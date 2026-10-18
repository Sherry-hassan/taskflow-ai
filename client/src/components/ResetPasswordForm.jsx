import { useState } from 'react';

const inputClasses =
  'h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4.5 w-4.5" aria-hidden="true">
      <rect x="4" y="8.5" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 8.5V6a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function EyeIcon({ hidden }) {
  if (hidden) {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="h-4.5 w-4.5" aria-hidden="true">
        <path
          d="M3 3l14 14M8.4 8.5a2 2 0 0 0 2.9 2.9M6.1 6.1C4 7.4 2.7 9.2 2.5 10c.5 1.8 4 7 7.5 7 1.4 0 2.7-.4 3.9-1.1M11.4 4.2c2.9.4 5.8 2.9 6.9 5.8-.4 1.4-1.3 3-2.6 4.3"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4.5 w-4.5" aria-hidden="true">
      <path
        d="M2.5 10c.5-1.8 4-7 7.5-7s7 5.2 7.5 7c-.5 1.8-4 7-7.5 7s-7-5.2-7.5-7Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 10.2l2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ResetPasswordForm({ onSubmit }) {
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({ newPassword });
      setDone(true);
    } catch (err) {
      // Mirrors authController.js's confirmPasswordReset error message exactly
      // — covers an expired, already-used, or invalid token alike.
      setError(err.message || 'Token expired, already used, or invalid');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-800"
      >
        <CheckCircleIcon />
        <span>Your password has been reset. You can now log in.</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div>
        <label htmlFor="reset-password-new" className="mb-1.5 block text-sm font-medium text-slate-700">
          New password
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <LockIcon />
          </span>
          <input
            id="reset-password-new"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Enter a new password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            className={inputClasses}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Hide typed characters' : 'Reveal typed characters'}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
          >
            <EyeIcon hidden={showPassword} />
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-400">Use at least 8 characters.</p>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="flex h-11 w-full items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? 'Resetting…' : 'Reset password'}
      </button>
    </form>
  );
}
