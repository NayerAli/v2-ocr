import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { ProcessingStatus } from '@/types';
import { useToast } from '@/components/ui/use-toast';

interface UseSupabaseDocumentsOptions {
  initialFetch?: boolean;
}

export function useSupabaseDocuments(options: UseSupabaseDocumentsOptions = {}) {
  const { initialFetch = true } = options;
  const [documents, setDocuments] = useState<ProcessingStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();

  // Function to fetch all documents
  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error: fetchError } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (fetchError) {
        throw new Error(`Failed to fetch documents: ${fetchError.message}`);
      }
      
      const processedData = data.map(doc => ({
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
      
      setDocuments(processedData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An unknown error occurred'));
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to fetch documents',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Function to create a document
  const createDocument = async (document: Omit<ProcessingStatus, 'id'>) => {
    try {
      const { data, error: createError } = await supabase
        .from('documents')
        .insert({
          filename: document.filename,
          status: document.status,
          progress: document.progress,
          current_page: document.currentPage,
          total_pages: document.totalPages,
          size: document.size,
          type: document.type,
          start_time: document.startTime,
          end_time: document.endTime,
          completion_time: document.completionTime
        })
        .select()
        .single();
      
      if (createError) {
        throw new Error(`Failed to create document: ${createError.message}`);
      }
      
      const newDocument: ProcessingStatus = {
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
      
      setDocuments(prev => [newDocument, ...prev]);
      return newDocument;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create document';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  // Function to update a document
  const updateDocument = async (document: ProcessingStatus) => {
    try {
      const { data, error: updateError } = await supabase
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
      
      if (updateError) {
        throw new Error(`Failed to update document: ${updateError.message}`);
      }
      
      const updatedDocument: ProcessingStatus = {
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
      
      setDocuments(prev => 
        prev.map(doc => doc.id === updatedDocument.id ? updatedDocument : doc)
      );
      
      return updatedDocument;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update document';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  // Function to delete a document
  const deleteDocument = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', id);
      
      if (deleteError) {
        throw new Error(`Failed to delete document: ${deleteError.message}`);
      }
      
      setDocuments(prev => prev.filter(doc => doc.id !== id));
      
      toast({
        title: 'Success',
        description: 'Document deleted successfully',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete document';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  // Set up real-time subscription for document changes
  useEffect(() => {
    const channel = supabase
      .channel('documents-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'documents' 
      }, (payload) => {
        // Handle different types of changes
        if (payload.eventType === 'INSERT') {
          const newDoc = payload.new as any;
          const newDocument: ProcessingStatus = {
            id: newDoc.id,
            filename: newDoc.filename,
            status: newDoc.status as ProcessingStatus['status'],
            progress: newDoc.progress,
            currentPage: newDoc.current_page,
            totalPages: newDoc.total_pages,
            size: newDoc.size,
            type: newDoc.type,
            startTime: newDoc.start_time,
            endTime: newDoc.end_time,
            completionTime: newDoc.completion_time,
            createdAt: new Date(newDoc.created_at).getTime(),
            updatedAt: new Date(newDoc.updated_at).getTime()
          };
          
          setDocuments(prev => [newDocument, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          const updatedDoc = payload.new as any;
          const updatedDocument: ProcessingStatus = {
            id: updatedDoc.id,
            filename: updatedDoc.filename,
            status: updatedDoc.status as ProcessingStatus['status'],
            progress: updatedDoc.progress,
            currentPage: updatedDoc.current_page,
            totalPages: updatedDoc.total_pages,
            size: updatedDoc.size,
            type: updatedDoc.type,
            startTime: updatedDoc.start_time,
            endTime: updatedDoc.end_time,
            completionTime: updatedDoc.completion_time,
            createdAt: new Date(updatedDoc.created_at).getTime(),
            updatedAt: new Date(updatedDoc.updated_at).getTime()
          };
          
          setDocuments(prev => 
            prev.map(doc => doc.id === updatedDocument.id ? updatedDocument : doc)
          );
        } else if (payload.eventType === 'DELETE') {
          const deletedDoc = payload.old as any;
          setDocuments(prev => prev.filter(doc => doc.id !== deletedDoc.id));
        }
      })
      .subscribe();
    
    // Initial fetch if requested
    if (initialFetch) {
      fetchDocuments();
    }
    
    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialFetch]);

  return {
    documents,
    loading,
    error,
    fetchDocuments,
    createDocument,
    updateDocument,
    deleteDocument
  };
} 