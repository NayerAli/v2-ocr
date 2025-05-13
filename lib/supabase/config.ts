import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// Standard Supabase client options to ensure consistent configuration
export const getDefaultOptions = (cookies?: string) => {
  const options = {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'sb-auth-token',
      flowType: 'pkce'
    }
  } as any

  // Add cookies to headers if provided
  if (cookies) {
    options.global = {
      headers: {
        cookie: cookies
      }
    }
  }

  return options
}

// Create a client for server-side use with cookies
export function createServerClient(cookieString: string) {
  // Extract auth token directly from cookie string if possible
  let authToken = null;
  let refreshToken = '';
  
  try {
    if (cookieString) {
      const cookies = cookieString.split(';').map(c => c.trim());
      
      // Try to find auth cookie with standard and environment-specific names
      const authCookieNames = ['sb-auth-token', 'sb-localhost:8000-auth-token'];
      
      // Add Supabase project reference if in production
      const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0];
      if (projectRef && !authCookieNames.includes(`sb-${projectRef}-auth-token`)) {
        authCookieNames.push(`sb-${projectRef}-auth-token`);
      }
      
      // Try each auth cookie
      for (const cookieName of authCookieNames) {
        const authCookie = cookies.find(c => c.startsWith(`${cookieName}=`));
        if (authCookie) {
          try {
            const cookieValue = decodeURIComponent(authCookie.split('=')[1]);
            const authData = JSON.parse(cookieValue);
            
            if (authData.access_token) {
              authToken = authData.access_token;
              refreshToken = authData.refresh_token || '';
              break;
            }
          } catch (e) {
            console.error(`Error parsing ${cookieName} cookie`, e);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error extracting auth token from cookies', e);
  }
  
  // Create client with standard options
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    getDefaultOptions(cookieString)
  );
  
  // Set session directly if token was found
  if (authToken) {
    try {
      // Need to set this immediately and synchronously to ensure the session is available
      client.auth.setSession({ access_token: authToken, refresh_token: refreshToken });
    } catch (e) {
      console.error('Error setting session on Supabase client', e);
    }
  }
  
  return client;
}

// Create a client for client-side use
export function createBrowserClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    getDefaultOptions()
  )
} 