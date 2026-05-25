// supabaseClient.js - Initialization for Supabase
const SUPABASE_URL = 'https://ajlbyphyztggsfcsjaad.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqbGJ5cGh5enRnZ3NmY3NqYWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUwNTIsImV4cCI6MjA5MzA0MTA1Mn0.55jVTWVmET02jZitURjrpqWu2HcFK9w5EiF1IzoPLds';

// Use a different name than the library's global 'supabase' object to avoid shadowing
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Resend Email via Supabase Edge Function ---
// The RESEND_API_KEY lives server-side as a Supabase secret — never in the browser.
// To set it: supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
// The edge function URL is auto-derived from SUPABASE_URL below.
const SEND_EMAIL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-email`;

