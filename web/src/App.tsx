import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AppLayout } from './components/AppLayout';
import { ProtectedRoute, RoleLanding, RoleRoute } from './components/RouteGuards';
import { AuthProvider } from './features/auth/AuthProvider';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { UpdatePassword } from './pages/auth/UpdatePassword';
import { Onboarding } from './pages/onboarding/Onboarding';
import { OwnerStores as OwnerStoresPage } from './pages/owner/OwnerStores';
import { OwnerMembers as OwnerMembersPage } from './pages/owner/OwnerMembers';
import { EmployeeCalendar as EmployeeCalendarPage } from './pages/employee/EmployeeCalendar';
import { EmployeePayroll as EmployeePayrollPage } from './pages/employee/EmployeePayroll';
import { EmployeeDashboard as EmployeeDashboardPage } from './pages/employee/EmployeeDashboard';
import { ManagerStorePicker as ManagerStorePickerPage } from './pages/manager/ManagerStorePicker';
import { ManagerApprovals as ManagerApprovalsPage } from './pages/manager/ManagerApprovals';
import { ManagerDashboard as ManagerDashboardPage } from './pages/manager/ManagerDashboard';
import { ManagerEmployees as ManagerEmployeesPage } from './pages/manager/ManagerEmployees';
import { ManagerPayroll as ManagerPayrollPage } from './pages/manager/ManagerPayroll';
import { OwnerWorkSchedule } from './pages/owner/OwnerWorkSchedule';
import { OwnerPayroll as OwnerPayrollPage } from './pages/owner/OwnerPayroll';
import { OwnerDashboard as OwnerDashboardPage } from './pages/owner/OwnerDashboard';
import {
  NotFound,
} from './pages/stubs';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* 공개 */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/update-password" element={<UpdatePassword />} />

          {/* 인증 필요 */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<RoleLanding />} />
              <Route path="onboarding" element={<Onboarding />} />

              {/* 알바생 — 사장님·매니저도 본인 근무는 여기서 본다 */}
              <Route path="me">
                <Route path="dashboard" element={<EmployeeDashboardPage />} />
                <Route path="calendar" element={<EmployeeCalendarPage />} />
                <Route path="payroll" element={<EmployeePayrollPage />} />
              </Route>

              {/* 매니저 — 사장님도 접근 가능 (화면 재사용) */}
              <Route element={<RoleRoute allow={['MANAGER', 'OWNER']} />}>
                <Route path="manage" element={<ManagerStorePickerPage />} />
                <Route path="manage/:storeId">
                  <Route path="dashboard" element={<ManagerDashboardPage />} />
                  <Route path="employees" element={<ManagerEmployeesPage />} />
                  <Route path="approvals" element={<ManagerApprovalsPage />} />
                  <Route path="payroll" element={<ManagerPayrollPage />} />
                </Route>
              </Route>

              {/* 사장님 전용 */}
              <Route element={<RoleRoute allow={['OWNER']} />}>
                <Route path="owner">
                  <Route path="dashboard" element={<OwnerDashboardPage />} />
                  <Route path="stores" element={<OwnerStoresPage />} />
                  <Route path="stores/:storeId/members" element={<OwnerMembersPage />} />
                  <Route path="payroll" element={<OwnerPayrollPage />} />
                  <Route path="schedule" element={<OwnerWorkSchedule />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
