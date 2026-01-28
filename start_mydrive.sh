#!/bin/bash

# start_mydrive.sh - One-click setup for mydrive

echo "Starting mydrive setup..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Docker is not running. Attempting to start Docker Desktop..."
  open -a Docker
  
  echo "Waiting for Docker to start..."
  while ! docker info > /dev/null 2>&1; do
    echo -n "."
    sleep 2
  done
  echo ""
  echo "Docker started successfully."
fi

# Navigate to the mydrive directory
cd mydrive || { echo "Error: 'mydrive' directory not found."; exit 1; }

# Install dependencies
echo "Installing dependencies..."
npm install

# Start Docker containers (Postgres, Minio, WebSocket)
echo "Starting Docker containers..."
docker-compose up -d

# Wait a moment for the database to be ready
echo "Waiting for services to initialize..."
sleep 5

# Setup Database
echo "Setting up the database..."
npx prisma db push

echo "Seeding the database..."
npm run prisma:seed

# Build the application
echo "Building the application..."
npm run build

# Start the application
echo "Starting the application in production mode..."
npm start
