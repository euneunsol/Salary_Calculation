import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/AuthProvider';
import { formatMinutes } from '../../lib/date';
import { supabase } from '../../lib/supabase';
import type { Payroll, Profile, StoreMember } from '../../types/database.types';
import { badgeClass, buttonClass, cardClass, inputClass, mutedTextClass, pageTitleClass, sectionTitleClass } from '../../components/ui/classNames';
import { Modal } from '../../components/ui/Modal';
import type { BadgeTone } from '../../components/ui/classNames';

interface PayrollRow extends StoreMember { profile: Profile | null; payroll: Payroll | null }
function currentMonth() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7); }
function won(value: number) { return `${value.toLocaleString('ko-KR')}원`; }
const STATUS_LABEL = { CALCULATED: '계산 완료', CONFIRMED: '급여 확정', PAID: '지급 완료' } as const;
const STATUS_TONE: Record<keyof typeof STATUS_LABEL, BadgeTone> = { CALCULATED: 'info', CONFIRMED: 'success', PAID: 'dark' };

export function OwnerPayroll() {
  const { ownedStores, session } = useAuth();
  const queryClient = useQueryClient();
  const [storeId, setStoreId] = useState(ownedStores[0]?.id ?? '');
  const [month, setMonth] = useState(currentMonth());
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedPayrollId, setSelectedPayrollId] = useState<string | null>(null);
  useEffect(() => { if (!storeId && ownedStores[0]) setStoreId(ownedStores[0].id); }, [ownedStores, storeId]);
  const [year, monthNumber] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);

  const payrollQuery = useQuery({
    queryKey: ['owner-payroll', storeId, year, monthNumber], enabled: !!storeId,
    queryFn: async (): Promise<PayrollRow[]> => {
      const { data: members, error: memberError } = await supabase.from('store_members').select('*').eq('store_id', storeId).lte('joined_at', monthEnd).or(`left_at.is.null,left_at.gte.${monthStart}`).order('created_at');
      if (memberError) throw memberError;
      const typedMembers = (members ?? []) as StoreMember[];
      if (typedMembers.length === 0) return [];
      const memberIds = typedMembers.map((member) => member.id);
      const userIds = [...new Set(typedMembers.map((member) => member.user_id))];
      const [{ data: profiles, error: profileError }, { data: payrolls, error: payrollError }] = await Promise.all([
        supabase.from('profiles').select('*').in('id', userIds),
        supabase.from('payrolls').select('*').in('store_member_id', memberIds).eq('year', year).eq('month', monthNumber),
      ]);
      if (profileError) throw profileError; if (payrollError) throw payrollError;
      const typedProfiles = (profiles ?? []) as Profile[];
      const typedPayrolls = (payrolls ?? []) as Payroll[];
      return typedMembers.map((member) => ({ ...member, profile: typedProfiles.find((item) => item.id === member.user_id) ?? null, payroll: typedPayrolls.find((item) => item.store_member_id === member.id) ?? null }));
    },
  });

  async function refresh() { await queryClient.invalidateQueries({ queryKey: ['owner-payroll', storeId, year, monthNumber] }); }
  async function calculateAll() {
    const targets = (payrollQuery.data ?? []).filter((row) => !row.payroll || row.payroll.status === 'CALCULATED');
    if (targets.length === 0) return setMessage('계산할 구성원이 없습니다. 확정된 급여는 다시 계산할 수 없습니다.');
    setPending(true); setMessage(null);
    const results = await Promise.all(targets.map((row) => supabase.rpc('calculate_payroll', { p_member_id: row.id, p_year: year, p_month: monthNumber })));
    const failures = results.filter((result) => result.error);
    setPending(false); await refresh();
    setMessage(failures.length ? `${targets.length - failures.length}명 계산 완료, ${failures.length}명은 계산하지 못했습니다.` : `${targets.length}명의 급여를 계산했습니다.`);
  }
  async function confirmAll() {
    const ids = (payrollQuery.data ?? []).map((row) => row.payroll).filter((payroll): payroll is Payroll => payroll?.status === 'CALCULATED').map((payroll) => payroll.id);
    if (ids.length === 0) return setMessage('확정할 계산 완료 급여가 없습니다.');
    if (!window.confirm(`${year}년 ${monthNumber}월 급여 ${ids.length}건을 확정할까요? 확정 후에는 해당 월 근무기록을 수정할 수 없습니다.`)) return;
    setPending(true); setMessage(null);
    const { error } = await supabase.from('payrolls').update({ status: 'CONFIRMED', confirmed_by: session!.user.id, confirmed_at: new Date().toISOString() }).in('id', ids);
    setPending(false);
    if (error) setMessage('급여를 확정하지 못했습니다.'); else { await refresh(); setMessage(`${ids.length}명의 급여를 확정했습니다.`); }
  }
  async function markPaid(payroll: Payroll) {
    if (payroll.status !== 'CONFIRMED' || !window.confirm('이 급여를 지급 완료로 처리할까요?')) return;
    setPending(true); setMessage(null);
    const { error } = await supabase.from('payrolls').update({ status: 'PAID' }).eq('id', payroll.id);
    setPending(false);
    if (error) setMessage('지급 완료로 변경하지 못했습니다.'); else { await refresh(); setMessage('지급 완료로 처리했습니다.'); }
  }
  async function revertPaid(payroll: Payroll) {
    if (payroll.status !== 'PAID' || !window.confirm('지급 완료를 취소하고 급여 확정 상태로 되돌릴까요?')) return;
    setPending(true); setMessage(null);
    const { error } = await supabase.from('payrolls').update({ status: 'CONFIRMED' }).eq('id', payroll.id);
    setPending(false);
    if (error) setMessage('지급 완료를 취소하지 못했습니다.'); else { await refresh(); setMessage('지급 완료를 취소하고 확정 상태로 되돌렸습니다.'); }
  }
  async function cancelConfirmation(payroll: Payroll) {
    if (payroll.status !== 'CONFIRMED' || !window.confirm('급여 확정을 취소하고 계산 완료 상태로 되돌릴까요? 취소하면 해당 월 근무기록을 다시 승인·반려할 수 있게 됩니다.')) return;
    setPending(true); setMessage(null);
    const { error } = await supabase.from('payrolls').update({ status: 'CALCULATED', confirmed_by: null, confirmed_at: null }).eq('id', payroll.id);
    setPending(false);
    if (error) setMessage('확정을 취소하지 못했습니다.'); else { await refresh(); setMessage('급여 확정을 취소했습니다.'); }
  }
  function exportCsv() {
    const header = ['매장','연월','이름','이메일','역할','근무분','기본급','주휴수당','총액','상태'];
    const storeName = ownedStores.find((store) => store.id === storeId)?.name ?? '';
    const body = rows.map((row) => [storeName, month, row.profile?.name ?? '', row.profile?.email ?? '', row.role, row.payroll?.work_minutes ?? '', row.payroll?.base_pay ?? '', row.payroll?.allowance_pay ?? '', row.payroll?.total_pay ?? '', row.payroll?.status ?? '미계산']);
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = `\uFEFF${[header, ...body].map((line) => line.map(escape).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${storeName}_${month}_급여.csv`; link.click(); URL.revokeObjectURL(url);
  }

  const rows = payrollQuery.data ?? [];
  const totals = useMemo(() => rows.reduce((sum, row) => ({ work: sum.work + (row.payroll?.work_minutes ?? 0), base: sum.base + (row.payroll?.base_pay ?? 0), allowance: sum.allowance + (row.payroll?.allowance_pay ?? 0), total: sum.total + (row.payroll?.total_pay ?? 0) }), { work: 0, base: 0, allowance: 0, total: 0 }), [rows]);
  const calculatedCount = rows.filter((row) => row.payroll?.status === 'CALCULATED').length;
  const selectedRow = rows.find((row) => row.payroll?.id === selectedPayrollId);
  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className={pageTitleClass}>전체 급여</h1><p className={`mt-1 ${mutedTextClass}`}>매장별 구성원 급여를 계산하고 최종 확정합니다.</p></div><div className="flex flex-wrap gap-2"><select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={inputClass('w-auto')}>{ownedStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass('w-auto')} /><button type="button" disabled={pending || rows.length === 0} onClick={() => void calculateAll()} className={buttonClass('primary')}>{pending ? '처리 중…' : '전체 다시 계산'}</button><button type="button" disabled={pending || calculatedCount === 0} onClick={() => void confirmAll()} className={buttonClass('success')}>급여 일괄 확정</button><button type="button" disabled={!rows.length} onClick={exportCsv} className={buttonClass('outline')}>CSV 내보내기</button></div></div>
    {message && <p role="status" className="rounded-lg bg-shell p-3 text-sm text-ink-soft">{message}</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['총 근무', formatMinutes(totals.work)], ['기본급 합계', won(totals.base)], ['주휴수당 합계', won(totals.allowance)], ['총 인건비', won(totals.total)]].map(([label,value]) => <div key={label} className={cardClass()}><p className="text-sm text-ink-soft">{label}</p><strong className="mt-2 block text-xl text-ink tabular-nums">{value}</strong></div>)}</div>
    {payrollQuery.isLoading ? <p className={mutedTextClass}>급여를 불러오는 중…</p> : payrollQuery.isError ? <p role="alert" className="rounded-lg bg-rust-tint p-3 text-sm text-rust-text">급여 현황을 불러오지 못했습니다.</p> : rows.length === 0 ? <div className="rounded-2xl border border-dashed border-hairline bg-paper p-8 text-center text-sm text-ink-soft">선택한 달에 재직한 구성원이 없습니다.</div> : <div className="overflow-x-auto rounded-2xl border border-hairline bg-paper"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-shell text-ink-soft"><tr><th className="px-4 py-3 font-medium">구성원</th><th className="px-4 py-3 font-medium">역할</th><th className="px-4 py-3 text-right font-medium">근무시간</th><th className="px-4 py-3 text-right font-medium">기본급</th><th className="px-4 py-3 text-right font-medium">주휴수당</th><th className="px-4 py-3 text-right font-medium">총액</th><th className="px-4 py-3 font-medium">상태</th><th className="px-4 py-3 font-medium">관리</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-hairline"><td className="px-4 py-4"><strong className="text-ink">{row.profile?.name ?? '이름 없음'}</strong><p className="text-xs text-ink-soft">{row.profile?.email}</p></td><td className="px-4 py-4">{row.role === 'MANAGER' ? '매니저' : '알바생'}</td><td className="px-4 py-4 text-right">{row.payroll ? formatMinutes(row.payroll.work_minutes) : '-'}</td><td className="px-4 py-4 text-right">{row.payroll ? won(row.payroll.base_pay) : '-'}</td><td className="px-4 py-4 text-right">{row.payroll ? won(row.payroll.allowance_pay) : '-'}</td><td className="px-4 py-4 text-right font-semibold text-ink tabular-nums">{row.payroll ? won(row.payroll.total_pay) : '-'}</td><td className="px-4 py-4">{row.payroll ? <span className={badgeClass(STATUS_TONE[row.payroll.status])}>{STATUS_LABEL[row.payroll.status]}</span> : <span className="text-xs text-ink-soft">미계산</span>}</td><td className="px-4 py-4"><div className="flex flex-wrap gap-1">{row.payroll && <button type="button" onClick={() => setSelectedPayrollId(row.payroll!.id)} className={buttonClass('outline', 'sm')}>상세</button>}{row.payroll?.status === 'CONFIRMED' && <button type="button" onClick={() => void markPaid(row.payroll!)} className={buttonClass('primary', 'sm')}>지급 완료</button>}{row.payroll?.status === 'CONFIRMED' && <button type="button" onClick={() => void cancelConfirmation(row.payroll!)} className={buttonClass('dangerOutline', 'sm')}>확정취소</button>}{row.payroll?.status === 'PAID' && <button type="button" onClick={() => void revertPaid(row.payroll!)} className={buttonClass('dangerOutline', 'sm')}>지급 취소</button>}</div></td></tr>)}</tbody></table></div>}
    <Modal open={!!selectedRow?.payroll} onClose={() => setSelectedPayrollId(null)} widthClassName="max-w-lg">
      {selectedRow?.payroll && <>
        <div className="flex items-start justify-between gap-3"><div><h2 className={sectionTitleClass}>{selectedRow.profile?.name} 급여 상세</h2><p className="text-sm text-ink-soft">{year}년 {monthNumber}월 · {STATUS_LABEL[selectedRow.payroll.status]}</p></div><button type="button" onClick={() => setSelectedPayrollId(null)} className={buttonClass('outline', 'sm')}>닫기</button></div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-shell p-3"><span className="text-ink-soft">기본급</span><strong className="block text-ink tabular-nums">{won(selectedRow.payroll.base_pay)}</strong></div><div className="rounded-lg bg-shell p-3"><span className="text-ink-soft">주휴수당</span><strong className="block text-ink tabular-nums">{won(selectedRow.payroll.allowance_pay)}</strong></div></div>
        <h3 className="mt-5 text-sm font-semibold text-ink">시급 적용 구간</h3>
        <div className="mt-2 space-y-2">{selectedRow.payroll.wage_breakdown.length ? selectedRow.payroll.wage_breakdown.map((item) => <div key={`${item.from}-${item.to}-${item.wage}`} className="rounded-lg border border-hairline p-3 text-sm"><p>{item.from} ~ {item.to}</p><p className="mt-1 text-ink-soft">시급 {won(item.wage)} · {formatMinutes(item.minutes)} · {won(item.pay)}</p></div>) : <p className="text-sm text-ink-soft">승인된 근무 내역이 없습니다.</p>}</div>
        <div className="mt-5 flex justify-between border-t border-hairline pt-4"><strong className="text-ink">총 지급액</strong><strong className="text-lg text-ink tabular-nums">{won(selectedRow.payroll.total_pay)}</strong></div>
      </>}
    </Modal>
    <p className="text-xs text-ink-soft">급여 확정 후에는 해당 월의 근무기록이 잠깁니다. 실제 지급 전 근로계약과 노무 기준을 확인해주세요.</p>
  </section>;
}
