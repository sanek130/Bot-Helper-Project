import config from '../config.js';

// Загрузка городов и школ
let cities = [];
let schoolsByCity = {};

async function loadData() {
  try {
    const citiesResponse = await fetch('/data/cities.json');
    cities = await citiesResponse.json();
    
    const schoolsResponse = await fetch('/data/schools.json');
    schoolsByCity = await schoolsResponse.json();
    
    // Заполняем список городов
    const citySelect = document.getElementById('city');
    cities.forEach(city => {
      const option = document.createElement('option');
      option.value = city;
      option.textContent = city;
      citySelect.appendChild(option);
    });
  } catch (e) {
    console.error('Failed to load data:', e);
  }
}

// Обработка выбора города
document.getElementById('city').addEventListener('change', async (e) => {
  const city = e.target.value;
  const schoolSelect = document.getElementById('school');
  
  schoolSelect.innerHTML = '<option value="">Выберите школу</option>';
  schoolSelect.disabled = true;
  
  if (city && schoolsByCity[city]) {
    const schools = schoolsByCity[city];
    schools.forEach(school => {
      const option = document.createElement('option');
      option.value = school;
      option.textContent = school;
      schoolSelect.appendChild(option);
    });
    schoolSelect.disabled = false;
  }
});

// Обработка отправки формы
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const city = document.getElementById('city').value;
  const school = document.getElementById('school').value;
  const classLetter = document.getElementById('classLetter').value;
  const classNumber = document.getElementById('classNumber').value;
  const role = document.getElementById('role').value;
  
  const className = `${classNumber}${classLetter}`;
  
  const resultDiv = document.getElementById('result');
  resultDiv.className = 'result';
  resultDiv.style.display = 'none';
  
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, school, class: className, role })
    });
    
    const data = await response.json();
    
    if (data.success) {
      resultDiv.className = 'result success';
      resultDiv.innerHTML = `
        <h3>Регистрация успешна!</h3>
        <p>Спец-ID: <code>${data.specId}</code></p>
        <p>Перейдите в Telegram и откройте ссылку для активации:</p>
        <p><a href="${data.activationLink}" target="_blank">${data.activationLink}</a></p>
        <p>После активации вы сможете войти на сайт.</p>
      `;
    } else {
      resultDiv.className = 'result error';
      resultDiv.textContent = data.error || 'Ошибка регистрации';
    }
    
    resultDiv.style.display = 'block';
  } catch (e) {
    console.error('Registration error:', e);
    resultDiv.className = 'result error';
    resultDiv.textContent = 'Ошибка сети';
    resultDiv.style.display = 'block';
  }
});

loadData();
