import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { allowanceMinutesFor, minutesUntilEligible } from '../../features/payroll/payrollCalc';
import { endOfMonth, formatMinutes, startOfWeek } from '../../lib/date';
import { supabase } from '../../lib/supabase';
import type { Payroll, WorkRecord } from '../../types/database.types';

function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function won(value: number) { return `${value.toLocaleString('ko-KR')}원`; }

export function EmployeeDashboard() {
  const { memberships } = useAuth();
  const [memberId, setMemberId] = useState(memberships[0]?.id ?? '');
  useEffect(() => { if (!memberId && memberships[0]) setMemberId(memberships[0].id); }, [memberId, memberships]);
  const membership = memberships.find((item) => item.id === memberId);
  const date = today();
  const month = date.slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = endOfMonth(year, monthNumber);
  const calendarWeekStart = startOfWeek(date, membership?.store.week_start_day ?? 1);
  const currentRangeStart = calendarWeekStart < monthStart ? monthStart : calendarWeekStart;

  const dashboardQuery = useQuery({
    queryKey: ['employee-dashboard', memberId, month], enabled: !!memberId,
    queryFn: async () => {
      const [{ data: records, error: recordError }, { data: payroll, error: payrollError }] = await Promise.all([
        supabase.from('work_records').select('*').eq('store_member_id', memberId).gte('work_date', monthStart).lte('work_date', monthEnd),
        supabase.from('payrolls').select('*').eq('store_member_id', memberId).eq('year', year).eq('month', monthNumber).maybeSingle(),
      ]);
      if (recordError) throw recordError; if (payrollError) throw payrollError;
      return { records: (records ?? []) as WorkRecord[], payroll: payroll as Payroll | null };
    },
  });
  const records = dashboardQuery.data?.records ?? [];
  const approved = records.filter((record) => record.status === 'APPROVED');
  const weekMinutes = approved.filter((record) => record.work_date >= currentRangeStart && record.work_date <= date).reduce((sum, record) => sum + record.work_minutes, 0);
  const monthMinutes = approved.reduce((sum, record) => sum + record.work_minutes, 0);
  const allowanceMinutes = allowanceMinutesFor(weekMinutes);
  const remaining = minutesUntilEligible(weekMinutes);
  const pendingCount = records.filter((record) => ['DRAFT', 'SUBMITTED', 'REJECTED'].includes(record.status)).length;
  const payroll = dashboardQuery.data?.payroll;

  return <section className="space-y-6">
    <div className="border-b border-hairline pb-4">
      <h1 className="text-lg font-bold text-ink">홈</h1>
      <p className="mt-1 text-sm text-ink-soft">{year}년 {monthNumber}월 · {membership?.store.name}</p>
    </div>
    {memberships.length > 1 && (
      <label className="block max-w-xs text-sm text-ink-soft">매장
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="ml-2 rounded-lg border border-hairline bg-paper-light px-2 py-1 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          {memberships.map((item) => <option key={item.id} value={item.id}>{item.store.name}</option>)}
        </select>
      </label>
    )}

    {dashboardQuery.isLoading ? (
      <p className="text-sm text-ink-soft">현황을 불러오는 중…</p>
    ) : dashboardQuery.isError ? (
      <p role="alert" className="rounded-lg border border-rust/20 bg-rust-tint p-4 text-sm text-rust-text">현황을 불러오지 못했습니다.</p>
    ) : <>
      <div className="rounded-lg border border-hairline bg-paper p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-semibold text-ink-soft">이번 달 예상 급여</h2>
          {pendingCount > 0 && <Link to="/me/calendar" className="text-xs font-medium text-ochre-text underline decoration-hairline underline-offset-2 hover:text-ink">확인 필요한 기록 {pendingCount}건</Link>}
        </div>
        <strong className="mt-1 block text-2xl font-bold leading-tight tracking-tight text-ink tabular-nums">{payroll ? won(payroll.total_pay) : '계산 전'}</strong>

        <dl className="mt-5 divide-y divide-hairline border-t border-hairline">
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-ink-soft">이번 달 승인 근무</dt>
            <dd className="text-ink">{formatMinutes(monthMinutes)}</dd>
          </div>
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-ink-soft">현재 주 승인 근무</dt>
            <dd className="text-ink">{formatMinutes(weekMinutes)}</dd>
          </div>
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-ink-soft">현재 주 주휴시간</dt>
            <dd className={allowanceMinutes ? 'font-semibold text-brand-700' : 'text-ink-soft'}>
              {allowanceMinutes ? formatMinutes(allowanceMinutes) : remaining ? `${formatMinutes(remaining)} 남음` : '미발생'}
            </dd>
          </div>
        </dl>
      </div>

      <p className="text-sm text-ink-soft">
        {pendingCount > 0
          ? <>임시저장·승인대기·반려 기록 <strong className="font-semibold text-ochre-text">{pendingCount}건</strong>은 급여 계산에서 제외됩니다. <Link to="/me/calendar" className="font-medium text-brand-700 underline decoration-hairline underline-offset-2 hover:text-brand-900">근무 달력에서 확인</Link></>
          : '이번 달 모든 근무기록이 승인됐어요.'}
      </p>
    </>}
  </section>;
}
