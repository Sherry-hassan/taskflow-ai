import nodemailer from 'nodemailer';

// Adapter boundary for the two narrow transactional-email capabilities
// (password reset, invitation — FR-094/FR-095). Provider-agnostic: any real
// SMTP account works here (SendGrid/Mailgun/Postmark/SES relay, etc.) — no
// vendor SDK, no lock-in. This is the ONLY module that imports `nodemailer`;
// callers never touch the transport directly (implementation-plan.md's
// M7/Phase-2 disposition — "a provider adapter that preserves the existing
// notification-service interface").

export class EmailProviderNotConfiguredError extends Error {}
export class EmailTimeoutError extends Error {}
export class EmailDeliveryError extends Error {}

const SEND_TIMEOUT_MS = 10000;

function readConfig() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) {
    return null;
  }
  return { host: SMTP_HOST, port: Number(SMTP_PORT), user: SMTP_USER, pass: SMTP_PASS, from: EMAIL_FROM };
}

// Read fresh on every call rather than cached, so a misconfigured deployment
// fails safely (a clear, typed error) on first use instead of silently
// caching a broken or stale transporter.
//
// Resolving here means the destination mail server *accepted* the message
// for relay — not that the recipient received it. SMTP has no end-to-end
// delivery-confirmation signal; callers must not treat a resolved promise as
// a delivery receipt (see docs/legal/privacy-policy.md's email section).
export async function sendEmail({ to, subject, text, html }) {
  const config = readConfig();
  if (!config) {
    throw new EmailProviderNotConfiguredError('SMTP configuration is incomplete');
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // Standard convention: 465 is implicit TLS; any other port negotiates
    // STARTTLS if the server offers it. No separate SMTP_SECURE var exists
    // (approved env-var list is exactly six names), so this is derived.
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });

  let timeoutHandle;
  const timeout = new Promise((_resolve, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new EmailTimeoutError('Email delivery timed out')),
      SEND_TIMEOUT_MS,
    );
  });

  try {
    const info = await Promise.race([
      transporter.sendMail({ from: config.from, to, subject, text, html }),
      timeout,
    ]);
    return { accepted: info?.accepted ?? [to] };
  } catch (err) {
    if (err instanceof EmailTimeoutError) {
      throw err;
    }
    // Never rethrow the provider's own error object or message — an SMTP
    // server's rejection response can embed server-specific detail (e.g. an
    // auth-failure response echoing part of the exchange). Replaced with a
    // generic, caller-safe error; the original is never logged either
    // (callers log only via utils/emailLogging.js's allow-listed category).
    throw new EmailDeliveryError('Email provider rejected the message');
  } finally {
    clearTimeout(timeoutHandle);
  }
}
