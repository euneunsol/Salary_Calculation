import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/AuthProvider';
import { formatMinutes } from '../../lib/date';
import { supabase } from '../../lib/supabase';
import type { Payroll, WeeklySummary } from '../../types/database.types';
import { buttonClass, cardClass, inputClass, mutedTextClass, pageTitleClass, sectionTitleClass } from '../../components/ui/classNames';

function currentMonth() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
}
function won(value: number) { return `${value.toLocaleString('ko-KR')}원`; }
function decimalHours(minutes: number) { return `${Number((minutes / 60).toFixed(2))}시간`; }

export function EmployeePayroll() {
  const { memberships } = useAuth();
  const queryClient = useQueryClient();
  const [memberId, setMemberId] = useState(memberships[0]?.id ?? '');
  const [month, setMonth] = useState(currentMonth());
  const [calculating, setCalculating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { if (!memberId && memberships[0]) setMemberId(memberships[0].id); }, [memberId, memberships]);
  const membership = memberships.find((item) => item.id === memberId);
  const [year, monthNumber] = month.split('-').map(Number);

  const payrollQuery = useQuery({
    queryKey: ['my-payroll', memberId, year, monthNumber], enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase.from('payrolls').select('*').eq('store_member_id', memberId).eq('year', year).eq('month', monthNumber).maybeSingle();
      if (error) throw error;
      return data as Payroll | null;
    },
  });
  const weeksQuery = useQuery({
    queryKey: ['my-payroll-weeks', memberId, month], enabled: !!memberId && !!payrollQuery.data,
    queryFn: async () => {
      const start = `${month}-01`;
      const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
      const { data, error } = await supabase.from('weekly_summaries').select('*').eq('store_member_id', memberId).gte('week_start', start).lte('week_end', end).order('week_start');
      if (error) throw error;
      return (data ?? []) as WeeklySummary[];
    },
  });

  async function calculate() {
    setCalculating(true); setMessage(null);
    const { error } = await supabase.rpc('calculate_payroll', { p_member_id: memberId, p_year: year, p_month: monthNumber });
    if (error) setMessage(error.message);
    else {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-payroll', memberId, year, monthNumber] }),
        queryClient.invalidateQueries({ queryKey: ['my-payroll-weeks', memberId, month] }),
      ]);
      setMessage('승인된 근무기록으로 급여를 계산했습니다.');
    }
    setCalculating(false);
  }

  const payroll = payrollQuery.data;
  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className={pageTitleClass}>내 급여</h1><p className={`mt-1 ${mutedTextClass}`}>승인 완료된 근무만 계산에 포함됩니다.</p></div>
      <div className="flex flex-wrap gap-2">{memberships.length > 1 && <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={inputClass('w-auto')}>{memberships.map((item) => <option key={item.id} value={item.id}>{item.store.name}</option>)}</select>}<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass('w-auto')} /><button type="button" onClick={() => void calculate()} disabled={!memberId || calculating} className={buttonClass('primary')}>{calculating ? '계산 중…' : payroll ? '다시 계산' : '급여 계산'}</button></div>
    </div>
    {message && <p role="status" className="rounded-lg bg-shell p-3 text-sm text-ink-soft">{message}</p>}
    {payrollQuery.isLoading ? <p className={mutedTextClass}>급여를 불러오는 중…</p> : !payroll ? <div className="rounded-2xl border border-dashed border-hairline bg-paper p-8 text-center"><p className="font-medium text-ink">아직 계산된 급여가 없습니다.</p><p className="mt-1 text-sm text-ink-soft">근무 승인 후 급여 계산 버튼을 눌러주세요.</p></div> : <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['실 근무', formatMinutes(payroll.work_minutes)], ['기본급', won(payroll.base_pay)], ['주휴수당', won(payroll.allowance_pay)], ['예상 합계', won(payroll.total_pay)]].map(([label, value]) => <div key={label} className={cardClass()}><p className="text-sm text-ink-soft">{label}</p><strong className="mt-2 block text-xl text-ink tabular-nums">{value}</strong></div>)}</div>
      <div className={cardClass()}><h2 className={sectionTitleClass}>시급 적용 근거</h2><div className="mt-3 space-y-2">{payroll.wage_breakdown.length === 0 ? <p className="text-sm text-ink-soft">해당 월의 승인 근무가 없습니다.</p> : payroll.wage_breakdown.map((row) => <div key={`${row.from}-${row.to}-${row.wage}`} className="flex flex-wrap justify-between gap-2 rounded-lg bg-shell p-3 text-sm"><span>{row.from} ~ {row.to} · 시급 {won(row.wage)}</span><strong>{formatMinutes(row.minutes)} · {won(row.pay)}</strong></div>)}</div></div>
      <div className={cardClass()}><h2 className={sectionTitleClass}>주별 주휴 계산</h2><p className="mt-1 text-xs text-ink-soft">주휴시간 = 주간 실근무시간 ÷ 5 (최대 8시간)</p><div className="mt-3 space-y-2">{(weeksQuery.data ?? []).map((week) => <div key={week.id} className="flex flex-wrap justify-between gap-2 border-b border-hairline py-3 text-sm last:border-0"><span>{week.week_start} ~ {week.week_end}</span><span>{formatMinutes(week.work_minutes)} · {week.is_eligible ? `주휴 ${decimalHours(week.allowance_minutes)} (${formatMinutes(week.allowance_minutes)})` : '15시간 미충족'}</span></div>)}</div></div>
      <p className="text-xs text-ink-soft">표시 금액은 예상 급여입니다. 실제 지급 전 근로계약과 노무 기준을 확인해주세요. 마지막 계산: {new Date(payroll.calculated_at).toLocaleString('ko-KR')}</p>
    </>}
    <p className="text-xs text-ink-soft">{membership?.store.name}</p>
  </section>;
}
