import type { ReactNode } from 'react';

/** 폼 에러 메시지 공용 컴포넌트 — role="alert"로 스크린리더에 즉시 알림 */
export function ErrorText({ children, className = '' }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className={`text-sm text-rust-text ${className}`.trim()}>
      {children}
    </p>
  );
}
