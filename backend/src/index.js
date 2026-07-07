import express from 'express';
import cors from 'cors';
import { connectMongo } from './lib/mongo.js';
import datasetsRouter from './routes/datasets.js';
import visualisationsRouter from './visualiser/routes/visualisations.js';
import visualiseRouter from './visualiser/routes/visualise.js';
import organisationsRouter from './routes/organisations.js';
import departmentsRouter from './routes/departments.js';
import membershipsRouter from './routes/memberships.js';
import invitationsRouter from './routes/invitations.js';
import usersRouter from './routes/users.js';
import adminRouter from './routes/admin.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/organisations', organisationsRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/memberships', membershipsRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/users', usersRouter);
app.use('/api/datasets', datasetsRouter);
app.use('/api/visualise', visualiseRouter);
app.use('/api/visualisations', visualisationsRouter);
app.use('/api/admin', adminRouter);

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
