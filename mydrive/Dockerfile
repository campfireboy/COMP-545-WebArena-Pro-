FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl curl && rm -rf /var/lib/apt/lists/*

# 1. Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm install

# 2. Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Environment variables must be present at build time
# We provide dummy values to prevent build failures if code checks for them
# But actual connection won't happen unless code forces it
ARG DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV DATABASE_URL=${DATABASE_URL}
ARG NEXTAUTH_SECRET="dummy_secret_for_build"
ENV NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
ARG NEXTAUTH_URL="http://localhost:7860"
ENV NEXTAUTH_URL=${NEXTAUTH_URL}

ENV NEXT_TELEMETRY_DISABLED 1

# Run Prisma generate (client generation)
RUN npx prisma generate

# Build the Next.js application
RUN npm run build

# 3. Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Default runtime env vars
ENV NEXTAUTH_SECRET="dummy_secret_for_runtime_fix"
ENV NEXTAUTH_URL="http://localhost:7860"

RUN groupadd -g 1001 -r nodejs
RUN useradd -u 1001 -r -g nodejs nextjs

# Install PostgreSQL in the runner stage
RUN apt-get update && apt-get install -y postgresql postgresql-contrib && rm -rf /var/lib/apt/lists/*

# Copy essential files
COPY --from=builder /app/package.json ./package.json

# If not using "output: standalone", we need node_modules and .next
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
# COPY from builder because it contains the generated Prisma Client inside node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

COPY start_all.sh ./start_all.sh
COPY ws-server.js ./ws-server.js
COPY Media ./Media
RUN chmod +x ./start_all.sh

# Install MinIO
RUN curl -O https://dl.min.io/server/minio/release/linux-amd64/minio \
    && chmod +x minio \
    && mv minio /usr/local/bin/

# Environment Variables for MinIO and App
ENV MINIO_ROOT_USER=minioadmin
ENV MINIO_ROOT_PASSWORD=minioadmin
ENV S3_REGION=us-east-1
ENV S3_ENDPOINT=http://localhost:9000
ENV S3_ACCESS_KEY=minioadmin
ENV S3_SECRET_KEY=minioadmin
ENV S3_BUCKET=mydrive
ENV S3_FORCE_PATH_STYLE=true

# Run as root so we can start postgres (the script switches users as needed)
USER root

EXPOSE 7860 9000 9001 1234

ENV PORT 7860

CMD ["./start_all.sh"]
