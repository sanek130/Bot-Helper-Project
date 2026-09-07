import { config } from './index.js';

// MongoDB connection manager
let dbConnection = null;

export async function connectDB() {
  if (dbConnection) {
    return dbConnection;
  }

  const mongoose = await import('mongoose');
  
  try {
    await mongoose.default.connect(config.mongodb.uri, config.mongodb.options);
    dbConnection = mongoose.default.connection;
    
    dbConnection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    dbConnection.once('open', () => {
      console.log('Connected to MongoDB');
    });

    return dbConnection;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

export async function closeDBConnection() {
  const mongoose = await import('mongoose');
  if (mongoose.default.connection && mongoose.default.connection.readyState !== 0) {
    await mongoose.default.disconnect();
    console.log('MongoDB connection closed');
  }
}

export default connectDB;
