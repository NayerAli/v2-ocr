# Document Status Handling Improvements - 20-05-2024 17:30

## Issue Description
When documents were uploaded but failed to process due to API errors or other issues, they were not properly displayed in the document list. This made it difficult for users to see, manage, or retry failed documents.

## Root Causes
1. The `canViewDocument` function in the `DocumentList` component only allowed viewing completed documents or cancelled documents with processed pages
2. The dropdown menu actions didn't include options for retrying failed documents
3. There was no API endpoint to update document status

## Implemented Fixes

### 1. Enhanced Document Visibility
- Updated the `canViewDocument` function to allow viewing documents with error or failed status
- Ensured all documents are displayed in the list regardless of their status

### 2. Improved Action Handling
- Added a "Retry" action for documents with error or failed status
- Ensured the cancel button is shown for processing documents in both grid and table views
- Added appropriate actions for each document status

### 3. Added Document Update API
- Created a new API endpoint at `/api/documents/[id]` to handle document updates
- Implemented proper authentication and error handling
- Added support for updating document status and error information

### 4. Enhanced Document Details Dialog
- Added a retry button to the document details dialog for documents with error status
- Improved error information display

### 5. Updated Status Filtering
- Added "failed" status to the status filter dropdown in the documents page
- Ensured all possible document statuses are available for filtering

## Files Modified
1. `app/components/document-list.tsx` - Updated document visibility and actions
2. `app/components/document-details-dialog.tsx` - Added retry button
3. `app/documents/page.tsx` - Added failed status to filter
4. Created new file: `app/api/documents/[id]/route.ts` - API endpoint for document updates

## Testing
The changes have been tested to ensure:
1. All documents are displayed in the list regardless of their status
2. Appropriate actions are available for each document status
3. Failed documents can be retried
4. Document details dialog shows error information and retry button

## Next Steps
1. Monitor the application to ensure the fix resolves the issue with document visibility
2. Consider adding more detailed error information for failed documents
3. Add more comprehensive logging for document status changes
