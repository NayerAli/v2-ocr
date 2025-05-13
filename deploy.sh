#!/bin/bash

# OCR Application deployment script for Linux VPS
# Version: 1.0.1

set -e

# Print colorful messages
function print_info() {
  echo -e "\e[1;34m[INFO] $1\e[0m"
}

function print_success() {
  echo -e "\e[1;32m[SUCCESS] $1\e[0m"
}

function print_error() {
  echo -e "\e[1;31m[ERROR] $1\e[0m"
}

function print_warning() {
  echo -e "\e[1;33m[WARNING] $1\e[0m"
}

# Helper: Generate a random base64 string for JWT secret
function generate_jwt_secret() {
  openssl rand -base64 32
}

# Helper: Generate a JWT (header.payload.signature) using openssl and bash
function generate_jwt() {
  local role=$1
  local secret=$2
  local exp=$3
  local header base64_header base64_payload payload unsigned_token signature

  header='{"alg":"HS256","typ":"JWT"}'
  payload="{\"iss\":\"supabase-demo\",\"role\":\"$role\",\"exp\":$exp}"
  base64_header=$(echo -n "$header" | openssl base64 -A | tr '+/' '-_' | tr -d '=')
  base64_payload=$(echo -n "$payload" | openssl base64 -A | tr '+/' '-_' | tr -d '=')
  unsigned_token="$base64_header.$base64_payload"
  signature=$(echo -n "$unsigned_token" | openssl dgst -sha256 -hmac "$secret" -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
  echo "$unsigned_token.$signature"
}

# Check if running on Linux
if [[ "$(uname)" != "Linux" ]]; then
  print_warning "This script is optimized for Linux VPS. You are running on $(uname)."
  print_warning "Some features may not work as expected."
fi

# Check system requirements
print_info "Checking system requirements..."

# Check for sufficient disk space (at least 5GB free)
free_disk=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
if [[ $free_disk -lt 5 ]]; then
  print_warning "Low disk space: $free_disk GB available. Recommend at least 5GB free."
fi

# Check for sufficient memory (at least 2GB recommended)
total_mem=$(free -m | awk 'NR==2 {print $2}')
if [[ $total_mem -lt 2000 ]]; then
  print_warning "Low memory: $total_mem MB available. Recommend at least 2GB for optimal performance."
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
  print_error "Docker is not installed. Please install Docker first."
  print_info "You can install Docker with: curl -fsSL https://get.docker.com | sh"
  exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
  print_error "Docker Compose is not installed. Please install Docker Compose first."
  print_info "You can install Docker Compose with: 
  curl -SL https://github.com/docker/compose/releases/download/v2.23.3/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose"
  exit 1
fi

# Check if Docker service is running
if ! systemctl is-active --quiet docker; then
  print_warning "Docker service is not running. Attempting to start it..."
  sudo systemctl start docker
  if ! systemctl is-active --quiet docker; then
    print_error "Failed to start Docker service."
    exit 1
  fi
  print_success "Docker service started successfully."
fi

# Ensure docker daemon is enabled on startup
if ! systemctl is-enabled --quiet docker; then
  print_info "Enabling Docker to start on boot..."
  sudo systemctl enable docker
  print_success "Docker enabled on startup."
fi

# Create necessary directories with proper permissions
print_info "Setting up directories..."
mkdir -p ./supabase/migrations
mkdir -p ./data/postgres
mkdir -p ./data/storage

# Check if .env file exists, if not create it from example
if [ ! -f .env ]; then
  print_info "Creating .env file from example..."
  if [ -f docker-env-example ]; then
    cp docker-env-example .env
    print_success "Created .env file from docker-env-example"
  else
    print_error "docker-env-example file not found. Creating basic .env file."
    touch .env
  fi
fi

# Load .env variables
set -o allexport
source .env
set +o allexport

changed_env=false

# Generate JWT_SECRET if missing
if [ -z "$JWT_SECRET" ]; then
  JWT_SECRET=$(generate_jwt_secret)
  echo "JWT_SECRET=$JWT_SECRET" >> .env
  print_info "Generated JWT_SECRET."
  changed_env=true
fi

# Set expiration to 5 years from now
EXP=$(($(date +%s) + 157680000))

# Generate ANON_KEY if missing
if [ -z "$ANON_KEY" ]; then
  ANON_KEY=$(generate_jwt "anon" "$JWT_SECRET" "$EXP")
  echo "ANON_KEY=$ANON_KEY" >> .env
  print_info "Generated ANON_KEY."
  changed_env=true
fi

# Generate SERVICE_ROLE_KEY if missing
if [ -z "$SERVICE_ROLE_KEY" ]; then
  SERVICE_ROLE_KEY=$(generate_jwt "service_role" "$JWT_SECRET" "$EXP")
  echo "SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY" >> .env
  print_info "Generated SERVICE_ROLE_KEY."
  changed_env=true
fi

# Set POSTGRES_PASSWORD if missing
if [ -z "$POSTGRES_PASSWORD" ]; then
  POSTGRES_PASSWORD=$(openssl rand -base64 16)
  echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" >> .env
  print_info "Generated POSTGRES_PASSWORD."
  changed_env=true
fi

if [ "$changed_env" = true ]; then
  print_success "Updated .env with generated secrets. Please review your .env file."
fi

# Backup .env for safekeeping
print_info "Creating backup of .env file..."
cp .env .env.backup.$(date +%Y%m%d%H%M%S)
print_success "Backup created."

# Optional: Configure firewall for the necessary ports
read -p "Do you want to configure UFW firewall for the necessary ports? (y/n): " configure_firewall
if [[ "$configure_firewall" =~ ^[Yy]$ ]]; then
  if command -v ufw &> /dev/null; then
    print_info "Configuring firewall..."
    sudo ufw allow 22/tcp
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw allow 3000/tcp
    sudo ufw allow 3010/tcp
    
    # Only enable if not already enabled
    if ! sudo ufw status | grep -q "Status: active"; then
      print_warning "Enabling UFW firewall. This might disconnect your SSH session if port 22 is not allowed."
      read -p "Continue? (y/n): " confirm_firewall
      if [[ "$confirm_firewall" =~ ^[Yy]$ ]]; then
        sudo ufw enable
      fi
    fi
    
    print_success "Firewall configured."
  else
    print_warning "UFW not installed. Skipping firewall configuration."
  fi
fi

# Pull the latest images
print_info "Pulling latest Docker images..."
docker-compose pull

# Stop any existing containers first
if docker-compose ps | grep -q "Up"; then
  print_info "Stopping existing services..."
  docker-compose down
fi

# Build and start the services
print_info "Building and starting services..."
docker-compose up -d --build

# Check if services are running
print_info "Checking service status..."
docker-compose ps

# Setup automatic cleanup of old images
print_info "Setting up cleanup cron job for Docker..."
if [ ! -f /etc/cron.weekly/docker-cleanup ]; then
  echo "#!/bin/bash
# Weekly cleanup of unused Docker resources
docker system prune -af --volumes" | sudo tee /etc/cron.weekly/docker-cleanup > /dev/null
  sudo chmod +x /etc/cron.weekly/docker-cleanup
  print_success "Docker cleanup cron job created."
fi

print_success "===================================================================="
print_success "Deployment completed! Your OCR application is now running on your VPS."
print_success ""
print_success "OCR Application: http://$(hostname -I | awk '{print $1}'):3000"
print_success "Supabase Studio:  http://$(hostname -I | awk '{print $1}'):3010"
print_success ""
print_success "To view logs: docker-compose logs -f"
print_success "To stop services: docker-compose down"
print_success "===================================================================="

# Remind about backups
print_warning "IMPORTANT: Regularly backup your data with:"
print_warning "docker-compose down && tar -czf ocr-backup-\$(date +%Y%m%d).tar.gz .env* ./data" 