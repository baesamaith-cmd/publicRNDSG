// supabase-client.js - Supabase client initialization
// This file is loaded via <script> tag, NOT as an ES module
// Expects window.supabase to already exist (loaded via CDN before this script)

// Supabase project credentials
var SUPABASE_URL = 'https://tnenfmuvvhqltsinwlrt.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_4vHwyowJ3MEvycmopfty0Q_jvBQV3Q2';

// Initialize Supabase client
var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expose globally
window.supabaseClient = supabaseClient;

// Helper: Get current user
window.getUser = async function() {
    var data = await supabaseClient.auth.getUser();
    return data.data ? data.data.user : null;
};

// Helper: Check if user is admin
window.isAdmin = async function() {
    var user = await window.getUser();
    if (!user) return false;
    var data = await supabaseClient.from('users').select('role').eq('id', user.id).single();
    return data.data && data.data.role === 'admin';
};

// Helper: Get current session
window.getSession = async function() {
    var data = await supabaseClient.auth.getSession();
    return data.data.session;
};

console.log('Supabase client initialized');
