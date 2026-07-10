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

//REGISTER

const registerBtn = document.getElementById('register-btn');

if (registerBtn) {
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

    if (passed) {
      el.classList.add('passed');
      el.textContent = '✓ ' + el.textContent.slice(2);
      setTimeout(() => {
        el.style.display = 'none';
      }, 500);
    } else {
      el.style.display = 'block';
      el.classList.remove('passed');
      el.textContent = '× ' + el.textContent.slice(2);
    }
  }

  registerBtn.addEventListener('click', async () => {
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

const loginBtn = document.getElementById('login-btn');

if (loginBtn) {
  loginBtn.dataset.label = 'Log in';

  loginBtn.addEventListener('click', async () => {
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
