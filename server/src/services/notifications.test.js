import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./emailProvider.js', async () => {
  const actual = await vi.importActual('./emailProvider.js');
  return { ...actual, sendEmail: vi.fn() };
});
vi.mock('../utils/emailLogging.js', () => ({ logEmailDeliveryFailure: vi.fn() }));

import { sendEmail, EmailProviderNotConfiguredError, EmailTimeoutError, EmailDeliveryError } from './emailProvider.js';
import { logEmailDeliveryFailure } from '../utils/emailLogging.js';
import { sendPasswordResetEmail, sendInvitationEmail } from './notifications.js';

describe('notifications.sendPasswordResetEmail', () => {
  beforeEach(() => {
    sendEmail.mockReset();
    logEmailDeliveryFailure.mockReset();
    delete process.env.APP_BASE_URL;
  });

  afterEach(() => {
    delete process.env.APP_BASE_URL;
  });

  it('builds a reset link using APP_BASE_URL and sends it, on success', async () => {
    process.env.APP_BASE_URL = 'https://app.example.com';
    sendEmail.mockResolvedValue({ accepted: ['user@example.com'] });

    await sendPasswordResetEmail({ to: 'user@example.com', token: 'raw-token-abc' });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const call = sendEmail.mock.calls[0][0];
    expect(call.to).toBe('user@example.com');
    expect(call.text).toContain('https://app.example.com/reset-password?token=raw-token-abc');
    expect(call.html).toContain('https://app.example.com/reset-password?token=raw-token-abc');
    expect(logEmailDeliveryFailure).not.toHaveBeenCalled();
  });

  it('resolves (never throws) and logs a sanitized "not-configured" failure when SMTP is unconfigured', async () => {
    sendEmail.mockRejectedValue(new EmailProviderNotConfiguredError('SMTP configuration is incomplete'));

    await expect(
      sendPasswordResetEmail({ to: 'user@example.com', token: 'raw-token-abc' }),
    ).resolves.toBeUndefined();

    expect(logEmailDeliveryFailure).toHaveBeenCalledWith({ category: 'not-configured', kind: 'password-reset' });
  });

  it('resolves and logs "timeout" on a provider timeout', async () => {
    sendEmail.mockRejectedValue(new EmailTimeoutError('Email delivery timed out'));

    await sendPasswordResetEmail({ to: 'user@example.com', token: 'raw-token-abc' });

    expect(logEmailDeliveryFailure).toHaveBeenCalledWith({ category: 'timeout', kind: 'password-reset' });
  });

  it('resolves and logs "provider-error" on a generic delivery failure', async () => {
    sendEmail.mockRejectedValue(new EmailDeliveryError('Email provider rejected the message'));

    await sendPasswordResetEmail({ to: 'user@example.com', token: 'raw-token-abc' });

    expect(logEmailDeliveryFailure).toHaveBeenCalledWith({ category: 'provider-error', kind: 'password-reset' });
  });

  it('never includes the recipient address or raw token in the logged failure', async () => {
    sendEmail.mockRejectedValue(new EmailDeliveryError('rejected'));

    await sendPasswordResetEmail({ to: 'someone-identifiable@example.com', token: 'super-secret-raw-token' });

    const loggedArg = logEmailDeliveryFailure.mock.calls[0][0];
    const serialized = JSON.stringify(loggedArg);
    expect(serialized).not.toContain('someone-identifiable@example.com');
    expect(serialized).not.toContain('super-secret-raw-token');
  });
});

describe('notifications.sendInvitationEmail', () => {
  beforeEach(() => {
    sendEmail.mockReset();
    logEmailDeliveryFailure.mockReset();
    delete process.env.APP_BASE_URL;
  });

  afterEach(() => {
    delete process.env.APP_BASE_URL;
  });

  it('builds an accept link using APP_BASE_URL and the role, and sends it, on success', async () => {
    process.env.APP_BASE_URL = 'https://app.example.com';
    sendEmail.mockResolvedValue({ accepted: ['invitee@example.com'] });

    await sendInvitationEmail({
      to: 'invitee@example.com',
      token: 'raw-invite-token',
      workspaceId: '64f0000000000000000000aa',
      role: 'member',
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const call = sendEmail.mock.calls[0][0];
    expect(call.text).toContain('https://app.example.com/invitations/raw-invite-token/accept');
    expect(call.text).toContain('member');
    expect(logEmailDeliveryFailure).not.toHaveBeenCalled();
  });

  it('resolves (never throws) and logs a sanitized failure when delivery fails', async () => {
    sendEmail.mockRejectedValue(new EmailDeliveryError('rejected'));

    await expect(
      sendInvitationEmail({ to: 'invitee@example.com', token: 'raw-invite-token', workspaceId: 'ws1', role: 'admin' }),
    ).resolves.toBeUndefined();

    expect(logEmailDeliveryFailure).toHaveBeenCalledWith({ category: 'provider-error', kind: 'invitation' });
  });

  it('tolerates a missing workspaceId/extra fields without throwing (preserves the existing call-site shape)', async () => {
    sendEmail.mockResolvedValue({});
    await expect(
      sendInvitationEmail({ to: 'invitee@example.com', token: 't', role: 'member' }),
    ).resolves.toBeUndefined();
  });
});
