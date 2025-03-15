import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { FileObject } from '@supabase/storage-js';
import { v4 as uuidv4 } from 'uuid';

const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB chunks
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
  onProgress?: (progress: number) => void;
}

interface UploadState {
  isUploading: boolean;
  progress: number;
  error: Error | null;
}

interface UseFileUpload {
  uploadFile: (file: File, options?: UploadOptions) => Promise<string>;
  uploadState: UploadState;
  cancelUpload: () => void;
}

export function useFileUpload(): UseFileUpload {
  const supabase = useSupabaseClient();
  const { toast } = useToast();
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null
  });
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const validateFile = useCallback((file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new Error(`File type ${file.type} is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`);
    }
  }, []);

  const generateFilePath = useCallback((file: File, options: UploadOptions = {}) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const uuid = uuidv4();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();
    
    const baseFolder = options.isPublic ? 'public' : 'private';
    const customPath = options.customPath ? `/${options.customPath}` : '';
    
    return `${baseFolder}${customPath}/${timestamp}-${uuid}-${safeFileName}`;
  }, []);

  const uploadChunk = useCallback(async (
    file: File,
    filePath: string,
    start: number,
    end: number,
    uploadId: string,
    partNumber: number,
    abortSignal: AbortSignal
  ): Promise<{ etag: string }> => {
    const chunk = file.slice(start, end);
    const { data, error } = await supabase.storage
      .from('ocr-documents')
      .uploadChunk(
        filePath,
        uploadId,
        chunk,
        partNumber,
        { abortSignal }
      );

    if (error) throw error;
    if (!data?.etag) throw new Error('No etag returned from chunk upload');

    return { etag: data.etag };
  }, [supabase]);

  const uploadFile = useCallback(async (
    file: File,
    options: UploadOptions = {}
  ): Promise<string> => {
    try {
      validateFile(file);
      
      const filePath = generateFilePath(file, options);
      const controller = new AbortController();
      setAbortController(controller);
      
      setUploadState({
        isUploading: true,
        progress: 0,
        error: null
      });

      // For small files, use direct upload
      if (file.size <= CHUNK_SIZE) {
        const { data, error } = await supabase.storage
          .from('ocr-documents')
          .upload(filePath, file, {
            cacheControl: '3600',
            contentType: options.contentType || file.type,
            upsert: false
          });

        if (error) throw error;
        if (!data?.path) throw new Error('Upload successful but file path not returned');

        const { data: { publicUrl } } = supabase.storage
          .from('ocr-documents')
          .getPublicUrl(data.path);

        setUploadState(prev => ({ ...prev, isUploading: false, progress: 100 }));
        return publicUrl;
      }

      // For large files, use chunked upload
      const { data: { uploadId }, error: initError } = await supabase.storage
        .from('ocr-documents')
        .createMultipartUpload(filePath, {
          cacheControl: '3600',
          contentType: options.contentType || file.type
        });

      if (initError) throw initError;
      if (!uploadId) throw new Error('No upload ID returned');

      const parts: { etag: string }[] = [];
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        
        const part = await uploadChunk(
          file,
          filePath,
          start,
          end,
          uploadId,
          i + 1,
          controller.signal
        );
        
        parts.push(part);

        const progress = Math.round((i + 1) / totalChunks * 100);
        setUploadState(prev => ({ ...prev, progress }));
        options.onProgress?.(progress);
      }

      // Complete multipart upload
      const { data: completeData, error: completeError } = await supabase.storage
        .from('ocr-documents')
        .completeMultipartUpload(filePath, uploadId, parts);

      if (completeError) throw completeError;
      if (!completeData?.path) throw new Error('Upload completed but file path not returned');

      const { data: { publicUrl } } = supabase.storage
        .from('ocr-documents')
        .getPublicUrl(completeData.path);

      setUploadState(prev => ({ ...prev, isUploading: false, progress: 100 }));
      return publicUrl;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during upload';
      setUploadState(prev => ({
        ...prev,
        isUploading: false,
        error: error instanceof Error ? error : new Error(errorMessage)
      }));
      
      toast({
        title: 'Upload Error',
        description: errorMessage,
        variant: 'destructive'
      });
      
      throw error;
    } finally {
      setAbortController(null);
    }
  }, [supabase, validateFile, generateFilePath, uploadChunk, toast]);

  const cancelUpload = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setUploadState(prev => ({
        ...prev,
        isUploading: false,
        error: new Error('Upload cancelled')
      }));
      setAbortController(null);
    }
  }, [abortController]);

  return {
    uploadFile,
    uploadState,
    cancelUpload
  };
} 