# Database API Check

This file tracks the status of all API endpoints and functions that interact with the database to ensure they work correctly after the database cleanup and optimization.

## API Endpoints

### Document Management
- [ ] ⚠️ GET /api/documents - Get all documents for the current user
  - **Issue**: Endpoint not implemented. Needs to be created to use the new documents table.
  - **Parameters**: None
  - **Expected Response**: Array of document objects
  - **Authentication**: Required
  - **Database Function**: db.getDocuments()

- [ ] ⚠️ GET /api/documents/:id - Get a specific document
  - **Issue**: Endpoint not implemented. Needs to be created to use the new documents table.
  - **Parameters**: id (path parameter) - Document ID
  - **Expected Response**: Document object
  - **Authentication**: Required
  - **Database Function**: db.getDocument(id)

- [ ] ⚠️ POST /api/documents - Upload a new document
  - **Issue**: Endpoint not implemented. Needs to be created to use the new documents table.
  - **Parameters**: File data (multipart/form-data)
  - **Expected Response**: Document object with ID
  - **Authentication**: Required
  - **Database Function**: db.saveDocument(document)

- [ ] ⚠️ DELETE /api/documents/:id - Delete a document
  - **Issue**: Endpoint not implemented. Needs to be created to use the new documents table.
  - **Parameters**: id (path parameter) - Document ID
  - **Expected Response**: Success message
  - **Authentication**: Required
  - **Database Function**: db.deleteDocument(id)

### Queue Management (to be updated to use documents table)
- [ ] ⚠️ GET /api/queue - Get the processing queue for the current user
  - **Issue**: Needs to be updated to use the documents table with status filtering.
  - **Parameters**: None
  - **Expected Response**: Array of documents in processing queue
  - **Authentication**: Required
  - **Database Function**: db.getQueue() (to be updated)

- [ ] ⚠️ POST /api/queue - Add a document to the queue
  - **Issue**: Needs to be updated to use the documents table with status='queued'.
  - **Parameters**: File data (multipart/form-data)
  - **Expected Response**: Document object with ID
  - **Authentication**: Required
  - **Database Function**: db.addToQueue() (to be updated)

- [ ] ⚠️ POST /api/queue/:id/cancel - Cancel processing for a document
  - **Issue**: Needs to be updated to use the documents table with status update.
  - **Parameters**: id (path parameter) - Document ID
  - **Expected Response**: Success message
  - **Authentication**: Required
  - **Database Function**: processingService.cancelProcessing() (to be updated)

- [ ] ⚠️ DELETE /api/queue/:id/delete - Remove a document from the queue
  - **Issue**: Needs to be updated to use the documents table.
  - **Parameters**: id (path parameter) - Document ID
  - **Expected Response**: Success message
  - **Authentication**: Required
  - **Database Function**: db.removeFromQueue() (to be updated)

### OCR Results
- [ ] ⚠️ GET /api/results/:id - Get OCR results for a document
  - **Issue**: Needs to be updated to use the ocr_results table.
  - **Parameters**: id (path parameter) - Document ID
  - **Expected Response**: Array of OCR results
  - **Authentication**: Required
  - **Database Function**: db.getResults() (to be updated)

- [ ] ⚠️ POST /api/results/:id - Save OCR results for a document
  - **Issue**: Needs to be updated to use the ocr_results table.
  - **Parameters**: id (path parameter) - Document ID, results (body) - OCR results
  - **Expected Response**: Success message
  - **Authentication**: Required
  - **Database Function**: db.saveResults() (to be updated)

### User Settings
- [x] GET /api/settings/user - Get user-specific settings
  - **Parameters**: None
  - **Expected Response**: Object with OCR, processing, upload, and display settings
  - **Authentication**: Required
  - **Database Functions**: userSettingsService.getOCRSettings(), userSettingsService.getProcessingSettings(), userSettingsService.getUploadSettings(), userSettingsService.getDisplaySettings()
  - **Flow**: Authenticates user → Retrieves settings from database → Returns settings with cache headers

- [x] PUT /api/settings/user - Update user-specific settings
  - **Parameters**: ocr, processing, upload, display (body) - Settings objects
  - **Expected Response**: Updated settings object
  - **Authentication**: Required
  - **Database Functions**: userSettingsService.updateOCRSettings(), userSettingsService.updateProcessingSettings(), userSettingsService.updateUploadSettings(), userSettingsService.updateDisplaySettings()
  - **Flow**: Authenticates user → Updates settings in database → Clears cache → Retrieves updated settings → Returns updated settings

- [ ] ⚠️ GET /api/settings/processing - Get processing settings
  - **Issue**: Needs to be updated to use the system_settings table.
  - **Parameters**: None
  - **Expected Response**: Processing settings object
  - **Authentication**: Not required (should be admin-only in production)
  - **Database Function**: systemSettingsService.getProcessingSettings() (to be created)

- [ ] ⚠️ PUT /api/settings/processing - Update processing settings
  - **Issue**: Needs to be updated to use the system_settings table.
  - **Parameters**: Processing settings object (body)
  - **Expected Response**: Updated processing settings
  - **Authentication**: Not required (should be admin-only in production)
  - **Database Function**: systemSettingsService.updateProcessingSettings() (to be created)

### User Management
- [ ] ⚠️ GET /api/user/profile - Get user profile
  - **Issue**: Endpoint not implemented. Needs to be created to use the user_profiles table.
  - **Parameters**: None
  - **Expected Response**: User profile object
  - **Authentication**: Required
  - **Database Function**: userProfileService.getProfile() (to be created)

- [ ] ⚠️ PUT /api/user/profile - Update user profile
  - **Issue**: Endpoint not implemented. Needs to be created to use the user_profiles table.
  - **Parameters**: Profile data (body)
  - **Expected Response**: Updated profile object
  - **Authentication**: Required
  - **Database Function**: userProfileService.updateProfile() (to be created)

## Database Functions

### Document Functions
- [ ] ⚠️ db.getDocuments() - Get all documents for the current user
  - **Issue**: Function not implemented. Needs to be created to use the documents table.
  - **Parameters**: None
  - **Expected Return**: Array of document objects
  - **Authentication**: Uses current user from auth
  - **Implementation**: Should retrieve documents from the documents table, filtered by user_id

- [ ] ⚠️ db.getDocument(id) - Get a specific document
  - **Issue**: Function not implemented. Needs to be created to use the documents table.
  - **Parameters**: id - Document ID
  - **Expected Return**: Document object
  - **Authentication**: Uses current user from auth
  - **Implementation**: Should retrieve a document from the documents table, filtered by id and user_id

- [ ] ⚠️ db.saveDocument(document) - Save a document
  - **Issue**: Function not implemented. Needs to be created to use the documents table.
  - **Parameters**: document - Document object
  - **Expected Return**: Saved document with ID
  - **Authentication**: Uses current user from auth
  - **Implementation**: Should save a document to the documents table with user_id

- [ ] ⚠️ db.deleteDocument(id) - Delete a document
  - **Issue**: Function not implemented. Needs to be created to use the documents table.
  - **Parameters**: id - Document ID
  - **Expected Return**: Success indicator
  - **Authentication**: Uses current user from auth
  - **Implementation**: Should delete a document from the documents table, filtered by id and user_id

### Queue Functions (to be updated to use documents table)
- [ ] ⚠️ db.getQueue() - Get the processing queue
  - **Issue**: Needs to be updated to use the documents table with status filtering.
  - **Parameters**: None
  - **Expected Return**: Array of documents in processing queue
  - **Authentication**: Uses current user from auth
  - **Implementation**: Should retrieve documents from the documents table with specific statuses, filtered by user_id

- [ ] ⚠️ db.addToQueue(document) - Add a document to the queue
  - **Issue**: Needs to be updated to use the documents table with status='queued'.
  - **Parameters**: document - Document object
  - **Expected Return**: Document with ID
  - **Authentication**: Uses current user from auth
  - **Implementation**: Should save a document to the documents table with status='queued' and user_id

- [ ] ⚠️ db.removeFromQueue(id) - Remove a document from the queue
  - **Issue**: Needs to be updated to use the documents table.
  - **Parameters**: id - Document ID
  - **Expected Return**: Success indicator
  - **Authentication**: Uses current user from auth
  - **Implementation**: Should delete a document from the documents table, filtered by id and user_id

- [ ] ⚠️ db.updateQueueItem(id, updates) - Update a queue item
  - **Issue**: Needs to be updated to use the documents table.
  - **Parameters**: id - Document ID, updates - Object with updates
  - **Expected Return**: Updated document
  - **Authentication**: Uses current user from auth
  - **Implementation**: Should update a document in the documents table, filtered by id and user_id

### Results Functions
- [ ] ⚠️ db.getResults(id) - Get OCR results for a document
  - **Issue**: Needs to be updated to use the ocr_results table.
  - **Parameters**: id - Document ID
  - **Expected Return**: Array of OCR results
  - **Authentication**: Uses current user from auth
  - **Implementation**: Should retrieve OCR results from the ocr_results table, filtered by document_id and user_id

- [ ] ⚠️ db.saveResults(id, results) - Save OCR results for a document
  - **Issue**: Needs to be updated to use the ocr_results table.
  - **Parameters**: id - Document ID, results - Array of OCR results
  - **Expected Return**: Success indicator
  - **Authentication**: Uses current user from auth
  - **Implementation**: Should save OCR results to the ocr_results table with document_id and user_id

### User Settings Functions
- [x] userSettingsService.getOCRSettings() - Get OCR settings
  - **Parameters**: None
  - **Expected Return**: OCR settings object
  - **Authentication**: Uses current user from auth
  - **Implementation**: Retrieves OCR settings from the database
  - **Flow**: Checks cache → Gets current user → Queries database → Returns settings or defaults

- [x] userSettingsService.updateOCRSettings(settings) - Update OCR settings
  - **Parameters**: settings - Partial OCR settings object
  - **Expected Return**: None
  - **Authentication**: Uses current user from auth
  - **Implementation**: Updates OCR settings in the database
  - **Flow**: Gets current user → Gets current settings → Merges with updates → Checks if record exists → Creates or updates record → Updates cache

- [x] userSettingsService.getProcessingSettings() - Get processing settings
  - **Parameters**: None
  - **Expected Return**: Processing settings object
  - **Authentication**: Uses current user from auth
  - **Implementation**: Retrieves processing settings from the database
  - **Flow**: Checks cache → Gets current user → Queries database → Returns settings or defaults

- [x] userSettingsService.updateProcessingSettings(settings) - Update processing settings
  - **Parameters**: settings - Partial processing settings object
  - **Expected Return**: None
  - **Authentication**: Uses current user from auth
  - **Implementation**: Updates processing settings in the database
  - **Flow**: Gets current user → Gets current settings → Merges with updates → Checks if record exists → Creates or updates record → Updates cache

- [x] userSettingsService.getUploadSettings() - Get upload settings
  - **Parameters**: None
  - **Expected Return**: Upload settings object
  - **Authentication**: Uses current user from auth
  - **Implementation**: Retrieves upload settings from the database
  - **Flow**: Checks cache → Gets current user → Queries database → Returns settings or defaults

- [x] userSettingsService.updateUploadSettings(settings) - Update upload settings
  - **Parameters**: settings - Partial upload settings object
  - **Expected Return**: None
  - **Authentication**: Uses current user from auth
  - **Implementation**: Updates upload settings in the database
  - **Flow**: Gets current user → Gets current settings → Merges with updates → Checks if record exists → Creates or updates record → Updates cache

- [x] userSettingsService.getDisplaySettings() - Get display settings
  - **Parameters**: None
  - **Expected Return**: Display settings object
  - **Authentication**: Uses current user from auth
  - **Implementation**: Retrieves display settings from the database
  - **Flow**: Checks cache → Gets current user → Queries database → Returns settings or defaults

- [x] userSettingsService.updateDisplaySettings(settings) - Update display settings
  - **Parameters**: settings - Partial display settings object
  - **Expected Return**: None
  - **Authentication**: Uses current user from auth
  - **Implementation**: Updates display settings in the database
  - **Flow**: Gets current user → Gets current settings → Merges with updates → Checks if record exists → Creates or updates record → Updates cache

### System Settings Functions (to be created)
- [ ] ⚠️ systemSettingsService.getProcessingSettings() - Get system processing settings
  - **Issue**: Function not implemented. Needs to be created to use the system_settings table.
  - **Parameters**: None
  - **Expected Return**: Processing settings object
  - **Authentication**: None (should be admin-only in production)
  - **Implementation**: Should retrieve processing settings from the system_settings table

- [ ] ⚠️ systemSettingsService.updateProcessingSettings(settings) - Update system processing settings
  - **Issue**: Function not implemented. Needs to be created to use the system_settings table.
  - **Parameters**: settings - Processing settings object
  - **Expected Return**: Updated settings
  - **Authentication**: None (should be admin-only in production)
  - **Implementation**: Should update processing settings in the system_settings table

### User Profile Functions (to be created)
- [ ] ⚠️ userProfileService.getProfile() - Get user profile
  - **Issue**: Function not implemented. Needs to be created to use the user_profiles table.
  - **Parameters**: None
  - **Expected Return**: User profile object
  - **Authentication**: Uses current user from auth
  - **Implementation**: Should retrieve user profile from the user_profiles table

- [ ] ⚠️ userProfileService.updateProfile(profile) - Update user profile
  - **Issue**: Function not implemented. Needs to be created to use the user_profiles table.
  - **Parameters**: profile - Profile object
  - **Expected Return**: Updated profile
  - **Authentication**: Uses current user from auth
  - **Implementation**: Should update user profile in the user_profiles table
