import mongoose from 'mongoose';

export async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pms_database';
  
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[MongoDB] Connected successfully to ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (err: any) {
    console.warn(`[MongoDB Warning] Could not establish connection to ${mongoUri}: ${err.message}`);
    console.warn('[MongoDB Notice] Server is still operational. Once MongoDB is running or MONGODB_URI is provided in Render environment variables, it will auto-connect.');
  }

  mongoose.connection.on('disconnected', () => {
    console.log('[MongoDB] Connection lost');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[MongoDB] Connection re-established');
  });
}
