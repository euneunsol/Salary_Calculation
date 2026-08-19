import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setPending(false);
    if (signInError) {
      setError('이메일 또는 비밀번호를 확인해주세요.');
      return;
    }
    navigate('/', { replace: true });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
      >
        <h1 className="text-xl font-semibold text-slate-900">로그인</h1>

        <label className="block space-y-1">
          <span className="text-sm text-slate-600">이메일</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-slate-600">비밀번호</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-slate-900 py-2.5 font-medium text-white disabled:opacity-50"
        >
          {pending ? '로그인 중…' : '로그인'}
        </button>

        <p className="text-center text-sm text-slate-500">
          계정이 없으신가요?{' '}
          <Link to="/register" className="font-medium text-slate-900 underline">
            회원가입
          </Link>
        </p>
      </form>
    </div>
  );
}
