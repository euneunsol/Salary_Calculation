import assert from 'node:assert/strict';
import test from 'node:test';
import { minimumWageFor, validateWage } from './minimumWage';

test('적용 연도별 최저시급을 반환한다', () => {
  assert.equal(minimumWageFor('2025-12-31'), 10_030);
  assert.equal(minimumWageFor('2026-01-01'), 10_320);
  assert.equal(minimumWageFor('2027-01-01'), 10_700);
});

test('적용일의 최저시급 미만을 거부한다', () => {
  assert.ok(validateWage(10_319, '2026-08-23'));
  assert.equal(validateWage(10_320, '2026-08-23'), null);
});
