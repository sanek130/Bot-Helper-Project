import mongoose from 'mongoose';

// Тесты никогда не берут MONGO_URI из .env: иначе они могли бы очистить рабочую базу.
const BASE_URI = process.env.MONGO_TEST_URI || 'mongodb://localhost:27017';

// Каждый тестовый файл получает свою базу: node --test запускает файлы параллельно.
export async function connectTestDb(name) {
  const uri = `${BASE_URI.replace(/\/+$/, '')}/hwhelper_test_${name}`;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
    return true;
  } catch {
    console.warn(`MongoDB недоступна (${BASE_URI}): тесты с базой пропущены. Укажи MONGO_TEST_URI.`);
    return false;
  }
}

export async function dropTestDb() {
  if (mongoose.connection.readyState !== 1) return;
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
}
