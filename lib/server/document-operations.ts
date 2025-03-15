import { supabase } from '../supabase';
import { v4 as uuidv4 } from 'uuid';
import type { ProcessingStatus, OCRResult } from '@/types';
import { StorageError } from '@supabase/storage-js';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp'
];

interface UploadOptions {
  isPublic?: boolean;
  customPath?: string;
  contentType?: string;
}

/**
 * Validates a file before upload
 */
function validateFile(file: File): void {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }

  // Check file type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error(`File type ${file.type} is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`);
  }
}

/**
 * Generates a safe file path for upload
 */
function generateFilePath(file: File, userId: string, options: UploadOptions = {}): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const uuid = uuidv4();
  const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();
  
  const baseFolder = options.isPublic ? 'public' : userId;
  const customPath = options.customPath ? `/${options.customPath}` : '';
  
  return `${baseFolder}${customPath}/${timestamp}-${uuid}-${safeFileName}`;
}

/**
 * Handles specific upload errors
 */
function handleUploadError(error: StorageError): never {
  switch (error.error) {
    case 'Invalid bucket id':
      throw new Error('Storage bucket not found');
    case 'Payload too large':
      throw new Error(`File size exceeds the allowed limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    case 'Invalid file type':
      throw new Error('File type not allowed');
    default:
      throw new Error(`Upload failed: ${error.message}`);
  }
}

/**
 * Creates a new document in Supabase
 */
export async function createDocument(document: Omit<ProcessingStatus, 'id'>): Promise<ProcessingStatus> {
  const id = uuidv4();
  
  const { data, error } = await supabase
    .from('documents')
    .insert({
      filename: document.filename,
      status: document.status,
      progress: document.progress,
      current_page: document.currentPage,
      total_pages: document.totalPages,
      size: document.size,
      type: document.type,
      start_time: document.startTime ?? null,
      end_time: document.endTime ?? null,
      completion_time: document.completionTime ?? null
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating document:', error);
    throw new Error(`Failed to create document: ${error.message}`);
  }
  
  return {
    id: data.id,
    filename: data.filename,
    status: data.status as ProcessingStatus['status'],
    progress: data.progress,
    currentPage: data.current_page,
    totalPages: data.total_pages,
    size: data.size,
    type: data.type,
    startTime: data.start_time ?? undefined,
    endTime: data.end_time ?? undefined,
    completionTime: data.completion_time ?? undefined,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at)
  };
}

/**
 * Updates an existing document in Supabase
 */
export async function updateDocument(document: ProcessingStatus): Promise<ProcessingStatus> {
  const { data, error } = await supabase
    .from('documents')
    .update({
      filename: document.filename,
      status: document.status,
      progress: document.progress,
      current_page: document.currentPage,
      total_pages: document.totalPages,
      size: document.size,
      type: document.type,
      start_time: document.startTime,
      end_time: document.endTime,
      completion_time: document.completionTime,
      updated_at: new Date().toISOString()
    })
    .eq('id', document.id)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating document:', error);
    throw new Error(`Failed to update document: ${error.message}`);
  }
  
  return {
    id: data.id,
    filename: data.filename,
    status: data.status as ProcessingStatus['status'],
    progress: data.progress,
    currentPage: data.current_page,
    totalPages: data.total_pages,
    size: data.size,
    type: data.type,
    startTime: data.start_time,
    endTime: data.end_time,
    completionTime: data.completion_time,
    createdAt: new Date(data.created_at).getTime(),
    updatedAt: new Date(data.updated_at).getTime()
  };
}

/**
 * Gets all documents from Supabase
 */
export async function getAllDocuments(): Promise<ProcessingStatus[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching documents:', error);
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }
  
  return data.map(doc => ({
    id: doc.id,
    filename: doc.filename,
    status: doc.status as ProcessingStatus['status'],
    progress: doc.progress,
    currentPage: doc.current_page,
    totalPages: doc.total_pages,
    size: doc.size,
    type: doc.type,
    startTime: doc.start_time,
    endTime: doc.end_time,
    completionTime: doc.completion_time,
    createdAt: new Date(doc.created_at).getTime(),
    updatedAt: new Date(doc.updated_at).getTime()
  }));
}

/**
 * Gets a document by ID from Supabase
 */
export async function getDocumentById(id: string): Promise<ProcessingStatus | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      // Record not found
      return null;
    }
    console.error('Error fetching document:', error);
    throw new Error(`Failed to fetch document: ${error.message}`);
  }
  
  return {
    id: data.id,
    filename: data.filename,
    status: data.status as ProcessingStatus['status'],
    progress: data.progress,
    currentPage: data.current_page,
    totalPages: data.total_pages,
    size: data.size,
    type: data.type,
    startTime: data.start_time,
    endTime: data.end_time,
    completionTime: data.completion_time,
    createdAt: new Date(data.created_at).getTime(),
    updatedAt: new Date(data.updated_at).getTime()
  };
}

/**
 * Deletes a document by ID from Supabase
 */
export async function deleteDocument(id: string): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('Error deleting document:', error);
    throw new Error(`Failed to delete document: ${error.message}`);
  }
}

/**
 * Saves OCR results to Supabase
 */
export async function saveOCRResults(documentId: string, results: OCRResult[]): Promise<void> {
  const formattedResults = results.map(result => ({
    id: result.id || uuidv4(),
    document_id: documentId,
    page: result.page,
    image_url: result.imageUrl,
    text: result.text,
    confidence: result.confidence
  }));
  
  const { error } = await supabase
    .from('results')
    .upsert(formattedResults, { onConflict: 'id' });
  
  if (error) {
    console.error('Error saving OCR results:', error);
    throw new Error(`Failed to save OCR results: ${error.message}`);
  }
}

/**
 * Gets OCR results for a document from Supabase
 */
export async function getOCRResults(documentId: string): Promise<OCRResult[]> {
  const { data, error } = await supabase
    .from('results')
    .select('*')
    .eq('document_id', documentId)
    .order('page', { ascending: true });
  
  if (error) {
    console.error('Error fetching OCR results:', error);
    throw new Error(`Failed to fetch OCR results: ${error.message}`);
  }
  
  return data.map(result => ({
    id: result.id,
    documentId: result.document_id,
    page: result.page,
    imageUrl: result.image_url,
    text: result.text,
    confidence: result.confidence,
    createdAt: new Date(result.created_at).getTime()
  }));
}

/**
 * Uploads a file to Supabase Storage with proper validation and error handling
 */
export async function uploadFile(
  file: File,
  userId: string,
  options: UploadOptions = {}
): Promise<string> {
  try {
    // Validate file before upload
    validateFile(file);

    // Generate safe file path
    const filePath = generateFilePath(file, userId, options);

    // Prepare upload options
    const uploadOptions = {
      cacheControl: '3600',
      contentType: options.contentType || file.type,
      upsert: false
    };

    // Upload file
    const { data, error } = await supabase.storage
      .from('ocr-documents')
      .upload(filePath, file, uploadOptions);

    if (error) {
      handleUploadError(error);
    }

    if (!data?.path) {
      throw new Error('Upload successful but file path not returned');
    }

    // Get public URL for the file
    const { data: { publicUrl } } = supabase.storage
      .from('ocr-documents')
      .getPublicUrl(data.path);

    return publicUrl;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error instanceof Error ? error : new Error('Unknown error during file upload');
  }
}

/**
 * Downloads a file from storage
 */
export async function downloadFile(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage
    .from('ocr-documents')
    .download(path);

  if (error) {
    console.error('Error downloading file:', error);
    throw new Error(`Failed to download file: ${error.message}`);
  }

  if (!data) {
    throw new Error('No data received from download');
  }

  return data;
}

/**
 * Deletes a file from storage
 */
export async function deleteFile(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from('ocr-documents')
    .remove([path]);

  if (error) {
    console.error('Error deleting file:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Lists files in a specific path
 */
export async function listFiles(path: string = ''): Promise<any[]> {
  const { data, error } = await supabase.storage
    .from('ocr-documents')
    .list(path);

  if (error) {
    console.error('Error listing files:', error);
    throw new Error(`Failed to list files: ${error.message}`);
  }

  return data || [];
} 