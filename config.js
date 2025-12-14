export const config = {
  telegramToken: process.env.BOT_TOKEN,
  mongodbUri: process.env.MONGODB_URI, // ← вот здесь!
  adminChatIds: [5191412364, 369745517]
};
