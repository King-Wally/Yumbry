import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import type { SmallVolumeStyle, SupportedLocale, UnitSystem } from 'yumbry-shared';

/** The app's better-auth client. Same origin in dev (vite proxies /api) and in
 * production (Express serves the SPA), so no baseURL is needed.
 *
 * The additional fields are declared by hand rather than inferred from
 * `typeof auth`: `shared` is the only package `frontend` depends on, and the
 * backend's auth config isn't importable across that boundary. */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [
    inferAdditionalFields({
      user: {
        // input: false mirrors the server config — these are never part of a
        // signup or updateUser payload, so they must not appear in the client's
        // argument types either.
        familyId: { type: 'number', input: false },
        locale: { type: 'string', input: false },
        unitSystem: { type: 'string', input: false },
        smallVolumes: { type: 'string', input: false },
        jsonImportExportEnabled: { type: 'boolean', input: false },
      },
    }),
  ],
});

export const { useSession, signIn, signUp, signOut } = authClient;

/** Re-reads the session so better-auth's store picks up a change made through
 * our own endpoints — the preference columns live on the user row but are
 * written by PATCH /api/me, which better-auth knows nothing about. */
export function refreshSession(): void {
  void authClient.getSession({ query: { disableCookieCache: true } });
}

/** The session user, with the preference columns narrowed to the shared unions.
 * better-auth types additional fields as plain strings; these are validated
 * against the same enums server-side by PATCH /api/me. */
export interface CurrentUser {
  id: string;
  email: string;
  locale: SupportedLocale;
  unitSystem: UnitSystem;
  smallVolumes: SmallVolumeStyle;
  jsonImportExportEnabled: boolean;
}
