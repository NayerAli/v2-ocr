import { supabase } from "./database/utils";

/**
 * Infer the MIME type from a filename
 * @param filename The filename
 * @returns The inferred MIME type
 */
function inferMimeType(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() || '';

  switch (extension) {
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Download a file from Supabase storage
 * @param userId The user ID
 * @param storagePath The storage path of the file
 * @returns The file as a File object or null if there was an error
 */
export async function downloadFileFromStorage(userId: string, storagePath: string): Promise<File | null> {
  try {
    console.log(`[DEBUG] Downloading file from storage: ${userId}/${storagePath}`);

    // Create the full path with user ID
    const fullPath = `${userId}/${storagePath}`;

    // Download the file from Supabase storage
    const { data, error } = await supabase
      .storage
      .from('ocr-documents')
      .download(fullPath);

    if (error) {
      console.error(`[DEBUG] Error downloading file from storage:`, error);
      return null;
    }

    if (!data) {
      console.error(`[DEBUG] No data returned from storage download`);
      return null;
    }

    // Get the filename from the storage path
    const filename = storagePath.split('/').pop() || 'unknown';

    // Create a File object from the Blob
    const file = new File([data], filename, {
      type: data.type || inferMimeType(filename)
    });

    console.log(`[DEBUG] File downloaded successfully: ${filename}, size: ${file.size} bytes`);

    return file;
  } catch (error) {
    console.error(`[DEBUG] Exception in downloadFileFromStorage:`, error);
    return null;
  }
}
