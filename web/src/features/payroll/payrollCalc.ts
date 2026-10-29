/**
 * 급여 계산 코어 로직 (순수 함수 · 외부 의존 없음)
 *
 * 설계문서 §5 의 규칙을 그대로 구현한다.
 *
 *  규칙 A — 주휴수당은 달력상 한 주(예: 월~일) 전체의 실근무시간을 기준으로 계산한다.
 *           주가 두 달에 걸쳐도 시간을 자르지 않는다(예: 7/29~8/4 주는 7월분+8월분을 합산).
 *           그렇게 계산한 주휴수당은 "그 주가 끝나는 날짜가 속한 달"에만 전액 귀속시킨다 —
 *           즉 한 주는 정확히 한 달에서만 카운트되고, 두 달에 걸쳐 중복 지급되지 않는다.
 *           단, 기본급(실 근무시간·시급 구간)은 이 규칙과 무관하게 항상 해당 월 범위로만 계산한다.
 *  규칙 B — 입사 전 / 퇴사 후 날짜는 주 집계에서 제외한다.
 *           즉 주 범위를 [max(weekStart, joinedAt), min(weekEnd, leftAt)] 로 자른 뒤 판정한다.
 *           (규칙 A의 "끝나는 달" 판정도 이렇게 재직기간으로 자른 뒤의 끝 날짜로 한다.)
 *  규칙 C — 주휴수당에 적용하는 시급은 "그 주의 마지막 근무일 시급"이다.
 *
 *  주휴 환산   W < 15시간(900분)  → 0
 *              15 ≤ W ≤ 40시간    → W ÷ 5
 *              W > 40시간         → 8시간(480분) 상한
 *
 * 금액은 전부 원 단위 정수. 각 계산 단위마다 floor(절사)한다.
 *
 * 이 파일은 Edge Function(calculate-payroll)과 동일한 규칙을 구현하며,
 * 프론트에서는 "예상 급여" 미리보기에 쓴다. 확정 금액은 항상 서버 계산 결과를 따른다.
 */

import {
  addDays,
  compareDate,
  endOfMonth,
  isWithin,
  maxDate,
  minDate,
  startOfMonth,
  weekStartsBetween,
} from '../../lib/date';

/** 주휴수당 발생 최소 근무시간 (15시간) */
export const ELIGIBLE_THRESHOLD_MINUTES = 900;

/** 주휴 환산 상한 (8시간) — 주 40시간 초과분은 반영하지 않는다 */
export const ALLOWANCE_CAP_MINUTES = 480;

// ---------------------------------------------------------------------------
// 입력 타입
// ---------------------------------------------------------------------------

/** 승인된 근무기록 1건 */
export interface WorkRecordInput {
  /** 'YYYY-MM-DD' — 출근일 기준 */
  workDate: string;
  /** 실 근무 분 (휴게 제외) */
  workMinutes: number;
}

/** 시급 적용 구간 */
export interface WagePeriodInput {
  hourlyWage: number;
  effectiveFrom: string;
  /** null = 현재까지 적용 중 */
  effectiveTo: string | null;
}

/** 재직 기간 */
export interface MembershipInput {
  joinedAt: string;
  /** null = 재직 중 */
  leftAt: string | null;
}

export interface PayrollInput {
  year: number;
  month: number;
  /** 1=월 … 7=일 (stores.week_start_day) */
  weekStartDay: number;
  /**
   * APPROVED 상태 근무기록.
   * 월 경계에 걸친 주도 전체 주 단위로 계산해야 하므로(규칙 A),
   * 호출자는 대상 월의 앞뒤로 최대 6일까지의 근무기록도 포함해서 넘겨야 한다.
   */
  records: WorkRecordInput[];
  wages: WagePeriodInput[];
  membership: MembershipInput;
}

// ---------------------------------------------------------------------------
// 출력 타입
// ---------------------------------------------------------------------------

export interface WeekSummary {
  weekStart: string;
  weekEnd: string;
  /** 재직기간으로 자른 실제 집계 범위 (규칙 B) */
  rangeFrom: string;
  rangeTo: string;
  workMinutes: number;
  isEligible: boolean;
  allowanceMinutes: number;
  /** 규칙 C — 그 주의 마지막 근무일 시급. 근무가 없으면 null */
  appliedWage: number | null;
  allowancePay: number;
  /** 규칙 A — 이 주의 주휴수당이 귀속되는 달 */
  belongsToYear: number;
  belongsToMonth: number;
  /** 이번 계산 대상 월에 귀속되는가 */
  countedInThisMonth: boolean;
}

export interface WageBreakdownRow {
  from: string;
  to: string;
  wage: number;
  minutes: number;
  pay: number;
}

export interface PayrollResult {
  year: number;
  month: number;
  /** 당월 근무 분 합계 */
  workMinutes: number;
  /** 당월 귀속 주휴 환산 분 합계 */
  allowanceMinutes: number;
  basePay: number;
  allowancePay: number;
  totalPay: number;
  wageBreakdown: WageBreakdownRow[];
  weeks: WeekSummary[];
  /** 시급 정보가 없어 금액을 매기지 못한 근무 분 (데이터 누락 감지용) */
  unpricedMinutes: number;
}

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

/** 특정 날짜에 유효한 시급. 없으면 null */
export function wageAt(wages: WagePeriodInput[], date: string): number | null {
  for (const w of wages) {
    const to = w.effectiveTo ?? '9999-12-31';
    if (compareDate(date, w.effectiveFrom) >= 0 && compareDate(date, to) <= 0) {
      return w.hourlyWage;
    }
  }
  return null;
}

/** 근무 분 × 시급 → 원 (절사) */
export function payFor(minutes: number, hourlyWage: number): number {
  return Math.floor((minutes * hourlyWage) / 60);
}

/**
 * 주간 근무 분 → 주휴 환산 분.
 * 15시간 미만 0, 그 외 W÷5, 최대 8시간.
 */
export function allowanceMinutesFor(weekMinutes: number): number {
  if (weekMinutes < ELIGIBLE_THRESHOLD_MINUTES) return 0;
  return Math.min(Math.floor(weekMinutes / 5), ALLOWANCE_CAP_MINUTES);
}

/** 재직 기간으로 [from, to] 를 자른다. 유효 범위가 없으면 null (규칙 B) */
function clipToMembership(
  from: string,
  to: string,
  membership: MembershipInput,
): { from: string; to: string } | null {
  const lo = maxDate(from, membership.joinedAt);
  const hi = membership.leftAt ? minDate(to, membership.leftAt) : to;
  if (compareDate(lo, hi) > 0) return null;
  return { from: lo, to: hi };
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------

export function calculatePayroll(input: PayrollInput): PayrollResult {
  const { year, month, weekStartDay, records, wages, membership } = input;

  const monthStart = startOfMonth(year, month);
  const monthEnd = endOfMonth(year, month);

  // 날짜별 근무 분 합계 (하루 1건이지만 방어적으로 합산)
  const minutesByDate = new Map<string, number>();
  for (const r of records) {
    minutesByDate.set(r.workDate, (minutesByDate.get(r.workDate) ?? 0) + r.workMinutes);
  }

  const sumMinutes = (from: string, to: string): number => {
    let total = 0;
    for (const [date, minutes] of minutesByDate) {
      if (isWithin(date, from, to)) total += minutes;
    }
    return total;
  };

  // --- 1) 기본급: 당월 × 시급 구간별 ---------------------------------------
  const monthRange = clipToMembership(monthStart, monthEnd, membership);

  const wageBreakdown: WageBreakdownRow[] = [];
  let basePay = 0;
  let workMinutes = 0;

  if (monthRange) {
    workMinutes = sumMinutes(monthRange.from, monthRange.to);

    // 시급 구간을 시작일 순으로 정렬한 뒤 당월과 겹치는 부분만 잘라 낸다
    const sorted = [...wages].sort((a, b) => compareDate(a.effectiveFrom, b.effectiveFrom));
    for (const w of sorted) {
      const wTo = w.effectiveTo ?? monthRange.to;
      const from = maxDate(w.effectiveFrom, monthRange.from);
      const to = minDate(wTo, monthRange.to);
      if (compareDate(from, to) > 0) continue;

      const minutes = sumMinutes(from, to);
      if (minutes === 0) continue;

      const pay = payFor(minutes, w.hourlyWage);
      wageBreakdown.push({ from, to, wage: w.hourlyWage, minutes, pay });
      basePay += pay;
    }
  }

  const pricedMinutes = wageBreakdown.reduce((acc, row) => acc + row.minutes, 0);
  const unpricedMinutes = workMinutes - pricedMinutes;

  // --- 2) 주간 집계 + 주휴수당 ---------------------------------------------
  // 이 달과 겹치는 달력상의 주를 나열한다. 각 주의 실제 계산 범위는 재직기간으로만
  // 자르고(규칙 B), 월 경계로는 자르지 않는다 — 귀속 판정은 아래 루프에서 한다(규칙 A).
  const weekStarts = weekStartsBetween(monthStart, monthEnd, weekStartDay);

  const weeks: WeekSummary[] = [];
  let allowanceMinutes = 0;
  let allowancePay = 0;

  for (const weekStart of weekStarts) {
    const calendarWeekEnd = addDays(weekStart, 6);
    // 규칙 B만 적용한다 — 월 경계로는 자르지 않고, 재직 기간으로만 자른 "전체 주"를 구한다.
    const range = clipToMembership(weekStart, calendarWeekEnd, membership);
    if (!range) continue;

    // 규칙 A — 이 주(재직기간으로 자른 뒤)가 끝나는 날짜가 이번 달에 속할 때만
    // 이번 달 급여로 계산한다. 그렇지 않으면(다음 달에서 끝나면) 그 달의 계산에 맡기고 건너뛴다.
    if (!isWithin(range.to, monthStart, monthEnd)) continue;

    const weekMinutes = sumMinutes(range.from, range.to);
    const allowMin = allowanceMinutesFor(weekMinutes);

    // 규칙 C — 그 주(전체 주) 중 마지막 근무일의 시급
    let lastWorkedDate: string | null = null;
    for (const [date, minutes] of minutesByDate) {
      if (minutes > 0 && isWithin(date, range.from, range.to)) {
        if (!lastWorkedDate || compareDate(date, lastWorkedDate) > 0) lastWorkedDate = date;
      }
    }
    const appliedWage = lastWorkedDate ? wageAt(wages, lastWorkedDate) : null;

    const pay = appliedWage !== null ? payFor(allowMin, appliedWage) : 0;
    allowanceMinutes += allowMin;
    allowancePay += pay;

    weeks.push({
      weekStart,
      weekEnd: calendarWeekEnd,
      rangeFrom: range.from,
      rangeTo: range.to,
      workMinutes: weekMinutes,
      isEligible: weekMinutes >= ELIGIBLE_THRESHOLD_MINUTES,
      allowanceMinutes: allowMin,
      appliedWage,
      allowancePay: pay,
      belongsToYear: year,
      belongsToMonth: month,
      countedInThisMonth: true,
    });
  }

  return {
    year,
    month,
    workMinutes,
    allowanceMinutes,
    basePay,
    allowancePay,
    totalPay: basePay + allowancePay,
    wageBreakdown,
    weeks,
    unpricedMinutes,
  };
}

/**
 * 진행 중인 주의 안내 문구용 — 주휴수당까지 몇 분 남았는지.
 * 이미 충족했으면 0.
 */
export function minutesUntilEligible(weekMinutes: number): number {
  return Math.max(0, ELIGIBLE_THRESHOLD_MINUTES - weekMinutes);
}
