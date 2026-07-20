type TimeStatIcon = 'clock' | 'flame' | 'timer';

interface TimeStatProps {
  icon: TimeStatIcon;
  label: string;
  minutes: number;
}

function StatIcon({ icon }: { icon: TimeStatIcon }) {
  const common = {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    className: 'h-5 w-5',
  } as const;

  if (icon === 'flame') {
    return (
      <svg {...common}>
        <path d="M12 2c1 3-2 4-2 7a4 4 0 108 0c0-1-.5-2-1-2 .5 2-1 3-2 3 1-2-1-3-1-5 0-1 .5-2 .5-3-1 0-2.5 1-2.5 3-2-1-3-2-3-3z" />
      </svg>
    );
  }
  if (icon === 'timer') {
    return (
      <svg {...common}>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M9 3h6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

export default function TimeStat({ icon, label, minutes }: TimeStatProps) {
  return (
    <div className="flex items-center gap-2 text-stone-600">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-clay/10 text-clay">
        <StatIcon icon={icon} />
      </span>
      <div className="leading-tight">
        <div className="text-xs text-stone-400">{label}</div>
        <div className="text-sm font-medium text-stone-700">{minutes} min</div>
      </div>
    </div>
  );
}
