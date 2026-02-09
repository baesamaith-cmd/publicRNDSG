// Password Protection with API Authentication
(function () {
    const SESSION_KEY = 'igms_authenticated';
    const PASSWORD_KEY = 'igms_password';

    // Check if on a page with login screen
    const loginScreen = document.getElementById('loginScreen');
    const mainContainer = document.getElementById('mainContainer');

    // If login screen elements don't exist (e.g. graph.html), just check auth and maybe redirect
    if (!loginScreen || !mainContainer) {
        // We are on a secondary page like graph.html
        // Ideally we should verify auth here too, but for now just ensure we don't crash
        // If strict auth is needed:
        /*
        if (sessionStorage.getItem(SESSION_KEY) !== 'true') {
            window.location.href = 'index.html'; 
        }
        */
        return;
    }

    // Check if already authenticated in this session
    if (sessionStorage.getItem(SESSION_KEY) === 'true') {
        showDashboard();
        return;
    }

    // Show login screen
    loginScreen.style.display = 'flex';

    // Handle login form submission
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const password = document.getElementById('passwordInput').value;
            const errorElement = document.getElementById('loginError');

            // For local development, use hardcoded password
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                if (password === '202601') {
                    sessionStorage.setItem(SESSION_KEY, 'true');
                    sessionStorage.setItem(PASSWORD_KEY, password);
                    showDashboard();
                } else {
                    errorElement.textContent = '비밀번호가 올바르지 않습니다.';
                    document.getElementById('passwordInput').value = '';
                    document.getElementById('passwordInput').focus();
                }
                return;
            }

            // For production, verify password via API
            try {
                const response = await fetch('/.netlify/functions/data', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${password}`
                    }
                });

                if (response.ok) {
                    sessionStorage.setItem(SESSION_KEY, 'true');
                    sessionStorage.setItem(PASSWORD_KEY, password);
                    showDashboard();
                } else {
                    errorElement.textContent = '비밀번호가 올바르지 않습니다.';
                    document.getElementById('passwordInput').value = '';
                    document.getElementById('passwordInput').focus();
                }
            } catch (error) {
                console.error('Auth error:', error);
                errorElement.textContent = '인증 서버에 연결할 수 없습니다.';
            }
        });
    }

    function showDashboard() {
        if (loginScreen) loginScreen.style.display = 'none';
        if (mainContainer) mainContainer.style.display = 'block';

        // Initialize app after login
        if (typeof initApp === 'function') {
            initApp();
        }
    }
})();
