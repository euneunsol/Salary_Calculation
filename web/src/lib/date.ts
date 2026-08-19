/**
 * 날짜 유틸 — 모든 날짜는 'YYYY-MM-DD' 문자열로 다룬다.
 *
 * 왜 Date 객체를 쓰지 않는가:
 * 브라우저 로컬 타임존에 따라 `new Date('2026-08-01')`이 7/31로 밀리는 문제가 있다.
 * 근무일·급여월은 KST 달력 날짜이지 시각이 아니므로, 문자열로만 계산하고
 * 내부 연산에서만 UTC 기준 Date를 잠깐 쓴다.
 */

/** 'YYYY-MM-DD' 형식인지 검사 */
export function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function assertISO(s: string): void {
  if (!isISODate(s)) throw new Error(`날짜 형식이 잘못되었습니다: ${s} (YYYY-MM-DD 필요)`);
}

/** 'YYYY-MM-DD' → UTC 자정 Date */
function toUTC(iso: string): Date {
  assertISO(iso);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** UTC Date → 'YYYY-MM-DD' */
function fromUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** n일 더하기 (음수 가능) */
export function addDays(iso: string, n: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

/** ISO 요일: 1=월 … 7=일 */
export function isoDayOfWeek(iso: string): number {
  const day = toUTC(iso).getUTCDay(); // 0=일
  return day === 0 ? 7 : day;
}

/** 두 날짜 비교: a<b → 음수, a===b → 0, a>b → 양수 */
export function compareDate(a: string, b: string): number {
  assertISO(a);
  assertISO(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: string, b: string): string {
  return compareDate(a, b) <= 0 ? a : b;
}

export function maxDate(a: string, b: string): string {
  return compareDate(a, b) >= 0 ? a : b;
}

/** iso 가 [from, to] 범위 안인가 (양끝 포함) */
export function isWithin(iso: string, from: string, to: string): boolean {
  return compareDate(iso, from) >= 0 && compareDate(iso, to) <= 0;
}

/**
 * 주의 시작일.
 * weekStartDay: 1=월 … 7=일 (stores.week_start_day)
 */
export function startOfWeek(iso: string, weekStartDay: number): string {
  if (weekStartDay < 1 || weekStartDay > 7) {
    throw new Error(`weekStartDay는 1~7이어야 합니다: ${weekStartDay}`);
  }
  const dow = isoDayOfWeek(iso);
  const diff = (dow - weekStartDay + 7) % 7;
  return addDays(iso, -diff);
}

/** 주의 종료일 (시작일 + 6) */
export function endOfWeek(iso: string, weekStartDay: number): string {
  return addDays(startOfWeek(iso, weekStartDay), 6);
}

/** 해당 월의 1일 */
export function startOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** 해당 월의 마지막 날 */
export function endOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0)); // month는 1-based → 다음 달 0일 = 이번 달 말일
  return fromUTC(d);
}

/** 'YYYY-MM-DD' → { year, month } */
export function monthOf(iso: string): { year: number; month: number } {
  assertISO(iso);
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

/**
 * [from, to] 구간과 겹치는 모든 주의 시작일 목록.
 * 급여 계산에서 "이 달에 걸친 주"를 나열할 때 쓴다.
 */
export function weekStartsBetween(from: string, to: string, weekStartDay: number): string[] {
  const result: string[] = [];
  let cursor = startOfWeek(from, weekStartDay);
  const last = startOfWeek(to, weekStartDay);
  while (compareDate(cursor, last) <= 0) {
    result.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return result;
}

/** 분 → "8시간 30분" 형태 */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/** 분 → 소수 시간 (예: 216 → 3.6) */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}
