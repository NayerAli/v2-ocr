"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabaseClient = getSupabaseClient;
var supabase_js_1 = require("@supabase/supabase-js");
// Create a singleton Supabase client to be used across the application
var supabaseClient = null;
function getSupabaseClient() {
    if (!supabaseClient) {
        var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        var supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        console.log('Creating Supabase client with URL:', supabaseUrl ? 'URL provided' : 'URL missing');
        // Create client with appropriate configuration
        supabaseClient = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                // Use cookies for session storage to ensure server-side authentication works
                storageKey: 'sb-auth-token',
                flowType: 'pkce'
            }
        });
        console.log('Supabase client created successfully');
    }
    return supabaseClient;
}
