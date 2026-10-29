/**
 * 아직 구현하지 않은 화면들의 자리표시자.
 * 설계문서 §9 개발 순서의 몇 단계에 해당하는지 함께 표시해 둔다.
 * 각 단계를 구현할 때 이 파일에서 꺼내 개별 파일로 옮긴다.
 */

function Stub({ title, step, children }: { title: string; step: string; children?: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-hairline bg-paper p-8">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{step}</p>
      <h1 className="mt-1 text-lg font-semibold text-ink">{title}</h1>
      {children && <p className="mt-2 text-sm text-ink-soft">{children}</p>}
    </section>
  );
}

/* ---------------- 알바생 ---------------- */

export function EmployeeDashboard() {
  return (
    <Stub title="알바생 홈" step="개발 순서 10단계">
      이번 주 누적 근무시간, 주휴수당 충족 여부, 이번 달 예상 급여, 미승인 건수를 보여줍니다.
    </Stub>
  );
}

export function EmployeeCalendar() {
  return (
    <Stub title="근무 달력" step="개발 순서 10~11단계">
      월 단위 그리드에 공휴일과 근무기록 상태를 표시하고, 주별 누적시간을 오른쪽에 붙입니다.
    </Stub>
  );
}

export function EmployeePayroll() {
  return (
    <Stub title="내 급여" step="개발 순서 14단계">
      기본급·주휴수당·합계와 함께 주별 계산 근거를 펼쳐 볼 수 있게 합니다.
    </Stub>
  );
}

/* ---------------- 매니저 ---------------- */

export function ManagerStorePicker() {
  return (
    <Stub title="담당 매장 선택" step="개발 순서 12단계">
      담당 중인 매장이 여러 곳이면 여기서 고릅니다.
    </Stub>
  );
}

export function ManagerDashboard() {
  return (
    <Stub title="매장 대시보드" step="개발 순서 15단계">
      승인 대기 건수와 이번 달 매장 인건비를 보여줍니다.
    </Stub>
  );
}

export function ManagerEmployees() {
  return (
    <Stub title="직원 목록" step="개발 순서 12단계">
      담당 매장 직원의 근무시간·시급·급여를 확인합니다.
    </Stub>
  );
}

export function ManagerApprovals() {
  return (
    <Stub title="근무 승인" step="개발 순서 12단계">
      SUBMITTED 상태 기록을 직원별로 묶어 일괄 승인·반려합니다.
    </Stub>
  );
}

/* ---------------- 사장님 ---------------- */

export function OwnerDashboard() {
  return (
    <Stub title="사장님 홈" step="개발 순서 15단계">
      소유 매장 전체의 근무 현황과 인건비를 한눈에 봅니다.
    </Stub>
  );
}

export function OwnerStores() {
  return (
    <Stub title="매장 관리" step="개발 순서 6단계">
      매장을 만들고 참여 코드를 확인합니다.
    </Stub>
  );
}

export function OwnerMembers() {
  return (
    <Stub title="구성원·시급 관리" step="개발 순서 7~8단계">
      매니저를 배정하고 직원 시급을 설정합니다. 시급 변경은 set_wage() 로 이력을 남깁니다.
    </Stub>
  );
}

export function OwnerPayroll() {
  return (
    <Stub title="전체 급여" step="개발 순서 15단계">
      매장별·직원별 급여를 확인하고 확정합니다.
    </Stub>
  );
}

/* ---------------- 공통 ---------------- */

export function NotFound() {
  return (
    <Stub title="페이지를 찾을 수 없습니다" step="404">
      주소를 다시 확인해주세요.
    </Stub>
  );
}
