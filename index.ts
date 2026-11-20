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


// DB_URI="mongodb+srv://ersumittech_db_user:rH3qLnHh5AuYhMbC@cluster0.cdth02z.mongodb.net/coaching_db"
// SECRET_KEY="qwertyuiop[ASDFGHJKLZXCVBNM,]",
// SUPERADMIN_ALLOWLIST=sumit@gmail.com|+91|9999988888,stuti@gmail.com|+91|8888899999