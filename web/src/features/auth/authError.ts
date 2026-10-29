export const connectionErrorMessage =
  '인증 서버에 연결할 수 없습니다. 네트워크 연결과 web/.env의 VITE_SUPABASE_URL, Supabase 프로젝트 상태를 확인해주세요.';

export function authErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    if (error.code === 'invalid_credentials') return '이메일 또는 비밀번호를 확인해주세요.';
    if (error.code === 'email_not_confirmed') return '이메일 인증을 완료한 후 로그인해주세요.';
  }
  return connectionErrorMessage;
}

export async function withAuthTimeout<T>(request: Promise<T>, timeoutMs = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(connectionErrorMessage)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
