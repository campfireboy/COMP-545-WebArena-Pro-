#!/bin/bash
echo "Building Docker image..."
docker build -t mydrive .

echo "Stopping any existing container..."
docker stop mydrive_container 2>/dev/null || true
docker rm mydrive_container 2>/dev/null || true

echo "Running Docker container..."
# -p host_port:container_port
docker run -d \
  --name mydrive_container \
  -p 7860:7860 \
  -p 9000:9000 \
  -p 9001:9001 \
  -p 1234:1234 \
  mydrive

echo "Container started! Access it at http://localhost:7860"
docker logs -f mydrive_container
