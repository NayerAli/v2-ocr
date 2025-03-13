import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { v4 as uuidv4 } from 'uuid';

export function useSupabaseStorage() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  /**
   * Uploads a file to Supabase Storage
   */
  const uploadFile = async (file: File, path?: string): Promise<string> => {
    try {
      setUploading(true);
      setProgress(0);
      
      // Generate a unique path if not provided
      const filePath = path || `${uuidv4()}-${file.name.replace(/\s+/g, '-')}`;
      
      // Upload the file
      const { data, error } = await supabase.storage
        .from('ocr-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          onUploadProgress: (progress) => {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            setProgress(percent);
          },
        });
      
      if (error) {
        throw new Error(`Error uploading file: ${error.message}`);
      }
      
      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('ocr-documents')
        .getPublicUrl(data.path);
      
      return publicUrl;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload file';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    } finally {
      setUploading(false);
    }
  };

  /**
   * Downloads a file from Supabase Storage
   */
  const downloadFile = async (path: string): Promise<Blob> => {
    try {
      const { data, error } = await supabase.storage
        .from('ocr-documents')
        .download(path);
      
      if (error) {
        throw new Error(`Error downloading file: ${error.message}`);
      }
      
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to download file';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  /**
   * Deletes a file from Supabase Storage
   */
  const deleteFile = async (path: string): Promise<void> => {
    try {
      const { error } = await supabase.storage
        .from('ocr-documents')
        .remove([path]);
      
      if (error) {
        throw new Error(`Error deleting file: ${error.message}`);
      }
      
      toast({
        title: 'Success',
        description: 'File deleted successfully',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete file';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  /**
   * Lists files in Supabase Storage
   */
  const listFiles = async (path?: string): Promise<{ name: string; size: number; created_at: string }[]> => {
    try {
      const { data, error } = await supabase.storage
        .from('ocr-documents')
        .list(path || '');
      
      if (error) {
        throw new Error(`Error listing files: ${error.message}`);
      }
      
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to list files';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  return {
    uploadFile,
    downloadFile,
    deleteFile,
    listFiles,
    uploading,
    progress
  };
} 