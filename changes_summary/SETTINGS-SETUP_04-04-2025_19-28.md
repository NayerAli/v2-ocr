# Settings Table Setup

This document provides instructions on how to set up the settings table in Supabase for the server-side processing settings.

## Background

The application has been updated to use server-side processing settings instead of client-side settings. This means that the processing settings are now stored in a Supabase database table called `settings` and are read-only on the client side.

## Setup Instructions

### Option 1: Run the Fix Script

The easiest way to set up the settings table is to run the fix script:

```bash
# Install dependencies if needed
npm install

# Run the fix script
node scripts/fix-settings-table.js
```

This script will:
1. Check if the settings table exists
2. Create the table if it doesn't exist
3. Add the `data` column if it's missing
4. Initialize the processing settings with default values

### Option 2: Run the SQL Script Manually

If you prefer to set up the table manually, you can run the SQL script in the Supabase SQL Editor:

1. Open the Supabase dashboard
2. Go to the SQL Editor
3. Copy the contents of `supabase-settings-fix.sql`
4. Run the SQL script

### Option 3: Check and Fix the Table

You can also run a script that checks the table and fixes any issues:

```bash
node scripts/check-settings-table.js
```

## Default Processing Settings

The default processing settings are:

```json
{
  "maxConcurrentJobs": 2,
  "pagesPerChunk": 2,
  "concurrentChunks": 1,
  "retryAttempts": 2,
  "retryDelay": 1000
}
```

## Troubleshooting

If you encounter the error `column settings.data does not exist`, it means that the settings table exists but the `data` column is missing. You can fix this by running one of the scripts mentioned above.

If you encounter other issues, please check the console logs for more information.
