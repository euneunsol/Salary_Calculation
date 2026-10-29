import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import type { AppRole } from '../types/database.types';

/**
 * 주의: 아래 가드는 UX(잘못된 화면으로 들어가는 것 방지)를 위한 것이며,
 * 실제 데이터 접근 차단은 전적으로 Supabase RLS 가 담당한다.
 * 클라이언트 코드는 언제든 우회 가능하므로 보안 경계로 취급하지 않는다.
 */

function LoadingScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-shell text-ink-soft">
      불러오는 중…
    </div>
  );
}

export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

export function RoleRoute({ allow }: { allow: AppRole[] }) {
  const { role, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!role || !allow.includes(role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** 로그인 후 역할에 맞는 첫 화면으로 보낸다 */
export function RoleLanding() {
  const { role, loading, session } = useAuth();

  if (loading) return <LoadingScreen />;
  if (session && !role) return <Navigate to="/onboarding" replace />;
  if (role === 'OWNER') return <Navigate to="/owner/dashboard" replace />;
  if (role === 'MANAGER') return <Navigate to="/manage" replace />;
  if (role === 'EMPLOYEE') return <Navigate to="/me/dashboard" replace />;
  return <Navigate to="/login" replace />;
}
