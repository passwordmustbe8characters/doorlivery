import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { allowedOrigins, config } from './config.js';
import { checkDb, pool } from './db/client.js';
import { startRetentionSchedule } from './jobs/retention.js';
import { errorHandler, sendError, wantsHtml } from './lib/errors.js';
import { requestLogger } from './lib/logger.js';
import { requireSameOrigin } from './lib/origin.js';
import { byIp, rateLimit } from './lib/rate-limit.js';
import { securityHeaders } from './lib/security-headers.js';
import { sendErrorPage } from './views/error-page.js';
import { authRouter } from './routes/auth.js';
import { customerRouter } from './routes/customer.js';
import { deliveriesRouter } from './routes/deliveries.js';
import { riderRouter } from './routes/rider.js';

const app = express();
app.disable('x-powered-by');
// Render puts one proxy in front of us; needed so req.ip (login rate limit) is the real client.
app.set('trust proxy', config.NODE_ENV === 'production' ? 1 : false);
app.use(securityHeaders(config.NODE_ENV === 'production'));
app.use(requestLogger);
app.use(express.json({ limit: '32kb' }));

app.get('/health', async (_req, res) => {
  const db = await checkDb();
  res.status(db === 'down' ? 503 : 200).json({ status: db === 'down' ? 'degraded' : 'ok', db });
});

app.use('/c', customerRouter);
app.use('/r', riderRouter);

// Vendor API: cookie-authenticated, so every state-changing call must come from our own origin.
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api', rateLimit(600, 10 * 60_000, byIp));
app.use('/api', requireSameOrigin(allowedOrigins));
app.use('/api/auth', authRouter);
app.use('/api/deliveries', deliveriesRouter);
app.use('/api', (_req, res) => sendError(res, 'NOT_FOUND', 'Not found'));

// Vendor app (built React app), served from the same origin as the API. In dev, Vite serves it instead.
const webDist = resolve(import.meta.dirname, '../../web/dist');
if (existsSync(resolve(webDist, 'index.html'))) {
  const appCsp = [
    "default-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  app.use((_req, res, next) => {
    res.set('Content-Security-Policy', appCsp);
    next();
  });
  app.use('/assets', express.static(resolve(webDist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
  app.use(express.static(webDist, { index: false }));
  // Client-side routes (/, /login, /deliveries/...) all get index.html.
  app.get(/^\/(?!api\/|c\/|r\/|health$).*/, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(resolve(webDist, 'index.html'));
  });
}

app.use((req, res) => (wantsHtml(req) ? sendErrorPage(res, 404) : sendError(res, 'NOT_FOUND', 'Not found')));

app.use(errorHandler);

const server = app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});

// Retention job: on by default in production, off in development unless asked for.
const retentionOn = config.RETENTION_JOB_ENABLED ? config.RETENTION_JOB_ENABLED === 'true' : config.NODE_ENV === 'production';
if (retentionOn && pool) startRetentionSchedule();

// Render sends SIGTERM on deploys: finish in-flight requests, then close the DB pool.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    void (pool?.end() ?? Promise.resolve()).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
