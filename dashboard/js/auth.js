// Simple Password Protection
(function() {
    const CORRECT_PASSWORD = '202601';
    const SESSION_KEY = 'igms_authenticated';

    // Check if already authenticated in this session
    if (sessionStorage.getItem(SESSION_KEY) === 'true') {
        showDashboard();
        return;
    }

    // Show login screen
    document.getElementById('loginScreen').style.display = 'flex';

    // Handle login form submission
    document.getElementById('loginForm').addEventListener('submit', function(e) {
        e.preventDefault();

        const password = document.getElementById('passwordInput').value;
        const errorElement = document.getElementById('loginError');

        if (password === CORRECT_PASSWORD) {
            sessionStorage.setItem(SESSION_KEY, 'true');
            showDashboard();
        } else {
            errorElement.textContent = '비밀번호가 올바르지 않습니다.';
            document.getElementById('passwordInput').value = '';
            document.getElementById('passwordInput').focus();
        }
    });

    function showDashboard() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainContainer').style.display = 'block';
    }
})();
