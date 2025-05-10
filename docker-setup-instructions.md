# Docker Setup Instructions for iNoor OCR

This document provides instructions for setting up and running the iNoor OCR application with Supabase using Docker Compose.

## Prerequisites

- Docker and Docker Compose installed on your system
- Git to clone the repository

## Setup Steps

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd v2-ocr
   ```

2. Create a `.env` file in the root directory with the following environment variables:

   ```env
   ############
   # Secrets - CHANGE THESE BEFORE PRODUCTION!
   ############

   # Generate a strong password for Postgres
   POSTGRES_PASSWORD=change_me_to_a_strong_password

   # Generate a strong JWT secret (at least 32 characters)
   JWT_SECRET=change_me_to_a_strong_jwt_secret_at_least_32_chars

   # Supabase keys (pre-generated examples, should be changed)
   ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE3OTk1MzU2MDB9.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE
   SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q

   # OCR API settings - Add your API keys here
   AZURE_API_KEY=your_azure_api_key_here
   AZURE_ENDPOINT=your_azure_endpoint_here

   # Development mode settings
   NODE_ENV=production

   # Other required Supabase settings
   DASHBOARD_USERNAME=admin
   DASHBOARD_PASSWORD=strong_admin_password
   SECRET_KEY_BASE=generate_a_long_random_string_here
   VAULT_ENC_KEY=generate_a_32_char_min_encryption_key
   ```

3. Create a `volumes` directory and create the Kong configuration file:

   ```bash
   mkdir -p volumes
   ```

4. Create a `volumes/kong.yml` file with the following content:

   ```yaml
   _format_version: "2.1"
   _transform: true

   services:
     - name: auth-v1
       url: http://auth:9999/verify
       routes:
         - name: auth-v1-route
           paths:
             - /auth/v1/verify
     - name: auth-v1-admin
       url: http://auth:9999/admin
       routes:
         - name: auth-v1-admin-route
           paths:
             - /auth/v1/admin
     - name: auth-v1-token
       url: http://auth:9999
       routes:
         - name: auth-v1-token-route
           paths:
             - /auth/v1
     - name: rest-v1
       url: http://rest:3000
       routes:
         - name: rest-v1-route
           paths:
             - /rest/v1
     - name: storage-v1
       url: http://storage:5000
       routes:
         - name: storage-v1-route
           paths:
             - /storage/v1
   ```

5. Start the application:

   ```bash
   docker-compose up -d
   ```

6. Access the services:
   - OCR Application: http://localhost:3000
   - Supabase Studio: http://localhost:3001
   - MailHog (for email testing): http://localhost:8025

## Database Migrations

The database migrations are automatically applied when the Docker containers start. The migration files are located in the `supabase/migrations` directory.

## Troubleshooting

If you encounter any issues:

1. Check the logs:
   ```bash
   docker-compose logs -f
   ```

2. Restart a specific service:
   ```bash
   docker-compose restart <service-name>
   ```

3. Completely reset and rebuild:
   ```bash
   docker-compose down -v
   docker-compose up -d --build
   ```

## Stopping the Application

To stop all services:
```bash
docker-compose down
```

To stop and remove all volumes (warning: this will delete all data):
```bash
docker-compose down -v
``` 