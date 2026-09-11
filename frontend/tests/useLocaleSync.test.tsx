import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useLocaleSync } from '../src/hooks/useLocaleSync';
import { useSession } from '../src/lib/auth-client';
import * as i18n from '../src/i18n';
import { sessionFor, NO_SESSION } from './helpers/auth-client';

// Async factory with a dynamic import: vi.mock is hoisted above the imports,
// so the helper cannot be referenced directly here.
vi.mock('../src/lib/auth-client', async () =>
  (await import('./helpers/auth-client')).authClientMock()
);
vi.mock('../src/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/i18n')>();
  return { ...actual, setActiveLocale: vi.fn() };
});

function Consumer() {
  useLocaleSync();
  return <div>rendered</div>;
}

describe('useLocaleSync', () => {
  beforeEach(() => {
    vi.mocked(i18n.setActiveLocale).mockClear();
  });

  it("re-applies the active locale when the same user's locale changes, not just on next login", async () => {
    vi.mocked(useSession).mockReturnValue(sessionFor({ locale: 'en' }));
    const { rerender } = render(<Consumer />);

    await screen.findByText('rendered');
    expect(i18n.setActiveLocale).toHaveBeenCalledWith('en');

    // Settings saves a new language, which refreshes the session with the same
    // user id and a different locale. Tracking by locale value rather than user
    // id is what makes this re-apply instead of being skipped as "same user".
    vi.mocked(useSession).mockReturnValue(sessionFor({ locale: 'fr' }));
    rerender(<Consumer />);

    expect(i18n.setActiveLocale).toHaveBeenCalledWith('fr');
  });

  it('does not touch the locale while there is no session', () => {
    vi.mocked(useSession).mockReturnValue(NO_SESSION);

    render(<Consumer />);

    // Signed-out visitors keep whatever localStorage/browser language resolved
    // to at init; nothing overrides it.
    expect(i18n.setActiveLocale).not.toHaveBeenCalled();
  });
});
