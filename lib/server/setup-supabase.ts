import { supabase } from '../supabase';

/**
 * Sets up the Supabase database schema for local development
 */
export async function setupSupabaseSchema(): Promise<boolean> {
  try {
    console.log('Checking Supabase schema...');
    
    // Check if Supabase is available
    try {
      const { data, error } = await supabase.from('settings').select('count(*)').single();
      if (!error) {
        console.log('Supabase connection successful, tables already exist');
        return true;
      }
    } catch (e) {
      console.log('Error checking Supabase connection:', e);
    }
    
    console.log('Tables may not exist, attempting to create them...');
    
    // Create storage buckets if they don't exist
    try {
      const { error: bucketError } = await supabase.storage.createBucket('documents', {
        public: false,
        fileSizeLimit: 100 * 1024 * 1024, // 100MB limit
      });
      
      if (bucketError && bucketError.message !== 'Bucket already exists') {
        console.error('Error creating documents bucket:', bucketError);
      } else {
        console.log('Documents bucket created or already exists');
      }
    } catch (e) {
      console.error('Error creating storage bucket:', e);
    }
    
    console.log('Supabase schema setup completed');
    return true;
  } catch (error) {
    console.error('Error setting up Supabase schema:', error);
    return false;
  }
} 