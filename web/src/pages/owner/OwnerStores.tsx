import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { validateStoreName, WEEK_DAYS } from '../../features/stores/storeForm';
import { supabase } from '../../lib/supabase';
import type { Store } from '../../types/database.types';
import { badgeClass, buttonClass, cardClass, inputClass, labelClass, mutedTextClass, pageTitleClass, sectionTitleClass } from '../../components/ui/classNames';
import { ErrorText } from '../../components/ui/ErrorText';

interface StoreFields { name: string; address: string; weekStartDay: number }
const emptyFields: StoreFields = { name: '', address: '', weekStartDay: 1 };

export function OwnerStores() {
  const { session, ownedStores } = useAuth();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fields, setFields] = useState<StoreFields>(emptyFields);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function refresh() { await queryClient.invalidateQueries({ queryKey: ['my-stores', session?.user.id] }); }
  function resetForm() { setCreating(false); setEditingId(null); setFields(emptyFields); setError(null); }
  function edit(store: Store) {
    setCreating(false); setEditingId(store.id);
    setFields({ name: store.name, address: store.address ?? '', weekStartDay: store.week_start_day });
    setError(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const nameError = validateStoreName(fields.name);
    if (nameError) return setError(nameError);
    if (!session) return;
    setPending(true); setError(null);
    const payload = { name: fields.name.trim(), address: fields.address.trim() || null, week_start_day: fields.weekStartDay };
    const result = editingId
      ? await supabase.from('stores').update(payload).eq('id', editingId)
      : await supabase.from('stores').insert({ ...payload, owner_id: session.user.id });
    setPending(false);
    if (result.error) return setError('매장 정보를 저장하지 못했습니다.');
    await refresh(); resetForm();
  }

  async function deactivate(store: Store) {
    if (!window.confirm(`${store.name} 매장 운영을 종료할까요? 과거 기록은 보존됩니다.`)) return;
    const { error: updateError } = await supabase.from('stores').update({ is_active: false }).eq('id', store.id);
    if (updateError) return setError('매장 운영 상태를 변경하지 못했습니다.');
    await refresh();
  }

  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className={pageTitleClass}>매장 관리</h1><p className={`mt-1 ${mutedTextClass}`}>매장을 만들고 기본 정보와 참여 코드를 관리합니다.</p></div>{!creating && !editingId && <button onClick={() => { setCreating(true); setFields(emptyFields); }} className={buttonClass('primary')}>매장 추가</button>}</div>
    {(creating || editingId) && <form onSubmit={save} className={cardClass('space-y-4')}>
      <h2 className={sectionTitleClass}>{editingId ? '매장 정보 수정' : '새 매장 추가'}</h2>
      <label className="block space-y-1"><span className={labelClass()}>매장명</span><input required maxLength={50} value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} className={inputClass()} /></label>
      <label className="block space-y-1"><span className={labelClass()}>주소 (선택)</span><input value={fields.address} onChange={(e) => setFields({ ...fields, address: e.target.value })} className={inputClass()} /></label>
      <label className="block space-y-1"><span className={labelClass()}>주 시작일</span><select value={fields.weekStartDay} onChange={(e) => setFields({ ...fields, weekStartDay: Number(e.target.value) })} className={inputClass()}>{WEEK_DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select></label>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2"><button disabled={pending} className={buttonClass('primary')}>{pending ? '저장 중…' : '저장'}</button><button type="button" onClick={resetForm} className={buttonClass('outline')}>취소</button></div>
    </form>}
    {!creating && !editingId && <ErrorText>{error}</ErrorText>}
    <div className="grid gap-4 sm:grid-cols-2">{ownedStores.map((store) => <article key={store.id} className={cardClass()}>
      <div className="flex items-start justify-between gap-3"><div><h2 className={sectionTitleClass}>{store.name}</h2><p className="mt-1 text-sm text-ink-soft">{store.address || '주소 미등록'}</p></div><span className={badgeClass(store.is_active ? 'success' : 'neutral')}>{store.is_active ? '운영 중' : '운영 종료'}</span></div>
      <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><dt className="text-ink-soft">주 시작일</dt><dd>{WEEK_DAYS.find((day) => day.value === store.week_start_day)?.label}</dd></div><div className="flex justify-between"><dt className="text-ink-soft">참여 코드</dt><dd className="font-mono font-semibold tracking-wider">{store.join_code}</dd></div></dl>
      <div className="mt-5 flex flex-wrap gap-2"><Link to={`/owner/stores/${store.id}/members`} className={buttonClass('primary', 'sm')}>구성원 관리</Link><button onClick={() => edit(store)} className={buttonClass('outline', 'sm')}>수정</button>{store.is_active && <button onClick={() => void deactivate(store)} className={buttonClass('dangerOutline', 'sm')}>운영 종료</button>}</div>
    </article>)}</div>
  </section>;
}
