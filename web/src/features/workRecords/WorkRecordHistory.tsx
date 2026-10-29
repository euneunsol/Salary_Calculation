import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { endOfMonth } from '../../lib/date';
import type { WorkRecord, WorkRecordHistory as HistoryRow } from '../../types/database.types';

function summary(record: WorkRecord): string {
  return `${record.start_time.slice(0, 5)}~${record.crosses_midnight ? '다음 날 ' : ''}${record.end_time.slice(0, 5)} · 휴게 ${record.break_minutes}분 · 메모: ${record.memo || '없음'}`;
}

export function WorkRecordHistory({ storeId, month }: { storeId: string; month: string }) {
  const [year, monthNumber] = month.split('-').map(Number);
  const query = useQuery({
    queryKey: ['work-record-history', storeId, month], enabled: !!storeId,
    refetchInterval: 30_000, refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.from('work_record_history').select('*')
        .eq('store_id', storeId).gte('work_date', `${month}-01`)
        .lte('work_date', endOfMonth(year, monthNumber)).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as HistoryRow[];
    },
  });
  return <section className="space-y-3 rounded-2xl border border-hairline bg-paper p-4">
    <h2 className="font-semibold text-ink">근무 수정·삭제 이력</h2>
    <p className="text-sm text-ink-soft">선택한 달의 근무 변경 내역입니다. 삭제한 기록도 이력에 남습니다.</p>
    {query.isLoading && <p>변경 이력을 불러오는 중…</p>}
    {query.isError && <p role="alert">변경 이력을 불러오지 못했습니다. <button className="underline" onClick={() => void query.refetch()}>다시 시도</button></p>}
    {query.isSuccess && !query.data.length && <p className="text-sm text-ink-soft">수정·삭제 이력이 없습니다.</p>}
    {query.data?.map((entry) => <article key={entry.id} className="space-y-1 border-t border-hairline pt-3 text-sm">
      <p className="font-medium text-ink">{entry.member_name} · {entry.work_date} · {entry.action === 'DELETED' ? '삭제 완료' : '수정 완료'}</p>
      <p className="text-ink-soft">처리: {entry.actor_name} · {new Date(entry.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
      <p>변경 전: {summary(entry.before_record)}</p>
      <p>{entry.after_record ? `변경 후: ${summary(entry.after_record)}` : '변경 후: 근무 삭제 — 근무표와 급여 계산에서 제외'}</p>
    </article>)}
  </section>;
}
