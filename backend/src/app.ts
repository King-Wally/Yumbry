import path from 'node:path';
import fs from 'node:fs';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.routes.js';
import { recipesRouter } from './routes/recipes.routes.js';
import { tagsRouter } from './routes/tags.routes.js';
import { categoriesRouter } from './routes/categories.routes.js';
import { aiRouter } from './routes/ai.routes.js';
import { UPLOADS_DIR } from './middleware/upload.js';
import { requireAuth } from './middleware/require-auth.js';
import { requirePhotoOwner } from './middleware/require-photo-owner.js';
import { apiRateLimiter } from './middleware/rate-limit.js';
import { asyncHandler } from './utils/async-handler.js';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

export const app = express();
app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use('/api', apiRateLimiter);

app.use('/uploads', requireAuth, asyncHandler(requirePhotoOwner), express.static(UPLOADS_DIR));

app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok' }));

app.use('/api/auth', authRouter);
app.use('/api/recipes', requireAuth, recipesRouter);
app.use('/api/tags', requireAuth, tagsRouter);
app.use('/api/categories', requireAuth, categoriesRouter);
app.use('/api/ai', requireAuth, aiRouter);

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
