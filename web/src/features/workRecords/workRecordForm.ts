export interface WorkTimeInput {
  startTime: string;
  endTime: string;
  breakMinutes: number;
  crossesMidnight: boolean;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function calculateWorkMinutes(input: WorkTimeInput): number {
  let total = timeToMinutes(input.endTime) - timeToMinutes(input.startTime);
  if (input.crossesMidnight) total += 1440;
  return total - input.breakMinutes;
}

export function validateWorkTime(input: WorkTimeInput): string | null {
  if (!/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime)) {
    return '출근·퇴근 시간을 입력해주세요.';
  }
  if (![0, 30, 60].includes(input.breakMinutes)) {
    return '휴게시간은 0분, 30분, 60분만 선택해주세요.';
  }
  const minutes = calculateWorkMinutes(input);
  if (minutes <= 0) return '퇴근시간과 휴게시간을 확인해주세요.';
  if (minutes > 1080) return '실 근무시간은 하루 18시간을 초과할 수 없습니다.';
  return null;
}

/** 시작일~종료일(포함) 중 선택한 ISO 요일(1=월…7=일)에 해당하는 날짜를 만든다. */
export function expandWeeklyDates(
  from: string,
  to: string,
  weekdays: number[],
): string[] {
  if (from > to || weekdays.length === 0) return [];
  const selected = new Set(weekdays);
  const result: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const last = new Date(`${to}T00:00:00Z`);
  while (cursor <= last) {
    const jsDay = cursor.getUTCDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;
    if (selected.has(isoDay)) result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
