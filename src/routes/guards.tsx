import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Spinner } from '@/components/ui/feedback';
import { ROLE_HOME } from '@/utils/roles';
import type { Role } from '@/types';

/** UX-only guard: the backend remains the authority on every request. */
export function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, initialized } = useAuthStore();
  const location = useLocation();

  if (!initialized) return <div className="min-h-screen"><Spinner label="Restoring session…" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <Outlet />;
}

export function RedirectIfAuthed({ children }: { children: JSX.Element }) {
  const { user, initialized } = useAuthStore();
  if (!initialized) return <Spinner label="Restoring session…" />;
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return children;
}

export function HomeRedirect() {
  const user = useAuthStore((s) => s.user);
  return <Navigate to={user ? ROLE_HOME[user.role] : '/login'} replace />;
}
