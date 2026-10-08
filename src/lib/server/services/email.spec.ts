import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
	ORIGIN: 'http://app.test',
	RESEND_API_KEY: undefined as string | undefined,
	EMAIL_FROM: undefined as string | undefined,
	RESEND_BASE_URL: undefined as string | undefined
}));
vi.mock('$app/env/private', () => env);

const { isEmailConfigured, sendPasswordResetEmail } = await import('./email.ts');

interface Sent {
	path: string;
	auth: string | null;
	body: { from: string; to: string; subject: string; text: string; html: string };
}

let fake: ReturnType<typeof Bun.serve>;
let sent: Sent[] = [];
let failNext = false;

beforeAll(() => {
	fake = Bun.serve({
		port: 0,
		hostname: '127.0.0.1',
		async fetch(req) {
			sent.push({
				path: new URL(req.url).pathname,
				auth: req.headers.get('authorization'),
				body: await req.json()
			});
			if (failNext) {
				return Response.json(
					{ name: 'validation_error', message: 'Domain not verified', statusCode: 422 },
					{ status: 422 }
				);
			}
			return Response.json({ id: 'email-1' });
		}
	});
});
afterAll(() => fake.stop(true));

beforeEach(() => {
	sent = [];
	failNext = false;
	env.RESEND_API_KEY = 're_key';
	env.EMAIL_FROM = 'Yumbry <no-reply@app.test>';
	env.RESEND_BASE_URL = `http://127.0.0.1:${fake.port}/resend`;
});

describe('isEmailConfigured', () => {
	it('needs both the API key and the From address', () => {
		expect(isEmailConfigured()).toBe(true);
		env.EMAIL_FROM = undefined;
		expect(isEmailConfigured()).toBe(false);
		env.EMAIL_FROM = 'a@app.test';
		env.RESEND_API_KEY = undefined;
		expect(isEmailConfigured()).toBe(false);
	});
});

describe('sendPasswordResetEmail', () => {
	it('sends main’s reset link through RESEND_BASE_URL', async () => {
		await sendPasswordResetEmail('cook@example.test', 'abc123');

		expect(sent).toHaveLength(1);
		const [email] = sent;
		expect(email.path).toBe('/resend/emails');
		expect(email.auth).toBe('Bearer re_key');
		expect(email.body).toMatchObject({
			from: 'Yumbry <no-reply@app.test>',
			to: 'cook@example.test',
			subject: 'Reset your Yumbry password'
		});
		expect(email.body.text).toContain('http://app.test/reset-password?token=abc123');
		expect(email.body.html).toContain('href="http://app.test/reset-password?token=abc123"');
	});

	it('throws when Resend refuses the email', async () => {
		failNext = true;
		await expect(sendPasswordResetEmail('cook@example.test', 'abc123')).rejects.toThrow(
			/Domain not verified/
		);
	});

	it('throws when email is not configured', async () => {
		env.RESEND_API_KEY = undefined;
		await expect(sendPasswordResetEmail('cook@example.test', 'abc123')).rejects.toThrow();
		expect(sent).toHaveLength(0);
	});
});
