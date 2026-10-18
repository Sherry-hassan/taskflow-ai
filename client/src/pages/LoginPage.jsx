import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.jsx';
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
    <AuthLayout heading="Welcome back" subtitle="Sign in to continue managing your projects.">
      <LoginForm onSubmit={handleSubmit} />
      <p className="mt-3 text-right text-sm">
        <Link to="/forgot-password" className="font-medium text-indigo-600 hover:text-indigo-700">
          Forgot password?
        </Link>
      </p>
      <p className="mt-6 text-center text-sm text-slate-500">
        Need an account?{' '}
        <Link to="/signup" className="font-medium text-indigo-600 hover:text-indigo-700">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
