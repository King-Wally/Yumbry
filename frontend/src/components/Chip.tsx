import type { ButtonHTMLAttributes } from 'react';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export default function Chip({ active = false, className = '', ...props }: ChipProps) {
  return (
    <button
      type="button"
      className={`rounded-full px-3 py-1 text-sm capitalize transition ${
        active ? 'bg-clay text-white shadow-sm' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
      } ${className}`}
      {...props}
    />
  );
}
