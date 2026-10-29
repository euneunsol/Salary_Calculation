import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { supabase } from '../../lib/supabase';
import type { Profile, StoreMember, WageHistory, WorkRecord } from '../../types/database.types';
import { backLinkClass, mutedTextClass, pageTitleClass } from '../../components/ui/classNames';

export function ManagerEmployees() {
  const { storeId } = useParams();
  const { memberships } = useAuth();
  const managerMembership = memberships.find((item) => item.store_id === storeId && item.role === 'MANAGER');
  const employeesQuery = useQuery({
    queryKey: ['manager-employees', storeId], enabled: !!managerMembership,
    queryFn: async () => {
      const { data: members, error: memberError } = await supabase.from('store_members').select('*').eq('store_id', storeId!).order('created_at');
      if (memberError) throw memberError;
      const typedMembers = (members ?? []) as StoreMember[];
      if (typedMembers.length === 0) return [];
      const [{ data: profiles, error: profileError }, { data: wages, error: wageError }, { data: records, error: recordError }] = await Promise.all([
        supabase.from('profiles').select('*').in('id', typedMembers.map((member) => member.user_id)),
        supabase.from('wage_history').select('*').in('store_member_id', typedMembers.map((member) => member.id)).is('effective_to', null),
        supabase.from('work_records').select('*').in('store_member_id', typedMembers.map((member) => member.id)),
      ]);
      if (profileError) throw profileError;
      if (wageError) throw wageError;
      if (recordError) throw recordError;
      const typedProfiles = (profiles ?? []) as Profile[];
      const typedWages = (wages ?? []) as WageHistory[];
      const typedRecords = (records ?? []) as WorkRecord[];
      return typedMembers.map((member) => ({ member, profile: typedProfiles.find((item) => item.id === member.user_id), wage: typedWages.find((item) => item.store_member_id === member.id), submitted: typedRecords.filter((item) => item.store_member_id === member.id && item.status === 'SUBMITTED').length }));
    },
  });
  if (!storeId || (!managerMembership && memberships.length > 0)) return <Navigate to="/manage" replace />;
  return <section className="space-y-5"><div><Link to={`/manage/${storeId}/dashboard`} className={backLinkClass}>대시보드</Link><h1 className={`mt-2 ${pageTitleClass}`}>{managerMembership?.store.name} 직원 현황</h1><p className={`mt-1 ${mutedTextClass}`}>시급은 조회만 가능하며 변경은 사장님만 할 수 있습니다.</p></div>{employeesQuery.isLoading ? <p className={mutedTextClass}>직원 정보를 불러오는 중…</p> : employeesQuery.isError ? <p role="alert" className="rounded-lg bg-rust-tint p-3 text-sm text-rust-text">직원 정보를 불러오지 못했습니다.</p> : <div className="overflow-x-auto rounded-2xl border border-hairline bg-paper"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-shell text-ink-soft"><tr><th className="px-4 py-3 font-medium">이름</th><th className="px-4 py-3 font-medium">역할</th><th className="px-4 py-3 font-medium">입사일</th><th className="px-4 py-3 font-medium">현재 시급</th><th className="px-4 py-3 font-medium">승인 대기</th><th className="px-4 py-3 font-medium">상태</th></tr></thead><tbody className="divide-y divide-hairline">{employeesQuery.data?.map(({member,profile,wage,submitted}) => <tr key={member.id}><td className="px-4 py-3"><strong className="block text-ink">{profile?.name}</strong><span className="text-xs text-ink-soft">{profile?.email}</span></td><td className="px-4 py-3">{member.role === 'MANAGER' ? '매니저' : '알바생'}</td><td className="px-4 py-3">{member.joined_at}</td><td className="px-4 py-3">{wage ? `${wage.hourly_wage.toLocaleString()}원` : '미설정'}</td><td className="px-4 py-3">{submitted}건</td><td className="px-4 py-3">{member.status === 'ACTIVE' ? '재직' : '퇴사'}</td></tr>)}</tbody></table></div>}</section>;
}
