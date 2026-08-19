import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }

    setPending(true);
    // profiles 행은 auth.users INSERT 트리거(handle_new_user)가 자동으로 만든다.
    // name 은 raw_user_meta_data 로 넘겨야 트리거가 읽을 수 있다.
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    setPending(false);
    if (signUpError) {
      setError(signUpError.message);
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
        <h1 className="text-xl font-semibold text-slate-900">회원가입</h1>

        <label className="block space-y-1">
          <span className="text-sm text-slate-600">이름</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
          />
        </label>

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
          <span className="text-sm text-slate-600">비밀번호 (8자 이상)</span>
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
          {pending ? '처리 중…' : '가입하기'}
        </button>

        <p className="text-center text-sm text-slate-500">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="font-medium text-slate-900 underline">
            로그인
          </Link>
        </p>
      </form>
    </div>
  );
}
