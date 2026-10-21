// Загрузка новостей
async function loadNews() {
  const container = document.getElementById('news-container');
  
  try {
    const response = await fetch('/api/news');
    const data = await response.json();
    
    if (!data.news || data.news.length === 0) {
      container.innerHTML = '<p>Нет новостей</p>';
      return;
    }
    
    container.innerHTML = '';
    
    data.news.forEach(news => {
      const item = document.createElement('div');
      item.className = 'news-item';
      item.innerHTML = `
        <h3>${news.title}</h3>
        <p class="news-date">${new Date(news.createdAt).toLocaleDateString('ru-RU')}</p>
        <p>${news.text}</p>
      `;
      container.appendChild(item);
    });
  } catch (e) {
    console.error('Failed to load news:', e);
    container.innerHTML = '<p>Ошибка загрузки новостей</p>';
  }
}

loadNews();
