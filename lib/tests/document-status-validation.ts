import { db } from "../database";
import type { ProcessingStatus } from "@/types";
import { downloadFileFromStorage } from "../storage-utils";
import { getUser } from "../auth";

/**
 * Test to ensure no document in the database has status "queued" and a non-null error field
 * @returns An object with the test result and any invalid documents found
 */
export async function validateDocumentStatuses(): Promise<{
  valid: boolean;
  invalidDocuments: ProcessingStatus[];
}> {
  console.log('[TEST] Running document status validation test');

  // Get all documents from the database
  const documents = await db.getQueue();
  console.log(`[TEST] Found ${documents.length} documents in the database`);

  // Find documents with status "queued" and a non-null error field
  const invalidDocuments = documents.filter(doc =>
    doc.status === 'queued' && doc.error !== null && doc.error !== undefined
  );

  const valid = invalidDocuments.length === 0;

  if (valid) {
    console.log('[TEST] All documents have valid status and error field combinations');
  } else {
    console.error(`[TEST] Found ${invalidDocuments.length} documents with invalid status and error field combinations`);
    console.error('[TEST] Invalid documents:', invalidDocuments.map(doc => ({
      id: doc.id,
      filename: doc.filename,
      status: doc.status,
      error: doc.error
    })));

    // Fix invalid documents
    console.log('[TEST] Fixing invalid documents...');
    for (const doc of invalidDocuments) {
      console.log(`[TEST] Fixing document ${doc.id} (${doc.filename})`);
      doc.error = undefined;
      await db.saveToQueue(doc);
    }
    console.log('[TEST] All invalid documents fixed');
  }

  return { valid, invalidDocuments };
}

/**
 * Run the document status validation test
 */
export async function runDocumentStatusValidationTest(): Promise<void> {
  try {
    const result = await validateDocumentStatuses();

    if (result.valid) {
      console.log('[TEST] Document status validation test passed');
    } else {
      console.log('[TEST] Document status validation test failed');
      console.log('[TEST] Fixed', result.invalidDocuments.length, 'invalid documents');
    }
  } catch (error) {
    console.error('[TEST] Error running document status validation test:', error);
  }
}

/**
 * Retry a failed document by setting its status to 'queued' and clearing error
 * @param documentId The ID of the document to retry
 * @returns The updated document or null if not found
 */
export async function retryDocument(documentId: string): Promise<ProcessingStatus | null> {
  console.log(`[DEBUG] Retrying document ${documentId}`);

  // Get the document from the database
  const queue = await db.getQueue();
  const document = queue.find(item => item.id === documentId);

  if (!document) {
    console.error(`[DEBUG] Document ${documentId} not found for retry`);
    return null;
  }

  console.log(`[DEBUG] Found document to retry:`, {
    id: document.id,
    filename: document.filename,
    status: document.status,
    error: document.error,
    storagePath: document.storagePath
  });

  // Check if we need to download the file from storage
  if (!document.file && document.storagePath) {
    // Make sure we have a user_id
    const userId = document.user_id || (await getUser())?.id;

    if (userId) {
      console.log(`[DEBUG] Document has no file property, downloading from storage: ${userId}/${document.storagePath}`);

      // Download the file from storage
      const file = await downloadFileFromStorage(userId, document.storagePath);

      if (file) {
        console.log(`[DEBUG] File downloaded successfully: ${file.name}, size: ${file.size} bytes`);
        document.file = file;

        // If document didn't have user_id, set it now
        if (!document.user_id) {
          document.user_id = userId;
        }
      } else {
        console.error(`[DEBUG] Failed to download file from storage, retry may fail`);
      }
    } else {
      console.error(`[DEBUG] Cannot download file: No user ID available`);
    }
  } else if (!document.file) {
    console.error(`[DEBUG] Document has no file property and no storage path, retry may fail`);
  } else {
    console.log(`[DEBUG] Document already has file property, size: ${document.file.size} bytes`);
  }

  // Reset document properties for retry
  document.status = 'queued';
  document.error = undefined;
  document.progress = 0;
  document.currentPage = 0;
  document.updatedAt = new Date();

  // Clear any rate limit info if present
  if (document.rateLimitInfo) {
    document.rateLimitInfo = undefined;
  }

  // Save to database
  await db.saveToQueue(document);

  console.log(`[DEBUG] Document ${documentId} retried successfully`);

  return document;
}
