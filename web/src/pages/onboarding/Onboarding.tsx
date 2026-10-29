import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { validateStoreName, WEEK_DAYS } from '../../features/stores/storeForm';
import { supabase } from '../../lib/supabase';
import { buttonClass, inputClass, labelClass } from '../../components/ui/classNames';
import { ErrorText } from '../../components/ui/ErrorText';

export function Onboarding() {
  const { session, ownedStores, memberships } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'choose' | 'owner' | 'employee' | 'manager'>('choose');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [weekStartDay, setWeekStartDay] = useState(1);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (ownedStores.length > 0 || memberships.length > 0) return <Navigate to="/" replace />;

  async function createStore(e: FormEvent) {
    e.preventDefault();
    const nameError = validateStoreName(name);
    if (nameError) return setError(nameError);
    if (!session) return;
    setPending(true);
    setError(null);
    const { error: insertError } = await supabase.from('stores').insert({
      name: name.trim(), address: address.trim() || null,
      week_start_day: weekStartDay, owner_id: session.user.id,
    });
    setPending(false);
    if (insertError) return setError('매장을 만들지 못했습니다. 잠시 후 다시 시도해주세요.');
    await queryClient.invalidateQueries({ queryKey: ['my-stores', session.user.id] });
    navigate('/owner/stores', { replace: true });
  }

  async function joinStore(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const expectedLength = mode === 'manager' ? 8 : 6;
    if (!new RegExp(`^[A-Za-z0-9]{${expectedLength}}$`).test(joinCode.trim())) {
      setError(`${expectedLength}자리 ${mode === 'manager' ? '매니저 초대' : '참여'} 코드를 입력해주세요.`);
      return;
    }
    setPending(true);
    setError(null);
    const code = joinCode.trim().toUpperCase();
    const { error: joinError } = mode === 'manager'
      ? await supabase.rpc('join_store_as_manager', { p_invite_code: code })
      : await supabase.rpc('join_store_by_code', { p_join_code: code });
    setPending(false);
    if (joinError) {
      setError(`${mode === 'manager' ? '매니저 초대 코드' : '참여 코드'}를 확인해주세요. 운영 중인 매장의 코드만 사용할 수 있습니다.`);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['my-memberships', session.user.id] });
    navigate(mode === 'manager' ? '/manage' : '/me/dashboard', { replace: true });
  }

  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-hairline bg-paper p-6 shadow-sm">
      {mode === 'choose' ? <>
        <h1 className="text-xl font-bold tracking-tight text-ink">어떻게 시작할까요?</h1>
        <p className="mt-2 text-sm text-ink-soft">매장을 운영하거나, 근무할 매장에 참여할 수 있습니다.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={() => setMode('owner')} className="cursor-pointer rounded-xl border border-hairline p-5 text-left transition-colors hover:border-brand-500/40 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><strong className="block text-ink">사장님으로 시작</strong><span className="mt-1 block text-sm text-ink-soft">첫 매장을 만들고 직원을 관리합니다.</span></button>
          <button type="button" onClick={() => setMode('employee')} className="cursor-pointer rounded-xl border border-hairline p-5 text-left transition-colors hover:border-brand-500/40 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><strong className="block text-ink">알바생으로 참여</strong><span className="mt-1 block text-sm text-ink-soft">사장님에게 받은 6자리 코드로 참여합니다.</span></button>
          <button type="button" onClick={() => setMode('manager')} className="cursor-pointer rounded-xl border border-hairline p-5 text-left transition-colors hover:border-brand-500/40 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><strong className="block text-ink">매니저로 참여</strong><span className="mt-1 block text-sm text-ink-soft">사장님에게 받은 8자리 초대 코드로 참여합니다.</span></button>
        </div>
      </> : mode === 'owner' ? <form onSubmit={createStore} className="space-y-4">
        <div><button type="button" onClick={() => setMode('choose')} className="text-sm font-medium text-ink-soft underline decoration-hairline underline-offset-2 hover:text-ink">이전</button><h1 className="mt-3 text-xl font-bold tracking-tight text-ink">첫 매장 만들기</h1></div>
        <label className="block space-y-1"><span className={labelClass()}>매장명</span><input required maxLength={50} value={name} onChange={(e) => setName(e.target.value)} className={inputClass()} /></label>
        <label className="block space-y-1"><span className={labelClass()}>주소 (선택)</span><input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass()} /></label>
        <label className="block space-y-1"><span className={labelClass()}>급여 계산 주 시작일</span><select value={weekStartDay} onChange={(e) => setWeekStartDay(Number(e.target.value))} className={inputClass()}>{WEEK_DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select></label>
        <ErrorText>{error}</ErrorText>
        <button disabled={pending} className={buttonClass('primary', 'md', 'w-full')}>{pending ? '만드는 중…' : '매장 만들기'}</button>
      </form> : <form onSubmit={joinStore} className="space-y-4">
        <div><button type="button" onClick={() => { setMode('choose'); setError(null); setJoinCode(''); }} className="text-sm font-medium text-ink-soft underline decoration-hairline underline-offset-2 hover:text-ink">이전</button><h1 className="mt-3 text-xl font-bold tracking-tight text-ink">{mode === 'manager' ? '매니저로 참여하기' : '매장 참여하기'}</h1><p className="mt-1 text-sm text-ink-soft">사장님에게 받은 {mode === 'manager' ? '매니저 초대 코드' : '참여 코드'}를 입력해주세요.</p></div>
        <label className="block space-y-1"><span className={labelClass()}>{mode === 'manager' ? '매니저 초대 코드' : '참여 코드'}</span><input required maxLength={mode === 'manager' ? 8 : 6} value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder={mode === 'manager' ? '예: A1B2C3D4' : '예: A1B2C3'} className={inputClass('font-mono uppercase tracking-widest')} /></label>
        <ErrorText>{error}</ErrorText>
        <button disabled={pending} className={buttonClass('primary', 'md', 'w-full')}>{pending ? '참여 중…' : mode === 'manager' ? '매니저로 참여' : '매장 참여'}</button>
      </form>}
    </section>
  );
}
