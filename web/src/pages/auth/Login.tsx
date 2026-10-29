import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { buttonClass, inputClass, labelClass } from '../../components/ui/classNames';
import { ErrorText } from '../../components/ui/ErrorText';
import wordmark from '../../assets/omamori-wordmark.png';
import { useAuth } from '../../features/auth/AuthProvider';
import { authErrorMessage, withAuthTimeout } from '../../features/auth/authError';

export function Login() {
  const navigate = useNavigate();
  const { initializationError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      const { error: signInError } = await withAuthTimeout(
        supabase.auth.signInWithPassword({ email, password }),
      );
      if (signInError) throw signInError;
      navigate('/', { replace: true });
    } catch (error: unknown) {
      setError(authErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-shell px-4">
      <img src={wordmark} alt="OMAMORI TEA HOUSE" className="h-20 w-auto" />
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-hairline bg-paper p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold tracking-tight text-ink">로그인</h1>

        <label className="block space-y-1">
          <span className={labelClass()}>이메일</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass()}
          />
        </label>

        <label className="block space-y-1">
          <span className={labelClass()}>비밀번호</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass()}
          />
        </label>

        <ErrorText>{error ?? initializationError}</ErrorText>

        <button type="submit" disabled={pending} className={buttonClass('primary', 'md', 'w-full')}>
          {pending ? '로그인 중…' : '로그인'}
        </button>

        <p className="text-center text-sm">
          <Link to="/forgot-password" className="font-medium text-ink-soft underline decoration-hairline underline-offset-2 hover:text-ink">
            비밀번호를 잊으셨나요?
          </Link>
        </p>

        <p className="text-center text-sm text-ink-soft">
          계정이 없으신가요?{' '}
          <Link to="/register" className="font-medium text-brand-700 underline decoration-hairline underline-offset-2">
            회원가입
          </Link>
        </p>
      </form>
    </div>
  );
}
