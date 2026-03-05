// auth.js - Google OAuth Authentication with Supabase
(function() {
    'use strict';

    // DOM Elements
    var loginScreen = document.getElementById('loginScreen');
    var mainContainer = document.getElementById('mainContainer');
    var googleLoginBtn = document.getElementById('googleLoginBtn');
    var orgModal = document.getElementById('orgModal');
    var orgInput = document.getElementById('orgInput');
    var deptInput = document.getElementById('deptInput');
    var orgSubmitBtn = document.getElementById('orgSubmitBtn');

    // Check if on a page with login screen (index.html)
    if (!loginScreen || !mainContainer) {
        // Secondary pages like graph.html - let them handle auth separately
        return;
    }

    // ============================================
    // PKCE: Handle OAuth callback code
    // ============================================
    async function handleAuthCallback() {
        var urlParams = new URLSearchParams(window.location.search);
        var code = urlParams.get('code');

        if (code) {
            // Exchange code for session
            loginScreen.innerHTML = '<div style="text-align:center;padding:50px;"><p>Signing you in...</p></div>';
            
            try {
                var _a = await window.supabaseClient.auth.exchangeCodeForSession(code);
                // Remove code from URL
                window.history.replaceState({}, document.title, window.location.pathname);
                // Check if user needs to complete profile
                await checkUserProfile();
            } catch (e) {
                console.error('Auth error:', e);
                loginScreen.innerHTML = '<div style="text-align:center;padding:50px;color:red;"><p>Authentication failed. Please try again.</p><button onclick="location.reload()" class="btn mt-4">Retry</button></div>';
            }
            return true;
        }
        return false;
    }

    // ============================================
    // Check if user has completed org/department
    // ============================================
    async function checkUserProfile() {
        var user = await window.getUser();
        if (!user) {
            showLoginScreen();
            return;
        }

        // Check if user has org/dept in public.users
        var _a = await window.supabaseClient.from('users').select('organization, department').eq('id', user.id).single();
        
        if (_a.data && _a.data.organization) {
            // User has completed profile - update last_login_at and show dashboard
            await window.supabaseClient.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);
            showDashboard();
        } else {
            // Show org/dept modal
            showOrgModal();
        }
    }

    // ============================================
    // Show/Hide Functions
    // ============================================
    function showLoginScreen() {
        loginScreen.style.display = 'flex';
        if (mainContainer) mainContainer.style.display = 'none';
    }

    function showDashboard() {
        if (loginScreen) loginScreen.style.display = 'none';
        if (mainContainer) mainContainer.style.display = 'block';

        // Initialize app
        if (typeof initApp === 'function') {
            initApp();
        }
    }

    function showOrgModal() {
        if (orgModal) {
            orgModal.style.display = 'flex';
        }
    }

    function hideOrgModal() {
        if (orgModal) {
            orgModal.style.display = 'none';
        }
    }

    // ============================================
    // Google OAuth Login
    // ============================================
    async function signInWithGoogle() {
        try {
            var _a = await window.supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + '/dashboard/'
                }
            });
        } catch (e) {
            console.error('Google sign-in error:', e);
            alert('Sign-in failed. Please try again.');
        }
    }

    // ============================================
    // Save Org/Department
    // ============================================
    async function saveOrgDept() {
        var organization = orgInput.value.trim();
        var department = deptInput.value.trim();

        if (!organization) {
            alert('Please enter your organization');
            return;
        }

        orgSubmitBtn.disabled = true;
        orgSubmitBtn.textContent = 'Saving...';

        try {
            var user = await window.getUser();
            if (!user) {
                alert('Session expired. Please sign in again.');
                location.reload();
                return;
            }

            // Upsert user profile
            var _a = await window.supabaseClient.from('users').upsert({
                id: user.id,
                email: user.email,
                name: user.user_metadata?.name || user.email,
                avatar_url: user.user_metadata?.avatar_url,
                organization: organization,
                department: department,
                last_login_at: new Date().toISOString()
            }, { onConflict: 'id' });

            hideOrgModal();
            showDashboard();
        } catch (e) {
            console.error('Save error:', e);
            alert('Failed to save. Please try again.');
        } finally {
            orgSubmitBtn.disabled = false;
            orgSubmitBtn.textContent = 'Continue';
        }
    }

    // ============================================
    // Logout
    // ============================================
    window.logout = async function() {
        await window.supabaseClient.auth.signOut();
        location.reload();
    };

    // ============================================
    // Initialize
    // ============================================
    async function init() {
        // Handle PKCE callback first
        var isCallback = await handleAuthCallback();
        if (isCallback) return;

        // Check existing session
        var session = await window.getSession();
        if (session) {
            await checkUserProfile();
        } else {
            showLoginScreen();
        }
    }

    // Event Listeners
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', signInWithGoogle);
    }

    if (orgSubmitBtn) {
        orgSubmitBtn.addEventListener('click', saveOrgDept);
    }

    // Allow Enter key in org/dept inputs
    if (orgInput) {
        orgInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') deptInput.focus();
        });
    }
    if (deptInput) {
        deptInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') saveOrgDept();
        });
    }

    // Start
    init();

})();
