import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AppLayout } from './components/AppLayout';
import { ProtectedRoute, RoleLanding, RoleRoute } from './components/RouteGuards';
import { AuthProvider } from './features/auth/AuthProvider';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import {
  EmployeeCalendar,
  EmployeeDashboard,
  EmployeePayroll,
  ManagerApprovals,
  ManagerDashboard,
  ManagerEmployees,
  ManagerStorePicker,
  NotFound,
  OwnerDashboard,
  OwnerMembers,
  OwnerPayroll,
  OwnerStores,
} from './pages/stubs';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* 공개 */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* 인증 필요 */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<RoleLanding />} />

              {/* 알바생 — 사장님·매니저도 본인 근무는 여기서 본다 */}
              <Route path="me">
                <Route path="dashboard" element={<EmployeeDashboard />} />
                <Route path="calendar" element={<EmployeeCalendar />} />
                <Route path="payroll" element={<EmployeePayroll />} />
              </Route>

              {/* 매니저 — 사장님도 접근 가능 (화면 재사용) */}
              <Route element={<RoleRoute allow={['MANAGER', 'OWNER']} />}>
                <Route path="manage" element={<ManagerStorePicker />} />
                <Route path="manage/:storeId">
                  <Route path="dashboard" element={<ManagerDashboard />} />
                  <Route path="employees" element={<ManagerEmployees />} />
                  <Route path="approvals" element={<ManagerApprovals />} />
                </Route>
              </Route>

              {/* 사장님 전용 */}
              <Route element={<RoleRoute allow={['OWNER']} />}>
                <Route path="owner">
                  <Route path="dashboard" element={<OwnerDashboard />} />
                  <Route path="stores" element={<OwnerStores />} />
                  <Route path="stores/:storeId/members" element={<OwnerMembers />} />
                  <Route path="payroll" element={<OwnerPayroll />} />
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
