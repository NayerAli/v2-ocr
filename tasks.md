# OCR SaaS Application Refactoring Tasks

## Project Overview
This project involves refactoring an OCR (Optical Character Recognition) application into a SaaS model with proper user authentication and data isolation. The database schema has been optimized to support multi-user functionality, and now the application code needs to be updated to work with the new schema.

## Database Schema Changes
The database schema has been completely redesigned for better organization and scalability:
- Consolidated redundant tables (merged queue functionality into documents table)
- Added proper user isolation with user_id columns and Row Level Security
- Added default values and constraints for data integrity
- Created proper relationships between tables with foreign keys
- Added indexes for better performance
- Added a trigger to automatically create user profiles and settings on signup

### Tables Removed
- `queue` - Merged into `documents` table
- `results` - Renamed to `ocr_results` with improved structure
- `metadata` - Replaced with `system_metadata` for system-wide data
- `settings` - Replaced with `system_settings` for system-wide settings

### Tables Added
- `documents` - Main table for document storage and processing status
- `ocr_results` - Stores OCR results with improved structure
- `system_settings` - Global system settings
- `system_metadata` - System-wide metadata

### Tables Kept (with improvements)
- `user_profiles` - User profile information
- `user_settings` - User-specific settings

## Task List (In Priority Order)

1. **Update Queue Functions to Use Documents Table**
   - Update db.getQueue() to query the documents table with status filtering
   - Update db.addToQueue() to insert into the documents table with status='queued'
   - Update db.removeFromQueue() to delete from the documents table
   - Update db.updateQueueItem() to update the documents table
   - File: [task-01-update-queue-functions.md](task-01-update-queue-functions.md)

2. **Update Results Functions to Use OCR Results Table**
   - Update db.getResults() to query the ocr_results table
   - Update db.saveResults() to insert into the ocr_results table
   - File: [task-02-update-results-functions.md](task-02-update-results-functions.md)

3. **Create Document Management Functions**
   - Create db.getDocuments() to get all documents for the current user
   - Create db.getDocument(id) to get a specific document
   - Create db.saveDocument(document) to save a document
   - Create db.deleteDocument(id) to delete a document
   - File: [task-03-create-document-functions.md](task-03-create-document-functions.md)

4. **Create System Settings Functions**
   - Create systemSettingsService.getProcessingSettings() to query the system_settings table
   - Create systemSettingsService.updateProcessingSettings() to update the system_settings table
   - File: [task-04-create-system-settings-functions.md](task-04-create-system-settings-functions.md)

5. **Create User Profile Functions**
   - Create userProfileService.getProfile() to query the user_profiles table
   - Create userProfileService.updateProfile() to update the user_profiles table
   - File: [task-05-create-user-profile-functions.md](task-05-create-user-profile-functions.md)

6. **Update API Endpoints for Document Management**
   - Create GET /api/documents endpoint
   - Create GET /api/documents/:id endpoint
   - Create POST /api/documents endpoint
   - Create DELETE /api/documents/:id endpoint
   - File: [task-06-update-document-endpoints.md](task-06-update-document-endpoints.md)

7. **Update API Endpoints for Queue Management**
   - Update GET /api/queue endpoint
   - Update POST /api/queue endpoint
   - Update POST /api/queue/:id/cancel endpoint
   - Update DELETE /api/queue/:id/delete endpoint
   - File: [task-07-update-queue-endpoints.md](task-07-update-queue-endpoints.md)

8. **Update API Endpoints for OCR Results**
   - Update GET /api/results/:id endpoint
   - Update POST /api/results/:id endpoint
   - File: [task-08-update-results-endpoints.md](task-08-update-results-endpoints.md)

9. **Update API Endpoints for System Settings**
   - Update GET /api/settings/processing endpoint
   - Update PUT /api/settings/processing endpoint
   - File: [task-09-update-system-settings-endpoints.md](task-09-update-system-settings-endpoints.md)

10. **Create API Endpoints for User Profile Management**
    - Create GET /api/user/profile endpoint
    - Create PUT /api/user/profile endpoint
    - File: [task-10-create-user-profile-endpoints.md](task-10-create-user-profile-endpoints.md)

11. **Test and Verify All Endpoints**
    - Test each endpoint to ensure it works correctly with the new schema
    - Verify that user data is properly isolated
    - File: [task-11-test-verify-endpoints.md](task-11-test-verify-endpoints.md)

## Important Notes
- All database functions must include proper user authentication and data isolation
- All API endpoints must include proper authentication checks
- The application must use the @supabase/ssr package for Next.js authentication (not the deprecated auth-helpers)
- Each user must have their own documents, queues, OCR provider, and API key
- For file processing, use user-defined settings (provider and API key) instead of defaults
- Don't display the default API key - just inform users they can use their own API key

## Technical Requirements
- The Supabase Docker configuration is located at C:\Users\Nayer\AI_Projects\iNoor_ASR\v2-ocr-mistral\supabase\docker
- Use @supabase/ssr for Next.js authentication implementation following the Server-Side Auth guide

## Project Goals
- Add authentication to the application and transform it into a SaaS model
- Each user should have their own document lists, queues, OCR provider and API key with proper access controls
- Each user must have their own files and settings that are only accessible by the user themselves
- Clean and optimize the database schema to avoid duplicate and confusing tables
- Focus on scalability and thorough verification of all endpoints and functions
