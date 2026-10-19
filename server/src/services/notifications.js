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

// Table-based, inline-styled layout shared by both transactional emails below.
// Inline styles and <table> layout (rather than a <style> block or flex/grid)
// are deliberate — this is the subset that renders consistently across
// Outlook/Gmail/Apple Mail, not a stylistic preference.
function renderEmailLayout({ heading, bodyHtml, link, linkLabel }) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color:#4f46e5;padding:20px 32px;">
                <span style="color:#ffffff;font-size:18px;font-weight:600;">TaskFlow AI</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1f2933;font-size:15px;line-height:1.6;">
                <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">${heading}</h1>
                ${bodyHtml}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                  <tr>
                    <td style="border-radius:6px;background-color:#4f46e5;">
                      <a href="${link}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">${linkLabel}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0;font-size:13px;color:#6b7280;word-break:break-all;">If the button doesn't work, copy and paste this link into your browser:<br /><a href="${link}" style="color:#4f46e5;">${link}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background-color:#f9fafb;color:#9ca3af;font-size:12px;">
                This is an automated message from TaskFlow AI. If you weren't expecting it, you can safely ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
      html: renderEmailLayout({
        heading: 'Reset your password',
        bodyHtml: `<p style="margin:0 0 8px;">We received a request to reset your TaskFlow AI password.</p><p style="margin:0;">This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.</p>`,
        link,
        linkLabel: 'Reset password',
      }),
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
      html: renderEmailLayout({
        heading: "You're invited to TaskFlow AI",
        bodyHtml: `<p style="margin:0;">You've been invited to join a TaskFlow AI workspace as <strong>${role}</strong>.</p>`,
        link,
        linkLabel: 'Accept invitation',
      }),
    });
  } catch (err) {
    logEmailDeliveryFailure({ category: categorizeFailure(err), kind: 'invitation' });
  }
}
