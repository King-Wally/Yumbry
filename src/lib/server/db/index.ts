import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { DATABASE_URL } from '$app/env/private';

const client = postgres(DATABASE_URL);

// adapter-node emits this once the server has drained on SIGTERM/SIGINT. Idle pool connections
// would otherwise keep the process alive until Docker's stop timeout kills it.
process.once('sveltekit:shutdown', () => void client.end({ timeout: 5 }));

export const db = drizzle(client, { schema });

/** The client or an open transaction: services that run inside a caller's transaction take this. */
export type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
