import { type ReactNode, useState } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';

interface CollapsibleActionsProps {
  /** Always visible, even on mobile, rendered outside the collapsible area. */
  pinned?: ReactNode;
  /** Rendered as a row on desktop; collapses into the dropdown menu below `md`. */
  children: ReactNode;
  /** Classes for the desktop-only row wrapping `children` (e.g. gap, text size). */
  rowClassName?: string;
}

export default function CollapsibleActions({
  pinned,
  children,
  rowClassName = 'gap-2',
}: CollapsibleActionsProps) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <div className={`hidden items-center md:flex ${rowClassName}`}>{children}</div>

      {pinned}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Menu"
        className="rounded-md border border-stone-300 p-1.5 text-stone-600 transition-colors hover:border-stone-400 hover:bg-stone-100 md:hidden"
      >
        {open ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-5 w-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-5 w-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="absolute right-0 top-full z-20 mt-2 w-36 divide-y divide-stone-100 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg md:hidden [&_a]:block [&_a]:w-full [&_a]:rounded-none [&_a]:border-0 [&_a]:px-4 [&_a]:py-2.5 [&_a]:text-left [&_button]:block [&_button]:w-full [&_button]:rounded-none [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-4 [&_button]:py-2.5 [&_button]:text-left"
        >
          {children}
        </div>
      )}
    </div>
  );
}
