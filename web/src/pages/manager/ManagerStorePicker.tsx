import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { buttonClass, cardClass, pageTitleClass, sectionTitleClass } from '../../components/ui/classNames';

export function ManagerStorePicker() {
  const { memberships } = useAuth();
  const stores = memberships.filter((membership) => membership.role === 'MANAGER');
  return <section className="space-y-5"><div><h1 className={pageTitleClass}>담당 매장</h1><p className="mt-1 text-sm text-ink-soft">관리할 매장을 선택해주세요.</p></div>{stores.length === 0 ? <div className="rounded-2xl border border-dashed border-hairline bg-paper p-8 text-center text-ink-soft">배정된 매니저 매장이 없습니다.</div> : <div className="grid gap-4 sm:grid-cols-2">{stores.map((membership) => <article key={membership.id} className={cardClass()}><h2 className={sectionTitleClass}>{membership.store.name}</h2><Link to={`/manage/${membership.store_id}/dashboard`} className={buttonClass('primary', 'md', 'mt-4')}>매장 대시보드</Link></article>)}</div>}</section>;
}
