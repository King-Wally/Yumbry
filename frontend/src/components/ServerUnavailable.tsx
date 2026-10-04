import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { pingServer, reportServerUp, useServerStatus } from '../lib/server-status';

/** Full-screen cover shown while the backend is unreachable. It overlays the app instead of
 * replacing it, so a half-written recipe survives the outage. It does not retry on its own:
 * the user's "Try again" pings /api/health and lifts it once the server answers. It is portalled to <body> so the app root can go `inert`
 * (no tabbing or screen-reader access to what's underneath) while it is showing. */
export default function ServerUnavailable() {
  const { t } = useTranslation();
  const status = useServerStatus();
  const [checking, setChecking] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const down = status === 'down';

  const retry = useCallback(async () => {
    setChecking(true);
    const ok = await pingServer();
    setChecking(false);
    if (ok) reportServerUp();
  }, []);

  useEffect(() => {
    if (!down) return;
    buttonRef.current?.focus();
  }, [down]);

  useEffect(() => {
    if (!down) return;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    return () => root?.removeAttribute('inert');
  }, [down]);

  if (!down) return null;

  return createPortal(
    <div className="bg-cream fixed inset-0 z-50 flex flex-col overflow-y-auto">
      <div className="border-b border-stone-200 bg-white/90">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <span className="font-serif text-2xl tracking-tight text-stone-900">Yumbry</span>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-6">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="server-unavailable-title"
          aria-describedby="server-unavailable-description"
          className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-8 text-center shadow-sm"
        >
          <div className="bg-clay/10 text-clay mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full">
            <Clock aria-hidden="true" size={24} />
          </div>
          <h1 id="server-unavailable-title" className="mb-3 font-serif text-2xl text-stone-900">
            {t('serverUnavailable.title')}
          </h1>
          <p
            id="server-unavailable-description"
            className="text-[15px] leading-relaxed text-stone-600"
          >
            {t('serverUnavailable.description')}
          </p>
          <button
            ref={buttonRef}
            type="button"
            onClick={() => void retry()}
            disabled={checking}
            className="bg-clay hover:bg-clay/90 mt-6 rounded-md px-4 py-2 text-white transition disabled:opacity-50"
          >
            {checking ? t('serverUnavailable.retrying') : t('serverUnavailable.retry')}
          </button>
          <p className="mt-5 border-t border-stone-100 pt-5 text-[13px] text-stone-500">
            {t('serverUnavailable.hint')}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
