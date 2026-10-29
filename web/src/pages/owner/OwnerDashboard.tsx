import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { formatMinutes } from '../../lib/date';
import { supabase } from '../../lib/supabase';
import type { Payroll, StoreMember, WorkRecord } from '../../types/database.types';
import { buttonClass } from '../../components/ui/classNames';

function currentMonth() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7); }
function won(value: number) { return `${value.toLocaleString('ko-KR')}원`; }

export function OwnerDashboard() {
  const { ownedStores, profile } = useAuth();
  const month = currentMonth();
  const [year, monthNumber] = month.split('-').map(Number);
  const dashboardQuery = useQuery({
    queryKey: ['owner-dashboard', ownedStores.map((store) => store.id), month], enabled: ownedStores.length > 0,
    queryFn: async () => {
      const storeIds = ownedStores.map((store) => store.id);
      const { data: members, error: memberError } = await supabase.from('store_members').select('*').in('store_id', storeIds);
      if (memberError) throw memberError;
      const typedMembers = (members ?? []) as StoreMember[];
      const memberIds = typedMembers.map((member) => member.id);
      if (memberIds.length === 0) return { members: typedMembers, records: [] as WorkRecord[], payrolls: [] as Payroll[] };
      const [{ data: records, error: recordError }, { data: payrolls, error: payrollError }] = await Promise.all([
        supabase.from('work_records').select('*').in('store_member_id', memberIds).gte('work_date', `${month}-01`).lt('work_date', monthNumber === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNumber + 1).padStart(2, '0')}-01`),
        supabase.from('payrolls').select('*').in('store_member_id', memberIds).eq('year', year).eq('month', monthNumber),
      ]);
      if (recordError) throw recordError; if (payrollError) throw payrollError;
      return { members: typedMembers, records: (records ?? []) as WorkRecord[], payrolls: (payrolls ?? []) as Payroll[] };
    },
  });
  const data = dashboardQuery.data;
  const activeMembers = data?.members.filter((member) => member.status === 'ACTIVE').length ?? 0;
  const approvedMinutes = data?.records.reduce((sum, record) => sum + record.work_minutes, 0) ?? 0;
  const totalPay = data?.payrolls.reduce((sum, payroll) => sum + payroll.total_pay, 0) ?? 0;
  const confirmed = data?.payrolls.filter((payroll) => ['CONFIRMED', 'PAID'].includes(payroll.status)).length ?? 0;
  const calculatedCount = data?.payrolls.length ?? 0;
  const needsCalculation = Math.max(0, activeMembers - calculatedCount);
  const needsConfirmation = data?.payrolls.filter((payroll) => payroll.status === 'CALCULATED').length ?? 0;
  const pendingApprovals = data?.records.filter((record) => record.status === 'SUBMITTED').length ?? 0;
  const storeCount = ownedStores.filter((store) => store.is_active).length;

  return <section className="space-y-6">
    <div className="border-b border-hairline pb-4">
      <h1 className="text-lg font-bold text-ink">홈</h1>
      <p className="mt-1 text-sm text-ink-soft">{year}년 {monthNumber}월 · {profile?.name}님의 사업장 현황</p>
    </div>

    {ownedStores.length === 0 ? (
      <div className="rounded-lg border border-dashed border-hairline bg-paper p-8 text-center">
        <h2 className="text-base font-semibold text-ink">첫 매장을 등록해보세요</h2>
        <p className="mt-1 text-sm text-ink-soft">매장을 등록하면 구성원과 근무·급여 관리를 시작할 수 있습니다.</p>
        <Link to="/owner/stores" className={buttonClass('primary', 'md', 'mt-5')}>매장 만들기</Link>
      </div>
    ) : dashboardQuery.isLoading ? (
      <p className="text-sm text-ink-soft">현황을 불러오는 중…</p>
    ) : dashboardQuery.isError ? (
      <p role="alert" className="rounded-lg border border-rust/20 bg-rust-tint p-4 text-sm text-rust-text">현황을 불러오지 못했습니다.</p>
    ) : <>
      <div className="rounded-lg border border-hairline bg-paper p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-semibold text-ink-soft">이번 달 인건비</h2>
          <span className="text-xs text-ink-soft">계산된 금액 기준</span>
        </div>
        <strong className="mt-1 block text-2xl font-bold leading-tight tracking-tight text-ink tabular-nums">{won(totalPay)}</strong>

        <dl className="mt-5 divide-y divide-hairline border-t border-hairline">
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-ink-soft">근무 승인 대기</dt>
            <dd className={pendingApprovals > 0 ? 'font-semibold text-ochre-text' : 'text-ink-soft'}>{pendingApprovals}건</dd>
          </div>
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-ink-soft">급여 계산 필요</dt>
            <dd className="flex items-center gap-3">
              <span className={needsCalculation > 0 ? 'font-semibold text-ochre-text' : 'text-ink-soft'}>{needsCalculation}명</span>
              {needsCalculation > 0 && <Link to="/owner/payroll" className="text-xs font-medium text-brand-700 underline decoration-hairline underline-offset-2 hover:text-brand-900">계산하기</Link>}
            </dd>
          </div>
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-ink-soft">확정 대기</dt>
            <dd className="flex items-center gap-3">
              <span className={needsConfirmation > 0 ? 'font-semibold text-celadon-text' : 'text-ink-soft'}>{needsConfirmation}명</span>
              {needsConfirmation > 0 && <Link to="/owner/payroll" className="text-xs font-medium text-brand-700 underline decoration-hairline underline-offset-2 hover:text-brand-900">확정하기</Link>}
            </dd>
          </div>
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-ink-soft">확정·지급 완료</dt>
            <dd className="text-ink">{confirmed}/{activeMembers}명</dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-1.5 text-sm text-ink-soft">
        <span>운영 매장 <strong className="font-semibold text-ink">{storeCount}곳</strong></span>
        <span>재직 구성원 <strong className="font-semibold text-ink">{activeMembers}명</strong></span>
        <span>이번 달 승인 근무 <strong className="font-semibold text-ink">{formatMinutes(approvedMinutes)}</strong></span>
      </div>
    </>}
  </section>;
}
