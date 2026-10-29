export const WEEK_DAYS = [
  { value: 1, label: '월요일' }, { value: 2, label: '화요일' },
  { value: 3, label: '수요일' }, { value: 4, label: '목요일' },
  { value: 5, label: '금요일' }, { value: 6, label: '토요일' },
  { value: 7, label: '일요일' },
] as const;

export function validateStoreName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return '매장명을 입력해주세요.';
  if (trimmed.length > 50) return '매장명은 50자 이하로 입력해주세요.';
  return null;
}
