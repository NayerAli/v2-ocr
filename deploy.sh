#!/bin/bash

# OCR Application deployment script

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if .env file exists, if not create it from example
if [ ! -f .env ]; then
    echo "Creating .env file from example..."
    if [ -f docker-env-example ]; then
        cp docker-env-example .env
        echo "Created .env file from docker-env-example"
    else
        echo "ERROR: docker-env-example file not found. Please create a .env file manually."
        exit 1
    fi
fi

# Pull the latest images
echo "Pulling latest Docker images..."
docker-compose pull

# Build and start the services
echo "Building and starting services..."
docker-compose up -d --build

# Check if services are running
echo "Checking service status..."
docker-compose ps

echo ""
echo "======================================================================================="
echo "Deployment completed! Your OCR application should now be running."
echo ""
echo "OCR Application: http://localhost:3000"
echo "Supabase Studio:  http://localhost:3010"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop services: docker-compose down"
echo "=======================================================================================" 