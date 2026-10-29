import type { WorkRecord } from '../../types/database.types';

export function workRecordStatusLabel(record: Pick<WorkRecord, 'status' | 'manager_modified_at'>): string {
  if (record.status === 'APPROVED') return record.manager_modified_at ? '수정 완료' : '승인 완료';
  return { DRAFT: '임시저장', SUBMITTED: '승인 대기', REJECTED: '반려' }[record.status];
}
