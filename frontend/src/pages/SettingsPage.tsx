import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { changePassword, deleteAccount, updateProfile } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../hooks/useAuth';
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
