-- 기존 제약은 2025년 최저시급(10,030원)을 모든 기간에 고정 적용했다.
-- 적용 시작일 기준으로 고시된 연도별 최저시급을 검증한다.
alter table public.wage_history
  drop constraint if exists wage_history_hourly_wage_check;

alter table public.wage_history
  add constraint wage_history_minimum_wage_check check (
    hourly_wage >= case
      when effective_from >= date '2027-01-01' then 10700
      when effective_from >= date '2026-01-01' then 10320
      else 10030
    end
  );

