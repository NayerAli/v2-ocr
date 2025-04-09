# Database Refactoring Plan

This file tracks the changes needed in the codebase to work with the new database schema.

## Database Schema Changes

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

## API Endpoints to Update

### Document Management
- [ ] ⚠️ GET /api/documents - Update to use documents table instead of queue
  - **Current Implementation**: Uses queue table
  - **Required Changes**: Update to use documents table
  - **Parameters**: None
  - **Expected Response**: Array of document objects
  - **Authentication**: Required

- [ ] ⚠️ GET /api/documents/:id - Update to use documents table instead of queue
  - **Current Implementation**: Uses queue table
  - **Required Changes**: Update to use documents table
  - **Parameters**: id (path parameter) - Document ID
  - **Expected Response**: Document object
  - **Authentication**: Required

- [ ] ⚠️ POST /api/documents - Update to use documents table instead of queue
  - **Current Implementation**: Uses queue table
  - **Required Changes**: Update to use documents table
  - **Parameters**: File data (multipart/form-data)
  - **Expected Response**: Document object with ID
  - **Authentication**: Required

- [ ] ⚠️ DELETE /api/documents/:id - Update to use documents table instead of queue
  - **Current Implementation**: Uses queue table
  - **Required Changes**: Update to use documents table
  - **Parameters**: id (path parameter) - Document ID
  - **Expected Response**: Success message
  - **Authentication**: Required

### Queue Management (to be updated to Document Management)
- [ ] ⚠️ GET /api/queue - Update to use documents table
  - **Current Implementation**: Uses queue table
  - **Required Changes**: Update to use documents table with status filtering
  - **Parameters**: None
  - **Expected Response**: Array of documents in processing queue
  - **Authentication**: Required

- [ ] ⚠️ POST /api/queue - Update to use documents table
  - **Current Implementation**: Uses queue table
  - **Required Changes**: Update to use documents table with status='queued'
  - **Parameters**: File data (multipart/form-data)
  - **Expected Response**: Document object with ID
  - **Authentication**: Required

- [ ] ⚠️ POST /api/queue/:id/cancel - Update to use documents table
  - **Current Implementation**: Uses queue table
  - **Required Changes**: Update to use documents table with status update
  - **Parameters**: id (path parameter) - Document ID
  - **Expected Response**: Success message
  - **Authentication**: Required

- [ ] ⚠️ DELETE /api/queue/:id/delete - Update to use documents table
  - **Current Implementation**: Uses queue table
  - **Required Changes**: Update to use documents table
  - **Parameters**: id (path parameter) - Document ID
  - **Expected Response**: Success message
  - **Authentication**: Required

### OCR Results
- [ ] ⚠️ GET /api/results/:id - Update to use ocr_results table
  - **Current Implementation**: Uses results table
  - **Required Changes**: Update to use ocr_results table
  - **Parameters**: id (path parameter) - Document ID
  - **Expected Response**: Array of OCR results
  - **Authentication**: Required

- [ ] ⚠️ POST /api/results/:id - Update to use ocr_results table
  - **Current Implementation**: Uses results table
  - **Required Changes**: Update to use ocr_results table
  - **Parameters**: id (path parameter) - Document ID, results (body) - OCR results
  - **Expected Response**: Success message
  - **Authentication**: Required

### User Settings
- [x] GET /api/settings/user - No changes needed
  - **Parameters**: None
  - **Expected Response**: Object with OCR, processing, upload, and display settings
  - **Authentication**: Required
  - **Database Functions**: userSettingsService.getOCRSettings(), userSettingsService.getProcessingSettings(), userSettingsService.getUploadSettings(), userSettingsService.getDisplaySettings()
  - **Flow**: Authenticates user → Retrieves settings from database → Returns settings with cache headers

- [x] PUT /api/settings/user - No changes needed
  - **Parameters**: ocr, processing, upload, display (body) - Settings objects
  - **Expected Response**: Updated settings object
  - **Authentication**: Required
  - **Database Functions**: userSettingsService.updateOCRSettings(), userSettingsService.updateProcessingSettings(), userSettingsService.updateUploadSettings(), userSettingsService.updateDisplaySettings()
  - **Flow**: Authenticates user → Updates settings in database → Clears cache → Retrieves updated settings → Returns updated settings

- [ ] ⚠️ GET /api/settings/processing - Update to use system_settings table
  - **Current Implementation**: Uses settings table
  - **Required Changes**: Update to use system_settings table
  - **Parameters**: None
  - **Expected Response**: Processing settings object
  - **Authentication**: Not required
  - **Database Function**: settingsService.getProcessingSettings()

- [ ] ⚠️ PUT /api/settings/processing - Update to use system_settings table
  - **Current Implementation**: Uses settings table
  - **Required Changes**: Update to use system_settings table
  - **Parameters**: Processing settings object (body)
  - **Expected Response**: Updated processing settings
  - **Authentication**: Not required (should be protected in production)
  - **Database Function**: settingsService.updateProcessingSettings()

### User Management
- [x] GET /api/user/profile - No changes needed
  - **Parameters**: None
  - **Expected Response**: User profile object
  - **Authentication**: Required
  - **Database Function**: userProfileService.getProfile()
  - **Flow**: Authenticates user → Retrieves profile from database → Returns profile

- [x] PUT /api/user/profile - No changes needed
  - **Parameters**: Profile data (body)
  - **Expected Response**: Updated profile object
  - **Authentication**: Required
  - **Database Function**: userProfileService.updateProfile()
  - **Flow**: Authenticates user → Updates profile in database → Returns updated profile

## Database Functions to Update

### Document Functions (to replace Queue Functions)
- [ ] ⚠️ db.getDocuments() - Create new function
  - **Current Implementation**: Not implemented
  - **Required Changes**: Create function to get documents from documents table
  - **Parameters**: None
  - **Expected Return**: Array of document objects
  - **Authentication**: Uses current user from auth

- [ ] ⚠️ db.getDocument(id) - Create new function
  - **Current Implementation**: Not implemented
  - **Required Changes**: Create function to get document from documents table
  - **Parameters**: id - Document ID
  - **Expected Return**: Document object
  - **Authentication**: Uses current user from auth

- [ ] ⚠️ db.saveDocument(document) - Create new function
  - **Current Implementation**: Not implemented
  - **Required Changes**: Create function to save document to documents table
  - **Parameters**: document - Document object
  - **Expected Return**: Saved document with ID
  - **Authentication**: Uses current user from auth

- [ ] ⚠️ db.deleteDocument(id) - Create new function
  - **Current Implementation**: Not implemented
  - **Required Changes**: Create function to delete document from documents table
  - **Parameters**: id - Document ID
  - **Expected Return**: Success indicator
  - **Authentication**: Uses current user from auth

### Queue Functions (to be updated to use documents table)
- [ ] ⚠️ db.getQueue() - Update to use documents table
  - **Current Implementation**: Uses queue table
  - **Required Changes**: Update to use documents table with status filtering
  - **Parameters**: None
  - **Expected Return**: Array of documents in processing queue
  - **Authentication**: Uses current user from auth

- [ ] ⚠️ db.addToQueue(document) - Update to use documents table
  - **Current Implementation**: Uses queue table
  - **Required Changes**: Update to use documents table with status='queued'
  - **Parameters**: document - Document object
  - **Expected Return**: Document with ID
  - **Authentication**: Uses current user from auth

- [ ] ⚠️ db.removeFromQueue(id) - Update to use documents table
  - **Current Implementation**: Uses queue table
  - **Required Changes**: Update to use documents table
  - **Parameters**: id - Document ID
  - **Expected Return**: Success indicator
  - **Authentication**: Uses current user from auth

- [ ] ⚠️ db.updateQueueItem(id, updates) - Update to use documents table
  - **Current Implementation**: Uses queue table
  - **Required Changes**: Update to use documents table
  - **Parameters**: id - Document ID, updates - Object with updates
  - **Expected Return**: Updated document
  - **Authentication**: Uses current user from auth

### Results Functions
- [ ] ⚠️ db.getResults(id) - Update to use ocr_results table
  - **Current Implementation**: Uses results table
  - **Required Changes**: Update to use ocr_results table
  - **Parameters**: id - Document ID
  - **Expected Return**: Array of OCR results
  - **Authentication**: Uses current user from auth

- [ ] ⚠️ db.saveResults(id, results) - Update to use ocr_results table
  - **Current Implementation**: Uses results table
  - **Required Changes**: Update to use ocr_results table
  - **Parameters**: id - Document ID, results - Array of OCR results
  - **Expected Return**: Success indicator
  - **Authentication**: Uses current user from auth

### Settings Functions
- [x] userSettingsService.getOCRSettings() - No changes needed
  - **Parameters**: None
  - **Expected Return**: OCR settings object
  - **Authentication**: Uses current user from auth
  - **Implementation**: Retrieves OCR settings from the database
  - **Flow**: Checks cache → Gets current user → Queries database → Returns settings or defaults

- [x] userSettingsService.updateOCRSettings(settings) - No changes needed
  - **Parameters**: settings - Partial OCR settings object
  - **Expected Return**: None
  - **Authentication**: Uses current user from auth
  - **Implementation**: Updates OCR settings in the database
  - **Flow**: Gets current user → Gets current settings → Merges with updates → Checks if record exists → Creates or updates record → Updates cache

- [x] userSettingsService.getProcessingSettings() - No changes needed
  - **Parameters**: None
  - **Expected Return**: Processing settings object
  - **Authentication**: Uses current user from auth
  - **Implementation**: Retrieves processing settings from the database
  - **Flow**: Checks cache → Gets current user → Queries database → Returns settings or defaults

- [x] userSettingsService.updateProcessingSettings(settings) - No changes needed
  - **Parameters**: settings - Partial processing settings object
  - **Expected Return**: None
  - **Authentication**: Uses current user from auth
  - **Implementation**: Updates processing settings in the database
  - **Flow**: Gets current user → Gets current settings → Merges with updates → Checks if record exists → Creates or updates record → Updates cache

- [x] userSettingsService.getUploadSettings() - No changes needed
  - **Parameters**: None
  - **Expected Return**: Upload settings object
  - **Authentication**: Uses current user from auth
  - **Implementation**: Retrieves upload settings from the database
  - **Flow**: Checks cache → Gets current user → Queries database → Returns settings or defaults

- [x] userSettingsService.updateUploadSettings(settings) - No changes needed
  - **Parameters**: settings - Partial upload settings object
  - **Expected Return**: None
  - **Authentication**: Uses current user from auth
  - **Implementation**: Updates upload settings in the database
  - **Flow**: Gets current user → Gets current settings → Merges with updates → Checks if record exists → Creates or updates record → Updates cache

- [x] userSettingsService.getDisplaySettings() - No changes needed
  - **Parameters**: None
  - **Expected Return**: Display settings object
  - **Authentication**: Uses current user from auth
  - **Implementation**: Retrieves display settings from the database
  - **Flow**: Checks cache → Gets current user → Queries database → Returns settings or defaults

- [x] userSettingsService.updateDisplaySettings(settings) - No changes needed
  - **Parameters**: settings - Partial display settings object
  - **Expected Return**: None
  - **Authentication**: Uses current user from auth
  - **Implementation**: Updates display settings in the database
  - **Flow**: Gets current user → Gets current settings → Merges with updates → Checks if record exists → Creates or updates record → Updates cache

- [ ] ⚠️ settingsService.getProcessingSettings() - Update to use system_settings table
  - **Current Implementation**: Uses settings table
  - **Required Changes**: Update to use system_settings table
  - **Parameters**: None
  - **Expected Return**: Processing settings object
  - **Authentication**: None

- [ ] ⚠️ settingsService.updateProcessingSettings(settings) - Update to use system_settings table
  - **Current Implementation**: Uses settings table
  - **Required Changes**: Update to use system_settings table
  - **Parameters**: settings - Processing settings object
  - **Expected Return**: Updated settings
  - **Authentication**: None (should be protected in production)

## Implementation Plan

1. Execute the SQL script to create the new database schema
2. Update the database functions to work with the new schema
3. Update the API endpoints to use the new database functions
4. Test each endpoint to ensure it works correctly
5. Update the UI components to work with the new data structure