# API Key Update Fix - 20-05-2024

## Issue Description
After updating the API key in the app's settings, some OCR jobs were still using the old (now invalid) key, resulting in intermittent failures. This happened even though the old key was deleted from the provider (Google, Microsoft, etc.), so it should never work.

## Root Causes
1. **Stale In-Memory State**: The OCR provider instance was created with the API key that was present at the time of its instantiation. When the key was updated in the UI, the running instance was not updated.
2. **Asynchronous/Batched Processing**: Jobs queued before the key was updated were using the key that was current at the time they were enqueued.
3. **Delayed Settings Propagation**: The settings update was asynchronous (saved to a database and then re-fetched), causing a delay before all parts of the app saw the new key.

## Implemented Fixes

### 1. Enhanced OCR Provider Creation
- Added a new `createOCRProviderWithLatestSettings` function that always gets the latest API key from the database
- Implemented a short-lived cache for providers to avoid recreating them unnecessarily
- Added proper error handling for API key retrieval failures

### 2. Improved Settings Update Propagation
- Modified the processing service to always use the latest API key
- Added cache clearing to ensure we always get the most up-to-date settings
- Made the service initialization process asynchronous to properly handle API key updates

### 3. In-Flight Job Management
- Added logic to cancel and restart in-flight jobs when the API key changes
- Implemented a mechanism to requeue jobs with the new API key
- Added proper error handling for job cancellation and requeuing

### 4. Additional Validations
- Added validation before processing a file to ensure a valid OCR provider is available
- Improved error handling and logging for API key issues

### 5. Code Cleanup
- Fixed all ESLint errors throughout the codebase
- Removed unused imports and variables
- Improved code comments and documentation

## Files Modified
1. `lib/ocr/providers/index.ts` - Enhanced provider creation with latest settings
2. `lib/ocr/processing-service.ts` - Improved service initialization and settings updates
3. `lib/ocr/queue-manager.ts` - Added method to update item status for requeuing
4. `lib/ocr/file-processor.ts` - Added validation before processing
5. Various other files to fix ESLint errors

## Testing
The changes have been tested to ensure:
1. New API keys are immediately used for all new OCR jobs
2. In-flight jobs are properly cancelled and requeued with the new API key
3. The application gracefully handles API key update scenarios

## Next Steps
1. Monitor the application to ensure the fix resolves the intermittent failures
2. Consider implementing a more robust event-based system for settings updates in the future
3. Add more comprehensive logging around API key usage to help diagnose any future issues
