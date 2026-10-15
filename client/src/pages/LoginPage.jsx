import { Link, useNavigate } from 'react-router-dom';
import LoginForm from '../components/LoginForm.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit({ email, password }) {
    await login(email, password);
    navigate('/', { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-6 text-xl font-semibold text-gray-900">Log in</h1>
        <LoginForm onSubmit={handleSubmit} />
        <p className="mt-4 text-sm text-gray-500">
          Need an account?{' '}
          <Link to="/signup" className="text-blue-600 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
