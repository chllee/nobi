import express from 'express';
import cors from 'cors';
import { connectMongo } from './lib/mongo.js';
import datasetsRouter from './routes/datasets.js';
import visualiseRouter from './routes/visualise.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/datasets', datasetsRouter);
app.use('/api/visualise', visualiseRouter);

connectMongo()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });
