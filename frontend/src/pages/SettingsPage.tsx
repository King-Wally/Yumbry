import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileBraces, Globe, Lock, TriangleAlert, Users } from 'lucide-react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { leaveFamily, updateProfile } from '../api/client';
import { authClient, refreshSession } from '../lib/auth-client';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useFamily } from '../hooks/useFamily';
import { useInvalidateFamilyData } from '../hooks/useInvalidateFamilyData';
import Card from '../components/Card';
import Dialog from '../components/Dialog';
import { SUPPORTED_LOCALES, type SupportedLocale } from 'yumbry-shared';
import { Link } from 'react-router-dom';
import { LOCALE_LABELS } from '../i18n/localeLabels';

export default function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  const deleteAccountMutation = useMutation({
    // better-auth reports failures in the result rather than throwing, so the
    // wrong-password case has to be turned back into a rejection for useMutation.
    mutationFn: async () => {
      const { error } = await authClient.deleteUser({ password: deletePassword });
      if (error) throw new Error(error.message ?? t('common.somethingWentWrong'));
    },
    onSuccess: () => {
      // The account and its session are gone; drop every cached query with it.
      queryClient.clear();
    },
  });

  function handleDeleteSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    deleteAccountMutation.mutate();
  }

  const localeMutation = useMutation({
    mutationFn: (locale: SupportedLocale) => updateProfile({ locale }),
    onSuccess: () => {
      refreshSession();
    },
  });

  const jsonImportExportMutation = useMutation({
    mutationFn: (jsonImportExportEnabled: boolean) => updateProfile({ jsonImportExportEnabled }),
    onSuccess: () => {
      refreshSession();
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
    mutationFn: async () => {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        // Matches the old behaviour: changing your password signs out every
        // other device, which used to be a tokenVersion bump.
        revokeOtherSessions: true,
      });
      if (error) throw new Error(error.message ?? t('common.somethingWentWrong'));
    },
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
    <div className="max-w-settings mx-auto">
      <div className="mb-4 flex items-center gap-3">
        <Link
          to="/"
          aria-label={t('common.back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:bg-stone-100"
        >
          <ArrowLeft size={18} />
        </Link>
        <h1 className="font-serif text-2xl font-bold text-stone-900">
          {t('settings.title', 'Settings')}
        </h1>
      </div>

      <div className="flex flex-col gap-6">
        {/* Language */}
        <Card>
          <Card.Header
            icon={<Globe size={20} strokeWidth={2} />}
            title={t('settings.language.title')}
            description={t('settings.language.description')}
          />

          <label className="block text-sm font-medium text-stone-700">
            {t('settings.language.label')}
            <select
              value={user?.locale ?? 'en'}
              onChange={(e) => localeMutation.mutate(e.target.value as SupportedLocale)}
              disabled={localeMutation.isPending}
              className="focus:border-clay mt-1.5 w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none disabled:opacity-50"
            >
              {SUPPORTED_LOCALES.map((key) => (
                <option key={key} value={key}>
                  {LOCALE_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          {localeMutation.isSuccess && (
            <p className="mt-2.5 text-[13px] text-green-700">{t('settings.language.saved')}</p>
          )}
          {localeMutation.isError && (
            <p className="mt-2.5 text-[13px] text-red-600">{localeMutation.error?.message}</p>
          )}
        </Card>

        {/* Password */}
        <Card>
          <Card.Header
            icon={<Lock size={20} strokeWidth={2} />}
            title={t('settings.password.title')}
            description={t('settings.password.description')}
          />

          <form onSubmit={handleChangePasswordSubmit} className="flex flex-col gap-3.5">
            <label className="block text-sm font-medium text-stone-700">
              {t('settings.password.currentPassword')}
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="focus:border-clay mt-1.5 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:outline-none"
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
                className="focus:border-clay mt-1.5 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:outline-none"
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
                className="focus:border-clay mt-1.5 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:outline-none"
              />
            </label>

            {passwordMismatch && (
              <p className="text-[13px] text-red-600">{t('settings.password.mismatch')}</p>
            )}
            {changePasswordMutation.isError && (
              <p className="text-[13px] text-red-600">{changePasswordMutation.error?.message}</p>
            )}
            {changePasswordMutation.isSuccess && (
              <p className="text-[13px] text-green-700">{t('settings.password.saved')}</p>
            )}

            <div>
              <button
                type="submit"
                disabled={changePasswordMutation.isPending || passwordMismatch}
                className="bg-clay rounded-md px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {changePasswordMutation.isPending
                  ? t('settings.password.saving')
                  : t('settings.password.savePassword')}
              </button>
            </div>
          </form>
        </Card>

        {/* Family */}
        {family && (
          <Card>
            <Card.Header
              icon={<Users size={20} strokeWidth={2} />}
              title={t('settings.family.title')}
              description={t('settings.family.description')}
            />

            <div className="mb-4.5">
              <h3 className="mb-1.5 text-[13px] font-medium text-stone-700">
                {t('settings.family.members')}
              </h3>
              <ul className="divide-y divide-stone-200 rounded-md border border-stone-300">
                {family.members.map((member) => (
                  <li key={member.id} className="px-3 py-2 text-sm text-stone-700">
                    {member.email}
                    {member.id === user?.id && (
                      <span className="ml-2 text-stone-400">
                        {t('settings.family.you', '(you)')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mb-4.5">
              <label
                className="mb-1.5 block text-sm font-medium text-stone-700"
                htmlFor="invite-link"
              >
                {t('settings.family.inviteLabel')}
              </label>
              <div className="flex gap-2">
                <input
                  id="invite-link"
                  type="text"
                  readOnly
                  value={inviteUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="focus:border-clay w-full rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-[13px] text-stone-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="bg-clay shrink-0 rounded-md px-4 py-2 text-[13px] text-white"
                >
                  {copied ? t('settings.family.copied') : t('settings.family.copyLink')}
                </button>
              </div>
              <p className="mt-2 text-xs text-stone-500">{t('settings.family.inviteHint')}</p>
            </div>

            {family.members.length > 1 && (
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(true)}
                className="rounded-md border border-stone-300 px-3.5 py-1.5 text-[13px] text-stone-700 transition-colors hover:border-stone-400 hover:bg-stone-100"
              >
                {t('settings.family.leave')}
              </button>
            )}
          </Card>
        )}

        {/* JSON import/export */}
        <Card>
          <Card.Header
            icon={<FileBraces size={20} strokeWidth={2} />}
            title={t('settings.jsonImportExport.title')}
            description={t('settings.jsonImportExport.description')}
          />

          <label className="flex items-center justify-between gap-3 text-sm font-medium text-stone-700">
            {t('settings.jsonImportExport.label')}
            <SwitchPrimitive.Root
              checked={user?.jsonImportExportEnabled ?? false}
              onCheckedChange={(checked) => jsonImportExportMutation.mutate(checked)}
              disabled={jsonImportExportMutation.isPending}
              className="data-[state=checked]:bg-clay relative h-6 w-11 shrink-0 rounded-full bg-stone-300 transition-colors disabled:opacity-50"
            >
              <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5.5" />
            </SwitchPrimitive.Root>
          </label>
          {jsonImportExportMutation.isError && (
            <p className="mt-2.5 text-[13px] text-red-600">
              {jsonImportExportMutation.error?.message}
            </p>
          )}
        </Card>

        {/* Danger zone */}
        <Card danger>
          <Card.Header
            danger
            icon={<TriangleAlert size={20} strokeWidth={2} />}
            title={t('settings.dangerZone.title')}
            description={t('settings.dangerZone.description')}
          />

          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-md border border-red-600 px-3.5 py-1.5 text-[13px] text-red-700 transition-colors hover:bg-red-100"
          >
            {t('settings.dangerZone.deleteAccount')}
          </button>
        </Card>
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
              className="bg-clay rounded-md px-4 py-2 text-white disabled:opacity-50"
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
              className="focus:border-clay mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:outline-none"
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
