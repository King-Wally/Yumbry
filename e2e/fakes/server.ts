// One local HTTP server standing in for every external service the app talks to:
//   /openrouter/chat/completions, /gemini/chat/completions  — OpenAI-compatible LLM endpoints
//   /resend/emails                                           — Resend's send-email endpoint
//   /sites/<file>                                            — recipe pages for URL import
//   /__control/*                                             — lets specs script and inspect it
//
// Specs run in parallel against one instance, so scripted responses are keyed: a queued entry is
// only served to a request whose body contains its key (a spec puts the key in its prompt or
// recipe title). Anything unkeyed gets a sensible default. Self-contained on purpose — it runs
// under plain `node` and must not depend on the app's code.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_NUTRITION, DEFAULT_RECIPE, DEFAULT_REPLY } from './defaults.ts';

const PORT = Number(process.env.E2E_FAKES_PORT ?? 4100);
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

type Backend = 'openrouter' | 'gemini';

interface QueuedResponse {
  key: string;
  status: number;
  /** Serialized as the assistant message's content on a 200. */
  content?: unknown;
}

interface RecordedRequest {
  backend: Backend;
  model: string;
  body: unknown;
  raw: string;
}

interface CapturedEmail {
  to: string[];
  subject: string;
  text: string;
  html: string;
}

let queue: QueuedResponse[] = [];
let requests: RecordedRequest[] = [];
let emails: CapturedEmail[] = [];

function defaultContent(backend: Backend): unknown {
  if (backend === 'gemini') return DEFAULT_NUTRITION;
  return { reply: DEFAULT_REPLY, recipe: DEFAULT_RECIPE };
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function takeQueued(raw: string): QueuedResponse | undefined {
  const index = queue.findIndex((entry) => raw.includes(entry.key));
  if (index === -1) return undefined;
  return queue.splice(index, 1)[0];
}

function handleCompletion(backend: Backend, raw: string, res: http.ServerResponse): void {
  let body: { model?: string } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    // Recorded as-is; the app never sends invalid JSON, but don't crash the fake if it did.
  }
  const model = body.model ?? 'unknown';
  requests.push({ backend, model, body, raw });

  const queued = takeQueued(raw);
  const status = queued?.status ?? 200;
  if (status !== 200) {
    sendJson(res, status, { error: { message: `fake ${backend} failure`, code: status } });
    return;
  }

  const content = queued?.content ?? defaultContent(backend);
  sendJson(res, 200, {
    id: `fake-${requests.length}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: typeof content === 'string' ? content : JSON.stringify(content),
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      ...(backend === 'openrouter' ? { cost: 0.0001 } : {}),
    },
  });
}

function handleEmail(raw: string, res: http.ServerResponse): void {
  const body = JSON.parse(raw) as {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
  };
  emails.push({
    to: Array.isArray(body.to) ? body.to : [body.to],
    subject: body.subject,
    text: body.text ?? '',
    html: body.html ?? '',
  });
  sendJson(res, 200, { id: `fake-email-${emails.length}` });
}

function handleSite(name: string, res: http.ServerResponse): void {
  const file = path.join(FIXTURES, 'sites', path.basename(name));
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end('<html><body>Not found</body></html>');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
}

async function handleControl(
  url: URL,
  method: string,
  raw: string,
  res: http.ServerResponse
): Promise<void> {
  const route = url.pathname.replace('/__control/', '');
  if (route === 'health') return sendJson(res, 200, { status: 'ok' });
  if (route === 'queue' && method === 'POST') {
    const entry = JSON.parse(raw) as Partial<QueuedResponse>;
    if (!entry.key) return sendJson(res, 400, { error: 'key is required' });
    queue.push({ key: entry.key, status: entry.status ?? 200, content: entry.content });
    return sendJson(res, 201, { queued: queue.length });
  }
  if (route === 'requests') {
    const contains = url.searchParams.get('contains') ?? '';
    return sendJson(
      res,
      200,
      requests
        .filter((entry) => entry.raw.includes(contains))
        .map(({ backend, model, body }) => ({ backend, model, body }))
    );
  }
  if (route === 'emails') {
    const to = url.searchParams.get('to');
    return sendJson(
      res,
      200,
      emails.filter((email) => !to || email.to.includes(to))
    );
  }
  if (route === 'reset' && method === 'POST') {
    queue = [];
    requests = [];
    emails = [];
    return sendJson(res, 200, { ok: true });
  }
  sendJson(res, 404, { error: `unknown control route ${route}` });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const method = req.method ?? 'GET';
    const raw = method === 'GET' ? '' : await readBody(req);

    if (url.pathname.startsWith('/__control/')) return await handleControl(url, method, raw, res);
    if (method === 'POST' && url.pathname.endsWith('/chat/completions')) {
      const backend: Backend = url.pathname.startsWith('/gemini') ? 'gemini' : 'openrouter';
      return handleCompletion(backend, raw, res);
    }
    if (method === 'POST' && url.pathname === '/resend/emails') return handleEmail(raw, res);
    if (method === 'GET' && url.pathname.startsWith('/sites/')) {
      return handleSite(url.pathname.slice('/sites/'.length), res);
    }
    sendJson(res, 404, { error: `no fake for ${method} ${url.pathname}` });
  } catch (err) {
    console.error('[fakes]', err);
    sendJson(res, 500, { error: String(err) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[fakes] listening on http://127.0.0.1:${PORT}`);
});
