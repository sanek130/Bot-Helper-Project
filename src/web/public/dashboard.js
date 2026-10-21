let currentDate = new Date();
let homeworkData = null;

// Форматирование даты
function formatDate(date) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Сегодня';
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return 'Завтра';
  } else {
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }
}

// Форматирование для API
function formatDateForAPI(date) {
  return date.toISOString().split('T')[0];
}

// Загрузка ДЗ
async function loadHomework() {
  const container = document.getElementById('homework-container');
  container.innerHTML = '<p>Загрузка ДЗ...</p>';
  
  try {
    const dateStr = formatDateForAPI(currentDate);
    const response = await fetch(`/api/homework?date=${dateStr}`);
    
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }
    
    homeworkData = await response.json();
    
    if (!homeworkData.homework) {
      container.innerHTML = '<p>Нет домашнего задания на этот день</p>';
      return;
    }
    
    container.innerHTML = '';
    
    Object.entries(homeworkData.homework).forEach(([subject, data]) => {
      const card = document.createElement('div');
      card.className = 'homework-card';
      
      const checkbox = homeworkData.completed?.[dateStr]?.includes(subject) ? 'checked' : '';
      
      card.innerHTML = `
        <h3>${subject}</h3>
        <p>${data.text || 'Нет текста'}</p>
        ${data.photos && data.photos.length > 0 ? 
          data.photos.map(photo => `<img src="/api/file/${photo}" alt="${subject}">`).join('') : ''}
        <div class="checkbox">
          <label>
            <input type="checkbox" ${checkbox} data-subject="${subject}">
            Выполнено
          </label>
        </div>
      `;
      
      container.appendChild(card);
    });
    
    // Обработка чекбоксов
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        const subject = e.target.dataset.subject;
        const dateStr = formatDateForAPI(currentDate);
        
        try {
          await fetch('/api/homework/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dateStr, subject, done: e.target.checked })
          });
        } catch (err) {
          console.error('Failed to update checkbox:', err);
        }
      });
    });
    
  } catch (e) {
    console.error('Failed to load homework:', e);
    container.innerHTML = '<p>Ошибка загрузки ДЗ</p>';
  }
}

// Обработка кнопок навигации
document.getElementById('prev-day').addEventListener('click', () => {
  currentDate.setDate(currentDate.getDate() - 1);
  updateDateDisplay();
  loadHomework();
});

document.getElementById('next-day').addEventListener('click', () => {
  currentDate.setDate(currentDate.getDate() + 1);
  updateDateDisplay();
  loadHomework();
});

// Обновление отображения даты
function updateDateDisplay() {
  document.getElementById('current-date').textContent = formatDate(currentDate);
}

// Копирование ДЗ
document.getElementById('copy-btn').addEventListener('click', async () => {
  if (!homeworkData || !homeworkData.homework) {
    alert('Нет ДЗ для копирования');
    return;
  }
  
  const dateStr = formatDateForAPI(currentDate);
  const response = await fetch(`/api/homework/copy?date=${dateStr}`);
  
  if (response.status === 401) {
    window.location.href = '/login';
    return;
  }
  
  const data = await response.json();
  
  if (data.text) {
    await navigator.clipboard.writeText(data.text);
    alert('ДЗ скопировано в буфер обмена');
  } else {
    alert('Нет ДЗ для копирования');
  }
});

// Выход
document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  } catch (e) {
    console.error('Logout error:', e);
  }
});

// Инициализация
updateDateDisplay();
loadHomework();
