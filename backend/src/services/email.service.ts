import { Resend } from 'resend';

function requireResendApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY must be set.');
  return key;
}

function requireEmailFrom(): string {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error('EMAIL_FROM must be set.');
  return from;
}

function requireAppBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) throw new Error('APP_BASE_URL must be set.');
  return url;
}

const resend = new Resend(requireResendApiKey());
const EMAIL_FROM = requireEmailFrom();
const APP_BASE_URL = requireAppBaseUrl();

/** Sends the password reset email containing a link with the raw (unhashed)
 * token. Throws if Resend reports an error. */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const resetUrl = `${APP_BASE_URL}/reset-password?token=${token}`;

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: 'Reset your Recipe Vault password',
    text: `We received a request to reset your Recipe Vault password.\n\nOpen this link to choose a new password (it expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `<p>We received a request to reset your Recipe Vault password.</p><p><a href="${resetUrl}">Click here to choose a new password</a> (this link expires in 1 hour).</p><p>If you didn't request this, you can safely ignore this email.</p>`,
  });

  if (error) throw new Error(`Failed to send password reset email: ${error.message}`);
}
