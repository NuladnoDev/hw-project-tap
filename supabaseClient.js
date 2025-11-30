// Supabase Configuration
// REPLACE WITH YOUR SUPABASE URL AND ANON KEY
const SUPABASE_URL = 'https://eleogitrimqprymsfydk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JqCXIUA6i1Osh5sTHH-GIw_rtO2heI7';

let supabase;

if (window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.error('Supabase client library not loaded.');
}

export { supabase };
