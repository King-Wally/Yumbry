import { EMAIL_FROM, ORIGIN, RESEND_API_KEY, RESEND_BASE_URL } from '$app/env/private';
import { Resend } from 'resend';

/** Password reset by email is optional: self-hosters without Resend just don't get it, and the login
 * page hides its "Forgot your password?" link. */
export function isEmailConfigured(): boolean {
	return Boolean(RESEND_API_KEY && EMAIL_FROM);
}

/** Sends the password reset email with a link holding the raw token. Throws if Resend reports an
 * error, or if email isn't configured. */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
	if (!RESEND_API_KEY || !EMAIL_FROM) throw new Error('Email is not configured.');
	// The same URL main sent, so links already sitting in inboxes keep working.
	const resetUrl = `${ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;

	// Built per send, with the base URL passed explicitly rather than left to the SDK's own
	// process.env read (the e2e fakes set RESEND_BASE_URL).
	const resend = new Resend(RESEND_API_KEY, { baseUrl: RESEND_BASE_URL });
	const { error } = await resend.emails.send({
		from: EMAIL_FROM,
		to,
		subject: 'Reset your Yumbry password',
		text: `We received a request to reset your Yumbry password.\n\nOpen this link to choose a new password (it expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
		html: `<p>We received a request to reset your Yumbry password.</p><p><a href="${resetUrl}">Click here to choose a new password</a> (this link expires in 1 hour).</p><p>If you didn't request this, you can safely ignore this email.</p>`
	});

	if (error) throw new Error(`Failed to send password reset email: ${error.message}`);
}
