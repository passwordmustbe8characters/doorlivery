import express from 'express';
import { config } from './config.js';
import { checkDb } from './db/client.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.get('/health', async (_req, res) => {
  const db = await checkDb();
  res.status(db === 'down' ? 503 : 200).json({ status: db === 'down' ? 'degraded' : 'ok', db });
});

app.use((_req, res) => {
  res.status(404).json({ error: true, message: 'Not found', code: 'NOT_FOUND' });
});

app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});
