import jwt from 'jsonwebtoken';

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET must be set.');
  return secret;
}

const JWT_SECRET = requireJwtSecret();

/** Name of the httpOnly cookie the signed auth token is stored in. */
export const AUTH_COOKIE_NAME = 'token';

interface AuthTokenPayload {
  userId: number;
}

export function signAuthToken(userId: number): string {
  return jwt.sign({ userId } satisfies AuthTokenPayload, JWT_SECRET, { expiresIn: '30d' });
}

/** Verifies and decodes the token, returning the userId or null on any
 * failure (expired/invalid/malformed) rather than throwing. */
export function verifyAuthToken(token: string): number | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    return payload.userId;
  } catch {
    return null;
  }
}
