# OCR Application Docker Deployment Guide

This guide explains how to deploy the OCR application with Supabase using Docker Compose.

## Prerequisites

- Docker and Docker Compose installed on your VPS
- Git to clone the repository

## Setup Instructions

1. Clone the repository to your VPS:
   ```
   git clone <your-repo-url>
   cd <repository-folder>
   ```

2. Create a `.env` file in the root directory with the following variables:
   ```
   # Supabase configuration
   POSTGRES_PASSWORD=your_secure_postgres_password
   JWT_SECRET=your_secure_jwt_secret_key
   ANON_KEY=your_supabase_anon_key
   SERVICE_ROLE_KEY=your_supabase_service_role_key
   
   # OCR application configuration
   NODE_ENV=production
   ```

   For Supabase keys, you can generate secure ones using:
   ```
   # For JWT_SECRET
   openssl rand -base64 32
   
   # For ANON_KEY and SERVICE_ROLE_KEY, you can use JWT tokens with proper payloads
   # Example tokens are provided in docker-compose.yml but should be changed for production
   ```

3. Start the application with Docker Compose:
   ```
   docker-compose up -d
   ```

4. The services will be available at:
   - OCR Application: http://your-vps-ip:3000
   - Supabase Studio: http://your-vps-ip:3010

## Service Architecture

The docker-compose setup includes:

- **ocr-app**: The Next.js OCR application
- **supabase-db**: PostgreSQL database configured for Supabase
- **kong**: API gateway for routing requests to Supabase services
- **auth**: Authentication service
- **rest**: REST API for database access
- **realtime**: Realtime subscriptions
- **storage**: File storage service
- **meta**: Database metadata service
- **studio**: Supabase Studio for database management

## Migration and Database Setup

The database is automatically initialized with migrations from the `supabase/migrations` directory.

## Troubleshooting

If you encounter issues:

1. Check container logs:
   ```
   docker-compose logs [service-name]
   ```

2. Ensure all services are running:
   ```
   docker-compose ps
   ```

3. Restart services if needed:
   ```
   docker-compose restart [service-name]
   ```

## Production Considerations

For production deployments:

1. Use secure, randomly generated values for all keys and passwords
2. Set up proper SSL/TLS termination with a reverse proxy like Nginx
3. Configure proper backups for the database volume
4. Adjust resource limits in docker-compose.yml based on your VPS capabilities 