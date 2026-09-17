import { Navigate } from 'react-router-dom';
import { isAuthenticated } from '../services/auth';
import { useAccess } from './AccessContext';
import type { ScreenKey } from './permissions';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function ProtectedScreen({
  screen,
  children,
}: {
  screen: ScreenKey;
  children: React.ReactNode;
}) {
  const { canView, defaultRoute } = useAccess();

  if (!canView(screen)) {
    return <Navigate to={defaultRoute} replace />;
  }

  return <>{children}</>;
}
