import { workRecordStatusLabel } from '../../features/workRecords/workRecordStatus';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/AuthProvider';
import { useHolidays } from '../../features/holidays/useHolidays';
import { calculateWorkMinutes, expandWeeklyDates, validateWorkTime } from '../../features/workRecords/workRecordForm';
import { addDays, endOfMonth, formatMinutes, isoDayOfWeek, startOfWeek } from '../../lib/date';
import { supabase } from '../../lib/supabase';
import type { WorkRecord, WorkRecordChangeRequest } from '../../types/database.types';
import { buttonClass, iconButtonClass, inputClass, labelClass, mutedTextClass, pageTitleClass, sectionTitleClass } from '../../components/ui/classNames';
import { ErrorText } from '../../components/ui/ErrorText';
import { Icon } from '../../components/ui/Icon';

const RECORD_CHIP_STYLE = { DRAFT: 'bg-shell text-ink-soft', SUBMITTED: 'bg-celadon-tint text-celadon-text', APPROVED: 'bg-brand-50 text-brand-700', REJECTED: 'bg-rust-tint text-rust-text' } as const;

function currentMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
}
function moveMonth(month: string, amount: number): string {
  const [year, value] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, value - 1 + amount, 1));
  return date.toISOString().slice(0, 7);
}
function currentMonthEnd(): string {
  const [year, month] = currentMonth().split('-').map(Number);
  return endOfMonth(year, month);
}

interface FormState { workDate: string; startTime: string; endTime: string; breakMinutes: string; crossesMidnight: boolean; memo: string }
const initialForm = (date: string): FormState => ({ workDate: date, startTime: '09:00', endTime: '18:00', breakMinutes: '0', crossesMidnight: false, memo: '' });

export function EmployeeCalendar() {
  const { memberships } = useAuth();
  const queryClient = useQueryClient();
  const employeeMemberships = memberships;
  const [memberId, setMemberId] = useState(employeeMemberships[0]?.id ?? '');
  const [month, setMonth] = useState(currentMonth());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<'single' | 'multiple' | 'weekly'>('single');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [repeatUntil, setRepeatUntil] = useState(currentMonthEnd());
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>([]);
  const [form, setForm] = useState<FormState>(initialForm(`${currentMonth()}-01`));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const [requestPending, setRequestPending] = useState(false);

  useEffect(() => { if (!memberId && employeeMemberships[0]) setMemberId(employeeMemberships[0].id); }, [employeeMemberships, memberId]);
  const membership = employeeMemberships.find((item) => item.id === memberId);
  const isManager = membership?.role === 'MANAGER';
  const monthStart = `${month}-01`;
  const [year, monthNumber] = month.split('-').map(Number);
  const monthEnd = endOfMonth(year, monthNumber);
  const gridStart = addDays(monthStart, -(isoDayOfWeek(monthStart) - 1));
  const gridEnd = addDays(monthEnd, 7 - isoDayOfWeek(monthEnd));

  const recordsQuery = useQuery({
    queryKey: ['work-records', memberId, gridStart, gridEnd], enabled: !!memberId,
    queryFn: async () => {
      const { data, error: queryError } = await supabase.from('work_records').select('*').eq('store_member_id', memberId).gte('work_date', gridStart).lte('work_date', gridEnd).order('work_date');
      if (queryError) throw queryError;
      return (data ?? []) as WorkRecord[];
    },
  });
  const holidaysQuery = useHolidays(gridStart, gridEnd);
  const holidayByDate = useMemo(() => new Map((holidaysQuery.data ?? []).map((holiday) => [holiday.holiday_date, holiday])), [holidaysQuery.data]);
  const records = recordsQuery.data ?? [];
  const recordIds = records.map((record) => record.id);
  const changeRequestsQuery = useQuery({
    queryKey: ['my-work-change-requests', recordIds], enabled: recordIds.length > 0,
    queryFn: async () => {
      const { data, error: queryError } = await supabase.from('work_record_change_requests').select('*').in('work_record_id', recordIds).order('created_at', { ascending: false });
      if (queryError) throw queryError;
      return (data ?? []) as WorkRecordChangeRequest[];
    },
  });
  const recordByDate = useMemo(() => new Map(records.map((record) => [record.work_date, record])), [records]);
  const calendarDates = useMemo(() => { const result: string[] = []; for (let date = gridStart; date <= gridEnd; date = addDays(date, 1)) result.push(date); return result; }, [gridStart, gridEnd]);
  const monthMinutes = records.filter((record) => record.work_date >= monthStart && record.work_date <= monthEnd).reduce((sum, record) => sum + record.work_minutes, 0);
  const weekMinutes = useMemo(() => { const totals = new Map<string, number>(); for (const record of records) { if (record.work_date < monthStart || record.work_date > monthEnd) continue; const week = startOfWeek(record.work_date, membership?.store.week_start_day ?? 1); totals.set(week, (totals.get(week) ?? 0) + record.work_minutes); } return totals; }, [records, membership, monthStart, monthEnd]);

  function openNew(date: string) { setEditingId(null); setForm(initialForm(date)); setRepeatUntil(date); setRepeatWeekdays([isoDayOfWeek(date)]); setError(null); }
  function openEdit(record: WorkRecord) { setEntryMode('single'); setSelectedDates([]); setEditingId(record.id); setForm({ workDate: record.work_date, startTime: record.start_time.slice(0, 5), endTime: record.end_time.slice(0, 5), breakMinutes: String(record.break_minutes), crossesMidnight: record.crosses_midnight, memo: record.memo ?? '' }); setError(null); }
  function selectCalendarDate(date: string, record?: WorkRecord) {
    if (entryMode === 'multiple' && !record) {
      setEditingId(null);
      setSelectedDates((current) => current.includes(date) ? current.filter((item) => item !== date) : [...current, date].sort());
      setForm((current) => ({ ...current, workDate: date }));
      setError(null);
      return;
    }
    if (record) openEdit(record);
    else openNew(date);
  }
  async function refresh() { await queryClient.invalidateQueries({ queryKey: ['work-records', memberId] }); }

  async function save(e: FormEvent) {
    e.preventDefault();
    const breakMinutes = Number(form.breakMinutes);
    const timeInput = { startTime: form.startTime, endTime: form.endTime, breakMinutes, crossesMidnight: form.crossesMidnight };
    const validationError = validateWorkTime(timeInput);
    if (validationError) return setError(validationError);
    if (!membership) return;
    if (isManager && selectedRecord?.status === 'APPROVED') {
      if (form.workDate !== selectedRecord.work_date) return setError('승인된 근무의 날짜는 변경할 수 없습니다. 근무 검토에서 삭제 후 다시 등록해주세요.');
      setPending(true); setError(null);
      try {
        const { error: editError } = await supabase.rpc('manager_edit_approved_work', {
          p_record_id: selectedRecord.id, p_start_time: form.startTime, p_end_time: form.endTime,
          p_crosses_midnight: form.crossesMidnight, p_break_minutes: breakMinutes,
          p_memo: form.memo, p_expected_updated_at: selectedRecord.updated_at,
        });
        if (editError) return setError(editError.message);
        await queryClient.invalidateQueries();
        setEditingId(null); setForm(initialForm(form.workDate));
      } catch { setError('근무기록을 저장하지 못했습니다.'); }
      finally { setPending(false); }
      return;
    }
    let targetDates = editingId || entryMode === 'single' ? [form.workDate]
      : entryMode === 'multiple' ? selectedDates
      : expandWeeklyDates(form.workDate, repeatUntil, repeatWeekdays);
    targetDates = [...new Set(targetDates)].sort();
    if (targetDates.length === 0) return setError(entryMode === 'multiple' ? '달력에서 날짜를 하나 이상 선택해주세요.' : '반복할 요일과 기간을 확인해주세요.');
    if (targetDates.length > 100) return setError('한 번에 최대 100개의 근무기록을 만들 수 있습니다.');
    if (targetDates.some((date) => date < membership.joined_at || (membership.left_at && date > membership.left_at))) return setError('재직 기간 안의 날짜만 입력할 수 있습니다.');
    if (!editingId) {
      const { data: existing, error: existingError } = await supabase.from('work_records').select('work_date').eq('store_member_id', memberId).in('work_date', targetDates);
      if (existingError) return setError('기존 근무기록을 확인하지 못했습니다.');
      if (existing && existing.length > 0) return setError(`이미 기록이 있는 날짜가 포함되어 있습니다: ${existing.map((item) => item.work_date).join(', ')}`);
    }
    setPending(true); setError(null);
    const payloads = targetDates.map((workDate) => ({ store_member_id: memberId, work_date: workDate, start_time: form.startTime, end_time: form.endTime, break_minutes: breakMinutes, crosses_midnight: form.crossesMidnight, memo: form.memo.trim() || null, work_minutes: calculateWorkMinutes(timeInput), status: isManager ? 'APPROVED' as const : 'DRAFT' as const, reject_reason: null, approved_by: isManager ? membership.user_id : null, approved_at: isManager ? new Date().toISOString() : null }));
    const result = editingId ? await supabase.from('work_records').update(payloads[0]).eq('id', editingId) : await supabase.from('work_records').insert(payloads);
    setPending(false);
    if (result.error) return setError(result.error.code === '23505' ? '해당 날짜의 근무기록이 이미 있습니다.' : '근무기록을 저장하지 못했습니다.');
    await refresh(); setEditingId(null); setSelectedDates([]); setForm(initialForm(form.workDate));
  }

  async function submitMonthDrafts() {
    const draftIds = records.filter((record) => record.work_date >= monthStart && record.work_date <= monthEnd && record.status === 'DRAFT').map((record) => record.id);
    if (draftIds.length === 0) return setError('이번 달에 제출할 임시저장 기록이 없습니다.');
    if (!window.confirm(`이번 달 임시저장 ${draftIds.length}건을 매니저에게 일괄 제출할까요?`)) return;
    setPending(true); setError(null);
    const { error: submitError } = await supabase.from('work_records').update({ status: 'SUBMITTED', submitted_at: new Date().toISOString() }).in('id', draftIds);
    setPending(false);
    if (submitError) return setError('근무기록을 일괄 제출하지 못했습니다.');
    await refresh();
  }
  async function requestChange(record: WorkRecord) {
    const breakMinutes = Number(form.breakMinutes);
    const timeInput = { startTime: form.startTime, endTime: form.endTime, breakMinutes, crossesMidnight: form.crossesMidnight };
    const validationError = validateWorkTime(timeInput);
    if (validationError) return setError(validationError);
    if (!requestReason.trim()) return setError('수정이 필요한 이유를 입력해주세요.');
    setRequestPending(true); setError(null);
    const { error: requestError } = await supabase.from('work_record_change_requests').insert({
      work_record_id: record.id, requester_id: membership!.user_id, reason: requestReason.trim(),
      start_time: form.startTime, end_time: form.endTime, crosses_midnight: form.crossesMidnight,
      break_minutes: breakMinutes, memo: form.memo.trim() || null, status: 'PENDING',
    });
    setRequestPending(false);
    if (requestError) return setError(requestError.code === '23505' ? '이미 처리 대기 중인 수정요청이 있습니다.' : '수정요청을 보내지 못했습니다.');
    setRequestReason('');
    await queryClient.invalidateQueries({ queryKey: ['my-work-change-requests'] });
  }
  async function remove(record: WorkRecord) {
    if (!window.confirm(`${record.work_date} 근무기록을 삭제할까요?`)) return;
    const { error: deleteError } = await supabase.from('work_records').delete().eq('id', record.id);
    if (deleteError) return setError('근무기록을 삭제하지 못했습니다.');
    await refresh();
  }

  if (employeeMemberships.length === 0) return <section className="rounded-2xl border border-dashed border-hairline bg-paper p-8 text-center"><h1 className="font-semibold text-ink">참여한 매장이 없습니다</h1><p className="mt-2 text-sm text-ink-soft">참여 코드로 매장에 먼저 가입해주세요.</p></section>;

  const selectedRecord = entryMode === 'single' || editingId ? recordByDate.get(form.workDate) : undefined;
  const pendingChangeRequest = selectedRecord
    ? changeRequestsQuery.data?.find((request) => request.work_record_id === selectedRecord.id && request.status === 'PENDING')
    : undefined;
  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className={pageTitleClass}>근무 달력</h1><p className={`mt-1 ${mutedTextClass}`}>{isManager ? '내 근무는 저장 즉시 사장님 근무표에 표시됩니다.' : '근무시간을 기록하고 매니저에게 일괄 제출합니다.'}</p></div><div className="flex flex-wrap items-center gap-2">{!isManager && records.some((record) => record.work_date >= monthStart && record.work_date <= monthEnd && record.status === 'DRAFT') && <button type="button" onClick={() => void submitMonthDrafts()} disabled={pending} className={buttonClass('primary')}>이번 달 일괄 제출</button>}{employeeMemberships.length > 1 && <label className="text-sm text-ink-soft">매장<select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={inputClass('ml-2 w-auto')}>{employeeMemberships.map((item) => <option key={item.id} value={item.id}>{item.store.name}</option>)}</select></label>}</div></div>
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-2xl border border-hairline bg-paper"><div className="flex items-center justify-between gap-2 border-b border-hairline p-4"><button onClick={() => setMonth(moveMonth(month, -1))} aria-label="이전 달" className={iconButtonClass()}><Icon name="chevronLeft" className="h-4 w-4" /></button><div className="text-center"><strong className="text-ink">{year}년 {monthNumber}월</strong><p className="text-xs text-ink-soft">월 누적 {formatMinutes(monthMinutes)}</p></div><button onClick={() => setMonth(moveMonth(month, 1))} aria-label="다음 달" className={iconButtonClass()}><Icon name="chevronRight" className="h-4 w-4" /></button></div>
        <div className="overflow-x-auto"><div className="min-w-[560px]"><div className="grid grid-cols-7 bg-shell text-center text-xs font-medium text-ink-soft">{['월','화','수','목','금','토','일'].map((day) => <div key={day} className="py-2">{day}</div>)}</div>
        <div className="grid grid-cols-7">{calendarDates.map((date) => { const record = recordByDate.get(date); const holiday = holidayByDate.get(date); const inMonth = date.startsWith(month); const weekStart = startOfWeek(date, membership?.store.week_start_day ?? 1); const weekDisplayStart = weekStart < monthStart ? monthStart : weekStart; const isSelected = entryMode === 'multiple' ? selectedDates.includes(date) : form.workDate === date; return <button key={date} onClick={() => selectCalendarDate(date, record)} aria-label={`${date}${record ? ` · ${workRecordStatusLabel(record)}` : ''}`} className={`min-h-24 cursor-pointer border-r border-t border-hairline p-2 text-left align-top transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${inMonth ? 'bg-paper hover:bg-shell' : 'bg-shell text-ink-soft'} ${isSelected ? 'ring-2 ring-inset ring-brand-600 bg-shell' : ''}`}><span className={`text-xs ${holiday ? 'font-semibold text-rust-text' : ''}`}>{Number(date.slice(-2))}</span>{entryMode === 'multiple' && isSelected && <span className="float-right rounded-full bg-brand-600 px-1.5 text-xs text-white">선택</span>}{holiday && <span className="mt-1 block truncate text-xs text-rust-text">{holiday.name}</span>}{record && <><span className={`mt-1 block rounded px-1.5 py-1 text-xs font-medium ${RECORD_CHIP_STYLE[record.status]}`}>{workRecordStatusLabel(record)}</span><span className="mt-1 block text-xs text-ink-soft">{formatMinutes(record.work_minutes)}</span></>}{inMonth && date === weekDisplayStart && <span className="mt-1 block text-xs text-ink-soft">이번 달 주 {formatMinutes(weekMinutes.get(weekStart) ?? 0)}</span>}</button>; })}</div></div></div>
      </div>
      <aside><form onSubmit={save} className="sticky top-5 space-y-4 rounded-2xl border border-hairline bg-paper p-5 shadow-sm"><div><h2 className={sectionTitleClass}>{selectedRecord?.status === 'SUBMITTED' ? '제출 기록 수정요청' : editingId ? '근무기록 수정' : '근무기록 입력'}</h2><p className="mt-1 text-xs text-ink-soft">{membership?.store.name}</p></div>
        {!editingId && <div className="grid grid-cols-3 rounded-lg bg-shell p-1 text-xs" role="tablist" aria-label="입력 방식">{([['single','하루'],['multiple','여러 날짜'],['weekly','매주 반복']] as const).map(([value,label]) => <button type="button" key={value} role="tab" aria-selected={entryMode === value} onClick={() => { setEntryMode(value); setSelectedDates([]); setError(null); }} className={`min-h-9 cursor-pointer rounded-md px-2 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${entryMode === value ? 'bg-paper font-medium text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}>{label}</button>)}</div>}
        {entryMode === 'multiple' && !editingId ? <div className="rounded-lg border border-dashed border-hairline p-3 text-sm"><p className="text-ink-soft">달력에서 근무 날짜를 동시에 선택하세요.</p><p className="mt-1 font-medium text-ink">{selectedDates.length}일 선택됨</p>{selectedDates.length > 0 && <button type="button" onClick={() => setSelectedDates([])} className="mt-1 text-xs font-medium text-ink-soft underline decoration-hairline underline-offset-2 hover:text-ink">선택 초기화</button>}</div> : <label className="block space-y-1"><span className={labelClass()}>{entryMode === 'weekly' && !editingId ? '반복 시작일' : '근무일'}</span><input type="date" required value={form.workDate} onChange={(e) => { const record = recordByDate.get(e.target.value); record && ['DRAFT','REJECTED'].includes(record.status) ? openEdit(record) : openNew(e.target.value); }} className={inputClass()} /></label>}
        {entryMode === 'weekly' && !editingId && <div className="space-y-3 rounded-lg border border-hairline p-3"><label className="block space-y-1"><span className={labelClass()}>반복 종료일</span><input type="date" required min={form.workDate} value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} className={inputClass()} /></label><fieldset><legend className={labelClass()}>반복 요일</legend><div className="mt-2 flex flex-wrap gap-1">{['월','화','수','목','금','토','일'].map((day,index) => { const value = index + 1; const active = repeatWeekdays.includes(value); return <button type="button" key={day} aria-pressed={active} onClick={() => setRepeatWeekdays((current) => active ? current.filter((item) => item !== value) : [...current, value].sort())} className={`h-9 w-9 cursor-pointer rounded-full text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${active ? 'bg-brand-600 text-white' : 'bg-shell text-ink-soft hover:bg-hairline/60'}`}>{day}</button>; })}</div></fieldset><p className="text-xs text-ink-soft">총 {expandWeeklyDates(form.workDate, repeatUntil, repeatWeekdays).length}일 생성 예정</p></div>}
        <div className="flex gap-2"><button type="button" onClick={() => setForm({ ...form, startTime: membership?.store.open_time.slice(0, 5) ?? '09:00' })} className="min-h-11 flex-1 cursor-pointer rounded-lg border border-celadon/30 bg-celadon-tint px-3 py-2 text-sm text-celadon-text transition-colors hover:bg-celadon/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celadon">오픈 {membership?.store.open_time.slice(0, 5)}</button><button type="button" onClick={() => setForm({ ...form, endTime: membership?.store.close_time.slice(0, 5) ?? '18:00' })} className="min-h-11 flex-1 cursor-pointer rounded-lg border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700 transition-colors hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">마감 {membership?.store.close_time.slice(0, 5)}</button></div><div className="grid grid-cols-2 gap-3"><label className="block space-y-1"><span className={labelClass()}>출근</span><input type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className={inputClass()} /></label><label className="block space-y-1"><span className={labelClass()}>퇴근</span><input type="time" required value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className={inputClass()} /></label></div><label className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" checked={form.crossesMidnight} onChange={(e) => setForm({ ...form, crossesMidnight: e.target.checked })} className="h-4 w-4 rounded border-hairline text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" />다음 날 퇴근</label><label className="block space-y-1"><span className={labelClass()}>휴게시간</span><select required value={form.breakMinutes} onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })} className={inputClass()}><option value="0">0분</option><option value="30">30분</option><option value="60">60분</option></select></label><label className="block space-y-1"><span className={labelClass()}>메모 (선택)</span><textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} className={inputClass()} /></label><p className="rounded-lg bg-shell p-2 text-sm text-ink-soft">예상 실 근무 <strong className="text-ink">{validateWorkTime({ startTime: form.startTime, endTime: form.endTime, breakMinutes: Number(form.breakMinutes), crossesMidnight: form.crossesMidnight }) ? '-' : formatMinutes(calculateWorkMinutes({ startTime: form.startTime, endTime: form.endTime, breakMinutes: Number(form.breakMinutes), crossesMidnight: form.crossesMidnight }))}</strong></p>{selectedRecord?.reject_reason && <p role="alert" className="rounded-lg bg-rust-tint p-2 text-sm text-rust-text">반려 사유: {selectedRecord.reject_reason}</p>}{selectedRecord?.status === 'SUBMITTED' && (pendingChangeRequest ? <p role="status" className="rounded-lg bg-ochre-tint p-3 text-sm text-ochre-text">수정요청 처리 대기 중<br /><span className="text-xs">{pendingChangeRequest.reason}</span></p> : <label className="block space-y-1"><span className={labelClass()}>수정요청 사유</span><textarea required value={requestReason} onChange={(e) => setRequestReason(e.target.value)} placeholder="변경이 필요한 이유를 입력하세요." className={inputClass()} /></label>)}<ErrorText>{error}</ErrorText>{selectedRecord?.status === 'SUBMITTED' ? !pendingChangeRequest && <button type="button" disabled={requestPending} onClick={() => void requestChange(selectedRecord)} className={buttonClass('primary', 'md', 'w-full bg-ochre hover:bg-ochre-text focus-visible:ring-ochre')}>{requestPending ? '요청 중…' : '매니저에게 수정요청'}</button> : <button disabled={pending || (!!selectedRecord && !['DRAFT','REJECTED'].includes(selectedRecord.status) && !(isManager && selectedRecord.status === 'APPROVED'))} className={buttonClass('primary', 'md', 'w-full')}>{pending ? '저장 중…' : isManager ? (editingId ? '내 근무 수정 저장' : '내 근무 저장') : entryMode === 'single' || editingId ? '임시저장' : '선택한 날짜 일괄 저장'}</button>}{selectedRecord?.status === 'DRAFT' && <button type="button" onClick={() => void remove(selectedRecord)} className={buttonClass('dangerOutline', 'md', 'w-full')}>삭제</button>}{selectedRecord?.status === 'APPROVED' && <p role="status" className="text-center text-xs font-medium text-brand-700">{isManager ? '사장님 근무표에 표시 중' : workRecordStatusLabel(selectedRecord)}</p>}</form></aside>
    </div>
  </section>;
}
