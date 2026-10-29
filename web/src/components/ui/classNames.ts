/**
 * 디자인 시스템 토큰 — 오마모리(OMAMORI TEA HOUSE) 브랜드 세계.
 * 방향: 한코 결재(印) — 다도·와비사비 절제 위에 승인을 "도장을 찍는 행위"로 그린다.
 * 색은 로직 없이 순수 className 조합만 담당한다.
 */

export type ButtonVariant = 'primary' | 'success' | 'danger' | 'dangerOutline' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const BUTTON_BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg text-center font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-50';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500',
  success: 'bg-brand-700 text-white hover:bg-brand-900 focus-visible:ring-brand-500',
  danger: 'bg-rust text-white hover:bg-rust-text focus-visible:ring-rust',
  dangerOutline: 'border border-rust/30 bg-rust-tint text-rust-text hover:bg-rust/15 focus-visible:ring-rust',
  outline: 'border border-hairline bg-paper-light text-ink hover:bg-paper focus-visible:ring-brand-500',
  ghost: 'text-ink-soft hover:bg-paper hover:text-ink focus-visible:ring-brand-500',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 py-1.5 text-xs',
  md: 'min-h-11 px-4 py-2.5 text-sm',
};

/** 버튼/버튼처럼 쓰이는 Link 공용 클래스 */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className = ''): string {
  return [BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className].filter(Boolean).join(' ');
}

/** 아이콘 하나만 담는 정사각형 버튼 (달력 이전/다음, 닫기 등). 44x44 터치 영역 확보 */
export function iconButtonClass(className = ''): string {
  return [
    'inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-hairline bg-paper-light text-ink-soft transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50',
    className,
  ].filter(Boolean).join(' ');
}

/** input / select / textarea 공용 클래스 — 포커스 링 포함 */
export function inputClass(className = ''): string {
  return [
    'w-full rounded-lg border border-hairline bg-paper-light px-3 py-2 text-sm text-ink transition-colors placeholder:text-ink-soft/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus:border-brand-500 disabled:bg-shell disabled:text-ink-soft',
    className,
  ].filter(Boolean).join(' ');
}

export function labelClass(className = ''): string {
  return ['text-sm text-ink-soft', className].filter(Boolean).join(' ');
}

export function cardClass(className = ''): string {
  return ['rounded-2xl border border-hairline bg-paper p-5 shadow-sm', className].filter(Boolean).join(' ');
}

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'dark';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-shell text-ink-soft',
  info: 'bg-celadon-tint text-celadon-text',
  success: 'bg-brand-50 text-brand-700',
  warning: 'bg-ochre-tint text-ochre-text',
  danger: 'bg-rust-tint text-rust-text',
  dark: 'bg-ink text-paper',
};

export function badgeClass(tone: BadgeTone, className = ''): string {
  return ['inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', BADGE_TONES[tone], className].filter(Boolean).join(' ');
}

/** 페이지 최상단 h1 */
export const pageTitleClass = 'text-xl font-bold tracking-tight text-ink sm:text-2xl';
/** 카드/섹션 h2 */
export const sectionTitleClass = 'text-base font-semibold text-ink';
/** 보조 설명 텍스트 */
export const mutedTextClass = 'text-sm text-ink-soft';
/** 상단 뒤로가기류 링크 */
export const backLinkClass = 'text-sm font-medium text-ink-soft underline decoration-hairline underline-offset-2 hover:text-ink';
