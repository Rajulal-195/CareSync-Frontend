import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { Spinner } from '@/components/ui/feedback';
import { HomeRedirect, RedirectIfAuthed, RequireAuth } from './guards';

// Pages are code-split: each role only downloads the screens it opens.
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const AppointmentsPage = lazy(() => import('@/pages/AppointmentsPage'));
const SchedulerPage = lazy(() => import('@/pages/SchedulerPage'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const DoctorsPage = lazy(() => import('@/pages/admin/DoctorsPage'));
const ReceptionistsPage = lazy(() => import('@/pages/admin/ReceptionistsPage'));
const DepartmentsPage = lazy(() => import('@/pages/admin/DepartmentsPage'));
const SchedulesPage = lazy(() => import('@/pages/admin/SchedulesPage'));
const ReceptionDashboard = lazy(() => import('@/pages/reception/ReceptionDashboard'));
const PatientsPage = lazy(() => import('@/pages/reception/PatientsPage'));
const DoctorDashboard = lazy(() => import('@/pages/doctor/DoctorDashboard'));
const DoctorAppointmentsPage = lazy(() => import('@/pages/doctor/DoctorAppointmentsPage'));

export function AppRoutes() {
  return (
    <Suspense fallback={<Spinner label="Loading…" />}>
      <Routes>
        <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
        <Route path="/" element={<HomeRedirect />} />

        <Route element={<RequireAuth roles={['SUPER_ADMIN']} />}>
          <Route path="/admin" element={<AppLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="doctors" element={<DoctorsPage />} />
            <Route path="receptionists" element={<ReceptionistsPage />} />
            <Route path="schedules" element={<SchedulesPage />} />
            <Route path="scheduler" element={<SchedulerPage />} />
            <Route path="appointments" element={<AppointmentsPage />} />
            <Route path="departments" element={<DepartmentsPage />} />
          </Route>
        </Route>

        <Route element={<RequireAuth roles={['RECEPTIONIST']} />}>
          <Route path="/reception" element={<AppLayout />}>
            <Route index element={<ReceptionDashboard />} />
            <Route path="patients" element={<PatientsPage />} />
            <Route path="scheduler" element={<SchedulerPage />} />
            <Route path="appointments" element={<AppointmentsPage />} />
          </Route>
        </Route>

        <Route element={<RequireAuth roles={['DOCTOR']} />}>
          <Route path="/doctor" element={<AppLayout />}>
            <Route index element={<DoctorDashboard />} />
            <Route path="appointments" element={<DoctorAppointmentsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
