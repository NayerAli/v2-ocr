import type { ProcessingStatus, OCRResult } from "@/types";
import type { OCRSettings, ProcessingSettings, UploadSettings } from "@/types/settings";
import { createClient as createClientBrowser } from '@/utils/supabase/client';

interface ProcessingServiceOptions {
  ocr: OCRSettings;
  processing: ProcessingSettings;
  upload: UploadSettings;
}

// This is a client-side implementation that doesn't use any server-only features
export async function getProcessingService(options: ProcessingServiceOptions) {
  const supabase = createClientBrowser();

  return {
    // Add a document to the queue
    addToQueue: async (files: File[]): Promise<string[]> => {
      if (!files.length) return [];

      // This is a client-side mock that just creates document entries
      // The actual processing would be triggered by an API route
      const documentIds: string[] = [];

      for (const file of files) {
        try {
          // Create a document entry
          const documentId = crypto.randomUUID();

          // Create a storage path for the file
          const filePath = `uploads/${documentId}/${file.name}`;

          // Upload to storage bucket
          const { error: uploadError } = await supabase.storage
            .from('ocr-documents')
            .upload(filePath, file);

          if (uploadError) {
            console.error('Error uploading file:', uploadError);
            continue;
          }

          // Get current user (client-side)
          const { data: { user } } = await supabase.auth.getUser();

          if (!user) {
            console.error('User not authenticated');
            continue;
          }

          // Insert document record
          const { error: insertError } = await supabase
            .from('documents')
            .insert({
              id: documentId,
              user_id: user.id,
              filename: file.name,
              original_filename: file.name, // Add original_filename field
              file_type: file.type,
              file_size: file.size,
              status: 'pending',
              storage_path: filePath,
            });

          if (insertError) {
            console.error('Error inserting document:', insertError);
            continue;
          }

          documentIds.push(documentId);
          
          // Trigger document processing immediately after upload
          try {
            const processResponse = await fetch('/api/documents/process', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ documentId })
            });
            
            if (!processResponse.ok) {
              console.error('Error triggering document processing:', await processResponse.text());
            } else {
              console.log('Document processing triggered for:', documentId);
            }
          } catch (processError) {
            console.error('Error triggering processing:', processError);
          }
        } catch (error) {
          console.error('Error adding file to queue:', error);
        }
      }

      return documentIds;
    },

    // Get the status of a document
    getStatus: async (id: string): Promise<ProcessingStatus | undefined> => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        console.error('Error getting document status:', error);
        return undefined;
      }

      return {
        id: data.id,
        userId: data.user_id,
        filename: data.filename,
        status: data.status,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        processingStartedAt: data.processing_started_at ? new Date(data.processing_started_at) : undefined,
        processingCompletedAt: data.processing_completed_at ? new Date(data.processing_completed_at) : undefined,
        fileType: data.file_type,
        fileSize: data.file_size,
        currentPage: data.current_page,
        totalPages: data.total_pages,
        storagePath: data.storage_path,
      };
    },

    // Cancel processing
    cancelProcessing: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('documents')
        .update({ status: 'cancelled' })
        .eq('id', id);

      if (error) {
        console.error('Error cancelling document:', error);
      }
    },

    // Pause the queue
    pauseQueue: async (): Promise<void> => {
      // This is a client-side mock - actual implementation would be server-side
      console.log('Queue paused (client-side)');
    },

    // Resume the queue
    resumeQueue: async (): Promise<void> => {
      // This is a client-side mock - actual implementation would be server-side
      console.log('Queue resumed (client-side)');
    },

    // Update settings
    updateSettings: async (settings: ProcessingServiceOptions): Promise<void> => {
      // This is a client-side mock - actual implementation would save to user settings
      console.log('Settings updated (client-side):', settings);
    },

    // Retry a document
    retryDocument: async (id: string): Promise<ProcessingStatus | null> => {
      // Reset the document status to 'pending'
      const { data, error } = await supabase
        .from('documents')
        .update({
          status: 'pending',
          current_page: null,
          processing_started_at: null,
          processing_completed_at: null
        })
        .eq('id', id)
        .select()
        .single();

      if (error || !data) {
        console.error('Error retrying document:', error);
        return null;
      }

      return {
        id: data.id,
        userId: data.user_id,
        filename: data.filename,
        status: data.status,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        processingStartedAt: data.processing_started_at ? new Date(data.processing_started_at) : undefined,
        processingCompletedAt: data.processing_completed_at ? new Date(data.processing_completed_at) : undefined,
        fileType: data.file_type,
        fileSize: data.file_size,
        currentPage: data.current_page,
        totalPages: data.total_pages,
        storagePath: data.storage_path,
      };
    }
  };
}