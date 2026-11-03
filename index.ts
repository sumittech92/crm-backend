import dotenv from 'dotenv';
import http from 'http';
import app from './src/index.js';
import connectDB from './src/config/db.js';

dotenv.config();

const port = process.env.PORT || 4000;

async function startServer() {
  try {
    await connectDB();

    const server = http.createServer(app);
    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
