import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { isValidPassword, PASSWORD_REQUIREMENTS } from '../../features/auth/password';
import { supabase } from '../../lib/supabase';
import { buttonClass, inputClass, labelClass } from '../../components/ui/classNames';
import { ErrorText } from '../../components/ui/ErrorText';

export function UpdatePassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isValidPassword(password)) {
      setError(PASSWORD_REQUIREMENTS);
      return;
    }
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setPending(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (updateError) {
      setError('재설정 링크가 만료되었거나 유효하지 않습니다. 새 링크를 요청해주세요.');
      return;
    }
    await supabase.auth.signOut();
    setUpdated(true);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-shell px-4">
      <div className="w-full max-w-sm rounded-2xl border border-hairline bg-paper p-6 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight text-ink">새 비밀번호 설정</h1>
        {updated ? (
          <div className="mt-4 space-y-4">
            <p role="status" className="text-sm text-brand-700">비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.</p>
            <Link to="/login" className="block text-center text-sm font-medium text-brand-700 underline decoration-hairline underline-offset-2">
              로그인하기
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <label className="block space-y-1">
              <span className={labelClass()}>새 비밀번호</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass()}
              />
              <span className="block text-xs text-ink-soft">{PASSWORD_REQUIREMENTS}</span>
            </label>
            <label className="block space-y-1">
              <span className={labelClass()}>새 비밀번호 확인</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass()}
              />
            </label>
            <ErrorText>{error}</ErrorText>
            <button type="submit" disabled={pending} className={buttonClass('primary', 'md', 'w-full')}>
              {pending ? '변경 중…' : '비밀번호 변경'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
