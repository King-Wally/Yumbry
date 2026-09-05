import { Resend } from 'resend';

// Read lazily (at call time, not import time) so the app still boots without these set —
// self-hosters who don't want password-reset emails shouldn't be forced to configure Resend.
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

// Cheap, no-network check the frontend polls to decide whether to show the "forgot password"
// entry point at all, rather than only discovering email isn't configured after submitting.
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.APP_BASE_URL);
}

/** Sends the password reset email containing a link with the raw (unhashed)
 * token. Throws if Resend reports an error, or if email isn't configured. */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const resend = new Resend(requireResendApiKey());
  const emailFrom = requireEmailFrom();
  const resetUrl = `${requireAppBaseUrl()}/reset-password?token=${token}`;

  const { error } = await resend.emails.send({
    from: emailFrom,
    to,
    subject: 'Reset your Yumbry password',
    text: `We received a request to reset your Yumbry password.\n\nOpen this link to choose a new password (it expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `<p>We received a request to reset your Yumbry password.</p><p><a href="${resetUrl}">Click here to choose a new password</a> (this link expires in 1 hour).</p><p>If you didn't request this, you can safely ignore this email.</p>`,
  });

  if (error) throw new Error(`Failed to send password reset email: ${error.message}`);
}
