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
  tokenVersion: number;
}

export interface VerifiedAuthToken {
  userId: number;
  tokenVersion: number;
}

export function signAuthToken(userId: number, tokenVersion: number): string {
  return jwt.sign({ userId, tokenVersion } satisfies AuthTokenPayload, JWT_SECRET, {
    expiresIn: '30d',
  });
}

export function verifyAuthToken(token: string): VerifiedAuthToken | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    if (typeof payload.userId !== 'number' || typeof payload.tokenVersion !== 'number') {
      return null;
    }
    return { userId: payload.userId, tokenVersion: payload.tokenVersion };
  } catch {
    return null;
  }
}
