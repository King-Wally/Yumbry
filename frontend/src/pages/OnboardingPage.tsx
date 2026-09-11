import { useMemo, useState, type ComponentType } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { SUPPORTED_LOCALES, type SupportedLocale } from 'yumbry-shared';
import {
  Check,
  Download,
  Flame,
  Link2,
  MoreVertical,
  PenLine,
  PlusSquare,
  Share,
  Sparkles,
  UserCircle,
  Users,
} from 'lucide-react';
import { updateProfile } from '../api/client';
import { useAiStatus } from '../hooks/useAiStatus';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useFamily } from '../hooks/useFamily';
import { setActiveLocale } from '../i18n';
import { LOCALE_LABELS } from '../i18n/localeLabels';
import { detectInstallPlatform, isStandalonePwa, type InstallPlatform } from '../pwa';

type StepKey = 'language' | 'create' | 'family' | 'pwa' | 'done';

const ALL_STEPS: StepKey[] = ['language', 'create', 'family', 'pwa', 'done'];

const PWA_STEP_ICONS: Record<InstallPlatform, ComponentType<{ size?: number }>[]> = {
  'ios-safari': [Share, PlusSquare, Check],
  'ios-other': [Share],
  'android-chrome': [MoreVertical, PlusSquare, Check],
  'android-other': [MoreVertical],
  desktop: [Download, Check],
};

// Maps InstallPlatform to the matching leaf under the `onboarding.pwa.steps`
// translation namespace (i18next keys can't contain hyphens the way the
// platform ids do).
const PWA_STEP_KEYS: Record<InstallPlatform, string> = {
  'ios-safari': 'iosSafari',
  'ios-other': 'iosOther',
  'android-chrome': 'androidChrome',
  'android-other': 'androidOther',
  desktop: 'desktop',
};

export default function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: aiStatus } = useAiStatus({ enabled: true });
  const { data: family } = useFamily();
  const { user } = useCurrentUser();

  const [step, setStep] = useState(0);
  const [pickedLocale, setPickedLocale] = useState<SupportedLocale | null>(null);
  const [copied, setCopied] = useState(false);

  // Computed once on mount — the point of this step is a one-time nudge, not
  // something that should reshuffle mid-flow if the display mode somehow changes.
  const [platform] = useState<InstallPlatform>(() => detectInstallPlatform());
  const [showPwaStep] = useState(() => !isStandalonePwa());

  const stepKeys = useMemo(
    () => (showPwaStep ? ALL_STEPS : ALL_STEPS.filter((key) => key !== 'pwa')),
    [showPwaStep]
  );
  const currentKey = stepKeys[step];

  const localeMutation = useMutation({
    mutationFn: (locale: SupportedLocale) => updateProfile({ locale }),
  });

  function handlePickLocale(locale: SupportedLocale) {
    setPickedLocale(locale);
    // Switch the flow to the new language immediately, then persist it like
    // any other profile preference (mirrors SettingsPage's locale select).
    setActiveLocale(locale);
    localeMutation.mutate(locale);
  }

  function handleNext() {
    if (currentKey === 'language' && !pickedLocale) return;
    if (step === stepKeys.length - 1) {
      navigate('/', { replace: true });
      return;
    }
    setStep((s) => s + 1);
  }

  function handleBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  const inviteUrl = family ? `${window.location.origin}/join-family/${family.invite_token}` : '';

  async function handleCopyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const createOptions = [
    {
      key: 'manual',
      icon: PenLine,
      title: t('onboarding.create.manual.title'),
      description: t('onboarding.create.manual.description'),
    },
    {
      key: 'url',
      icon: Link2,
      title: t('onboarding.create.url.title'),
      description: t('onboarding.create.url.description'),
    },
    ...(aiStatus?.configured
      ? [
          {
            key: 'ai',
            icon: Sparkles,
            title: t('onboarding.create.ai.title'),
            description: t('onboarding.create.ai.description'),
          },
        ]
      : []),
  ];

  // Same entries, same order and same visibility rules as the real menu.
  const menuItems = [
    t('nav.manually'),
    ...(user?.jsonImportExportEnabled ? [t('nav.import')] : []),
    t('nav.paste'),
    ...(aiStatus?.configured ? [t('nav.createWithAi')] : []),
  ];

  const pwaStepTexts = t(`onboarding.pwa.steps.${PWA_STEP_KEYS[platform]}`, {
    returnObjects: true,
  }) as string[];
  const pwaStepIcons = PWA_STEP_ICONS[platform];

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-stone-200 px-7 py-5">
        <span className="font-serif text-[22px] tracking-tight text-stone-900">Yumbry</span>
        {currentKey !== 'done' && (
          <span className="text-[13px] text-stone-400">
            {t('onboarding.stepCounter', { step: step + 1, total: stepKeys.length })}
          </span>
        )}
      </div>

      <div className="flex flex-1 items-start justify-center overflow-auto px-6 pt-12 pb-6">
        <div className="w-full max-w-xl">
          {currentKey === 'language' && (
            <>
              <div className="mb-8 text-center">
                <h1 className="mb-2.5 font-serif text-[32px] text-stone-900">
                  {t('onboarding.language.title')}
                </h1>
                <p className="text-[15px] text-stone-600">{t('onboarding.language.description')}</p>
              </div>
              <div className="mx-auto flex max-w-105 flex-col gap-2.5">
                {SUPPORTED_LOCALES.map((locale) => {
                  const selected = pickedLocale === locale;
                  return (
                    <button
                      key={locale}
                      type="button"
                      onClick={() => handlePickLocale(locale)}
                      className={`flex items-center justify-between rounded-lg border px-4.5 py-3.5 text-left ${
                        selected ? 'border-clay bg-clay/10' : 'border-stone-300 bg-white'
                      }`}
                    >
                      <span className="text-[15px] font-medium text-stone-900">
                        {LOCALE_LABELS[locale]}
                      </span>
                      <span
                        className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                          selected
                            ? 'border-clay bg-clay shadow-[inset_0_0_0_2px_white]'
                            : 'border-stone-300'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {currentKey === 'create' && (
            <>
              <div className="mb-8 text-center">
                <h1 className="mb-2.5 font-serif text-[30px] text-stone-900">
                  {t('onboarding.create.title')}
                </h1>
                <p className="text-[15px] text-stone-600">{t('onboarding.create.description')}</p>
              </div>
              {/* Static replica of the app header's "Add recipe" menu (App.tsx),
                  shown open so the steps below map onto something they've seen. */}
              <div
                aria-hidden
                className="mx-auto mb-8 max-w-115 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm select-none"
              >
                <div className="flex items-center justify-between border-b border-stone-200 bg-white/90 px-4 py-3">
                  <span className="font-serif text-lg tracking-tight text-stone-900">Yumbry</span>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="bg-clay/90 rounded-md px-3 py-1.5 text-white">
                      {t('nav.addRecipe')}
                    </span>
                    <span className="rounded-full border border-gray-300 p-1.5 text-stone-600">
                      <UserCircle size={20} />
                    </span>
                  </div>
                </div>
                <div className="bg-cream flex justify-end px-4 pb-6">
                  <div className="-mt-2 mr-10 flex flex-col divide-y divide-stone-200 rounded-md border border-stone-200 bg-white text-sm font-medium text-stone-600 shadow-lg">
                    {menuItems.map((item) => (
                      <span key={item} className="px-5 py-2 text-nowrap">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mx-auto flex max-w-115 flex-col gap-3">
                {createOptions.map((opt) => (
                  <div key={opt.key} className="flex items-start gap-3.5 text-left">
                    <span className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
                      <opt.icon size={18} />
                    </span>
                    <span>
                      <span className="mb-0.5 block text-[15px] font-semibold text-stone-900">
                        {opt.title}
                      </span>
                      <span className="block text-[13px] leading-snug text-stone-400">
                        {opt.description}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="mx-auto mt-4 max-w-115 text-center text-[13px] leading-relaxed text-stone-400">
                {t('onboarding.create.hint')}
              </p>
            </>
          )}

          {currentKey === 'family' && (
            <>
              <div className="mb-8 text-center">
                <h1 className="mb-2.5 font-serif text-[30px] text-stone-900">
                  {t('onboarding.family.title')}
                </h1>
                <p className="text-[15px] text-stone-600">{t('onboarding.family.description')}</p>
              </div>
              <div className="mx-auto max-w-115 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
                <div className="mb-4.5 flex items-start gap-3.5 border-b border-stone-100 pb-4.5">
                  <div className="bg-clay/10 text-clay flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                    <Users size={18} />
                  </div>
                  <div>
                    <h2 className="mb-1 font-serif text-[19px] text-stone-900">
                      {t('settings.family.title')}
                    </h2>
                    <p className="text-[13px] leading-relaxed text-stone-400">
                      {t('settings.family.description')}
                    </p>
                  </div>
                </div>

                {family && (
                  <>
                    <h3 className="mb-2 text-xs font-semibold text-stone-400">
                      {t('settings.family.members')}
                    </h3>
                    <ul className="mb-4.5 divide-y divide-stone-100 overflow-hidden rounded-lg border border-stone-200">
                      {family.members.map((member) => (
                        <li key={member.id} className="px-3.5 py-3 text-[13px] text-stone-900">
                          {member.email}
                        </li>
                      ))}
                    </ul>

                    <h3 className="mb-2 text-xs font-semibold text-stone-400">
                      {t('settings.family.inviteLabel')}
                    </h3>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={inviteUrl}
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-full truncate rounded-md border border-stone-200 px-3 py-2 text-xs text-stone-400"
                      />
                      <button
                        type="button"
                        onClick={handleCopyInvite}
                        className="bg-clay shrink-0 rounded-md px-3.5 py-2 text-xs font-medium text-white"
                      >
                        {copied ? t('settings.family.copied') : t('settings.family.copyLink')}
                      </button>
                    </div>
                  </>
                )}
              </div>
              <p className="mx-auto mt-4 max-w-115 text-center text-[13px] leading-relaxed text-stone-400">
                {t('onboarding.family.hint')}
              </p>
            </>
          )}

          {currentKey === 'pwa' && (
            <>
              <div className="mb-6 text-center">
                <h1 className="mb-2.5 font-serif text-[30px] text-stone-900">
                  {t('onboarding.pwa.title')}
                </h1>
                <p className="text-[15px] text-stone-600">{t('onboarding.pwa.description')}</p>
              </div>
              <div className="mx-auto max-w-105">
                {pwaStepTexts.map((text, i) => {
                  const StepIcon = pwaStepIcons[i];
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3.5 border-b border-stone-200 py-3.5 last:border-b-0"
                    >
                      <div className="text-clay flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[13px] font-semibold">
                        {i + 1}
                      </div>
                      <p className="flex-1 pt-0.5 text-sm leading-relaxed text-stone-900">{text}</p>
                      {StepIcon && (
                        <div className="shrink-0 pt-0.5 text-stone-400">
                          <StepIcon size={20} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {currentKey === 'done' && (
            <div className="mx-auto mt-10 max-w-95 text-center">
              <div className="bg-clay mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full text-white">
                <Flame size={26} />
              </div>
              <h1 className="mb-2.5 font-serif text-[28px] text-stone-900">
                {t('onboarding.done.title')}
              </h1>
              <p className="mb-7 text-[15px] leading-relaxed text-stone-600">
                {t('onboarding.done.description')}
              </p>
              <button
                type="button"
                onClick={handleNext}
                className="bg-clay rounded-md px-8 py-2.5 font-medium text-white"
              >
                {t('onboarding.done.cta')}
              </button>
            </div>
          )}
        </div>
      </div>

      {currentKey !== 'done' && (
        <div className="flex items-center justify-between border-t border-stone-200 px-7 py-4">
          {step > 0 ? (
            <button
              type="button"
              onClick={handleBack}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
            >
              {t('common.back')}
            </button>
          ) : (
            <span />
          )}

          <div className="flex gap-1.5">
            {stepKeys.map((key, i) => (
              <span
                key={key}
                className={`h-1.5 w-1.5 rounded-full ${
                  i === step ? 'bg-clay' : i < step ? 'bg-clay/40' : 'bg-stone-300'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleNext}
            disabled={currentKey === 'language' && !pickedLocale}
            className="bg-clay rounded-md px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {step === stepKeys.length - 1 ? t('onboarding.finish') : t('onboarding.next')}
          </button>
        </div>
      )}
    </div>
  );
}
