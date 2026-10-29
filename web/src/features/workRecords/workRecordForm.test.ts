import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateWorkMinutes, expandWeeklyDates, validateWorkTime } from './workRecordForm';

test('일반 근무에서 휴게시간을 차감한다', () => {
  assert.equal(calculateWorkMinutes({ startTime: '09:00', endTime: '18:00', breakMinutes: 60, crossesMidnight: false }), 480);
});
test('자정을 넘기는 근무를 계산한다', () => {
  assert.equal(calculateWorkMinutes({ startTime: '22:00', endTime: '02:00', breakMinutes: 30, crossesMidnight: true }), 210);
});
test('음수와 18시간 초과 근무를 거부한다', () => {
  assert.ok(validateWorkTime({ startTime: '18:00', endTime: '09:00', breakMinutes: 0, crossesMidnight: false }));
  assert.ok(validateWorkTime({ startTime: '00:00', endTime: '19:00', breakMinutes: 0, crossesMidnight: false }));
});
test('휴게시간은 0분, 30분, 60분만 허용한다', () => {
  assert.ok(validateWorkTime({ startTime: '09:00', endTime: '18:00', breakMinutes: 15, crossesMidnight: false }));
  assert.equal(validateWorkTime({ startTime: '09:00', endTime: '18:00', breakMinutes: 0, crossesMidnight: false }), null);
});
test('기간 내 선택한 요일을 매주 반복한다', () => {
  assert.deepEqual(expandWeeklyDates('2026-08-24', '2026-09-06', [1, 3]), [
    '2026-08-24', '2026-08-26', '2026-08-31', '2026-09-02',
  ]);
});
test('종료일이 시작일보다 빠르거나 요일이 없으면 빈 배열이다', () => {
  assert.deepEqual(expandWeeklyDates('2026-09-01', '2026-08-01', [1]), []);
  assert.deepEqual(expandWeeklyDates('2026-08-01', '2026-09-01', []), []);
});
