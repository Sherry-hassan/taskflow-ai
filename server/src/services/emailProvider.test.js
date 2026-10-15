import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMailMock = vi.fn();
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
}));

const REQUIRED_ENV = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_USER: 'user',
  SMTP_PASS: 'pass',
  EMAIL_FROM: 'no-reply@example.com',
};

async function freshModule() {
  vi.resetModules();
  return import('./emailProvider.js');
}

describe('emailProvider.sendEmail', () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    createTransportMock.mockClear();
    for (const key of Object.keys(REQUIRED_ENV)) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of Object.keys(REQUIRED_ENV)) {
      delete process.env[key];
    }
    vi.useRealTimers();
  });

  it('throws EmailProviderNotConfiguredError, without attempting a send, when SMTP config is incomplete', async () => {
    const { sendEmail, EmailProviderNotConfiguredError } = await freshModule();
    // Deliberately missing EMAIL_FROM.
    Object.assign(process.env, {
      SMTP_HOST: REQUIRED_ENV.SMTP_HOST,
      SMTP_PORT: REQUIRED_ENV.SMTP_PORT,
      SMTP_USER: REQUIRED_ENV.SMTP_USER,
      SMTP_PASS: REQUIRED_ENV.SMTP_PASS,
    });

    await expect(sendEmail({ to: 'a@example.com', subject: 's', text: 't' })).rejects.toThrow(
      EmailProviderNotConfiguredError,
    );
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('calls the transport with the right shape and resolves on success', async () => {
    const { sendEmail } = await freshModule();
    Object.assign(process.env, REQUIRED_ENV);
    sendMailMock.mockResolvedValue({ accepted: ['a@example.com'] });

    const result = await sendEmail({ to: 'a@example.com', subject: 'Subject', text: 'Body', html: '<p>Body</p>' });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: REQUIRED_ENV.SMTP_HOST,
        port: 587,
        auth: { user: REQUIRED_ENV.SMTP_USER, pass: REQUIRED_ENV.SMTP_PASS },
      }),
    );
    expect(sendMailMock).toHaveBeenCalledWith({
      from: REQUIRED_ENV.EMAIL_FROM,
      to: 'a@example.com',
      subject: 'Subject',
      text: 'Body',
      html: '<p>Body</p>',
    });
    expect(result.accepted).toEqual(['a@example.com']);
  });

  it('wraps a provider rejection in a generic EmailDeliveryError, never the raw provider error', async () => {
    const { sendEmail, EmailDeliveryError } = await freshModule();
    Object.assign(process.env, REQUIRED_ENV);
    sendMailMock.mockRejectedValue(new Error('535 Authentication failed: user=secret-account-detail'));

    const rejection = await sendEmail({ to: 'a@example.com', subject: 's', text: 't' }).catch((e) => e);

    expect(rejection).toBeInstanceOf(EmailDeliveryError);
    expect(rejection.message).not.toMatch(/secret-account-detail/);
    expect(rejection.message).not.toMatch(/535/);
  });

  it('rejects with EmailTimeoutError when the provider never resolves in time', async () => {
    vi.useFakeTimers();
    const { sendEmail, EmailTimeoutError } = await freshModule();
    Object.assign(process.env, REQUIRED_ENV);
    sendMailMock.mockReturnValue(new Promise(() => {})); // never resolves

    const pending = sendEmail({ to: 'a@example.com', subject: 's', text: 't' });
    const assertion = expect(pending).rejects.toThrow(EmailTimeoutError);
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
  });
});
