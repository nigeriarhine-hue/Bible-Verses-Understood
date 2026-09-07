import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import { takeReturnPath } from '../lib/storage';

/** Where Supabase sends readers back after email confirmation or Google. */
export default function AuthCallbackPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate(takeReturnPath() ?? '/profile', { replace: true });
  }, [loading, user, navigate]);

  if (!loading && !user) return <Navigate to="/sign-in" replace />;

  return (
    <div className="container-page py-20 text-center">
      <span className="glass-pill">
        <Spinner className="h-4 w-4" />
        Signing you in
      </span>
    </div>
  );
}
