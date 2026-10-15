import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <Link to="/" className="text-lg font-semibold text-gray-900">
          TaskFlow AI
        </Link>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          {user?.email && <span>{user.email}</span>}
          <button
            type="button"
            onClick={handleLogout}
            className="rounded bg-gray-100 px-3 py-1.5 hover:bg-gray-200"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
