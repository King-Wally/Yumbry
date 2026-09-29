import { useId } from 'react';
import { useTranslation } from 'react-i18next';

interface ServingsStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
}

export default function ServingsStepper({ value, onChange, min = 1 }: ServingsStepperProps) {
  const { t } = useTranslation();
  const labelId = useId();
  return (
    <div className="flex items-center gap-3">
      <span id={labelId} className="text-sm text-stone-500">
        {t('recipes.detail.servings')}
      </span>
      <div className="flex items-center rounded-full border border-stone-300 bg-white">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="rounded-l-full px-3 py-1 text-lg text-stone-600 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-transparent"
          aria-label={t('servingsStepper.decrease')}
        >
          −
        </button>
        <output
          aria-labelledby={labelId}
          aria-live="polite"
          className="w-10 text-center font-medium"
        >
          {value}
        </output>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="rounded-r-full px-3 py-1 text-lg text-stone-600 transition-colors hover:bg-stone-100"
          aria-label={t('servingsStepper.increase')}
        >
          +
        </button>
      </div>
    </div>
  );
}
