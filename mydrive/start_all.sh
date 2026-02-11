#!/bin/bash
set -e

# Find Postgres bin path dynamically to support whatever version apt installed (e.g. 13, 15, 16)
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | head -n 1)

if [ -z "$PGBIN" ]; then
  echo "Error: Could not find PostgreSQL binaries in /usr/lib/postgresql/*/bin"
  exit 1
fi

echo "Using PostgreSQL binaries from: $PGBIN"

# Start PostgreSQL
echo "Starting PostgreSQL..."

# Initialize data directory if empty (this happens on first run)
if [ ! -d "/var/lib/postgresql/data/base" ]; then
    echo "Initializing database..."
    mkdir -p /var/lib/postgresql/data
    chown postgres:postgres /var/lib/postgresql/data
    
    # Initialize DB as postgres user using full path
    su - postgres -c "$PGBIN/initdb -D /var/lib/postgresql/data"
    
    # Configure to listen on local
    echo "host all all 0.0.0.0/0 md5" >> /var/lib/postgresql/data/pg_hba.conf
    echo "listen_addresses='*'" >> /var/lib/postgresql/data/postgresql.conf
fi

# Start Postgres in background
su - postgres -c "$PGBIN/pg_ctl -D /var/lib/postgresql/data -l /var/lib/postgresql/logfile start"
echo "Waiting for PostgreSQL to start..."
sleep 5 

# Create User and Database if they don't exist
echo "Setting up database user and db..."
# Check if user exists, if not create
su - postgres -c "$PGBIN/psql -c \"SELECT 1 FROM pg_roles WHERE rolname='mydrive'\" | grep -q 1 || $PGBIN/psql -c \"CREATE USER mydrive WITH PASSWORD 'mydrive';\""
su - postgres -c "$PGBIN/psql -c \"SELECT 1 FROM pg_database WHERE datname='mydrive'\" | grep -q 1 || $PGBIN/psql -c \"CREATE DATABASE mydrive OWNER mydrive;\""

# Run migrations
echo "Running Prisma migrations..."
# Ensure DATABASE_URL is pointing to localhost
export DATABASE_URL="postgresql://mydrive:mydrive@localhost:5432/mydrive"
npx prisma db push

# Start MinIO
echo "Starting MinIO..."
mkdir -p /data/mydrive # Pre-create "mydrive" bucket
# Run in background
minio server /data --console-address ":9001" > /var/log/minio.log 2>&1 &

# Wait for MinIO to start
echo "Waiting for MinIO to start..."
timeout=30
while ! curl -s http://localhost:9000/minio/health/live; do
  sleep 1
  timeout=$((timeout-1))
  if [ "$timeout" -le 0 ]; then
    echo "Timed out waiting for MinIO"
    exit 1
  fi
done
echo "MinIO is ready."

echo "Seeding database if needed..."
# Seed database
echo "Seeding database..."
npm run prisma:seed

# Start Websocket Server
echo "Starting Websocket Server..."
PORT=1234 node ws-server.js > /var/log/ws-server.log 2>&1 &

# Start Next.js
echo "Starting Next.js application..."
exec npm start

