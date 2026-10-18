import { useState } from 'react';

export default function ResetPasswordForm({ onSubmit }) {
  const [newPassword, setNewPassword] = useState('');
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
    return <p role="status">Your password has been reset. You can now log in.</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="reset-password-new">New password</label>
      <input
        id="reset-password-new"
        type="password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        required
      />

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={submitting}>
        Reset password
      </button>
    </form>
  );
}
