import assert from 'node:assert/strict';
import test from 'node:test';
import { workRecordStatusLabel } from './workRecordStatus';

test('승인 후 매니저 수정 여부를 표시하며 급여 집계 상태를 유지한다', () => {
  assert.equal(workRecordStatusLabel({ status: 'APPROVED' }), '승인 완료');
  assert.equal(workRecordStatusLabel({ status: 'APPROVED', manager_modified_at: null }), '승인 완료');
  assert.equal(workRecordStatusLabel({ status: 'APPROVED', manager_modified_at: '2026-10-01T00:00:00Z' }), '수정 완료');
});
test('승인되지 않은 기록은 수정 이력보다 검토 상태를 우선한다', () => {
  assert.equal(workRecordStatusLabel({ status: 'SUBMITTED', manager_modified_at: '2026-10-01T00:00:00Z' }), '승인 대기');
  assert.equal(workRecordStatusLabel({ status: 'REJECTED' }), '반려');
  assert.equal(workRecordStatusLabel({ status: 'DRAFT' }), '임시저장');
});
