import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';

const ROLE_LABEL: Record<string, string> = {
  OWNER: '사장님',
  MANAGER: '매니저',
  EMPLOYEE: '알바생',
};

function navClass({ isActive }: { isActive: boolean }) {
  return [
    'rounded-lg px-3 py-2 text-sm font-medium transition',
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
  ].join(' ');
}

export function AppLayout() {
  const { profile, role, signOut } = useAuth();

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <span className="text-base font-semibold text-slate-900">근무·급여 관리</span>

          <nav className="flex flex-1 gap-1">
            {role === 'EMPLOYEE' && (
              <>
                <NavLink to="/me/dashboard" className={navClass}>
                  홈
                </NavLink>
                <NavLink to="/me/calendar" className={navClass}>
                  근무 달력
                </NavLink>
                <NavLink to="/me/payroll" className={navClass}>
                  급여
                </NavLink>
              </>
            )}
            {role === 'MANAGER' && (
              <NavLink to="/manage" className={navClass}>
                매장 관리
              </NavLink>
            )}
            {role === 'OWNER' && (
              <>
                <NavLink to="/owner/dashboard" className={navClass}>
                  홈
                </NavLink>
                <NavLink to="/owner/stores" className={navClass}>
                  매장
                </NavLink>
                <NavLink to="/owner/payroll" className={navClass}>
                  급여
                </NavLink>
              </>
            )}
          </nav>

          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              {profile?.name}
              {role && (
                <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                  {ROLE_LABEL[role]}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
