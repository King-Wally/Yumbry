import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './db/prisma.js';
import { createFamily } from './services/family.service.js';
import {
  captureFamilyBeforeDelete,
  cleanUpFamilyAfterDelete,
} from './services/account-deletion.service.js';
import { isEmailConfigured, sendPasswordResetEmail } from './services/email.service.js';

const IS_PROD = process.env.NODE_ENV === 'production';

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const ONE_HOUR_SECONDS = 60 * 60;

// Unlike the old JWT_SECRET — which threw at import time and so had to be
// injected into every test run — this only hard-fails in production. Dev and
// test get a fixed placeholder, because a signing secret that changes per boot
// would log everyone out on every restart.
function requireSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (IS_PROD) throw new Error('BETTER_AUTH_SECRET must be set.');
  return 'dev-only-better-auth-secret-not-for-production';
}

export const auth = betterAuth({
  appName: 'Yumbry',
  secret: requireSecret(),
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_BASE_URL,
  basePath: '/api/auth',
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 72,
    resetPasswordTokenExpiresIn: ONE_HOUR_SECONDS,
    // Replaces the old tokenVersion counter: resetting a password now drops the
    // session rows outright instead of invalidating them by version number.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }) => {
      // Silently do nothing when Resend isn't configured, matching the old
      // requestPasswordReset: a self-hoster without email must still get the
      // same generic success response rather than a 500.
      if (!isEmailConfigured()) return;
      // sendPasswordResetEmail builds ${APP_BASE_URL}/reset-password?token=...
      // itself, so the existing ResetPasswordPage keeps working untouched.
      await sendPasswordResetEmail(user.email, token);
    },
  },

  user: {
    additionalFields: {
      // Set by the create hook below. input: false on all of these keeps them
      // off both the signup payload and better-auth's own updateUser endpoint —
      // every preference write goes through PATCH /api/me, which validates
      // against the shared enums with Zod.
      //
      // required: false is not optional here despite the column being NOT NULL:
      // better-auth validates required fields against the request payload before
      // databaseHooks runs, so a required familyId the client is not allowed to
      // send can never be satisfied. The hook always supplies one, and the NOT
      // NULL constraint is what actually guarantees it.
      familyId: { type: 'number', required: false, input: false },
      locale: { type: 'string', required: true, defaultValue: 'en', input: false },
      unitSystem: { type: 'string', required: true, defaultValue: 'metric', input: false },
      smallVolumes: { type: 'string', required: true, defaultValue: 'spoons', input: false },
      jsonImportExportEnabled: {
        type: 'boolean',
        required: true,
        defaultValue: false,
        input: false,
      },
    },
    changeEmail: { enabled: false },
    deleteUser: {
      enabled: true,
      beforeDelete: captureFamilyBeforeDelete,
      afterDelete: cleanUpFamilyAfterDelete,
    },
  },

  session: {
    expiresIn: THIRTY_DAYS_SECONDS,
    updateAge: 60 * 60 * 24,
    // cookieCache is deliberately left off. It would let getSession answer from
    // the cookie without touching the database, serving a stale familyId for the
    // cache lifetime — so a user who just left a family would keep reading its
    // recipes. Authorisation data has to be read fresh on every request.
  },

  advanced: {
    cookiePrefix: 'yumbry',
    useSecureCookies: process.env.COOKIE_SECURE === 'true',
    defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
  },

  rateLimit: {
    // Off outside production so the test suite can register freely; the
    // express-level apiRateLimiter still covers everything either way.
    enabled: IS_PROD,
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 900, max: 10 },
      '/sign-up/email': { window: 900, max: 10 },
      '/request-password-reset': { window: 900, max: 5 },
      '/reset-password': { window: 900, max: 10 },
      '/change-password': { window: 900, max: 10 },
      '/delete-user': { window: 900, max: 10 },
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Every user starts in a personal family of one, so users.family_id is
          // never null and no "user without a family" state exists for the rest
          // of the app to handle — the invariant the old registerUser guaranteed
          // with a nested create.
          //
          // The family is written before the user insert, so a failing insert
          // (duplicate email) leaves an empty family row behind. Harmless — it
          // has no members and no content — but see sweepOrphanedFamilies.
          const family = await createFamily(prisma);
          return { data: { ...user, familyId: family.id } };
        },
      },
    },
  },
});

export type Auth = typeof auth;
