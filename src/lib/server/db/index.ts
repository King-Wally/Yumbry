import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { DATABASE_URL } from '$app/env/private';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = postgres(DATABASE_URL);

// adapter-node emits this once the server has drained on SIGTERM/SIGINT. Idle pool connections
// would otherwise keep the process alive until Docker's stop timeout kills it.
process.once('sveltekit:shutdown', () => void client.end({ timeout: 5 }));

export const db = drizzle(client, { schema });
