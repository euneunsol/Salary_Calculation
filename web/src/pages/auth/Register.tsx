import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { isValidPassword, PASSWORD_REQUIREMENTS } from '../../features/auth/password';
import { buttonClass, inputClass, labelClass } from '../../components/ui/classNames';
import { ErrorText } from '../../components/ui/ErrorText';

export function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [confirmationRequired, setConfirmationRequired] = useState(true);
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
    // profiles 행은 auth.users INSERT 트리거(handle_new_user)가 자동으로 만든다.
    // name 은 raw_user_meta_data 로 넘겨야 트리거가 읽을 수 있다.
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      setConfirmationRequired(!data.session);
      setRegistered(true);
    } catch {
      setError('인증 서버에 연결하지 못했습니다. 네트워크 연결을 확인하고 다시 시도해주세요.');
    } finally {
      setPending(false);
    }
  }

  if (registered) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-shell px-4">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-hairline bg-paper p-6 shadow-sm">
          <h1 className="text-xl font-bold tracking-tight text-ink">{confirmationRequired ? '이메일을 확인해주세요' : '가입이 완료되었습니다'}</h1>
          <p className="text-sm text-ink-soft">
            {confirmationRequired
              ? `${email} 주소로 가입을 요청했습니다. 인증 메일이 도착하면 링크를 눌러주세요. 메일이 없다면 스팸함을 확인해주세요. 이미 가입한 주소라면 로그인 또는 비밀번호 찾기를 이용해주세요.`
              : '현재 이메일 인증 없이 가입이 완료되어 로그인된 상태입니다.'}
          </p>
          <Link to={confirmationRequired ? '/login' : '/'} className="block text-center text-sm font-medium text-brand-700 underline decoration-hairline underline-offset-2">
            {confirmationRequired ? '로그인으로 이동' : '시작하기'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-shell px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-hairline bg-paper p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold tracking-tight text-ink">회원가입</h1>

        <label className="block space-y-1">
          <span className={labelClass()}>이름</span>
          <input
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass()}
          />
        </label>

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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass()}
          />
          <span className="block text-xs text-ink-soft">{PASSWORD_REQUIREMENTS}</span>
        </label>

        <label className="block space-y-1">
          <span className={labelClass()}>비밀번호 확인</span>
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
          {pending ? '처리 중…' : '가입하기'}
        </button>

        <p className="text-center text-sm text-ink-soft">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="font-medium text-brand-700 underline decoration-hairline underline-offset-2">
            로그인
          </Link>
        </p>
      </form>
    </div>
  );
}
