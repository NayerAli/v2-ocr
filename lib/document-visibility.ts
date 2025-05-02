import type { ProcessingStatus } from "@/types";

/**
 * Determines if a document can be viewed based on its status
 * This function can be used on both client and server
 */
export function canViewDocument(doc: ProcessingStatus): boolean {
  if (doc.status === "completed") return true;

  // Allow viewing cancelled files if they have some processed pages
  if (doc.status === "cancelled") {
    return (doc.currentPage || 0) > 0 || (doc.totalPages || 0) > 0;
  }

  // Allow viewing error files to see the error details
  if (doc.status === "error" || doc.status === "failed") {
    return true;
  }

  return false;
}

/**
 * Get a document by ID
 * This function should only be called from server components or API routes
 */
export async function getDocumentById(documentId: string): Promise<ProcessingStatus | null> {
  try {
    // Import database service
    const { db } = await import('./database');

    // Get the document from the database
    return await db.getDocument(documentId);
  } catch (error) {
    console.error("Error getting document by ID:", error);
    return null;
  }
}

/**
 * Server-side function to check if a user can access a document
 * This should only be called from server components or API routes
 */
export async function canAccessDocument(
  documentId: string,
  userId: string
): Promise<{
  canAccess: boolean;
  canView: boolean;
  document?: ProcessingStatus;
  reason?: string;
}> {
  try {
    // Get the document from the database
    const document = await getDocumentById(documentId);

    if (!document) {
      return {
        canAccess: false,
        canView: false,
        reason: "Document not found"
      };
    }

    // Check if the document belongs to the user
    if (document.user_id !== userId) {
      return {
        canAccess: false,
        canView: false,
        document,
        reason: "Document belongs to another user"
      };
    }

    // Check if the document can be viewed
    const canView = canViewDocument(document);

    return {
      canAccess: true,
      canView,
      document,
      reason: canView ? undefined : "Document is not in a viewable state"
    };
  } catch (error) {
    console.error("Error checking document access:", error);
    return {
      canAccess: false,
      canView: false,
      reason: "Error checking document access"
    };
  }
}
