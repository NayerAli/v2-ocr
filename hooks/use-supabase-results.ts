import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { OCRResult } from '@/types';
import { useToast } from '@/components/ui/use-toast';
import { v4 as uuidv4 } from 'uuid';

interface UseSupabaseResultsOptions {
  documentId: string;
  initialFetch?: boolean;
}

export function useSupabaseResults(options: UseSupabaseResultsOptions) {
  const { documentId, initialFetch = true } = options;
  const [results, setResults] = useState<OCRResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();

  // Function to fetch results for a document
  const fetchResults = async () => {
    if (!documentId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const { data, error: fetchError } = await supabase
        .from('results')
        .select('*')
        .eq('document_id', documentId)
        .order('page', { ascending: true });
      
      if (fetchError) {
        throw new Error(`Failed to fetch results: ${fetchError.message}`);
      }
      
      const processedData = data.map(result => ({
        id: result.id,
        documentId: result.document_id,
        page: result.page,
        imageUrl: result.image_url,
        text: result.text,
        confidence: result.confidence,
        createdAt: new Date(result.created_at).getTime()
      }));
      
      setResults(processedData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An unknown error occurred'));
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to fetch results',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Function to save OCR results
  const saveResults = async (newResults: Omit<OCRResult, 'id' | 'documentId' | 'createdAt'>[]) => {
    try {
      const formattedResults = newResults.map(result => ({
        id: uuidv4(),
        document_id: documentId,
        page: result.page,
        image_url: result.imageUrl,
        text: result.text,
        confidence: result.confidence
      }));
      
      const { error: saveError } = await supabase
        .from('results')
        .insert(formattedResults);
      
      if (saveError) {
        throw new Error(`Failed to save results: ${saveError.message}`);
      }
      
      // Refresh results after saving
      await fetchResults();
      
      toast({
        title: 'Success',
        description: 'Results saved successfully',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save results';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  // Function to update an OCR result
  const updateResult = async (result: OCRResult) => {
    try {
      const { error: updateError } = await supabase
        .from('results')
        .update({
          page: result.page,
          image_url: result.imageUrl,
          text: result.text,
          confidence: result.confidence
        })
        .eq('id', result.id);
      
      if (updateError) {
        throw new Error(`Failed to update result: ${updateError.message}`);
      }
      
      setResults(prev => 
        prev.map(r => r.id === result.id ? result : r)
      );
      
      toast({
        title: 'Success',
        description: 'Result updated successfully',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update result';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  // Function to delete an OCR result
  const deleteResult = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('results')
        .delete()
        .eq('id', id);
      
      if (deleteError) {
        throw new Error(`Failed to delete result: ${deleteError.message}`);
      }
      
      setResults(prev => prev.filter(r => r.id !== id));
      
      toast({
        title: 'Success',
        description: 'Result deleted successfully',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete result';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  // Set up real-time subscription for result changes
  useEffect(() => {
    if (!documentId) return;
    
    const channel = supabase
      .channel(`results-changes-${documentId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'results',
        filter: `document_id=eq.${documentId}`
      }, (payload) => {
        // Handle different types of changes
        if (payload.eventType === 'INSERT') {
          const newResult = payload.new as any;
          const formattedResult: OCRResult = {
            id: newResult.id,
            documentId: newResult.document_id,
            page: newResult.page,
            imageUrl: newResult.image_url,
            text: newResult.text,
            confidence: newResult.confidence,
            createdAt: new Date(newResult.created_at).getTime()
          };
          
          setResults(prev => [...prev, formattedResult].sort((a, b) => (a.page || 0) - (b.page || 0)));
        } else if (payload.eventType === 'UPDATE') {
          const updatedResult = payload.new as any;
          const formattedResult: OCRResult = {
            id: updatedResult.id,
            documentId: updatedResult.document_id,
            page: updatedResult.page,
            imageUrl: updatedResult.image_url,
            text: updatedResult.text,
            confidence: updatedResult.confidence,
            createdAt: new Date(updatedResult.created_at).getTime()
          };
          
          setResults(prev => 
            prev.map(r => r.id === formattedResult.id ? formattedResult : r)
          );
        } else if (payload.eventType === 'DELETE') {
          const deletedResult = payload.old as any;
          setResults(prev => prev.filter(r => r.id !== deletedResult.id));
        }
      })
      .subscribe();
    
    // Initial fetch if requested
    if (initialFetch) {
      fetchResults();
    }
    
    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [documentId, initialFetch]);

  return {
    results,
    loading,
    error,
    fetchResults,
    saveResults,
    updateResult,
    deleteResult
  };
} 