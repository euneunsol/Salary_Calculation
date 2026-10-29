insert into public.holidays (holiday_date, name, type, is_public_holiday, source)
values
  ('2026-01-01', '신정', 'PUBLIC', true, 'KASI 2026 월력요항'),
  ('2026-02-16', '설날 연휴', 'PUBLIC', true, 'KASI 2026 월력요항'),
  ('2026-02-17', '설날', 'PUBLIC', true, 'KASI 2026 월력요항'),
  ('2026-02-18', '설날 연휴', 'PUBLIC', true, 'KASI 2026 월력요항'),
  ('2026-03-01', '삼일절', 'PUBLIC', true, 'KASI 2026 월력요항'),
  ('2026-03-02', '삼일절 대체공휴일', 'SUBSTITUTE', true, 'KASI 2026 월력요항'),
  ('2026-05-05', '어린이날', 'PUBLIC', true, 'KASI 2026 월력요항'),
  ('2026-05-24', '부처님오신날', 'PUBLIC', true, 'KASI 2026 월력요항'),
  ('2026-05-25', '부처님오신날 대체공휴일', 'SUBSTITUTE', true, 'KASI 2026 월력요항'),
  ('2026-06-03', '전국동시지방선거', 'TEMPORARY', true, 'KASI 2026 월력요항'),
  ('2026-06-06', '현충일', 'PUBLIC', true, 'KASI 2026 월력요항'),
  ('2026-08-15', '광복절', 'PUBLIC', true, 'KASI 2026 월력요항'),
  ('2026-08-17', '광복절 대체공휴일', 'SUBSTITUTE', true, 'KASI 2026 월력요항'),
  ('2026-09-24', '추석 연휴', 'PUBLIC', true, 'KASI 2026 월력요항'),
  ('2026-09-25', '추석', 'PUBLIC', true, 'KASI 2026 월력요항'),
  ('2026-09-26', '추석 연휴', 'PUBLIC', true, 'KASI 2026 월력요항'),
  ('2026-10-03', '개천절', 'PUBLIC', true, 'KASI 2026 월력요항'),
  ('2026-10-05', '개천절 대체공휴일', 'SUBSTITUTE', true, 'KASI 2026 월력요항'),
  ('2026-10-09', '한글날', 'PUBLIC', true, 'KASI 2026 월력요항'),
  ('2026-12-25', '성탄절', 'PUBLIC', true, 'KASI 2026 월력요항')
on conflict (holiday_date) do update
set name = excluded.name,
    type = excluded.type,
    is_public_holiday = excluded.is_public_holiday,
    source = excluded.source,
    synced_at = now();

