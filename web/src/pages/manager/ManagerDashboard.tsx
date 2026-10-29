import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { supabase } from '../../lib/supabase';
import type { StoreMember, WorkRecord, WorkRecordChangeRequest } from '../../types/database.types';
import { backLinkClass, buttonClass, cardClass, inputClass, labelClass, mutedTextClass, pageTitleClass, sectionTitleClass } from '../../components/ui/classNames';

export function ManagerDashboard() {
  const { storeId } = useParams();
  const { memberships, session } = useAuth();
  const queryClient = useQueryClient();
  const managerMembership = memberships.find((item) => item.store_id === storeId && item.role === 'MANAGER');
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('18:00');
  const [savingHours, setSavingHours] = useState(false);
  const [hoursMessage, setHoursMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!managerMembership) return;
    setOpenTime(managerMembership.store.open_time.slice(0, 5));
    setCloseTime(managerMembership.store.close_time.slice(0, 5));
  }, [managerMembership]);

  async function saveOperatingHours() {
    if (!storeId || openTime === closeTime) { setHoursMessage('오픈 시간과 마감 시간은 달라야 합니다.'); return; }
    setSavingHours(true); setHoursMessage(null);
    const { error } = await supabase.rpc('set_store_operating_hours', { p_store_id: storeId, p_open_time: openTime, p_close_time: closeTime });
    if (error) setHoursMessage(error.message);
    else { await queryClient.invalidateQueries({ queryKey: ['my-memberships', session?.user.id] }); setHoursMessage('운영시간을 저장했습니다.'); }
    setSavingHours(false);
  }

  const dashboardQuery = useQuery({
    queryKey: ['manager-dashboard', storeId], enabled: !!managerMembership,
    queryFn: async () => {
      const { data: members, error: memberError } = await supabase.from('store_members').select('*').eq('store_id', storeId!);
      if (memberError) throw memberError;
      const typedMembers = (members ?? []) as StoreMember[];
      if (typedMembers.length === 0) return { activeEmployees: 0, submitted: 0, pendingChanges: 0, approvedThisMonth: 0 };
      const memberIds = typedMembers.map((member) => member.id);
      const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
      const [{ data: records, error: recordError }, { data: requests, error: requestError }] = await Promise.all([
        supabase.from('work_records').select('*').in('store_member_id', memberIds),
        supabase.from('work_record_change_requests').select('*').eq('status', 'PENDING'),
      ]);
      if (recordError) throw recordError; if (requestError) throw requestError;
      const typedRecords = (records ?? []) as WorkRecord[];
      const recordIds = new Set(typedRecords.map((record) => record.id));
      return {
        activeEmployees: typedMembers.filter((member) => member.status === 'ACTIVE').length,
        submitted: typedRecords.filter((record) => record.status === 'SUBMITTED').length,
        pendingChanges: ((requests ?? []) as WorkRecordChangeRequest[]).filter((request) => recordIds.has(request.work_record_id)).length,
        approvedThisMonth: typedRecords.filter((record) => record.status === 'APPROVED' && record.work_date.startsWith(month)).length,
      };
    },
  });

  if (!storeId || (!managerMembership && memberships.length > 0)) return <Navigate to="/manage" replace />;
  const summary = dashboardQuery.data;
  return <section className="space-y-6">
    <div><Link to="/manage" className={backLinkClass}>담당 매장</Link><h1 className={`mt-2 ${pageTitleClass}`}>{managerMembership?.store.name} 대시보드</h1></div>
    <div className={cardClass()}>
      <h2 className={sectionTitleClass}>매장 운영시간</h2><p className={`mt-1 ${mutedTextClass}`}>구성원이 근무를 입력할 때 오픈·마감 버튼에 적용됩니다.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className={`block ${labelClass()}`}>오픈</span><input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} className={inputClass('w-auto')} /></label>
        <label className="space-y-1"><span className={`block ${labelClass()}`}>마감</span><input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} className={inputClass('w-auto')} /></label>
        <button type="button" onClick={() => void saveOperatingHours()} disabled={savingHours} className={buttonClass('primary')}>{savingHours ? '저장 중…' : '운영시간 저장'}</button>
      </div>{hoursMessage && <p role="status" className="mt-2 text-sm text-ink-soft">{hoursMessage}</p>}
    </div>
    {dashboardQuery.isLoading ? <p className={mutedTextClass}>현황을 불러오는 중…</p> : dashboardQuery.isError ? <p role="alert" className="rounded-lg bg-rust-tint p-3 text-sm text-rust-text">현황을 불러오지 못했습니다.</p> : summary && <>
      <div className="rounded-lg border border-hairline bg-paper p-5">
        <h2 className="text-sm font-semibold text-ink-soft">처리할 업무</h2>
        <dl className="mt-3 divide-y divide-hairline border-t border-hairline">
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-ink-soft">승인 대기</dt>
            <dd className="flex items-center gap-3">
              <span className={summary.submitted > 0 ? 'font-semibold text-ochre-text' : 'text-ink-soft'}>{summary.submitted}건</span>
              {summary.submitted > 0 && <Link to={`/manage/${storeId}/approvals`} className="text-xs font-medium text-brand-700 underline decoration-hairline underline-offset-2 hover:text-brand-900">검토하기</Link>}
            </dd>
          </div>
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-ink-soft">수정요청</dt>
            <dd className="flex items-center gap-3">
              <span className={summary.pendingChanges > 0 ? 'font-semibold text-ochre-text' : 'text-ink-soft'}>{summary.pendingChanges}건</span>
              {summary.pendingChanges > 0 && <Link to={`/manage/${storeId}/approvals`} className="text-xs font-medium text-brand-700 underline decoration-hairline underline-offset-2 hover:text-brand-900">검토하기</Link>}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-1.5 text-sm text-ink-soft">
        <span>재직 구성원 <strong className="font-semibold text-ink">{summary.activeEmployees}명</strong></span>
        <span>이번 달 승인 <strong className="font-semibold text-ink">{summary.approvedThisMonth}건</strong></span>
      </div>

      <div className="rounded-lg border border-hairline bg-paper">
        <Link to={`/manage/${storeId}/approvals`} className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5 transition-colors hover:bg-shell focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"><span><strong className="text-sm font-semibold text-ink">근무기록 검토</strong><span className="mt-0.5 block text-xs text-ink-soft">제출 기록 승인·반려 및 수정요청 처리</span></span></Link>
        <Link to={`/manage/${storeId}/employees`} className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5 transition-colors hover:bg-shell focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"><span><strong className="text-sm font-semibold text-ink">직원 현황</strong><span className="mt-0.5 block text-xs text-ink-soft">알바생과 매니저의 재직 상태 확인</span></span></Link>
        <Link to={`/manage/${storeId}/payroll`} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-shell focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"><span><strong className="text-sm font-semibold text-ink">급여 현황</strong><span className="mt-0.5 block text-xs text-ink-soft">구성원 급여 계산 및 사장님 확정 상태 확인</span></span></Link>
      </div>
    </>}
  </section>;
}
