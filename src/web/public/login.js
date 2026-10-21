let specId = null;
let loginAttempts = 0;

// Обработка входа
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  specId = document.getElementById('specId').value.trim();
  const resultDiv = document.getElementById('result');
  
  resultDiv.className = 'result';
  resultDiv.style.display = 'none';
  
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specId })
    });
    
    const data = await response.json();
    
    if (data.success) {
      resultDiv.className = 'result success';
      resultDiv.textContent = data.message;
      document.getElementById('code-section').classList.remove('hidden');
    } else {
      resultDiv.className = 'result error';
      resultDiv.textContent = data.error || 'Ошибка входа';
    }
    
    resultDiv.style.display = 'block';
  } catch (e) {
    console.error('Login error:', e);
    resultDiv.className = 'result error';
    resultDiv.textContent = 'Ошибка сети';
    resultDiv.style.display = 'block';
  }
});

// Обработка подтверждения кода
document.getElementById('verify-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const code = document.getElementById('code').value.trim();
  const resultDiv = document.getElementById('result');
  
  resultDiv.className = 'result';
  resultDiv.style.display = 'none';
  
  try {
    const response = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specId, code, attempts: loginAttempts })
    });
    
    const data = await response.json();
    
    if (data.success) {
      resultDiv.className = 'result success';
      resultDiv.textContent = 'Вход успешен! Перенаправление...';
      resultDiv.style.display = 'block';
      
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1000);
    } else {
      loginAttempts = data.attempts || loginAttempts + 1;
      resultDiv.className = 'result error';
      resultDiv.textContent = data.error || 'Неверный код';
      resultDiv.style.display = 'block';
    }
  } catch (e) {
    console.error('Verify error:', e);
    resultDiv.className = 'result error';
    resultDiv.textContent = 'Ошибка сети';
    resultDiv.style.display = 'block';
  }
});
