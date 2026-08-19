/**
 * DB 타입 정의.
 *
 * Supabase 프로젝트를 만들고 마이그레이션을 적용한 뒤에는 아래 명령으로 자동 생성하는 것을 권장한다.
 *   npx supabase gen types typescript --project-id <PROJECT_ID> > src/types/database.types.ts
 *
 * 지금은 supabase/migrations/0001_init.sql 을 기준으로 손으로 작성해 둔 버전이다.
 */

export type MemberRole = 'MANAGER' | 'EMPLOYEE';
export type MemberStatus = 'ACTIVE' | 'INACTIVE';
export type WorkStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type PayrollStatus = 'CALCULATED' | 'CONFIRMED' | 'PAID';
export type HolidayType = 'PUBLIC' | 'SUBSTITUTE' | 'TEMPORARY';

/** 사장님까지 포함한 화면상의 역할 */
export type AppRole = 'OWNER' | MemberRole;

export interface Profile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  name: string;
  owner_id: string;
  address: string | null;
  /** 1=월 … 7=일 */
  week_start_day: number;
  join_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StoreMember {
  id: string;
  store_id: string;
  user_id: string;
  role: MemberRole;
  status: MemberStatus;
  joined_at: string;
  left_at: string | null;
  created_at: string;
}

export interface WageHistory {
  id: string;
  store_member_id: string;
  hourly_wage: number;
  effective_from: string;
  effective_to: string | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
}

export interface WorkRecord {
  id: string;
  store_member_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  break_minutes: number;
  work_minutes: number;
  status: WorkStatus;
  memo: string | null;
  reject_reason: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeeklySummary {
  id: string;
  store_member_id: string;
  week_start: string;
  week_end: string;
  work_minutes: number;
  is_eligible: boolean;
  allowance_minutes: number;
  calculated_at: string;
}

export interface WageBreakdownEntry {
  from: string;
  to: string;
  wage: number;
  minutes: number;
  pay: number;
}

export interface Payroll {
  id: string;
  store_member_id: string;
  year: number;
  month: number;
  work_minutes: number;
  allowance_minutes: number;
  base_pay: number;
  allowance_pay: number;
  total_pay: number;
  wage_breakdown: WageBreakdownEntry[];
  status: PayrollStatus;
  calculated_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

export interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  type: HolidayType;
  is_public_holiday: boolean;
  source: string | null;
  synced_at: string;
}

type TableDef<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
};

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<Profile>;
      stores: TableDef<Store>;
      store_members: TableDef<StoreMember>;
      wage_history: TableDef<WageHistory>;
      work_records: TableDef<WorkRecord>;
      weekly_summaries: TableDef<WeeklySummary>;
      payrolls: TableDef<Payroll>;
      holidays: TableDef<Holiday>;
    };
    Views: Record<string, never>;
    Functions: {
      set_wage: {
        Args: { p_member_id: string; p_wage: number; p_from: string; p_memo?: string };
        Returns: string;
      };
      wage_at: {
        Args: { p_member_id: string; p_date: string };
        Returns: number;
      };
    };
    Enums: {
      member_role: MemberRole;
      member_status: MemberStatus;
      work_status: WorkStatus;
      payroll_status: PayrollStatus;
      holiday_type: HolidayType;
    };
  };
}
