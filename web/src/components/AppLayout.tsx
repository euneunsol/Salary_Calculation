import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { HankoFilterDefs } from './ui/Hanko';
import { Icon } from './ui/Icon';
import wordmark from '../assets/omamori-wordmark.png';
import icon from '../assets/omamori-icon.png';

const ROLE_LABEL: Record<string, string> = { OWNER: '사장님', MANAGER: '매니저', EMPLOYEE: '알바생' };

const NAV = {
  EMPLOYEE: [{ to: '/me/dashboard', label: '홈', icon: 'home' }, { to: '/me/calendar', label: '근무 달력', icon: 'calendar' }, { to: '/me/payroll', label: '급여', icon: 'wallet' }],
  MANAGER: [{ to: '/manage', label: '매장 관리', icon: 'store' }, { to: '/me/calendar', label: '내 근무', icon: 'calendar' }],
  OWNER: [{ to: '/owner/dashboard', label: '홈', icon: 'home' }, { to: '/owner/stores', label: '매장', icon: 'store' }, { to: '/owner/payroll', label: '급여', icon: 'wallet' }, { to: '/owner/schedule', label: '근무표', icon: 'users' }],
} as const;

function navClass({ isActive }: { isActive: boolean }) {
  return `flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${isActive ? 'bg-brand-600 text-white' : 'text-ink-soft hover:bg-shell hover:text-ink'}`;
}

export function AppLayout() {
  const { profile, role, signOut } = useAuth();
  const items = role ? NAV[role] : [];
  const initial = profile?.name?.slice(0, 1).toUpperCase() ?? '?';
  return <div className="min-h-dvh bg-shell text-ink">
    <HankoFilterDefs />
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-hairline bg-paper px-4 py-5 lg:flex">
      <div className="px-2"><img src={wordmark} alt="OMAMORI TEA HOUSE" className="h-16 w-auto" /><p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-ink-soft">근무·급여 관리</p></div>
      <nav className="mt-9 space-y-1.5" aria-label="주요 메뉴">{items.map((item) => <NavLink key={item.to} to={item.to} className={navClass}><Icon name={item.icon}/>{item.label}</NavLink>)}</nav>
      <div className="mt-auto rounded-lg border border-hairline bg-shell p-3"><div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700">{initial}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{profile?.name}</p><p className="text-xs text-ink-soft">{role && ROLE_LABEL[role]}</p></div></div><button type="button" onClick={() => void signOut()} className="mt-3 min-h-9 w-full cursor-pointer rounded-lg border border-hairline bg-paper-light py-2 text-xs font-medium text-ink-soft transition-colors hover:border-brand-500/40 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">로그아웃</button></div>
    </aside>
    <div className="lg:pl-64">
      <header className="sticky top-0 z-10 border-b border-hairline bg-paper/95 backdrop-blur lg:hidden"><div className="flex items-center justify-between px-4 py-3"><div className="flex items-center gap-2"><img src={icon} alt="" className="h-8 w-8" /><strong className="font-wordmark text-brand-700">OMAMORI</strong></div><button type="button" onClick={() => void signOut()} className="min-h-9 cursor-pointer rounded-lg px-2 text-xs font-medium text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">로그아웃</button></div><nav className="flex gap-1 overflow-x-auto px-3 pb-3" aria-label="주요 메뉴">{items.map((item) => <NavLink key={item.to} to={item.to} className={navClass}><Icon name={item.icon}/>{item.label}</NavLink>)}</nav></header>
      <header className="hidden h-20 items-center justify-between border-b border-hairline bg-paper/80 px-8 backdrop-blur lg:flex"><div><p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-soft">오마모리 워크스페이스</p><p className="mt-0.5 text-sm font-semibold text-ink">근무·급여 통합 관리</p></div><div className="flex items-center gap-3"><div className="text-right"><p className="text-sm font-semibold text-ink">{profile?.name}</p><p className="text-xs text-ink-soft">{role && ROLE_LABEL[role]}</p></div><div className="grid h-10 w-10 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700">{initial}</div></div></header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><Outlet /></main>
    </div>
  </div>;
}
