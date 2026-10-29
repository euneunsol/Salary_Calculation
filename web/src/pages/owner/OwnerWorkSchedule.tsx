import { workRecordStatusLabel } from '../../features/workRecords/workRecordStatus';
import { WorkRecordHistory } from '../../features/workRecords/WorkRecordHistory';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/AuthProvider';
import { useHolidays } from '../../features/holidays/useHolidays';
import { addDays, endOfMonth, formatMinutes, isoDayOfWeek } from '../../lib/date';
import { supabase } from '../../lib/supabase';
import type { Profile, StoreMember, WorkRecord } from '../../types/database.types';
import { iconButtonClass, inputClass, mutedTextClass, pageTitleClass } from '../../components/ui/classNames';
import { Icon } from '../../components/ui/Icon';

function currentMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
}
function moveMonth(month: string, amount: number): string {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value - 1 + amount, 1)).toISOString().slice(0, 7);
}

export function OwnerWorkSchedule() {
  const { ownedStores } = useAuth();
  const [storeId, setStoreId] = useState(ownedStores[0]?.id ?? '');
  const [month, setMonth] = useState(currentMonth());
  const [year, monthNumber] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = endOfMonth(year, monthNumber);
  const gridStart = addDays(monthStart, -(isoDayOfWeek(monthStart) - 1));
  const gridEnd = addDays(monthEnd, 7 - isoDayOfWeek(monthEnd));
  const holidaysQuery = useHolidays(gridStart, gridEnd);

  const scheduleQuery = useQuery({
    queryKey: ['owner-approved-schedule', storeId, month], enabled: !!storeId, refetchInterval: 30_000, refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: members, error: memberError } = await supabase.from('store_members').select('*').eq('store_id', storeId);
      if (memberError) throw memberError;
      const typedMembers = (members ?? []) as StoreMember[];
      if (typedMembers.length === 0) return { members: typedMembers, profiles: [] as Profile[], records: [] as WorkRecord[] };
      const [{ data: profiles, error: profileError }, { data: records, error: recordError }] = await Promise.all([
        supabase.from('profiles').select('*').in('id', typedMembers.map((member) => member.user_id)),
        supabase.from('work_records').select('*').in('store_member_id', typedMembers.map((member) => member.id)).eq('status', 'APPROVED').gte('work_date', `${month}-01`).lte('work_date', endOfMonth(year, monthNumber)).order('work_date'),
      ]);
      if (profileError) throw profileError;
      if (recordError) throw recordError;
      return { members: typedMembers, profiles: (profiles ?? []) as Profile[], records: (records ?? []) as WorkRecord[] };
    },
  });
  const data = scheduleQuery.data;
  const holidayMap = new Map((holidaysQuery.data ?? []).map((holiday) => [holiday.holiday_date, holiday]));
  const calendarDates: string[] = []; for (let date = gridStart; date <= gridEnd; date = addDays(date,1)) calendarDates.push(date);
  return <section className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className={pageTitleClass}>검토 완료 근무표</h1><p className={`mt-1 ${mutedTextClass}`}>매니저가 승인·수정한 근무를 표시합니다. 변경 전후 내용과 삭제 내역은 아래 이력에서 확인하세요.</p></div><select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={inputClass('w-auto')}>{ownedStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></div>
    <div className="flex items-center justify-center gap-4"><button onClick={() => setMonth(moveMonth(month,-1))} aria-label="이전 달" className={iconButtonClass()}><Icon name="chevronLeft" className="h-4 w-4" /></button><strong className="min-w-32 text-center text-ink">{year}년 {monthNumber}월</strong><button onClick={() => setMonth(moveMonth(month,1))} aria-label="다음 달" className={iconButtonClass()}><Icon name="chevronRight" className="h-4 w-4" /></button></div>
    {scheduleQuery.isLoading && <p className={mutedTextClass}>근무표를 불러오는 중…</p>}{scheduleQuery.isError && <p role="alert" className="rounded-lg bg-rust-tint p-3 text-sm text-rust-text">근무표를 불러오지 못했습니다.</p>}
    {data && <><div className="overflow-x-auto rounded-2xl border border-hairline bg-paper"><div className="min-w-[640px]"><div className="grid grid-cols-7 bg-shell text-center text-xs font-medium text-ink-soft">{['월','화','수','목','금','토','일'].map((day) => <div key={day} className="py-2">{day}</div>)}</div><div className="grid grid-cols-7">{calendarDates.map((date) => { const holiday = holidayMap.get(date); const records = data.records.filter((record) => record.work_date === date); return <div key={date} className={`min-h-36 border-r border-t border-hairline p-2 ${date.startsWith(month) ? 'bg-paper' : 'bg-shell'}`}><span className={`text-xs ${holiday ? 'font-semibold text-rust-text' : 'text-ink-soft'}`}>{Number(date.slice(-2))}</span>{holiday && <p className="truncate text-xs text-rust-text">{holiday.name}</p>}<div className="mt-1 space-y-1">{records.map((record) => { const member = data.members.find((item) => item.id === record.store_member_id); const profile = data.profiles.find((item) => item.id === member?.user_id); return <div key={record.id} className={`rounded p-1 text-xs ${member?.role === 'MANAGER' ? 'bg-celadon-tint text-celadon-text' : 'bg-brand-50 text-brand-700'}`}><strong className="block truncate">{profile?.name} · {member?.role === 'MANAGER' ? '매니저' : '알바생'}</strong><span>{record.start_time.slice(0,5)}~{record.end_time.slice(0,5)}</span><span className="block">{formatMinutes(record.work_minutes)}</span><span className="block font-semibold">{workRecordStatusLabel(record)}</span></div>; })}</div></div>; })}</div></div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.members.map((member) => { const profile = data.profiles.find((item) => item.id === member.user_id); const total = data.records.filter((record) => record.store_member_id === member.id).reduce((sum,record) => sum + record.work_minutes,0); return <div key={member.id} className="rounded-xl border border-hairline bg-paper p-4"><strong className="text-ink">{profile?.name}</strong><span className="ml-2 text-xs text-ink-soft">{member.role === 'MANAGER' ? '매니저' : '알바생'}</span><p className="mt-1 text-sm text-ink-soft">월 합계 {formatMinutes(total)}</p></div>; })}</div></>}
    <WorkRecordHistory storeId={storeId} month={month} />
  </section>;
}
