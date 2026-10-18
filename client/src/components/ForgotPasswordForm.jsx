import { useState } from 'react';

// FR-009: the server responds 202 identically whether or not the email
// matches an account, so this form shows exactly one fixed message after
// submit — it never branches on the response, since there is nothing in the
// response to safely branch on without reintroducing an enumeration leak.
export default function ForgotPasswordForm({ onSubmit }) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({ email });
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return <p role="status">If that email is registered, a reset link has been sent.</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="forgot-password-email">Email</label>
      <input
        id="forgot-password-email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <button type="submit" disabled={submitting}>
        Send reset link
      </button>
    </form>
  );
}
