import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Readiness probe for the e2e harness and the Docker healthcheck.
export const GET: RequestHandler = () => json({ status: 'ok' });
