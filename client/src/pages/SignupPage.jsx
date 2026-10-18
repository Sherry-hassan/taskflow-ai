import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.jsx';
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
    <AuthLayout heading="Create your account" subtitle="Start planning projects and turning ideas into action.">
      <SignupForm onSubmit={handleSubmit} />
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-700">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
