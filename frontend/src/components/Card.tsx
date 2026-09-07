import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  danger?: boolean;
}

function Card({ children, className = '', danger = false }: CardProps) {
  return (
    <section
      className={`rounded-xl border p-6 shadow-sm ${
        danger ? 'border-red-300 bg-red-50/60' : 'border-stone-200 bg-white'
      } ${className}`}
    >
      {children}
    </section>
  );
}

interface CardHeaderProps {
  icon: ReactNode;
  title: string;
  description: string;
  danger?: boolean;
}

function CardHeader({ icon, title, description, danger = false }: CardHeaderProps) {
  return (
    <div
      className={`mb-5 flex items-start gap-3.5 border-b pb-4 ${
        danger ? 'border-red-600/15' : 'border-stone-100'
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          danger ? 'bg-red-200 text-red-700' : 'bg-clay/10 text-clay'
        }`}
      >
        {icon}
      </div>
      <div>
        <h2
          className={`font-serif text-lg font-bold ${danger ? 'text-red-900' : 'text-stone-900'}`}
        >
          {title}
        </h2>
        <p className="mt-0.5 text-[13px] text-stone-500">{description}</p>
      </div>
    </div>
  );
}

Card.Header = CardHeader;

export default Card;
