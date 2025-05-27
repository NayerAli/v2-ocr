"use strict";
// Configuration utilities for Supabase
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
exports.isSupabaseConfigured = isSupabaseConfigured;
import { getSupabaseClient } from "../../supabase/singleton-client";
import { debugLog } from "../../log";
// Get the singleton Supabase client
exports.supabase = getSupabaseClient();
// Check if Supabase is configured
function isSupabaseConfigured() {
    debugLog('[DEBUG] Checking Supabase configuration');
    debugLog('[DEBUG] NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Present' : 'Missing');
    debugLog('[DEBUG] NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Present' : 'Missing');
    var isConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    debugLog('[DEBUG] Supabase is configured:', isConfigured);
    return isConfigured;
}
