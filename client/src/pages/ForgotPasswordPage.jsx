import { Link } from 'react-router-dom';
import ForgotPasswordForm from '../components/ForgotPasswordForm.jsx';
import { api } from '../api/client.js';

export default function ForgotPasswordPage() {
  async function handleSubmit({ email }) {
    await api.requestPasswordReset(email);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-6 text-xl font-semibold text-gray-900">Reset your password</h1>
        <ForgotPasswordForm onSubmit={handleSubmit} />
        <p className="mt-4 text-sm text-gray-500">
          <Link to="/login" className="text-blue-600 hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
