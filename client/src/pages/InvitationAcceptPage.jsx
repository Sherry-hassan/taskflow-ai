import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';

export default function InvitationAcceptPage() {
  const { token } = useParams();
  const { callWithAuth } = useAuth();
  const [status, setStatus] = useState('pending'); // pending | accepted | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const membership = await callWithAuth(api.acceptInvitation, token);
        if (!cancelled) {
          setStatus('accepted');
          setMessage(`Joined workspace as ${membership.role}.`);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setMessage(err.message || 'Failed to accept invitation');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callWithAuth, token]);

  return (
    <div className="mx-auto max-w-md">
      {status === 'pending' && <p className="text-gray-500">Accepting invitation…</p>}
      {status === 'accepted' && (
        <>
          <p role="status" className="mb-4 text-green-700">
            {message}
          </p>
          <Link to="/" className="text-blue-600 hover:underline">
            Go to your workspaces
          </Link>
        </>
      )}
      {status === 'error' && (
        <p role="alert" className="text-red-600">
          {message}
        </p>
      )}
    </div>
  );
}
