import { createServerClient as createSSRServerClient } from '@supabase/ssr'
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
  } as {
    auth: {
      persistSession: boolean;
      autoRefreshToken: boolean;
      detectSessionInUrl: boolean;
      storageKey: string;
      flowType: 'pkce';
    };
    global?: {
      headers: {
        cookie: string;
      };
    };
  }

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

/**
 * Custom fetch implementation that handles network errors gracefully
 */
export const customFetch = (url: RequestInfo | URL, init?: RequestInit) => {
  return fetch(url, init).catch((err: Error) => {
    console.error('Supabase fetch error:', err)
    // For AggregateError or network errors, implement retry logic
    if (err.name === 'AggregateError' || err.message?.includes('fetch failed')) {
      console.warn('Retrying Supabase request due to network error')
      // Add a small delay before retry to avoid overwhelming the network
      return new Promise(resolve => setTimeout(resolve, 500))
        .then(() => fetch(url, init))
    }
    throw err
  })
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

  // Create client with SSR approach
  const client = createSSRServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          if (cookieString) {
            const cookies = cookieString.split(';').map(c => c.trim())
            const cookie = cookies.find(c => c.startsWith(`${name}=`))
            if (cookie) {
              return decodeURIComponent(cookie.split('=')[1])
            }
          }
          return undefined
        },
        set() {
          // This is handled by the middleware
        },
        remove() {
          // This is handled by the middleware
        },
      },
      global: {
        fetch: customFetch
      }
    }
  );

  // Set session directly if token was found (for backward compatibility)
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
  // Get project reference for the proper cookie name
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!.split('//')[1]!.split('.')[0]!
  
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: `sb-${projectRef}-auth-token`,
        flowType: 'pkce',
        // Use cookies instead of localStorage for auth state
        // This enables the cookie to be accessible across subdomains if needed
        storage: {
          getItem: (key) => {
            if (typeof document === 'undefined') return null
            const value = document.cookie
              .split(';')
              .find((c) => c.trim().startsWith(`${key}=`))
            if (!value) return null
            return decodeURIComponent(value.split('=')[1])
          },
          setItem: (key, value) => {
            if (typeof document === 'undefined') return
            // Set secure cookies with proper attributes
            document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax; ${location.protocol === 'https:' ? 'Secure;' : ''}`
          },
          removeItem: (key) => {
            if (typeof document === 'undefined') return
            document.cookie = `${key}=; path=/; max-age=0`
          }
        }
      }
    }
  )
}