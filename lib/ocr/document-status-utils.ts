import type { ProcessingStatus } from "@/types";
import { db } from "../database";
import { downloadFileFromStorage } from "../storage-utils";
import { getUser } from "../auth";

/**
 * Update a document's status and ensure error field is properly handled
 * @param document The document to update
 * @param newStatus The new status to set
 * @param errorMessage Optional error message (only used when status is 'error')
 * @returns The updated document
 */
export async function updateDocumentStatus(
  document: ProcessingStatus,
  newStatus: string,
  errorMessage?: string
): Promise<ProcessingStatus> {
  console.log(`[DEBUG] Updating document ${document.id} status from ${document.status} to ${newStatus}`);

  // Update the status
  document.status = newStatus;

  // Handle error field based on status
  if (newStatus === 'error') {
    document.error = errorMessage || 'Unknown error';
    console.log(`[DEBUG] Setting error message: ${document.error}`);
  } else {
    // Clear error field for non-error statuses
    document.error = null;
    console.log(`[DEBUG] Clearing error field for non-error status`);
  }

  // Update timestamp
  document.updatedAt = new Date();

  // Save to database
  await db.saveToQueue(document);

  console.log(`[DEBUG] Document ${document.id} status updated successfully`);

  return document;
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
  document.error = null;
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
