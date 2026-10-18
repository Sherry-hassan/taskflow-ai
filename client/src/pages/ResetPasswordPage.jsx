import { Link, useSearchParams } from 'react-router-dom';
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-6 text-xl font-semibold text-gray-900">Choose a new password</h1>
        {token ? (
          <ResetPasswordForm onSubmit={handleSubmit} />
        ) : (
          <p role="alert">This link is missing its reset token.</p>
        )}
        <p className="mt-4 text-sm text-gray-500">
          <Link to="/login" className="text-blue-600 hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
