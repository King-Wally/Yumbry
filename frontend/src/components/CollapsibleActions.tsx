import { type ReactNode, useState } from 'react';
import { Ellipsis, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useClickOutside } from '../hooks/useClickOutside';

interface CollapsibleActionsProps {
  pinned?: ReactNode;
  children: ReactNode;
}

export default function CollapsibleActions({ pinned, children }: CollapsibleActionsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      {pinned}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t('common.menu')}
        className="rounded-md border border-stone-300 p-1.5 text-stone-600 transition-colors hover:border-stone-400 hover:bg-stone-100"
      >
        {open ? <X className="h-5 w-5" /> : <Ellipsis className="h-5 w-5" />}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="absolute top-full right-0 z-20 mt-2 flex w-max max-w-[calc(100vw-2rem)] flex-col divide-y divide-stone-200 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg [&_a]:flex [&_a]:w-full [&_a]:items-center [&_a]:gap-2 [&_a]:rounded-none [&_a]:border-x-0 [&_a]:border-b-0 [&_a]:px-3 [&_a]:py-2 [&_a]:text-left [&_a]:whitespace-nowrap [&_button]:flex [&_button]:w-full [&_button]:items-center [&_button]:gap-2 [&_button]:rounded-none [&_button]:border-x-0 [&_button]:border-b-0 [&_button]:bg-transparent [&_button]:px-3 [&_button]:py-2 [&_button]:text-left [&_button]:whitespace-nowrap [&>*:first-child]:border-t-0"
        >
          {children}
        </div>
      )}
    </div>
  );
}
