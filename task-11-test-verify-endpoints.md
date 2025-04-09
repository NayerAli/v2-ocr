# Task 11: Test and Verify All Endpoints

## Background
After implementing all the changes to the database schema and updating the API endpoints, it's important to thoroughly test and verify that everything works correctly. This task involves testing each endpoint to ensure it works with the new schema and that user data is properly isolated.

## Testing Plan

### 1. Set Up Testing Environment
Before testing the endpoints, set up a testing environment. The application uses Next.js App Router API routes and Supabase for authentication and database operations:

1. Create at least two test user accounts:
   - Regular user account
   - Admin user account

2. Prepare test data:
   - Sample documents for upload
   - Sample OCR results
   - Sample user profiles
   - Sample settings

3. Set up a testing tool:
   - Use a tool like Postman, Insomnia, or Thunder Client
   - Or create a simple testing script using JavaScript/Node.js
   - Or use the browser's developer tools to test the API endpoints directly from the application

4. Ensure Supabase is running locally:
   - The application uses Supabase Docker configuration located at `C:\Users\Nayer\AI_Projects\iNoor_ASR\v2-ocr-mistral\supabase\docker`
   - Make sure the Supabase services are running before testing

### 2. Test Document Management Endpoints

#### GET /api/documents
- **Test Case 1**: Get all documents for the current user
  - **Steps**:
    1. Log in as a regular user
    2. Call GET /api/documents
  - **Expected Result**: Returns an array of documents owned by the user
  - **Verification**: Check that only documents owned by the user are returned

- **Test Case 2**: Get all documents for a different user
  - **Steps**:
    1. Log in as a regular user
    2. Upload some documents
    3. Log in as a different user
    4. Call GET /api/documents
  - **Expected Result**: Returns an array of documents owned by the second user, not including the first user's documents
  - **Verification**: Check that data isolation is working correctly

#### GET /api/documents/:id
- **Test Case 1**: Get a specific document owned by the user
  - **Steps**:
    1. Log in as a regular user
    2. Upload a document and get its ID
    3. Call GET /api/documents/:id with the document ID
  - **Expected Result**: Returns the document
  - **Verification**: Check that the document data is correct

- **Test Case 2**: Try to get a document not owned by the user
  - **Steps**:
    1. Log in as a regular user
    2. Upload a document and get its ID
    3. Log in as a different user
    4. Call GET /api/documents/:id with the first user's document ID
  - **Expected Result**: Returns a 404 error
  - **Verification**: Check that data isolation is working correctly

#### POST /api/documents
- **Test Case 1**: Upload a new document
  - **Steps**:
    1. Log in as a regular user
    2. Call POST /api/documents with a valid file
  - **Expected Result**: Returns the created document with an ID
  - **Verification**: Check that the document is created in the database and the file is uploaded to storage

- **Test Case 2**: Try to upload an invalid file type
  - **Steps**:
    1. Log in as a regular user
    2. Call POST /api/documents with an invalid file type
  - **Expected Result**: Returns a 400 error
  - **Verification**: Check that the validation is working correctly

- **Test Case 3**: Try to upload a file that's too large
  - **Steps**:
    1. Log in as a regular user
    2. Call POST /api/documents with a file that exceeds the size limit
  - **Expected Result**: Returns a 400 error
  - **Verification**: Check that the validation is working correctly

#### DELETE /api/documents/:id
- **Test Case 1**: Delete a document owned by the user
  - **Steps**:
    1. Log in as a regular user
    2. Upload a document and get its ID
    3. Call DELETE /api/documents/:id with the document ID
  - **Expected Result**: Returns a success message
  - **Verification**: Check that the document is deleted from the database and the file is deleted from storage

- **Test Case 2**: Try to delete a document not owned by the user
  - **Steps**:
    1. Log in as a regular user
    2. Upload a document and get its ID
    3. Log in as a different user
    4. Call DELETE /api/documents/:id with the first user's document ID
  - **Expected Result**: Returns a 404 error
  - **Verification**: Check that data isolation is working correctly

### 3. Test Queue Management Endpoints

#### GET /api/queue
- **Test Case 1**: Get the processing queue for the current user
  - **Steps**:
    1. Log in as a regular user
    2. Add some documents to the queue
    3. Call GET /api/queue
  - **Expected Result**: Returns an array of documents in the queue owned by the user
  - **Verification**: Check that only documents with status 'pending', 'processing', or 'queued' are returned

- **Test Case 2**: Get the processing queue for a different user
  - **Steps**:
    1. Log in as a regular user
    2. Add some documents to the queue
    3. Log in as a different user
    4. Call GET /api/queue
  - **Expected Result**: Returns an array of documents in the queue owned by the second user, not including the first user's documents
  - **Verification**: Check that data isolation is working correctly

#### POST /api/queue
- **Test Case 1**: Add a document to the queue
  - **Steps**:
    1. Log in as a regular user
    2. Call POST /api/queue with a valid file
  - **Expected Result**: Returns the created document with status 'queued'
  - **Verification**: Check that the document is created in the database with the correct status and the file is uploaded to storage

- **Test Case 2**: Try to add an invalid file type to the queue
  - **Steps**:
    1. Log in as a regular user
    2. Call POST /api/queue with an invalid file type
  - **Expected Result**: Returns a 400 error
  - **Verification**: Check that the validation is working correctly

#### POST /api/queue/:id/cancel
- **Test Case 1**: Cancel processing for a document owned by the user
  - **Steps**:
    1. Log in as a regular user
    2. Add a document to the queue and get its ID
    3. Call POST /api/queue/:id/cancel with the document ID
  - **Expected Result**: Returns a success message and the document with status 'cancelled'
  - **Verification**: Check that the document status is updated in the database

- **Test Case 2**: Try to cancel processing for a document not owned by the user
  - **Steps**:
    1. Log in as a regular user
    2. Add a document to the queue and get its ID
    3. Log in as a different user
    4. Call POST /api/queue/:id/cancel with the first user's document ID
  - **Expected Result**: Returns a 404 error
  - **Verification**: Check that data isolation is working correctly

#### DELETE /api/queue/:id/delete
- **Test Case 1**: Remove a document from the queue owned by the user
  - **Steps**:
    1. Log in as a regular user
    2. Add a document to the queue and get its ID
    3. Call DELETE /api/queue/:id/delete with the document ID
  - **Expected Result**: Returns a success message
  - **Verification**: Check that the document is deleted from the database and the file is deleted from storage

- **Test Case 2**: Try to remove a document from the queue not owned by the user
  - **Steps**:
    1. Log in as a regular user
    2. Add a document to the queue and get its ID
    3. Log in as a different user
    4. Call DELETE /api/queue/:id/delete with the first user's document ID
  - **Expected Result**: Returns a 404 error
  - **Verification**: Check that data isolation is working correctly

### 4. Test OCR Results Endpoints

#### GET /api/results/:id
- **Test Case 1**: Get OCR results for a document owned by the user
  - **Steps**:
    1. Log in as a regular user
    2. Upload a document, process it, and get its ID
    3. Call GET /api/results/:id with the document ID
  - **Expected Result**: Returns an array of OCR results for the document
  - **Verification**: Check that the OCR results are correct

- **Test Case 2**: Try to get OCR results for a document not owned by the user
  - **Steps**:
    1. Log in as a regular user
    2. Upload a document, process it, and get its ID
    3. Log in as a different user
    4. Call GET /api/results/:id with the first user's document ID
  - **Expected Result**: Returns a 404 error
  - **Verification**: Check that data isolation is working correctly

#### POST /api/results/:id
- **Test Case 1**: Save OCR results for a document owned by the user
  - **Steps**:
    1. Log in as a regular user
    2. Upload a document and get its ID
    3. Call POST /api/results/:id with the document ID and valid OCR results
  - **Expected Result**: Returns a success message
  - **Verification**: Check that the OCR results are saved in the database and the document status is updated to 'completed'

- **Test Case 2**: Try to save OCR results for a document not owned by the user
  - **Steps**:
    1. Log in as a regular user
    2. Upload a document and get its ID
    3. Log in as a different user
    4. Call POST /api/results/:id with the first user's document ID and valid OCR results
  - **Expected Result**: Returns a 404 error
  - **Verification**: Check that data isolation is working correctly

### 5. Test User Settings Endpoints

#### GET /api/settings/user
- **Test Case 1**: Get user-specific settings
  - **Steps**:
    1. Log in as a regular user
    2. Call GET /api/settings/user
  - **Expected Result**: Returns an object with OCR, processing, upload, and display settings
  - **Verification**: Check that the settings are correct

- **Test Case 2**: Get user-specific settings for a different user
  - **Steps**:
    1. Log in as a regular user
    2. Update some settings
    3. Log in as a different user
    4. Call GET /api/settings/user
  - **Expected Result**: Returns an object with the second user's settings, not including the first user's settings
  - **Verification**: Check that data isolation is working correctly

#### PUT /api/settings/user
- **Test Case 1**: Update user-specific settings
  - **Steps**:
    1. Log in as a regular user
    2. Call PUT /api/settings/user with valid settings
  - **Expected Result**: Returns the updated settings
  - **Verification**: Check that the settings are updated in the database

- **Test Case 2**: Try to update settings with invalid data
  - **Steps**:
    1. Log in as a regular user
    2. Call PUT /api/settings/user with invalid settings
  - **Expected Result**: Returns a 400 error
  - **Verification**: Check that the validation is working correctly

### 6. Test System Settings Endpoints

#### GET /api/settings/processing
- **Test Case 1**: Get processing settings
  - **Steps**:
    1. Call GET /api/settings/processing
  - **Expected Result**: Returns an object with processing settings
  - **Verification**: Check that the settings are correct

#### PUT /api/settings/processing
- **Test Case 1**: Update processing settings as an admin
  - **Steps**:
    1. Log in as an admin user
    2. Call PUT /api/settings/processing with valid settings
  - **Expected Result**: Returns the updated settings
  - **Verification**: Check that the settings are updated in the database

- **Test Case 2**: Try to update processing settings as a regular user
  - **Steps**:
    1. Log in as a regular user
    2. Call PUT /api/settings/processing with valid settings
  - **Expected Result**: Returns a 403 error
  - **Verification**: Check that the admin-only access is working correctly

### 7. Test User Profile Endpoints

#### GET /api/user/profile
- **Test Case 1**: Get the current user's profile
  - **Steps**:
    1. Log in as a regular user
    2. Call GET /api/user/profile
  - **Expected Result**: Returns the user's profile
  - **Verification**: Check that the profile data is correct

- **Test Case 2**: Get the profile for a user without an existing profile
  - **Steps**:
    1. Create a new user account
    2. Log in as the new user
    3. Call GET /api/user/profile
  - **Expected Result**: Returns a default profile for the user
  - **Verification**: Check that a new profile is created in the database

#### PUT /api/user/profile
- **Test Case 1**: Update the current user's profile
  - **Steps**:
    1. Log in as a regular user
    2. Call PUT /api/user/profile with valid profile data
  - **Expected Result**: Returns the updated profile
  - **Verification**: Check that the profile is updated in the database

- **Test Case 2**: Try to update the profile with invalid data
  - **Steps**:
    1. Log in as a regular user
    2. Call PUT /api/user/profile with invalid profile data
  - **Expected Result**: Returns a 400 error
  - **Verification**: Check that the validation is working correctly

### 8. Test Admin User Management Endpoints

#### GET /api/admin/users
- **Test Case 1**: Get all user profiles as an admin
  - **Steps**:
    1. Log in as an admin user
    2. Call GET /api/admin/users
  - **Expected Result**: Returns an array of user profiles
  - **Verification**: Check that all user profiles are returned

- **Test Case 2**: Try to get all user profiles as a regular user
  - **Steps**:
    1. Log in as a regular user
    2. Call GET /api/admin/users
  - **Expected Result**: Returns a 403 error
  - **Verification**: Check that the admin-only access is working correctly

#### GET /api/admin/users/:id
- **Test Case 1**: Get a specific user profile as an admin
  - **Steps**:
    1. Log in as an admin user
    2. Get a user ID
    3. Call GET /api/admin/users/:id with the user ID
  - **Expected Result**: Returns the user's profile
  - **Verification**: Check that the profile data is correct

- **Test Case 2**: Try to get a specific user profile as a regular user
  - **Steps**:
    1. Log in as a regular user
    2. Get a user ID
    3. Call GET /api/admin/users/:id with the user ID
  - **Expected Result**: Returns a 403 error
  - **Verification**: Check that the admin-only access is working correctly

#### PUT /api/admin/users/:id
- **Test Case 1**: Update a specific user profile as an admin
  - **Steps**:
    1. Log in as an admin user
    2. Get a user ID
    3. Call PUT /api/admin/users/:id with the user ID and valid profile data
  - **Expected Result**: Returns the updated profile
  - **Verification**: Check that the profile is updated in the database

- **Test Case 2**: Try to update a specific user profile as a regular user
  - **Steps**:
    1. Log in as a regular user
    2. Get a user ID
    3. Call PUT /api/admin/users/:id with the user ID and valid profile data
  - **Expected Result**: Returns a 403 error
  - **Verification**: Check that the admin-only access is working correctly

## Verification Checklist

After testing all endpoints, verify the following:

1. **User Authentication**:
   - All endpoints that require authentication properly check for a valid session
   - Unauthenticated requests are rejected with a 401 error

2. **Data Isolation**:
   - Each user can only access their own data
   - Users cannot access or modify other users' data
   - Admin users can access and modify all users' data

3. **Input Validation**:
   - All endpoints properly validate input data
   - Invalid requests are rejected with appropriate error messages

4. **Error Handling**:
   - All endpoints properly handle errors
   - Error messages are clear and helpful

5. **Performance**:
   - All endpoints respond within a reasonable time
   - Caching is working correctly

6. **Security**:
   - Admin-only endpoints are properly secured
   - Sensitive data is not exposed

## Documentation

After testing and verification, document any issues or improvements:

1. **Issues Found**:
   - List any issues found during testing
   - Describe the steps to reproduce each issue
   - Suggest possible solutions

2. **Improvements**:
   - List any potential improvements
   - Describe the benefits of each improvement
   - Suggest implementation approaches

3. **Test Results**:
   - Document the results of all tests
   - Note any unexpected behavior
   - Highlight any performance concerns

## Next Steps

Based on the testing and verification results, determine the next steps:

1. **Fix Issues**:
   - Prioritize and fix any issues found during testing
   - Retest to ensure the fixes work correctly

2. **Implement Improvements**:
   - Prioritize and implement any improvements
   - Test the improvements to ensure they work correctly

3. **Deploy**:
   - Deploy the changes to production
   - Monitor for any issues
   - Collect user feedback
