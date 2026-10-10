import { randomBytes } from 'node:crypto';

/** 32 random bytes as hex: the secret in an invite or share link. Stored raw: the owner sees the
 * same link again, and 256 random bits leave nothing to guess. */
export function randomToken(): string {
	return randomBytes(32).toString('hex');
}
