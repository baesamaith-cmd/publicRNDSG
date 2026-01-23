// Password Protection with API Authentication
(function() {
    const SESSION_KEY = 'igms_authenticated';
    const PASSWORD_KEY = 'igms_password';

    // Check if already authenticated in this session
    if (sessionStorage.getItem(SESSION_KEY) === 'true') {
        showDashboard();
        return;
    }

    // Show login screen
    document.getElementById('loginScreen').style.display = 'flex';

    // Handle login form submission
    document.getElementById('loginForm').addEventListener('submit', async function(e) {
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
            const response = await fetch('https://igms-api.netlify.app/.netlify/functions/data', {
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

    function showDashboard() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainContainer').style.display = 'block';
    }
})();
