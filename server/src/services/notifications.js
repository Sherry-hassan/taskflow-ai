import { sendEmail, EmailProviderNotConfiguredError, EmailTimeoutError } from './emailProvider.js';
import { logEmailDeliveryFailure } from '../utils/emailLogging.js';

// Transactional-email capability (FR-094/FR-095). Both functions below keep
// the exact signature M1/M2 established — callers (authService.js,
// invitationService.js) are unmodified by the real provider integration.
// Both catch every delivery error internally and resolve without throwing:
// this is deliberate, not a swallowed bug. For password reset in particular,
// FR-009 requires the caller-visible response to be identical whether or not
// the account exists — a thrown delivery error reaching the controller would
// turn into a 500 only when an account *does* exist and its reset email
// fails to send, which would itself leak account existence. A failure is
// still never silently treated as a success: it's categorized and logged via
// the sanitized logger below, just never surfaced to the HTTP caller.

function categorizeFailure(err) {
  if (err instanceof EmailProviderNotConfiguredError) return 'not-configured';
  if (err instanceof EmailTimeoutError) return 'timeout';
  return 'provider-error';
}

function appBaseUrl() {
  return process.env.APP_BASE_URL || '';
}

// FR-009/US-006: a reset "link" by email. APP_BASE_URL + this route does not
// resolve to a real page yet — no app shell has been built (README.md's
// Current Limitations) — but FR-009/US-006 specify a link, not a bare token,
// so the link is constructed now and will start working once that frontend
// route exists, with no change needed here.
export async function sendPasswordResetEmail({ to, token }) {
  const link = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    await sendEmail({
      to,
      subject: 'Reset your TaskFlow AI password',
      text: `We received a request to reset your TaskFlow AI password. Use the link below within 1 hour:\n${link}\n\nIf you didn't request this, you can ignore this email.`,
      html: `<p>We received a request to reset your TaskFlow AI password. Use the link below within 1 hour:</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    });
  } catch (err) {
    logEmailDeliveryFailure({ category: categorizeFailure(err), kind: 'password-reset' });
  }
}

// FR-094/FR-095: invitation delivery, same APP_BASE_URL caveat as above.
// `workspaceId` is intentionally not destructured — the invitation's
// `role` is human-readable context for the recipient; the raw workspace
// ObjectId is not, and resolving it to a workspace name would require this
// module to query the Workspace collection, which is out of this phase's
// approved scope.
export async function sendInvitationEmail({ to, token, role }) {
  const link = `${appBaseUrl()}/invitations/${encodeURIComponent(token)}/accept`;
  try {
    await sendEmail({
      to,
      subject: 'You have been invited to a TaskFlow AI workspace',
      text: `You've been invited to join a TaskFlow AI workspace as ${role}. Use the link below to accept:\n${link}`,
      html: `<p>You've been invited to join a TaskFlow AI workspace as <strong>${role}</strong>. Use the link below to accept:</p><p><a href="${link}">${link}</a></p>`,
    });
  } catch (err) {
    logEmailDeliveryFailure({ category: categorizeFailure(err), kind: 'invitation' });
  }
}
