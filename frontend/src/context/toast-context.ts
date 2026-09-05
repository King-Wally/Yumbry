import { createContext } from 'react';

export interface ToastInput {
  title: string;
  description?: string;
}

export interface ToastContextValue {
  showToast: (toast: ToastInput) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
