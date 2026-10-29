/**
 * 급여 계산 단위 테스트
 * 실행: npm test   (내부적으로 tsx --test)
 *
 * 설계문서 §5.4 경계 케이스 표를 그대로 테스트로 옮겼다.
 * 2026년 8월 기준: 8/1(토), 8/3(월), 8/12(수), 8/31(월)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWANCE_CAP_MINUTES,
  ELIGIBLE_THRESHOLD_MINUTES,
  allowanceMinutesFor,
  calculatePayroll,
  minutesUntilEligible,
  payFor,
  wageAt,
  type PayrollInput,
  type WorkRecordInput,
} from './payrollCalc';

import {
  addDays,
  compareDate,
  endOfMonth,
  endOfWeek,
  isoDayOfWeek,
  startOfWeek,
  weekStartsBetween,
} from '../../lib/date';

const WAGE_2026 = 10030; // 2026년 최저시급

/** 하루 h시간 근무 기록 만들기 */
function rec(workDate: string, hours: number): WorkRecordInput {
  return { workDate, workMinutes: Math.round(hours * 60) };
}

/** 연속 날짜에 같은 시간씩 근무 */
function recRange(startDate: string, days: number, hours: number): WorkRecordInput[] {
  return Array.from({ length: days }, (_, i) => rec(addDays(startDate, i), hours));
}

function baseInput(overrides: Partial<PayrollInput> = {}): PayrollInput {
  return {
    year: 2026,
    month: 8,
    weekStartDay: 1, // 월요일 시작
    records: [],
    wages: [{ hourlyWage: WAGE_2026, effectiveFrom: '2026-01-01', effectiveTo: null }],
    membership: { joinedAt: '2026-01-01', leftAt: null },
    ...overrides,
  };
}

// ===========================================================================
describe('date 유틸', () => {
  it('ISO 요일: 1=월 … 7=일', () => {
    assert.equal(isoDayOfWeek('2026-08-03'), 1); // 월
    assert.equal(isoDayOfWeek('2026-08-01'), 6); // 토
    assert.equal(isoDayOfWeek('2026-08-02'), 7); // 일
  });

  it('월요일 시작 주 경계', () => {
    assert.equal(startOfWeek('2026-08-01', 1), '2026-07-27');
    assert.equal(endOfWeek('2026-08-01', 1), '2026-08-02');
  });

  it('일요일 시작 주 경계 (매장 설정이 다른 경우)', () => {
    assert.equal(startOfWeek('2026-08-01', 7), '2026-07-26');
    assert.equal(endOfWeek('2026-08-01', 7), '2026-08-01');
  });

  it('월말 계산 (윤년 포함)', () => {
    assert.equal(endOfMonth(2026, 8), '2026-08-31');
    assert.equal(endOfMonth(2026, 2), '2026-02-28');
    assert.equal(endOfMonth(2028, 2), '2028-02-29');
  });

  it('구간에 걸친 주 나열', () => {
    const weeks = weekStartsBetween('2026-08-01', '2026-08-31', 1);
    assert.deepEqual(weeks, [
      '2026-07-27',
      '2026-08-03',
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
    ]);
  });

  it('날짜 경계에서 타임존 밀림이 없다', () => {
    // 로컬 타임존이 UTC-x 여도 8/1이 7/31로 밀리면 안 된다
    assert.equal(addDays('2026-08-01', 0), '2026-08-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  });
});

// ===========================================================================
describe('주휴 환산 규칙 (§5.2)', () => {
  it('케이스 1 — 주 14시간 59분(899분)은 미충족', () => {
    assert.equal(allowanceMinutesFor(899), 0);
    assert.equal(ELIGIBLE_THRESHOLD_MINUTES, 900);
  });

  it('케이스 2 — 주 정확히 15시간(900분)은 3시간 환산', () => {
    assert.equal(allowanceMinutesFor(900), 180);
  });

  it('주 18시간 → 3.6시간(216분) 환산', () => {
    assert.equal(allowanceMinutesFor(18 * 60), 216);
  });

  it('주 26.5시간 → 5.3시간(318분) 환산', () => {
    assert.equal(allowanceMinutesFor(26.5 * 60), 318);
  });

  it('주 40시간 → 8시간(480분), 상한과 정확히 일치', () => {
    assert.equal(allowanceMinutesFor(40 * 60), 480);
  });

  it('케이스 3 — 주 45시간이어도 8시간 상한 (9시간 아님)', () => {
    assert.equal(allowanceMinutesFor(45 * 60), ALLOWANCE_CAP_MINUTES);
    assert.equal(allowanceMinutesFor(45 * 60), 480);
  });

  it('법정 계산식과 일치: 시급 × (주시간÷40) × 8', () => {
    for (const weekHours of [15, 20, 25, 30, 35, 40]) {
      const byLaw = WAGE_2026 * (weekHours / 40) * 8;
      const byImpl = payFor(allowanceMinutesFor(weekHours * 60), WAGE_2026);
      assert.ok(
        Math.abs(byLaw - byImpl) <= 1,
        `주 ${weekHours}시간: 법정 ${byLaw} vs 구현 ${byImpl}`,
      );
    }
  });

  it('주 20시간 주휴수당은 40,120원 (외부 자료 대조)', () => {
    assert.equal(payFor(allowanceMinutesFor(20 * 60), WAGE_2026), 40120);
  });

  it('주 15시간 주휴수당은 30,090원 (외부 자료 대조)', () => {
    assert.equal(payFor(allowanceMinutesFor(15 * 60), WAGE_2026), 30090);
  });

  it('주휴 충족까지 남은 시간 안내', () => {
    assert.equal(minutesUntilEligible(12 * 60), 180);
    assert.equal(minutesUntilEligible(20 * 60), 0);
  });
});

// ===========================================================================
describe('시급 이력 적용 (§5.4 케이스 4)', () => {
  const wages = [
    { hourlyWage: 10030, effectiveFrom: '2026-01-01', effectiveTo: '2026-08-14' },
    { hourlyWage: 11000, effectiveFrom: '2026-08-15', effectiveTo: null },
  ];

  it('날짜별 유효 시급을 찾는다', () => {
    assert.equal(wageAt(wages, '2026-08-10'), 10030);
    assert.equal(wageAt(wages, '2026-08-14'), 10030); // 경계 포함
    assert.equal(wageAt(wages, '2026-08-15'), 11000); // 경계 포함
    assert.equal(wageAt(wages, '2026-08-20'), 11000);
  });

  it('시급 이력이 없는 날짜는 null', () => {
    assert.equal(wageAt(wages, '2025-12-31'), null);
  });

  it('월 중 시급 변경 시 구간별로 나눠 계산한다', () => {
    const result = calculatePayroll(
      baseInput({
        wages,
        // 8/10(월)~8/14(금) 5일 × 4시간 = 20시간 @10,030
        // 8/17(월)~8/21(금) 5일 × 4시간 = 20시간 @11,000
        records: [...recRange('2026-08-10', 5, 4), ...recRange('2026-08-17', 5, 4)],
      }),
    );

    assert.equal(result.wageBreakdown.length, 2);
    assert.equal(result.wageBreakdown[0].wage, 10030);
    assert.equal(result.wageBreakdown[0].minutes, 1200);
    assert.equal(result.wageBreakdown[0].pay, 200600); // 20h × 10,030
    assert.equal(result.wageBreakdown[1].wage, 11000);
    assert.equal(result.wageBreakdown[1].minutes, 1200);
    assert.equal(result.wageBreakdown[1].pay, 220000); // 20h × 11,000
    assert.equal(result.basePay, 420600);
    assert.equal(result.unpricedMinutes, 0);
  });

  it('주휴수당은 그 주의 마지막 근무일 시급을 쓴다 (규칙 C)', () => {
    // 8/10(월)~8/16(일) 주에 8/13(목) 8시간, 8/16(일) 8시간 → 16시간
    // 마지막 근무일 8/16 → 11,000원 적용
    const result = calculatePayroll(
      baseInput({
        wages,
        records: [rec('2026-08-13', 8), rec('2026-08-16', 8)],
      }),
    );
    const week = result.weeks.find((w) => w.weekStart === '2026-08-10');
    assert.ok(week);
    assert.equal(week.workMinutes, 960);
    assert.equal(week.appliedWage, 11000);
    assert.equal(week.allowanceMinutes, 192); // 960/5
    assert.equal(week.allowancePay, payFor(192, 11000)); // 35,200
  });
});

// ===========================================================================
// 버그 수정: 주휴수당은 월 경계로 시간을 자르지 않고 "전체 달력 주"로 계산하며,
// 그 주가 끝나는 날짜가 속한 달에만 전액 귀속된다(중복 귀속 없음).
// 기본급(실 근무시간)은 이 규칙과 무관하게 항상 해당 월 범위로만 계산된다.
describe('월 경계 처리 — 전체 주 단위로 계산하고 끝나는 달에 귀속', () => {
  it('케이스 1 — 월 안에 완전히 포함된 주는 이전과 동일하게 계산된다 (회귀 없음)', () => {
    const result = calculatePayroll(baseInput({ records: recRange('2026-08-10', 5, 4) })); // 8/10~14, 20시간
    const week = result.weeks.find((w) => w.weekStart === '2026-08-10');
    assert.ok(week);
    assert.equal(week.weekEnd, '2026-08-16');
    assert.equal(week.workMinutes, 20 * 60);
    assert.equal(week.allowanceMinutes, 240); // 20 ÷ 5 = 4h
  });

  it('케이스 2 — 7/29~8/2에 걸친 주 30시간 근무는 8월에 정확히 6시간(360분) 주휴수당으로 계산된다', () => {
    const records = [
      ...recRange('2026-07-29', 3, 6), // 7/29~7/31, 3일×6시간 = 18시간 (7월분)
      ...recRange('2026-08-01', 2, 6), // 8/1~8/2, 2일×6시간 = 12시간 (8월분)
    ]; // 이 주(7/27~8/2) 총 근무시간 = 30시간
    const august = calculatePayroll(baseInput({ month: 8, records }));
    const week = august.weeks.find((w) => w.weekStart === '2026-07-27');
    assert.ok(week);
    assert.equal(week.workMinutes, 30 * 60);
    assert.equal(week.isEligible, true);
    assert.equal(week.allowanceMinutes, 360); // 기존 공식 그대로: 30 ÷ 5 = 6시간
    assert.equal(august.allowanceMinutes, 360);

    // 이 주는 8월에 끝나므로 8월에 전액 귀속되고, 7월 계산에는 나타나지 않는다(중복 귀속 없음).
    const july = calculatePayroll(baseInput({ month: 7, records }));
    assert.equal(july.weeks.find((w) => w.weekStart === '2026-07-27'), undefined);
    assert.equal(july.allowanceMinutes, 0);
  });

  it('케이스 3 — 경계 주 계산에 쓰인 이전 달 근무시간이 이번 달 기본급에 다시 더해지지 않는다', () => {
    const records = [
      ...recRange('2026-07-29', 3, 6), // 7/29~7/31 (18시간) — 8월 주휴 계산의 맥락으로만 쓰여야 함
      ...recRange('2026-08-01', 2, 6), // 8/1~8/2 (12시간) — 8월 정규 근무
      ...recRange('2026-08-04', 3, 5), // 8/4~8/6 (15시간) — 8월 정규 근무(별도 주)
    ];
    const august = calculatePayroll(baseInput({ month: 8, records }));
    // 기본급은 8월 날짜(8/1~8/6)만 합산 = 12+15 = 27시간. 7월분 18시간은 포함되지 않는다.
    assert.equal(august.workMinutes, 27 * 60);
    assert.equal(august.basePay, payFor(27 * 60, WAGE_2026));

    const july = calculatePayroll(baseInput({ month: 7, records }));
    // 7월 기본급은 7월 날짜(7/29~7/31)만 = 18시간. 8월 근무가 섞여 들어오지 않는다.
    assert.equal(july.workMinutes, 18 * 60);
    assert.equal(july.basePay, payFor(18 * 60, WAGE_2026));
  });

  it('케이스 4 — 월말에 시작해 다음 달로 이어지는 주는 잘리지 않고 다음 달에 전액 귀속된다', () => {
    const records = [rec('2026-08-31', 8), rec('2026-09-01', 8), rec('2026-09-02', 8)]; // 24시간

    const august = calculatePayroll(baseInput({ month: 8, records }));
    assert.equal(august.weeks.find((w) => w.weekStart === '2026-08-31'), undefined);
    assert.equal(august.allowanceMinutes, 0);

    const september = calculatePayroll(baseInput({ year: 2026, month: 9, records }));
    const week = september.weeks.find((w) => w.weekStart === '2026-08-31');
    assert.ok(week);
    assert.equal(week.weekEnd, '2026-09-06');
    assert.equal(week.workMinutes, 24 * 60);
    assert.equal(week.allowanceMinutes, 288); // 24 ÷ 5 = 4.8h = 288분
  });

  it('케이스 5 — 12월→1월 연도 경계도 하나의 연속된 주로 취급한다', () => {
    const weekStart = startOfWeek('2026-01-01', 1);
    const records = recRange(weekStart, 7, 3); // 그 주 7일 모두 3시간씩 = 21시간
    // 기본 membership(입사일 2026-01-01)이 연도 경계 주의 12월 쪽을 잘라내지 않도록 입사일을 앞당긴다.
    const membership = { joinedAt: '2020-01-01', leftAt: null };
    const january = calculatePayroll(baseInput({ year: 2026, month: 1, records, membership }));
    const week = january.weeks.find((w) => w.weekStart === weekStart);
    assert.ok(week);
    assert.equal(week.workMinutes, 21 * 60);
    assert.equal(week.allowanceMinutes, 252); // 21 ÷ 5 = 4.2h = 252분

    // 이 주가 실제로 2025년 12월에서 시작했다면, 12월 계산에는 나타나지 않아야 한다.
    if (compareDate(weekStart, '2026-01-01') < 0) {
      const december = calculatePayroll(baseInput({ year: 2025, month: 12, records, membership }));
      assert.equal(december.weeks.find((w) => w.weekStart === weekStart), undefined);
      assert.equal(december.allowanceMinutes, 0);
    }
  });

  it('케이스 6 — 한 직원의 근무기록이 다른 직원의 주간 합계에 영향을 주지 않는다', () => {
    const employeeARecords = [...recRange('2026-07-29', 3, 6), ...recRange('2026-08-01', 2, 6)]; // 30시간
    const employeeBRecords = [rec('2026-08-01', 2)]; // 2시간만

    const resultA = calculatePayroll(baseInput({ month: 8, records: employeeARecords }));
    const resultB = calculatePayroll(baseInput({ month: 8, records: employeeBRecords }));

    const weekA = resultA.weeks.find((w) => w.weekStart === '2026-07-27');
    assert.equal(weekA?.workMinutes, 30 * 60);
    assert.equal(weekA?.allowanceMinutes, 360);

    const weekB = resultB.weeks.find((w) => w.weekStart === '2026-07-27');
    assert.equal(weekB?.workMinutes, 2 * 60);
    assert.equal(weekB?.allowanceMinutes, 0);
    assert.equal(resultB.allowanceMinutes, 0);
  });
});

// ===========================================================================
describe('입사·퇴사 처리 — 규칙 B (§5.3.1)', () => {
  it('설계문서 예시: 8/12(수) 퇴사, 그 주 17시간 → 3.4시간 환산', () => {
    const result = calculatePayroll(
      baseInput({
        membership: { joinedAt: '2026-01-01', leftAt: '2026-08-12' },
        records: [
          rec('2026-08-10', 6), // 월
          rec('2026-08-11', 6), // 화
          rec('2026-08-12', 5), // 수 (퇴사일)
        ],
      }),
    );

    const week = result.weeks.find((w) => w.weekStart === '2026-08-10');
    assert.ok(week);
    assert.equal(week.rangeFrom, '2026-08-10');
    assert.equal(week.rangeTo, '2026-08-12'); // 퇴사일까지만
    assert.equal(week.workMinutes, 17 * 60);
    assert.equal(week.isEligible, true);
    assert.equal(week.allowanceMinutes, 204); // 17 ÷ 5 = 3.4h
  });

  it('퇴사 이후 날짜의 기록은 집계되지 않는다', () => {
    const result = calculatePayroll(
      baseInput({
        membership: { joinedAt: '2026-01-01', leftAt: '2026-08-12' },
        records: [
          rec('2026-08-10', 6),
          rec('2026-08-11', 6),
          rec('2026-08-12', 5),
          rec('2026-08-20', 8), // 퇴사 후 — 무시되어야 함
        ],
      }),
    );
    assert.equal(result.workMinutes, 17 * 60);
    assert.equal(result.weeks.every((w) => w.rangeTo <= '2026-08-12'), true);
  });

  it('퇴사 주가 15시간 미달이면 주휴수당 없음', () => {
    const result = calculatePayroll(
      baseInput({
        membership: { joinedAt: '2026-01-01', leftAt: '2026-08-11' },
        records: [rec('2026-08-10', 6), rec('2026-08-11', 6)], // 12시간
      }),
    );
    const week = result.weeks.find((w) => w.weekStart === '2026-08-10');
    assert.equal(week?.workMinutes, 12 * 60);
    assert.equal(week?.isEligible, false);
    assert.equal(week?.allowanceMinutes, 0);
  });

  it('케이스 7 — 입사 첫 주도 대칭적으로 잘린다', () => {
    const result = calculatePayroll(
      baseInput({
        membership: { joinedAt: '2026-08-05', leftAt: null }, // 8/5(수) 입사
        records: [
          rec('2026-08-03', 8), // 입사 전 — 무시
          rec('2026-08-05', 6),
          rec('2026-08-06', 6),
          rec('2026-08-07', 6),
        ],
      }),
    );
    const week = result.weeks.find((w) => w.weekStart === '2026-08-03');
    assert.ok(week);
    assert.equal(week.rangeFrom, '2026-08-05');
    assert.equal(week.workMinutes, 18 * 60);
    assert.equal(week.allowanceMinutes, 216);
    assert.equal(result.workMinutes, 18 * 60);
  });

  it('규칙 A×B 충돌 — 7/28 퇴사자의 7/27~8/2 주는 8월이 아니라 7월에 귀속된다', () => {
    // 8월 급여가 아예 없는 사람에게 8월 주휴수당만 뜨는 상황을 막는다
    const records = [rec('2026-07-27', 9), rec('2026-07-28', 9)]; // 18시간
    const membership = { joinedAt: '2026-01-01', leftAt: '2026-07-28' };

    const august = calculatePayroll(baseInput({ month: 8, records, membership }));
    assert.equal(august.weeks.length, 0);
    assert.equal(august.totalPay, 0);

    const july = calculatePayroll(baseInput({ month: 7, records, membership }));
    const week = july.weeks.find((w) => w.weekStart === '2026-07-27');
    assert.ok(week);
    assert.equal(week.rangeTo, '2026-07-28');
    assert.equal(week.belongsToMonth, 7);
    assert.equal(week.countedInThisMonth, true);
    assert.equal(july.allowanceMinutes, 216); // 18 ÷ 5
  });

  it('재직 기간과 전혀 겹치지 않는 달은 0원', () => {
    const result = calculatePayroll(
      baseInput({
        membership: { joinedAt: '2026-09-01', leftAt: null },
        records: [rec('2026-08-10', 8)],
      }),
    );
    assert.equal(result.totalPay, 0);
    assert.equal(result.workMinutes, 0);
    assert.equal(result.weeks.length, 0);
  });
});

// ===========================================================================
describe('금액·반올림 (§5.4 케이스 9)', () => {
  it('3.6시간 × 10,030원 = 36,108원', () => {
    assert.equal(payFor(216, 10030), 36108);
  });

  it('원 단위 미만은 절사한다', () => {
    // 1분 × 10,030원/시간 = 167.1666… → 167원
    assert.equal(payFor(1, 10030), 167);
  });

  it('전체 합계 = 기본급 + 주휴수당', () => {
    const result = calculatePayroll(
      baseInput({
        records: recRange('2026-08-03', 5, 5), // 8/3~8/7, 25시간
      }),
    );
    assert.equal(result.workMinutes, 1500);
    assert.equal(result.basePay, payFor(1500, WAGE_2026)); // 250,750
    assert.equal(result.allowanceMinutes, 300); // 25 ÷ 5 = 5h
    assert.equal(result.allowancePay, payFor(300, WAGE_2026)); // 50,150
    assert.equal(result.totalPay, result.basePay + result.allowancePay);
    assert.equal(result.totalPay, 300900);
  });

  it('시급 정보가 없는 근무는 unpricedMinutes 로 드러난다', () => {
    const result = calculatePayroll(
      baseInput({
        wages: [{ hourlyWage: WAGE_2026, effectiveFrom: '2026-08-15', effectiveTo: null }],
        records: [rec('2026-08-05', 8)], // 시급 이력 시작 전 근무
      }),
    );
    assert.equal(result.workMinutes, 480);
    assert.equal(result.basePay, 0);
    assert.equal(result.unpricedMinutes, 480);
  });
});

// ===========================================================================
describe('매장 주 시작 요일 설정', () => {
  it('일요일 시작 매장은 주 경계가 달라진다', () => {
    const records = [rec('2026-08-01', 8), rec('2026-08-02', 8)]; // 토, 일

    const monStart = calculatePayroll(baseInput({ weekStartDay: 1, records }));
    const sunStart = calculatePayroll(baseInput({ weekStartDay: 7, records }));

    // 월요일 시작: 8/1(토)~8/2(일)은 7/27(월)에 시작하는 같은 주에 속함 → 16시간
    const monWeek = monStart.weeks.find((w) => w.weekStart === '2026-07-27');
    assert.equal(monWeek?.workMinutes, 960);

    // 일요일 시작: 8/1(토)은 7/26(일)에 시작하는 주에, 8/2(일)는 그다음 주에 속해 갈린다 → 각각 8시간
    const sunWeek1 = sunStart.weeks.find((w) => w.weekStart === '2026-07-26');
    const sunWeek2 = sunStart.weeks.find((w) => w.weekStart === '2026-08-02');
    assert.equal(sunWeek1?.workMinutes, 480);
    assert.equal(sunWeek2?.workMinutes, 480);
    // 둘 다 15시간 미달 → 주휴수당 0
    assert.equal(sunStart.allowanceMinutes, 0);
  });
});

// ===========================================================================
describe('멱등성', () => {
  it('같은 입력을 여러 번 계산해도 결과가 같다', () => {
    const input = baseInput({
      records: [...recRange('2026-07-29', 6, 4), ...recRange('2026-08-10', 5, 5)],
    });
    const a = calculatePayroll(input);
    const b = calculatePayroll(input);
    const c = calculatePayroll(structuredClone(input));
    assert.deepEqual(a, b);
    assert.deepEqual(a, c);
  });

  it('근무기록 순서가 바뀌어도 결과가 같다', () => {
    const records = [...recRange('2026-08-03', 5, 5)];
    const a = calculatePayroll(baseInput({ records }));
    const b = calculatePayroll(baseInput({ records: [...records].reverse() }));
    assert.equal(a.totalPay, b.totalPay);
    assert.equal(a.allowanceMinutes, b.allowanceMinutes);
  });
});
