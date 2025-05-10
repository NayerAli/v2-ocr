/**
 * Server-specific authentication helper that doesn't rely on cookies or headers
 * This is specifically designed for background processing contexts where normal auth doesn't work
 */

import { createClient } from '@supabase/supabase-js'

// Create a direct Supabase client without relying on cookies
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Create a service role client for admin operations
const serviceClient = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null

/**
 * Get user settings directly from the database using the user ID
 * This bypasses the normal authentication flow
 */
export async function getUserSettingsById(userId: string) {
  if (!userId) {
    console.log('[SERVER-AUTH] No user ID provided')
    return null
  }

  try {
    // Try to use service client first for admin access
    if (serviceClient) {
      const { data, error } = await serviceClient
        .from('user_settings')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('[SERVER-AUTH] Error getting user settings with service client:', error.message)
      } else if (data) {
        console.log('[SERVER-AUTH] Retrieved user settings with service client')
        return data
      }
    }

    // Fall back to regular client
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('[SERVER-AUTH] Error getting user settings:', error.message)
      return null
    }

    return data
  } catch (error) {
    console.error('[SERVER-AUTH] Exception getting user settings:', error)
    return null
  }
}

/**
 * Get OCR settings directly from the database using the user ID
 * This bypasses the normal authentication flow
 */
export async function getOCRSettingsById(userId: string) {
  const settings = await getUserSettingsById(userId)
  if (!settings) {
    console.log('[SERVER-AUTH] No settings found for user:', userId)
    return null
  }

  return settings.ocr_settings
}

/**
 * Get processing settings directly from the database using the user ID
 * This bypasses the normal authentication flow
 */
export async function getProcessingSettingsById(userId: string) {
  const settings = await getUserSettingsById(userId)
  if (!settings) {
    console.log('[SERVER-AUTH] No settings found for user:', userId)
    return null
  }

  return settings.processing_settings
}

/**
 * Get user directly from the database using document ID
 * This is useful for background processing where we have a document ID but not a user ID
 */
export async function getUserByDocumentId(documentId: string) {
  if (!documentId) {
    console.log('[SERVER-AUTH] No document ID provided');
    return null;
  }

  try {
    // Try to use service client first for admin access
    if (serviceClient) {
      console.log(`[SERVER-AUTH] Attempting to get user ID for document ${documentId} with service client`);
      const { data, error } = await serviceClient
        .from('documents')
        .select('user_id, status')
        .eq('id', documentId)
        .single();

      if (error) {
        console.error('[SERVER-AUTH] Error getting document with service client:', error.message, error.code);
      } else if (data && data.user_id) {
        console.log(`[SERVER-AUTH] Retrieved user ID ${data.user_id} from document ${documentId} with service client (status: ${data.status})`);
        return { id: data.user_id };
      } else {
        console.log(`[SERVER-AUTH] Document ${documentId} found with service client but no user_id present`);
      }
    } else {
      console.log('[SERVER-AUTH] No service client available, using regular client');
    }

    // Fall back to regular client
    console.log(`[SERVER-AUTH] Attempting to get user ID for document ${documentId} with regular client`);
    const { data, error } = await supabase
      .from('documents')
      .select('user_id, status')
      .eq('id', documentId)
      .single();

    if (error) {
      console.error('[SERVER-AUTH] Error getting document with regular client:', error.message, error.code);
      return null;
    }

    if (data && data.user_id) {
      console.log(`[SERVER-AUTH] Retrieved user ID ${data.user_id} from document ${documentId} with regular client (status: ${data.status})`);
      return { id: data.user_id };
    }

    console.log(`[SERVER-AUTH] Document ${documentId} found but no user_id present`);
    return null;
  } catch (error) {
    console.error('[SERVER-AUTH] Exception getting document:', error);
    return null;
  }
}

/**
 * Get current user using service role
 * This is a fallback for server-side processing
 */
export async function getUser() {
  try {
    // We can't really get the current user in a background process
    // This is just a stub that will always return null
    console.log('[SERVER-AUTH] getUser called in server context - this will always return null');
    return null;
  } catch (error) {
    console.error('[SERVER-AUTH] Exception in getUser:', error);
    return null;
  }
}

/**
 * Server auth helper for background processing
 */
export const serverAuthHelper = {
  getUserSettingsById,
  getOCRSettingsById,
  getProcessingSettingsById,
  getUserByDocumentId,
  getUser
}
