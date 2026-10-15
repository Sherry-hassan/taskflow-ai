import { Link, useNavigate } from 'react-router-dom';
import SignupForm from '../components/SignupForm.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit({ email, password }) {
    await signup(email, password);
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-6 text-xl font-semibold text-gray-900">Create your account</h1>
        <SignupForm onSubmit={handleSubmit} />
        <p className="mt-4 text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
