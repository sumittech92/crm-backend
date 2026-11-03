import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import { UPLOAD_ROOT } from './routes/upload/upload.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
// Website images and videos uploaded by owners. nosniff stops browsers treating a file as another type.
app.use('/uploads', express.static(UPLOAD_ROOT, { index: false, setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));
app.use('/api/v1', routes);

app.get('/', (_req, res) => {
  res.status(200).json({ message: 'CRM API is running' });
});

export default app;

