import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { supabase } from '../../lib/supabase';
import { buttonClass, inputClass, labelClass } from '../../components/ui/classNames';
import { ErrorText } from '../../components/ui/ErrorText';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    setPending(false);
    if (resetError) {
      setError('재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-shell px-4">
      <div className="w-full max-w-sm rounded-2xl border border-hairline bg-paper p-6 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight text-ink">비밀번호 찾기</h1>
        {sent ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-ink-soft">
              입력한 이메일로 비밀번호 재설정 링크를 보냈습니다. 받은편지함과 스팸함을 확인해주세요.
            </p>
            <Link to="/login" className="block text-center text-sm font-medium text-brand-700 underline decoration-hairline underline-offset-2">
              로그인으로 돌아가기
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <label className="block space-y-1">
              <span className={labelClass()}>가입한 이메일</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass()}
              />
            </label>
            <ErrorText>{error}</ErrorText>
            <button type="submit" disabled={pending} className={buttonClass('primary', 'md', 'w-full')}>
              {pending ? '전송 중…' : '재설정 메일 보내기'}
            </button>
            <Link to="/login" className="block text-center text-sm text-ink-soft underline decoration-hairline underline-offset-2">
              로그인으로 돌아가기
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
