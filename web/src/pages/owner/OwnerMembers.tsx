import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { minimumWageFor, validateWage } from '../../features/wages/minimumWage';
import { supabase } from '../../lib/supabase';
import type { Profile, StoreMember, WageHistory, WorkRecord } from '../../types/database.types';
import { backLinkClass, buttonClass, cardClass, inputClass, labelClass, pageTitleClass, sectionTitleClass } from '../../components/ui/classNames';
import { ErrorText } from '../../components/ui/ErrorText';

interface MemberRow extends StoreMember {
  profile: Profile | null;
  currentWage: WageHistory | null;
  wageHistory: WageHistory[];
  earliestWorkDate: string | null;
}

function todayInKorea(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function nextDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function OwnerMembers() {
  const { storeId } = useParams();
  const { ownedStores } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [wageMember, setWageMember] = useState<MemberRow | null>(null);
  const [wage, setWage] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayInKorea());
  const [memo, setMemo] = useState('');
  const [wagePending, setWagePending] = useState(false);
  const [joinedMember, setJoinedMember] = useState<MemberRow | null>(null);
  const [joinedAt, setJoinedAt] = useState('');
  const [joinedPending, setJoinedPending] = useState(false);
  const store = ownedStores.find((item) => item.id === storeId);
  const managerInviteQuery = useQuery({
    queryKey: ['manager-invite', storeId],
    enabled: !!store,
    queryFn: async () => {
      const { data, error: queryError } = await supabase.from('store_manager_invites').select('*').eq('store_id', storeId!).single();
      if (queryError) throw queryError;
      return data;
    },
  });

  const membersQuery = useQuery({
    queryKey: ['store-members', storeId],
    enabled: !!store,
    queryFn: async (): Promise<MemberRow[]> => {
      const { data: members, error: memberError } = await supabase
        .from('store_members').select('*').eq('store_id', storeId!).order('created_at');
      if (memberError) throw memberError;
      const typedMembers = (members ?? []) as StoreMember[];
      if (typedMembers.length === 0) return [];

      const userIds = [...new Set(typedMembers.map((member) => member.user_id))];
      const memberIds = typedMembers.map((member) => member.id);
      const [{ data: profiles, error: profileError }, { data: wages, error: wageError }, { data: workRecords, error: workError }] = await Promise.all([
        supabase.from('profiles').select('*').in('id', userIds),
        supabase.from('wage_history').select('*').in('store_member_id', memberIds).order('effective_from', { ascending: false }),
        supabase.from('work_records').select('*').in('store_member_id', memberIds).order('work_date'),
      ]);
      if (profileError) throw profileError;
      if (wageError) throw wageError;
      if (workError) throw workError;

      const typedProfiles = (profiles ?? []) as Profile[];
      const typedWages = (wages ?? []) as WageHistory[];
      const typedWorkRecords = (workRecords ?? []) as WorkRecord[];
      return typedMembers.map((member) => ({
        ...member,
        profile: typedProfiles.find((profile) => profile.id === member.user_id) ?? null,
        currentWage: typedWages.find((wage) => wage.store_member_id === member.id && wage.effective_to === null) ?? null,
        wageHistory: typedWages.filter((wage) => wage.store_member_id === member.id),
        earliestWorkDate: typedWorkRecords.find((record) => record.store_member_id === member.id)?.work_date ?? null,
      }));
    },
  });

  if (!storeId || (!store && ownedStores.length > 0)) return <Navigate to="/owner/stores" replace />;

  async function setMemberActive(member: MemberRow, active: boolean) {
    const action = active ? '재활성화' : '퇴사 처리';
    if (!window.confirm(`${member.profile?.name ?? '해당 직원'}을(를) ${action}할까요?`)) return;
    setError(null);
    const { error: updateError } = await supabase.from('store_members').update({
      status: active ? 'ACTIVE' : 'INACTIVE',
      left_at: active ? null : todayInKorea(),
    }).eq('id', member.id);
    if (updateError) {
      setError(`${action}하지 못했습니다.`);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['store-members', storeId] });
  }

  async function setMemberRole(member: MemberRow) {
    const nextRole = member.role === 'MANAGER' ? 'EMPLOYEE' : 'MANAGER';
    const label = nextRole === 'MANAGER' ? '매니저로 지정' : '알바생으로 전환';
    if (!window.confirm(`${member.profile?.name ?? '해당 구성원'}을(를) ${label}할까요?`)) return;
    setError(null);
    const { error: updateError } = await supabase.from('store_members').update({ role: nextRole }).eq('id', member.id);
    if (updateError) return setError(`${label}하지 못했습니다.`);
    await queryClient.invalidateQueries({ queryKey: ['store-members', storeId] });
  }

  function openWageForm(member: MemberRow) {
    const earliest = member.currentWage ? nextDate(member.currentWage.effective_from) : member.joined_at;
    setWageMember(member);
    setJoinedMember(null);
    setWage(member.currentWage?.hourly_wage.toString() ?? minimumWageFor(todayInKorea()).toString());
    setEffectiveFrom(member.currentWage && earliest < todayInKorea() ? todayInKorea() : earliest);
    setMemo('');
    setError(null);
  }

  async function saveWage(e: FormEvent) {
    e.preventDefault();
    if (!wageMember) return;
    const numericWage = Number(wage);
    const wageError = validateWage(numericWage, effectiveFrom);
    if (wageError) return setError(wageError);
    if (effectiveFrom < wageMember.joined_at) return setError('시급 적용일은 입사일보다 빠를 수 없습니다.');
    if (wageMember.wageHistory.length === 0 && effectiveFrom !== wageMember.joined_at) {
      return setError(`최초 시급 적용일은 입사일(${wageMember.joined_at})과 같아야 합니다.`);
    }
    if (wageMember.currentWage && effectiveFrom <= wageMember.currentWage.effective_from) {
      return setError(`변경 적용일은 현재 시급 시작일(${wageMember.currentWage.effective_from}) 이후여야 합니다.`);
    }
    setWagePending(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('set_wage', {
      p_member_id: wageMember.id,
      p_wage: numericWage,
      p_from: effectiveFrom,
      p_memo: memo.trim() || undefined,
    });
    setWagePending(false);
    if (rpcError) return setError('시급을 저장하지 못했습니다. 적용일과 기존 이력을 확인해주세요.');
    await queryClient.invalidateQueries({ queryKey: ['store-members', storeId] });
    setWageMember(null);
  }

  function openJoinedAtForm(member: MemberRow) {
    setJoinedMember(member);
    setJoinedAt(member.joined_at);
    setWageMember(null);
    setError(null);
  }

  async function saveJoinedAt(e: FormEvent) {
    e.preventDefault();
    if (!joinedMember || !joinedAt) return;
    if (joinedMember.left_at && joinedAt > joinedMember.left_at) {
      return setError(`입사일은 퇴사일(${joinedMember.left_at})보다 늦을 수 없습니다.`);
    }
    const firstWageDate = joinedMember.wageHistory.length > 0
      ? [...joinedMember.wageHistory].sort((a, b) => a.effective_from.localeCompare(b.effective_from))[0].effective_from
      : null;
    const activityDates = [joinedMember.earliestWorkDate, firstWageDate].filter((date): date is string => !!date);
    const earliestActivity = activityDates.sort()[0] ?? null;
    if (earliestActivity && joinedAt > earliestActivity) {
      return setError(`기존 근무·시급 이력이 ${earliestActivity}부터 있어 그 이후로 변경할 수 없습니다.`);
    }
    setJoinedPending(true);
    setError(null);
    const { error: updateError } = await supabase.from('store_members').update({ joined_at: joinedAt }).eq('id', joinedMember.id);
    setJoinedPending(false);
    if (updateError) return setError('입사일을 변경하지 못했습니다.');
    await queryClient.invalidateQueries({ queryKey: ['store-members', storeId] });
    setJoinedMember(null);
  }

  return <section className="space-y-5">
    <div><Link to="/owner/stores" className={backLinkClass}>매장 목록</Link><h1 className={`mt-2 ${pageTitleClass}`}>{store?.name} 구성원</h1><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft"><p>알바생 참여 코드 <span className="font-mono font-semibold tracking-wider text-ink">{store?.join_code}</span></p><p>매니저 초대 코드 <span className="font-mono font-semibold tracking-wider text-celadon-text">{managerInviteQuery.data?.invite_code ?? '불러오는 중…'}</span></p></div></div>
    <ErrorText>{error}</ErrorText>
    {joinedMember && <form onSubmit={saveJoinedAt} className={cardClass('space-y-4')}>
      <div><h2 className={sectionTitleClass}>{joinedMember.profile?.name} 입사일 수정</h2><p className="mt-1 text-xs text-ink-soft">급여와 근무 집계가 시작되는 날짜입니다.</p></div>
      <label className="block max-w-xs space-y-1"><span className={labelClass()}>입사일 (근무 시작일)</span><input type="date" required max={joinedMember.left_at ?? undefined} value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} className={inputClass()} /></label>
      <div className="flex gap-2"><button disabled={joinedPending} className={buttonClass('primary')}>{joinedPending ? '저장 중…' : '입사일 저장'}</button><button type="button" onClick={() => { setJoinedMember(null); setError(null); }} className={buttonClass('outline')}>취소</button></div>
    </form>}
    {wageMember && <form onSubmit={saveWage} className={cardClass('space-y-4')}>
      <div><h2 className={sectionTitleClass}>{wageMember.profile?.name} 시급 {wageMember.currentWage ? '변경' : '설정'}</h2><p className="mt-1 text-xs text-ink-soft">{wageMember.currentWage ? '적용일 이후 근무부터 새 시급이 적용됩니다.' : '최초 시급은 입사일부터 적용됩니다.'}</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1"><span className={labelClass()}>시급 (원)</span><input type="number" required step="1" min={minimumWageFor(effectiveFrom)} value={wage} onChange={(e) => setWage(e.target.value)} className={inputClass()} /><span className="block text-xs text-ink-soft">{effectiveFrom.slice(0, 4)}년 최저시급 {minimumWageFor(effectiveFrom).toLocaleString()}원</span></label><label className="block space-y-1"><span className={labelClass()}>적용 시작일</span><input type="date" required disabled={!wageMember.currentWage} min={wageMember.currentWage ? nextDate(wageMember.currentWage.effective_from) : wageMember.joined_at} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className={inputClass()} /></label></div>
      <label className="block space-y-1"><span className={labelClass()}>변경 사유 (선택)</span><input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 근속 인상" className={inputClass()} /></label>
      <div className="flex gap-2"><button disabled={wagePending} className={buttonClass('primary')}>{wagePending ? '저장 중…' : '시급 저장'}</button><button type="button" onClick={() => { setWageMember(null); setError(null); }} className={buttonClass('outline')}>취소</button></div>
    </form>}
    {membersQuery.isLoading && <p className="text-sm text-ink-soft">구성원을 불러오는 중…</p>}
    {membersQuery.isError && <p role="alert" className="rounded-lg bg-rust-tint p-3 text-sm text-rust-text">구성원 정보를 불러오지 못했습니다.</p>}
    {membersQuery.data?.length === 0 && <div className="rounded-2xl border border-dashed border-hairline bg-paper p-8 text-center"><p className="text-ink">아직 참여한 직원이 없습니다.</p><p className="mt-1 text-sm text-ink-soft">위 참여 코드를 직원에게 전달해주세요.</p></div>}
    <div className="overflow-hidden rounded-2xl border border-hairline bg-paper">
      {membersQuery.data && membersQuery.data.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-shell text-ink-soft"><tr><th className="px-4 py-3 font-medium">이름</th><th className="px-4 py-3 font-medium">역할</th><th className="px-4 py-3 font-medium">입사일</th><th className="px-4 py-3 font-medium">현재 시급</th><th className="px-4 py-3 font-medium">상태</th><th className="px-4 py-3 font-medium">관리</th></tr></thead><tbody className="divide-y divide-hairline">{membersQuery.data.map((member) => <tr key={member.id}><td className="px-4 py-3"><strong className="block text-ink">{member.profile?.name ?? '이름 없음'}</strong><span className="text-xs text-ink-soft">{member.profile?.email}</span></td><td className="px-4 py-3">{member.role === 'MANAGER' ? '매니저' : '알바생'}</td><td className="px-4 py-3">{member.joined_at}</td><td className="px-4 py-3"><span>{member.currentWage ? `${member.currentWage.hourly_wage.toLocaleString()}원` : <span className="font-medium text-ochre-text">미설정</span>}</span>{member.wageHistory.length > 0 && <details className="mt-1"><summary className="cursor-pointer text-xs font-medium text-ink-soft underline decoration-hairline underline-offset-2 hover:text-ink">이력 {member.wageHistory.length}건</summary><ul className="mt-1 space-y-1 text-xs text-ink-soft">{member.wageHistory.map((item) => <li key={item.id}>{item.effective_from}~{item.effective_to ?? '현재'} · {item.hourly_wage.toLocaleString()}원{item.memo ? ` · ${item.memo}` : ''}</li>)}</ul></details>}</td><td className="px-4 py-3">{member.status === 'ACTIVE' ? <span className="font-medium text-brand-700">재직</span> : <span className="text-ink-soft">퇴사</span>}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1.5"><button onClick={() => void setMemberRole(member)} className={buttonClass('outline', 'sm', 'border-celadon/40 text-celadon-text hover:bg-celadon-tint')}>{member.role === 'MANAGER' ? '알바생 전환' : '매니저 지정'}</button><button onClick={() => openJoinedAtForm(member)} className={buttonClass('outline', 'sm')}>입사일 수정</button><button onClick={() => openWageForm(member)} className={buttonClass('outline', 'sm')}>시급 {member.currentWage ? '변경' : '설정'}</button><button onClick={() => void setMemberActive(member, member.status !== 'ACTIVE')} className={buttonClass('outline', 'sm')}>{member.status === 'ACTIVE' ? '퇴사 처리' : '재활성화'}</button></div></td></tr>)}</tbody></table></div>}
    </div>
  </section>;
}
