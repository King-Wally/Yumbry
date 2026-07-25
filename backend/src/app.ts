import path from 'node:path';
import fs from 'node:fs';
import express, { type NextFunction, type Request, type Response } from 'express';
import { recipesRouter } from './routes/recipes.routes.js';
import { tagsRouter } from './routes/tags.routes.js';
import { categoriesRouter } from './routes/categories.routes.js';
import { UPLOADS_DIR } from './middleware/upload.js';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

export const app = express();

app.use(express.json({ limit: '2mb' }));

app.use('/uploads', express.static(UPLOADS_DIR));

app.use('/api/recipes', recipesRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/categories', categoriesRouter);

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
