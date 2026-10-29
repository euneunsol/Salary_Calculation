import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { formatMinutes } from '../../lib/date';
import { supabase } from '../../lib/supabase';
import type { Payroll, Profile, StoreMember } from '../../types/database.types';
import { backLinkClass, buttonClass, cardClass, inputClass, mutedTextClass, pageTitleClass } from '../../components/ui/classNames';

interface Row extends StoreMember { profile: Profile | null; payroll: Payroll | null }
function currentMonth() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7); }
function won(value: number) { return `${value.toLocaleString('ko-KR')}원`; }

export function ManagerPayroll() {
  const { storeId } = useParams();
  const { memberships } = useAuth();
  const queryClient = useQueryClient();
  const membership = memberships.find((item) => item.store_id === storeId && item.role === 'MANAGER');
  const [month, setMonth] = useState(currentMonth());
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [year, monthNumber] = month.split('-').map(Number);
  const query = useQuery({
    queryKey: ['manager-payroll', storeId, year, monthNumber], enabled: !!membership,
    queryFn: async (): Promise<Row[]> => {
      const { data: members, error: memberError } = await supabase.from('store_members').select('*').eq('store_id', storeId!);
      if (memberError) throw memberError;
      const typedMembers = (members ?? []) as StoreMember[];
      if (!typedMembers.length) return [];
      const [{ data: profiles, error: profileError }, { data: payrolls, error: payrollError }] = await Promise.all([
        supabase.from('profiles').select('*').in('id', typedMembers.map((item) => item.user_id)),
        supabase.from('payrolls').select('*').in('store_member_id', typedMembers.map((item) => item.id)).eq('year', year).eq('month', monthNumber),
      ]);
      if (profileError) throw profileError; if (payrollError) throw payrollError;
      const typedProfiles = (profiles ?? []) as Profile[]; const typedPayrolls = (payrolls ?? []) as Payroll[];
      return typedMembers.map((item) => ({ ...item, profile: typedProfiles.find((profile) => profile.id === item.user_id) ?? null, payroll: typedPayrolls.find((payroll) => payroll.store_member_id === item.id) ?? null }));
    },
  });
  if (!storeId || (!membership && memberships.length > 0)) return <Navigate to="/manage" replace />;
  async function calculateAll() {
    const targets = (query.data ?? []).filter((row) => !row.payroll || row.payroll.status === 'CALCULATED');
    setPending(true); setMessage(null);
    const results = await Promise.all(targets.map((row) => supabase.rpc('calculate_payroll', { p_member_id: row.id, p_year: year, p_month: monthNumber })));
    setPending(false); await queryClient.invalidateQueries({ queryKey: ['manager-payroll', storeId, year, monthNumber] });
    const failed = results.filter((result) => result.error).length;
    setMessage(failed ? `${targets.length - failed}명 계산 완료, ${failed}명 실패` : `${targets.length}명의 급여를 계산했습니다.`);
  }
  async function cancelConfirmation(payroll: Payroll) {
    if (payroll.status !== 'CONFIRMED' || !window.confirm('급여 확정을 취소하고 계산 완료 상태로 되돌릴까요? 취소하면 해당 월 근무기록을 다시 승인·반려할 수 있게 됩니다.')) return;
    setPending(true); setMessage(null);
    const { error } = await supabase.from('payrolls').update({ status: 'CALCULATED', confirmed_by: null, confirmed_at: null }).eq('id', payroll.id);
    setPending(false);
    if (error) setMessage('확정을 취소하지 못했습니다.');
    else { await queryClient.invalidateQueries({ queryKey: ['manager-payroll', storeId, year, monthNumber] }); setMessage('급여 확정을 취소했습니다.'); }
  }
  const rows = query.data ?? [];
  const total = rows.reduce((sum, row) => sum + (row.payroll?.total_pay ?? 0), 0);
  return <section className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><Link to={`/manage/${storeId}/dashboard`} className={backLinkClass}>대시보드</Link><h1 className={`mt-2 ${pageTitleClass}`}>{membership?.store.name} 급여 현황</h1><p className={`mt-1 ${mutedTextClass}`}>매니저는 계산·확정취소가 가능하며, 급여 확정과 지급 완료는 사장님이 합니다.</p></div><div className="flex flex-wrap gap-2"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass('w-auto')} /><button type="button" disabled={pending || !rows.length} onClick={() => void calculateAll()} className={buttonClass('primary')}>{pending ? '계산 중…' : '미확정 급여 계산'}</button></div></div>{message && <p role="status" className="rounded-lg bg-shell p-3 text-sm text-ink-soft">{message}</p>}<div className={cardClass()}><p className="text-sm text-ink-soft">계산된 총 인건비</p><strong className="mt-1 block text-2xl text-ink tabular-nums">{won(total)}</strong></div>{query.isLoading ? <p className={mutedTextClass}>불러오는 중…</p> : <div className="overflow-x-auto rounded-2xl border border-hairline bg-paper"><table className="w-full min-w-[760px] text-sm"><thead className="bg-shell text-left text-ink-soft"><tr><th className="p-3 font-medium">구성원</th><th className="font-medium">역할</th><th className="text-right font-medium">근무</th><th className="text-right font-medium">주휴수당</th><th className="pr-3 text-right font-medium">총액</th><th className="px-3 font-medium">상태</th><th className="px-3 font-medium">관리</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-hairline"><td className="p-3 font-medium text-ink">{row.profile?.name}</td><td>{row.role === 'MANAGER' ? '매니저' : '알바생'}</td><td className="text-right">{row.payroll ? formatMinutes(row.payroll.work_minutes) : '-'}</td><td className="text-right">{row.payroll ? won(row.payroll.allowance_pay) : '-'}</td><td className="pr-3 text-right font-semibold text-ink tabular-nums">{row.payroll ? won(row.payroll.total_pay) : '-'}</td><td className="px-3">{row.payroll?.status === 'PAID' ? '지급 완료' : row.payroll?.status === 'CONFIRMED' ? '확정' : row.payroll ? '계산 완료' : '미계산'}</td><td className="px-3">{row.payroll?.status === 'CONFIRMED' && <button type="button" onClick={() => void cancelConfirmation(row.payroll!)} className={buttonClass('dangerOutline', 'sm')}>확정취소</button>}</td></tr>)}</tbody></table></div>}</section>;
}
