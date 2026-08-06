import { Clock, Flame, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type TimeStatIcon = 'clock' | 'flame' | 'timer';

interface TimeStatProps {
  icon: TimeStatIcon;
  label: string;
  minutes: number;
}

function StatIcon({ icon }: { icon: TimeStatIcon }) {
  const className = 'h-5 w-5';

  if (icon === 'flame') return <Flame className={className} strokeWidth={1.5} />;
  if (icon === 'timer') return <Timer className={className} strokeWidth={1.5} />;
  return <Clock className={className} strokeWidth={1.5} />;
}

export default function TimeStat({ icon, label, minutes }: TimeStatProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 text-stone-600">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-clay/10 text-clay">
        <StatIcon icon={icon} />
      </span>
      <div className="leading-tight">
        <div className="text-xs text-stone-400">{label}</div>
        <div className="text-sm font-medium text-stone-700">
          {t('common.minutes', { count: minutes })}
        </div>
      </div>
    </div>
  );
}
