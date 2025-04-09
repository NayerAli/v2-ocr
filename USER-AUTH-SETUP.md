# User Authentication Setup

This document provides instructions for setting up user authentication and user-specific data access in the application.

## Prerequisites

- Supabase project created
- Environment variables configured in `.env` file:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (for setup script only)

## Setup Steps

1. **Install dependencies**

```bash
npm install
```

2. **Run the setup script**

This script will create the necessary tables and Row Level Security (RLS) policies in your Supabase database:

```bash
node setup-user-auth.js
```

3. **Verify setup**

Check your Supabase dashboard to ensure the following tables were created:
- `user_profiles`
- `user_settings`

And that the following tables have been updated with a `user_id` column:
- `queue`
- `results`
- `metadata`

## How It Works

### User Registration and Authentication

- Users can sign up with email and password
- Email verification is sent to the user's email
- Users can sign in with email and password
- Users can reset their password if forgotten
- User sessions are managed by Supabase Auth with cookie-based authentication
- Protected routes require authentication via middleware

### User-Specific Data

Each user has access only to their own data:

1. **Documents and OCR Results**
   - Each document in the queue is associated with a user_id
   - OCR results are associated with the same user_id
   - Row Level Security (RLS) policies ensure users can only access their own documents and results

2. **User Settings**
   - Each user has their own OCR provider settings
   - Each user has their own processing settings
   - Settings are stored in the `user_settings` table

3. **User Profile**
   - Basic user information is stored in the `user_profiles` table
   - Users can update their profile information

## API Endpoints

The application provides the following API endpoints for user-specific data:

- `GET /api/settings/user` - Get user-specific settings
- `PUT /api/settings/user` - Update user-specific settings

## Troubleshooting

If you encounter issues with the setup:

1. Check the Supabase SQL Editor for any error messages
2. Verify that the RLS policies are correctly applied to all tables
3. Check that the `user_id` column is properly added to all tables
4. Ensure the trigger function for new user signups is created

## Security Considerations

- All data access is protected by Row Level Security (RLS) policies
- API endpoints verify user authentication before returning data
- User passwords are securely managed by Supabase Auth
- API keys for OCR providers are stored securely in the database
