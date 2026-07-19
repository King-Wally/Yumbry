interface ServingsStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
}

export default function ServingsStepper({ value, onChange, min = 1 }: ServingsStepperProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-stone-500">Servings</span>
      <div className="flex items-center rounded-full border border-stone-300 bg-white">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="rounded-l-full px-3 py-1 text-lg text-stone-600 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-transparent"
          aria-label="Decrease servings"
        >
          −
        </button>
        <span className="w-10 text-center font-medium">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="rounded-r-full px-3 py-1 text-lg text-stone-600 transition-colors hover:bg-stone-100"
          aria-label="Increase servings"
        >
          +
        </button>
      </div>
    </div>
  );
}
