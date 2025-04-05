# Authentication Setup Guide

This guide provides instructions on how to set up authentication for the OCR application using Supabase Auth with the latest `@supabase/ssr` package.

## Prerequisites

1. A Supabase project (same one used for the database)
2. Environment variables configured in `.env.local`

## Setup Steps

### 1. Configure Supabase Auth

1. Go to your Supabase project dashboard
2. Navigate to Authentication > Settings
3. Under "Site URL", enter your application URL (e.g., `http://localhost:3000` for local development)
4. Under "Redirect URLs", add the following URLs:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/reset-password`
   - Your production URLs if deploying to production

### 2. Configure Email Templates (Optional)

1. Go to Authentication > Email Templates
2. Customize the email templates for:
   - Confirmation email
   - Invitation email
   - Magic link email
   - Reset password email

### 3. Run Database Setup Script

Run the authentication database setup script to create the necessary tables and policies:

```bash
# Connect to your Supabase project's SQL editor
# Copy and paste the contents of supabase-auth-setup.sql
# Or run the following command if you have the Supabase CLI installed
supabase db push
```

### 4. Update Environment Variables

Make sure your `.env.local` file includes the following variables:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

For production, update the `NEXT_PUBLIC_SITE_URL` to your production URL.

## Authentication Flow

The authentication flow works as follows:

1. Users can sign up with email and password
2. Email verification is sent to the user's email
3. Users can sign in with email and password
4. Users can reset their password if forgotten
5. User sessions are managed by Supabase Auth with cookie-based authentication
6. Protected routes require authentication via middleware

## User Data

User data is stored in the following tables:

1. `auth.users` - Managed by Supabase Auth
2. `public.user_profiles` - Custom user profile data
3. `public.user_settings` - User-specific settings

## Row Level Security (RLS)

Row Level Security policies have been implemented to ensure users can only access their own data:

1. Users can only view, insert, update, and delete their own data
2. Anonymous users can only view public data
3. Each table has appropriate RLS policies

## Implementation Details

This implementation uses the standard Supabase JavaScript client for authentication:

1. Supabase client: `lib/supabase/server.ts` and `lib/supabase/client.ts` - Consistent client for both server and client components
2. Middleware: `middleware.ts` - For route protection and session management
3. Auth Provider: `components/auth/auth-provider.tsx` - For client-side auth state management
4. Auth Callback: `app/auth/callback/route.ts` - For handling authentication callbacks

## Testing Authentication

To test the authentication flow:

1. Start the application: `npm run dev`
2. Navigate to `/auth/signup` to create a new account
3. Check your email for the verification link
4. Sign in at `/auth/login`
5. Try accessing protected routes like `/profile`

## Troubleshooting

If you encounter issues:

1. Check the browser console for errors
2. Verify your Supabase credentials in `.env.local`
3. Ensure the Supabase Auth settings are correctly configured
4. Check that the database tables and policies are properly set up
5. Make sure the `@supabase/supabase-js` package is installed
