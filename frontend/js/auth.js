const errorMsg = document.getElementById('error-msg');

//function to show error
function showError(message) {
  errorMsg.textContent = message;
  errorMsg.style.display = 'block';
}

//NEW concept: setting button loading state
function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait...' : btn.dataset.label; //ternary operator
}

//Toggle password visibility
const passwordInput = document.getElementById('password-input');
const togglePasswordBtn = document.getElementById('toggle-password-btn');
const toggleIcon = document.getElementById('toggle-icon');

if (passwordInput && togglePasswordBtn && toggleIcon) {
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';

    //switch icons
    if (isPassword) {
      toggleIcon.classList.remove('fa-eye');
      toggleIcon.classList.add('fa-eye-slash');
    } else {
      toggleIcon.classList.remove('fa-eye-slash');
      toggleIcon.classList.add('fa-eye');
    }
  });
}

//REGISTER

const registerForm = document.getElementById('register-form');
const registerBtn = document.getElementById('register-btn');

if (registerForm) {
  registerBtn.dataset.label = 'Create Account';

  const passwordInput = document.getElementById('password-input');

  if (passwordInput) {
    passwordInput.addEventListener('input', () => {
      const val = passwordInput.value;

      checkRule('rule-length', val.length >= 8);
      checkRule('rule-upper', /[A-Z]/.test(val));
      checkRule('rule-lower', /[a-z]/.test(val));
      checkRule('rule-number', /[0-9]/.test(val));
    });
  }

  function checkRule(id, passed) {
    const el = document.getElementById(id);
    if (!el) return;

    //clear any existing pending timeout for this rule
    if (el.timeoutId) {
      clearTimeout(el.timeoutId);
      el.timeoutId = null;
    }

    if (passed) {
      el.classList.add('passed');
      el.textContent = '✓ ' + el.textContent.slice(2);
      el.timeoutId = setTimeout(() => {
        el.style.display = 'none';
        el.timeoutId = null;
      }, 500);
    } else {
      el.style.display = 'block';
      el.classList.remove('passed');
      el.textContent = '× ' + el.textContent.slice(2);
    }
  }

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault(); //prevents page reload
    const username = document.getElementById('username-input').value.trim();
    const email = document.getElementById('email-input').value.trim();
    const password = document.getElementById('password-input').value;

    if (!username || !email || !password) {
      return showError('All fields are required.');
    }

    //last check of password (with blocking register button)
    if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      return showError(
        'Please make sure your password meets all the requirements',
      );
    }

    setLoading(registerBtn, true);

    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return showError(data.message);
      }

      //saving token and user info to local storage
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.user.username);
      localStorage.setItem('userId', data.user.id);

      //redirecting to chat
      window.location.href = '../index.html';
    } catch (error) {
      showError('Something went wrong. Try again.');
    } finally {
      setLoading(registerBtn, false);
    }
  });
}

//LOGIN

const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');

if (loginForm) {
  loginBtn.dataset.label = 'Log in';

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email-input').value.trim();
    const password = document.getElementById('password-input').value;

    if (!email || !password) {
      return showError('All fields are required.');
    }

    setLoading(loginBtn, true);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return showError(data.message);
      }

      //saving token and user info to local storage
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.user.username);
      localStorage.setItem('userId', data.user.id);

      //redirecting to chat
      window.location.href = '../index.html';
    } catch (error) {
      showError('Something went wrong. Try again.');
    } finally {
      setLoading(loginBtn, false);
    }
  });
}
