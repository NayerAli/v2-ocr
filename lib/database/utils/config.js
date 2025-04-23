"use strict";
// Configuration utilities for Supabase
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
exports.isSupabaseConfigured = isSupabaseConfigured;
var singleton_client_1 = require("../../supabase/singleton-client");
var log_1 = require("../../log");
// Get the singleton Supabase client
exports.supabase = (0, singleton_client_1.getSupabaseClient)();
// Check if Supabase is configured
function isSupabaseConfigured() {
    (0, log_1.debugLog)('[DEBUG] Checking Supabase configuration');
    (0, log_1.debugLog)('[DEBUG] NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Present' : 'Missing');
    (0, log_1.debugLog)('[DEBUG] NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Present' : 'Missing');
    var isConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    (0, log_1.debugLog)('[DEBUG] Supabase is configured:', isConfigured);
    return isConfigured;
}
