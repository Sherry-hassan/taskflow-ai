import { Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.jsx';
import ForgotPasswordForm from '../components/ForgotPasswordForm.jsx';
import { api } from '../api/client.js';

export default function ForgotPasswordPage() {
  async function handleSubmit({ email }) {
    await api.requestPasswordReset(email);
  }

  return (
    <AuthLayout heading="Reset your password" subtitle="Enter your email and we'll send you a reset link.">
      <ForgotPasswordForm onSubmit={handleSubmit} />
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-700">
          Back to log in
        </Link>
      </p>
    </AuthLayout>
  );
}
