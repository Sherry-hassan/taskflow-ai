import { Link, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.jsx';
import ResetPasswordForm from '../components/ResetPasswordForm.jsx';
import { api } from '../api/client.js';

// notifications.js builds the emailed link as `${APP_BASE_URL}/reset-password?token=...`
// (a query param, unlike the invitation link's path param), so this page
// reads it with useSearchParams, not useParams.
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  async function handleSubmit({ newPassword }) {
    await api.confirmPasswordReset(token, newPassword);
  }

  return (
    <AuthLayout heading="Choose a new password" subtitle="Your new password must be different from previous ones.">
      {token ? (
        <ResetPasswordForm onSubmit={handleSubmit} />
      ) : (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          This link is missing its reset token.
        </p>
      )}
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-700">
          Back to log in
        </Link>
      </p>
    </AuthLayout>
  );
}
