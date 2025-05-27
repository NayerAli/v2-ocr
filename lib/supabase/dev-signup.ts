/**
 * Development-only utilities for Supabase authentication
 * These functions are only meant to be used in development environments
 * where email sending is not configured.
 */

import { createClient } from '@supabase/supabase-js'
// SupabaseClient type is imported but not used
// import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Creates a new user in Supabase without email confirmation
 * This is a development-only function and should not be used in production
 *
 * @param email User email
 * @param password User password
 * @returns Success status and any error message
 */
export async function createUserWithoutEmailConfirmation(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; userId?: string }> {
  try {
    console.log('[DEV] Creating user without email confirmation:', email)

    // Create an admin client with service role key
    // This is only safe in development environments
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // First, create the user
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true // This automatically confirms the email
    })

    if (createError) {
      console.error('[DEV] Error creating user:', createError.message)
      return { success: false, error: createError.message }
    }

    if (!userData.user) {
      console.error('[DEV] No user returned after creation')
      return { success: false, error: 'No user returned after creation' }
    }

    console.log('[DEV] User created successfully:', userData.user.id)

    return {
      success: true,
      userId: userData.user.id
    }
  } catch (error) {
    console.error('[DEV] Exception creating user:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Checks if the current environment is development
 * @returns true if in development mode
 */
export function isDevelopmentMode(): boolean {
  return process.env.NODE_ENV === 'development' ||
         typeof window !== 'undefined' && (
           window.location.hostname === 'localhost' ||
           window.location.hostname === '127.0.0.1'
         )
}
