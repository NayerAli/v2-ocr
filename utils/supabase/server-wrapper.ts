/**
 * Server wrapper for safely importing server-only Supabase client
 * This file maintains the same API as server.ts but:
 * 1. Uses dynamic imports to avoid bundling server-only code with client components
 * 2. Returns proper error messages when used incorrectly
 */

// Type definitions for the createClient function
interface SupabaseClient {
  from: (table: string) => any;
  storage: {
    from: (bucket: string) => any;
  };
  auth: {
    getUser: () => Promise<{ data: { user: any }, error: any }>;
    signOut: () => Promise<any>;
    // Add other auth methods as needed
  };
  rpc: (fn: string, params?: any) => any;
}

type CreateClientFunction = () => SupabaseClient;

/**
 * Safely creates a server-side Supabase client.
 * Will throw a clear error if imported from client components.
 */
export const createClient: CreateClientFunction = () => {
  if (typeof window !== 'undefined') {
    throw new Error(
      'Error: createClient from server-wrapper.ts was imported in a client component.\n' +
      'This is not allowed as it uses the server-only next/headers API.\n' +
      'Please use the client version from @/utils/supabase/client.ts instead.'
    );
  }

  // Dynamically import the server version
  const serverModule = require('./server');
  return serverModule.createClient();
};

// Add more server-side utility functions as needed 