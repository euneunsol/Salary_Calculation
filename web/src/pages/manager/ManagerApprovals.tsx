import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { useHolidays } from '../../features/holidays/useHolidays';
import { addDays, endOfMonth, formatMinutes, isoDayOfWeek } from '../../lib/date';
import { supabase } from '../../lib/supabase';
import type { Profile, StoreMember, WorkRecord, WorkRecordChangeRequest } from '../../types/database.types';
import { backLinkClass, buttonClass, iconButtonClass, inputClass, mutedTextClass, pageTitleClass, sectionTitleClass } from '../../components/ui/classNames';
import { ErrorText } from '../../components/ui/ErrorText';
import { Modal } from '../../components/ui/Modal';
import { Icon } from '../../components/ui/Icon';
import { HankoStamp } from '../../components/ui/Hanko';
import { validateWorkTime } from '../../features/workRecords/workRecordForm';
import { workRecordStatusLabel } from '../../features/workRecords/workRecordStatus';
import { WorkRecordHistory } from '../../features/workRecords/WorkRecordHistory';

interface ReviewRow extends WorkRecord { profile: Profile | null; request: WorkRecordChangeRequest | null }
function currentMonth(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7); }
function moveMonth(month: string, amount: number): string { const [year,value] = month.split('-').map(Number); return new Date(Date.UTC(year,value-1+amount,1)).toISOString().slice(0,7); }

export function ManagerApprovals() {
  const { storeId } = useParams();
  const { memberships, profile } = useAuth();
  const queryClient = useQueryClient();
  const managerMembership = memberships.find((item) => item.store_id === storeId && item.role === 'MANAGER');
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ReviewRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<ReviewRow | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editBreak, setEditBreak] = useState(0);
  const [editOvernight, setEditOvernight] = useState(false);
  const [editMemo, setEditMemo] = useState('');
  const [month, setMonth] = useState(currentMonth());
  const [year, monthNumber] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = endOfMonth(year, monthNumber);
  const gridStart = addDays(monthStart, -(isoDayOfWeek(monthStart) - 1));
  const gridEnd = addDays(monthEnd, 7 - isoDayOfWeek(monthEnd));
  const holidaysQuery = useHolidays(gridStart, gridEnd);

  const reviewQuery = useQuery({
    queryKey: ['manager-review', storeId, gridStart, gridEnd], enabled: !!managerMembership,
    queryFn: async (): Promise<ReviewRow[]> => {
      const { data: members, error: memberError } = await supabase.from('store_members').select('*').eq('store_id', storeId!);
      if (memberError) throw memberError;
      const typedMembers = (members ?? []) as StoreMember[];
      const memberIds = typedMembers.map((member) => member.id);
      if (memberIds.length === 0) return [];
      const { data: records, error: recordError } = await supabase.from('work_records').select('*').in('store_member_id', memberIds).gte('work_date', gridStart).lte('work_date', gridEnd).order('work_date');
      if (recordError) throw recordError;
      const typedRecords = (records ?? []) as WorkRecord[];
      if (typedRecords.length === 0) return [];
      const [{ data: profiles, error: profileError }, { data: requests, error: requestError }] = await Promise.all([
        supabase.from('profiles').select('*').in('id', typedMembers.map((member) => member.user_id)),
        supabase.from('work_record_change_requests').select('*').in('work_record_id', typedRecords.map((record) => record.id)).eq('status', 'PENDING'),
      ]);
      if (profileError) throw profileError;
      if (requestError) throw requestError;
      const typedProfiles = (profiles ?? []) as Profile[];
      const typedRequests = (requests ?? []) as WorkRecordChangeRequest[];
      return typedRecords.map((record) => {
        const member = typedMembers.find((item) => item.id === record.store_member_id);
        return { ...record, profile: typedProfiles.find((item) => item.id === member?.user_id) ?? null, request: typedRequests.find((item) => item.work_record_id === record.id) ?? null };
      });
    },
  });

  if (!storeId || (!managerMembership && memberships.length > 0)) return <Navigate to="/manage" replace />;
  async function refresh() { await queryClient.invalidateQueries({ queryKey: ['manager-review', storeId] }); }
  function openEdit(row: ReviewRow) {
    setError(null); setEditing(row);
    setEditStart(row.start_time.slice(0, 5)); setEditEnd(row.end_time.slice(0, 5));
    setEditBreak(row.break_minutes); setEditOvernight(row.crosses_midnight); setEditMemo(row.memo ?? '');
  }
  async function saveEdit() {
    if (!editing || pending) return;
    const validation = validateWorkTime({ startTime: editStart, endTime: editEnd, breakMinutes: editBreak, crossesMidnight: editOvernight });
    if (validation) return setError(validation);
    setPending(true); setError(null);
    try {
      const { error: editError } = await supabase.rpc('manager_edit_approved_work', {
        p_record_id: editing.id, p_start_time: editStart, p_end_time: editEnd,
        p_crosses_midnight: editOvernight, p_break_minutes: editBreak, p_memo: editMemo,
        p_expected_updated_at: editing.updated_at,
      });
      if (editError) { setError(editError.message); return; }
      setEditing(null);
      await queryClient.invalidateQueries();
    } catch {
      setError('근무기록을 저장하지 못했습니다. 연결 상태를 확인해주세요.');
    } finally { setPending(false); }
  }
  async function deleteWork() {
    if (!editing || pending) return;
    if (!window.confirm(`${editing.profile?.name ?? '구성원'}의 ${editing.work_date} 근무를 삭제할까요? 급여가 다시 계산되며 삭제 이력은 사장님에게 표시됩니다.`)) return;
    setPending(true); setError(null);
    try {
      const { error: deleteError } = await supabase.rpc('manager_delete_approved_work', {
        p_record_id: editing.id, p_expected_updated_at: editing.updated_at,
      });
      if (deleteError) { setError(deleteError.message); return; }
      setEditing(null);
      await queryClient.invalidateQueries();
    } catch { setError('근무를 삭제하지 못했습니다. 연결 상태를 확인해주세요.'); }
    finally { setPending(false); }
  }
  async function approve(ids: string[]) {
    if (ids.length === 0) return;
    if (!window.confirm(`${ids.length}건을 최종 승인할까요? 승인 후 사장님 근무표에 공개됩니다.`)) return;
    setPending(true); setError(null);
    const { error: updateError } = await supabase.from('work_records').update({ status: 'APPROVED', approved_by: profile!.id, approved_at: new Date().toISOString(), reject_reason: null }).in('id', ids);
    setPending(false);
    if (updateError) return setError('근무기록을 승인하지 못했습니다.');
    await refresh();
  }
  async function reject() {
    if (!rejecting || !rejectReason.trim()) return setError('반려 사유를 입력해주세요.');
    setPending(true); setError(null);
    const { error: updateError } = await supabase.from('work_records').update({ status: 'REJECTED', reject_reason: rejectReason.trim(), approved_by: null, approved_at: null }).eq('id', rejecting.id);
    setPending(false);
    if (updateError) return setError('근무기록을 반려하지 못했습니다.');
    setRejecting(null); setRejectReason(''); await refresh();
  }
  async function reviewRequest(request: WorkRecordChangeRequest, apply: boolean) {
    if (!window.confirm(apply ? '알바생이 요청한 내용으로 근무기록을 수정할까요?' : '수정요청을 거절할까요?')) return;
    const { error: rpcError } = await supabase.rpc('review_work_change_request', { p_request_id: request.id, p_apply: apply });
    if (rpcError) return setError('수정요청을 처리하지 못했습니다.');
    await refresh();
  }

  const rows = reviewQuery.data ?? [];
  const visibleRows = rows.filter((row) => row.work_date >= monthStart && row.work_date <= monthEnd);
  const reviewRows = visibleRows.filter((row) => row.status === 'SUBMITTED');
  const holidayMap = new Map((holidaysQuery.data ?? []).map((holiday) => [holiday.holiday_date, holiday]));
  const calendarDates: string[] = []; for (let date = gridStart; date <= gridEnd; date = addDays(date,1)) calendarDates.push(date);
  return <section className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><Link to="/manage" className={backLinkClass}>담당 매장</Link><h1 className={`mt-2 ${pageTitleClass}`}>{managerMembership?.store.name} 근무 검토</h1><p className={`mt-1 ${mutedTextClass}`}>제출된 기록을 승인하고, 승인 완료 기록을 눌러 지급 전까지 수정할 수 있습니다.</p></div>{reviewRows.length > 0 && <button disabled={pending} onClick={() => void approve(reviewRows.filter((row) => !row.request).map((row) => row.id))} className={buttonClass('success')}>이번 달 일괄 승인</button>}</div>
    <ErrorText>{error}</ErrorText>{reviewQuery.isLoading && <p className={mutedTextClass}>불러오는 중…</p>}
    <div className="overflow-hidden rounded-2xl border border-hairline bg-paper"><div className="flex items-center justify-between gap-2 border-b border-hairline p-4"><button onClick={() => setMonth(moveMonth(month,-1))} aria-label="이전 달" className={iconButtonClass()}><Icon name="chevronLeft" className="h-4 w-4" /></button><strong className="text-center text-sm text-ink sm:text-base">{year}년 {monthNumber}월 · 전체 {visibleRows.length}건 · 승인 대기 {reviewRows.length}건</strong><button onClick={() => setMonth(moveMonth(month,1))} aria-label="다음 달" className={iconButtonClass()}><Icon name="chevronRight" className="h-4 w-4" /></button></div><div className="overflow-x-auto"><div className="min-w-[640px]"><div className="grid grid-cols-7 bg-shell text-center text-xs font-medium text-ink-soft">{['월','화','수','목','금','토','일'].map((day) => <div key={day} className="py-2">{day}</div>)}</div><div className="grid grid-cols-7">{calendarDates.map((date) => { const dayRows = visibleRows.filter((row) => row.work_date === date); const holiday = holidayMap.get(date); return <div key={date} className={`min-h-36 border-r border-t border-hairline p-2 ${date.startsWith(month) ? 'bg-paper' : 'bg-shell'}`}><span className={`text-xs ${holiday ? 'font-semibold text-rust-text' : 'text-ink-soft'}`}>{Number(date.slice(-2))}</span>{holiday && <p className="truncate text-xs text-rust-text">{holiday.name}</p>}<div className="mt-1 space-y-1">{dayRows.map((row) => { const statusLabel = workRecordStatusLabel(row); const description = row.request ? `수정요청: ${row.request.reason}` : row.status === 'SUBMITTED' ? '클릭하여 승인' : row.status === 'APPROVED' ? '클릭하여 수정 (지급 전까지 가능)' : '현재 근무 상태'; return <button key={row.id} onClick={() => row.status === 'SUBMITTED' ? (row.request ? void reviewRequest(row.request,true) : void approve([row.id])) : row.status === 'APPROVED' ? openEdit(row) : undefined} title={description} aria-label={`${row.profile?.name} ${row.work_date} ${statusLabel}. ${description}`} className={`block min-h-[44px] w-full cursor-pointer rounded p-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${row.request ? 'bg-ochre-tint text-ochre-text' : row.status === 'SUBMITTED' ? 'bg-celadon-tint text-celadon-text hover:bg-celadon/25' : row.status === 'APPROVED' ? 'bg-brand-50 text-brand-700' : row.status === 'REJECTED' ? 'bg-rust-tint text-rust-text' : 'bg-shell text-ink-soft'}`}><strong className="block truncate">{row.profile?.name}</strong>{row.start_time.slice(0,5)}~{row.end_time.slice(0,5)}<span className="block">{formatMinutes(row.work_minutes)} · {statusLabel}</span>{row.status === 'APPROVED' && <span className="block font-medium underline">근무 수정</span>}{row.request && <span className="block font-medium">수정요청 있음</span>}</button>; })}</div></div>; })}</div></div></div></div>
    {reviewRows.length > 0 && <div className="space-y-3"><h2 className={sectionTitleClass}>승인 대기 상세</h2>{reviewRows.map((row) => <article key={row.id} className="rounded-2xl border border-hairline bg-paper p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong className="text-ink">{row.profile?.name}</strong><span className="ml-2 text-sm text-ink-soft">{row.work_date}</span><p className="mt-1 text-sm text-ink-soft">{row.start_time.slice(0,5)}~{row.end_time.slice(0,5)} · 휴게 {row.break_minutes}분 · {formatMinutes(row.work_minutes)}</p></div><div className="flex items-center gap-2">{!row.request && <HankoStamp label="승인" size={34} />}<button disabled={!!row.request} onClick={() => void approve([row.id])} className={buttonClass('success', 'sm')}>최종 승인</button><button onClick={() => { setRejecting(row); setRejectReason(''); }} className={buttonClass('dangerOutline', 'sm')}>반려</button></div></div>{row.request && <div className="mt-3 rounded-xl bg-ochre-tint p-3 text-sm"><strong className="text-ochre-text">수정요청</strong><p className="text-ochre-text">{row.request.reason}</p><p className="text-ochre-text">변경안 {row.request.start_time.slice(0,5)}~{row.request.end_time.slice(0,5)} · 휴게 {row.request.break_minutes}분</p><div className="mt-2 flex gap-2"><button onClick={() => void reviewRequest(row.request!,true)} className={buttonClass('primary', 'sm', 'bg-ochre hover:bg-ochre-text focus-visible:ring-ochre')}>변경 적용</button><button onClick={() => void reviewRequest(row.request!,false)} className={buttonClass('outline', 'sm')}>거절</button></div></div>}</article>)}</div>}
    <Modal open={!!editing} onClose={() => { if (!pending) setEditing(null); }} title="승인 근무 수정">
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
        <p className="text-sm text-ink-soft">{editing?.profile?.name} · {editing?.work_date}</p>
        <p className="text-sm text-ink-soft">지급 전까지 수정할 수 있습니다. 저장하면 관련 급여를 다시 계산하며, 확정된 급여는 사장님의 재확인이 필요합니다.</p>
        <label className="block">출근시간<input required type="time" value={editStart} onChange={(event) => setEditStart(event.target.value)} className={inputClass()} /></label>
        <label className="block">퇴근시간<input required type="time" value={editEnd} onChange={(event) => setEditEnd(event.target.value)} className={inputClass()} /></label>
        <label className="flex gap-2"><input type="checkbox" checked={editOvernight} onChange={(event) => setEditOvernight(event.target.checked)} />다음 날 퇴근</label>
        <label className="block">휴게시간<select value={editBreak} onChange={(event) => setEditBreak(Number(event.target.value))} className={inputClass()}>{[0, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes}분</option>)}</select></label>
        <label className="block">메모<textarea value={editMemo} onChange={(event) => setEditMemo(event.target.value)} className={inputClass()} /></label>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2"><button disabled={pending} className={buttonClass('primary')}>{pending ? '처리 중…' : '수정 저장'}</button><button type="button" disabled={pending} onClick={() => void deleteWork()} className={buttonClass('dangerOutline')}>근무 삭제</button></div>
      </form>
    </Modal>
    <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="근무기록 반려">
      <label className="block space-y-1">
        <span className="sr-only">반려 사유</span>
        <textarea autoFocus value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="알바생이 수정할 내용을 입력하세요." className={inputClass('min-h-24')} />
      </label>
      <ErrorText className="mt-2">{error}</ErrorText>
      <div className="mt-3 flex gap-2"><button disabled={pending} onClick={() => void reject()} className={buttonClass('danger')}>반려하기</button><button onClick={() => setRejecting(null)} className={buttonClass('outline')}>취소</button></div>
    </Modal>
    <WorkRecordHistory storeId={storeId} month={month} />
  </section>;
}
