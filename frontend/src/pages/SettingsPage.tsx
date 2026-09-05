import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { changePassword, deleteAccount, leaveFamily, updateProfile } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../hooks/useAuth';
import { useFamily } from '../hooks/useFamily';
import { useInvalidateFamilyData } from '../hooks/useInvalidateFamilyData';
import Dialog from '../components/Dialog';
import { SUPPORTED_LOCALES, type SupportedLocale } from 'yumbry-shared';

// Native-language names — always shown as-is, regardless of the active UI language.
const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: 'English',
  nl: 'Nederlands',
  fr: 'Français',
  es: 'Español',
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { clearSession, user } = useAuth();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  const deleteAccountMutation = useMutation({
    mutationFn: () => deleteAccount(deletePassword),
    onSuccess: () => clearSession(),
  });

  function handleDeleteSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    deleteAccountMutation.mutate();
  }

  const localeMutation = useMutation({
    mutationFn: (locale: SupportedLocale) => updateProfile({ locale }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.authMe });
    },
  });

  const { data: family } = useFamily();
  const invalidateFamilyData = useInvalidateFamilyData();
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const inviteUrl = family ? `${window.location.origin}/join-family/${family.invite_token}` : '';

  const leaveFamilyMutation = useMutation({
    mutationFn: leaveFamily,
    onSuccess: () => {
      setShowLeaveConfirm(false);
      invalidateFamilyData();
    },
  });

  async function handleCopyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const passwordMismatch =
    newPassword.length > 0 && confirmNewPassword.length > 0 && newPassword !== confirmNewPassword;

  const changePasswordMutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    },
  });

  function handleChangePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) return;
    changePasswordMutation.mutate();
  }

  return (
    <div className="max-w-xl space-y-10">
      <div className="space-y-3">
        <div>
          <h1 className="font-serif text-2xl text-stone-900">{t('settings.language.title')}</h1>
          <p className="mt-1 text-sm text-stone-500">{t('settings.language.description')}</p>
        </div>

        <label className="block text-sm font-medium text-stone-700">
          {t('settings.language.label')}
          <select
            value={user?.locale ?? 'en'}
            onChange={(e) => localeMutation.mutate(e.target.value as SupportedLocale)}
            disabled={localeMutation.isPending}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none disabled:opacity-50"
          >
            {SUPPORTED_LOCALES.map((key) => (
              <option key={key} value={key}>
                {LOCALE_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        {localeMutation.isSuccess && (
          <p className="text-sm text-green-700">{t('settings.language.saved')}</p>
        )}
        {localeMutation.isError && (
          <p className="text-sm text-red-600">{localeMutation.error?.message}</p>
        )}
      </div>

      <form onSubmit={handleChangePasswordSubmit} className="space-y-3">
        <div>
          <h1 className="font-serif text-2xl text-stone-900">{t('settings.password.title')}</h1>
          <p className="mt-1 text-sm text-stone-500">{t('settings.password.description')}</p>
        </div>

        <label className="block text-sm font-medium text-stone-700">
          {t('settings.password.currentPassword')}
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
          />
        </label>

        <label className="block text-sm font-medium text-stone-700">
          {t('settings.password.newPassword')}
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
          />
        </label>

        <label className="block text-sm font-medium text-stone-700">
          {t('settings.password.confirmNewPassword')}
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
          />
        </label>

        {passwordMismatch && (
          <p className="text-sm text-red-600">{t('settings.password.mismatch')}</p>
        )}

        {changePasswordMutation.isError && (
          <p className="text-sm text-red-600">{changePasswordMutation.error?.message}</p>
        )}
        {changePasswordMutation.isSuccess && (
          <p className="text-sm text-green-700">{t('settings.password.saved')}</p>
        )}

        <button
          type="submit"
          disabled={changePasswordMutation.isPending || passwordMismatch}
          className="rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
        >
          {changePasswordMutation.isPending
            ? t('settings.password.saving')
            : t('settings.password.savePassword')}
        </button>
      </form>

      {family && (
        <div className="space-y-4">
          <div>
            <h1 className="font-serif text-2xl text-stone-900">{t('settings.family.title')}</h1>
            <p className="mt-1 text-sm text-stone-500">{t('settings.family.description')}</p>
          </div>

          <div className="space-y-1">
            <h2 className="text-sm font-medium text-stone-700">{t('settings.family.members')}</h2>
            <ul className="divide-y divide-stone-200 rounded-md border border-stone-300">
              {family.members.map((member) => (
                <li key={member.id} className="px-3 py-2 text-sm text-stone-700">
                  {member.email}
                  {member.id === user?.id && (
                    <span className="ml-2 text-stone-400">{t('settings.family.you')}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-stone-700" htmlFor="invite-link">
              {t('settings.family.inviteLabel')}
            </label>
            <div className="flex gap-2">
              <input
                id="invite-link"
                type="text"
                readOnly
                value={inviteUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-600 focus:border-clay focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyInvite}
                className="shrink-0 rounded-md bg-clay px-4 py-2 text-sm text-white"
              >
                {copied ? t('settings.family.copied') : t('settings.family.copyLink')}
              </button>
            </div>
            <p className="text-xs text-stone-500">{t('settings.family.inviteHint')}</p>
          </div>

          {family.members.length > 1 && (
            <div>
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(true)}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
              >
                {t('settings.family.leave')}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 rounded-md border border-red-300 p-4">
        <h2 className="font-serif text-xl text-red-900">{t('settings.dangerZone.title')}</h2>
        <p className="text-sm text-stone-600">{t('settings.dangerZone.description')}</p>

        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="rounded-md border border-red-600 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50"
        >
          {t('settings.dangerZone.deleteAccount')}
        </button>
      </div>

      <Dialog
        open={showLeaveConfirm}
        onOpenChange={setShowLeaveConfirm}
        title={t('settings.family.leaveDialogTitle')}
        description={t('settings.family.leaveDialogDescription')}
      >
        <div className="space-y-3">
          {leaveFamilyMutation.isError && (
            <p className="text-sm text-red-600">{leaveFamilyMutation.error?.message}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => leaveFamilyMutation.mutate()}
              disabled={leaveFamilyMutation.isPending}
              className="rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
            >
              {leaveFamilyMutation.isPending
                ? t('settings.family.leaving')
                : t('settings.family.confirmLeave')}
            </button>
            <button
              type="button"
              onClick={() => setShowLeaveConfirm(false)}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          setShowDeleteConfirm(open);
          if (!open) setDeletePassword('');
        }}
        title={t('settings.dangerZone.dialogTitle')}
        description={t('settings.dangerZone.description')}
      >
        <form onSubmit={handleDeleteSubmit} className="space-y-3">
          <label className="block text-sm font-medium text-stone-700">
            {t('settings.dangerZone.confirmPassword')}
            <input
              type="password"
              required
              autoFocus
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
            />
          </label>

          {deleteAccountMutation.isError && (
            <p className="text-sm text-red-600">{deleteAccountMutation.error?.message}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={deleteAccountMutation.isPending}
              className="rounded-md bg-red-700 px-4 py-2 text-white disabled:opacity-50"
            >
              {deleteAccountMutation.isPending
                ? t('settings.dangerZone.deleting')
                : t('settings.dangerZone.permanentlyDelete')}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeletePassword('');
              }}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
