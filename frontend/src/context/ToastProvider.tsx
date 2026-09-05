import { useState, type ReactNode } from 'react';
import * as RadixToast from '@radix-ui/react-toast';
import { Check } from 'lucide-react';
import { ToastContext, type ToastInput } from './toast-context';

interface QueuedToast extends ToastInput {
  id: number;
  open: boolean;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<QueuedToast[]>([]);

  function showToast(toast: ToastInput) {
    setToasts((current) => [...current, { ...toast, id: nextId++, open: true }]);
  }

  // Two-phase removal: flip `open` to false first (rather than dropping the
  // toast from state immediately) so it stays mounted with data-state="closed"
  // long enough for the slide-out CSS animation in index.css to play, then
  // actually unmount once that animation's onAnimationEnd fires.
  function closeToast(id: number) {
    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { ...toast, open: false } : toast))
    );
  }

  function removeToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      <RadixToast.Provider swipeDirection="down">
        {children}
        {toasts.map((toast) => (
          <RadixToast.Root
            key={toast.id}
            open={toast.open}
            duration={4000}
            onOpenChange={(open) => {
              if (!open) closeToast(toast.id);
            }}
            onAnimationEnd={() => {
              if (!toast.open) removeToast(toast.id);
            }}
            className="toast-root flex items-start gap-3 rounded-md border border-stone-200 bg-white p-4 shadow-lg"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100">
              <Check className="h-3.5 w-3.5 text-green-700" />
            </span>
            <div>
              <RadixToast.Title className="text-sm font-medium text-green-700">
                {toast.title}
              </RadixToast.Title>
              {toast.description && (
                <RadixToast.Description className="mt-1 text-sm text-stone-600">
                  {toast.description}
                </RadixToast.Description>
              )}
            </div>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed bottom-0 left-1/2 z-20 m-4 flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
