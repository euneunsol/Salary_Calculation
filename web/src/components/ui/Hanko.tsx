/**
 * 한코(印) 결재 스탬프 — "승인"을 실제 도장을 찍는 행위로 표현한다.
 * 필터(HankoFilterDefs)는 앱 루트에서 한 번만 mount하고, 스탬프는 그 필터를 참조만 한다.
 */

export function HankoFilterDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <filter id="hanko-rough" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.4" />
      </filter>
    </svg>
  );
}

export function HankoStamp({ label = '승인', size = 40 }: { label?: string; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" width={size} height={size} className="absolute inset-0 -rotate-6">
        <circle cx="24" cy="24" r="19" fill="none" stroke="var(--color-stamp)" strokeWidth="3" filter="url(#hanko-rough)" opacity="0.92" />
      </svg>
      <span
        className="relative font-bold text-stamp"
        style={{ fontFamily: 'var(--font-wordmark)', fontSize: Math.max(9, size * 0.26) }}
      >
        {label}
      </span>
    </span>
  );
}
