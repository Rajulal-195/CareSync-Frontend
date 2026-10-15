import { Suspense, useState } from 'react';
import { Spinner } from '@/components/ui/feedback';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Building2, CalendarCheck, CalendarClock, CalendarDays, LayoutDashboard, LogOut, Menu, Stethoscope, UserCog, Users, X, type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useLogout } from '@/features/auth/useAuth';
import { useLiveAppointments } from '@/hooks/useLiveAppointments';
import { ROLE_LABEL } from '@/utils/roles';
import { initials } from '@/utils/format';
import type { Role } from '@/types';

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }

const NAV: Record<Role, NavItem[]> = {
  SUPER_ADMIN: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/doctors', label: 'Doctors', icon: Stethoscope },
    { to: '/admin/receptionists', label: 'Receptionists', icon: UserCog },
    { to: '/admin/schedules', label: 'Doctor Schedules', icon: CalendarClock },
    { to: '/admin/scheduler', label: 'Scheduler', icon: CalendarDays },
    { to: '/admin/appointments', label: 'Appointments', icon: CalendarCheck },
    { to: '/admin/departments', label: 'Departments', icon: Building2 },
  ],
  RECEPTIONIST: [
    { to: '/reception', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/reception/patients', label: 'Patients', icon: Users },
    { to: '/reception/scheduler', label: 'Scheduler', icon: CalendarDays },
    { to: '/reception/appointments', label: 'Appointments', icon: CalendarCheck },
  ],
  DOCTOR: [
    { to: '/doctor', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/doctor/appointments', label: 'My Appointments', icon: CalendarCheck },
  ],
};

/** Dark forest-green sidebar with emerald/sage active state, used for every role. */
export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  useLiveAppointments();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // Logging out clears the user before the redirect lands; render nothing for that instant.
  if (!user) return null;

  const sidebar = (
    <nav aria-label="Primary" className="flex h-full flex-col bg-forest text-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <img src="/logo-mark.png" alt="" width={36} height={36} className="h-9 w-9 rounded-lg" />
        <span className="text-lg font-semibold tracking-tight">CareSync</span>
      </div>
      <ul className="flex-1 space-y-1 px-3">
        {NAV[user.role].map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary text-white' : 'text-sage hover:bg-white/10 hover:text-white',
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-sage text-sm font-semibold text-forest">{initials(user.name)}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="text-xs text-sage">{ROLE_LABEL[user.role]}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sage hover:bg-white/10 hover:text-white">
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebar}</aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <span className="flex items-center gap-2 font-semibold">
          <img src="/logo-mark.png" alt="" width={28} height={28} className="h-7 w-7 rounded-md" />
          CareSync
        </span>
        <button onClick={() => setOpen(true)} aria-label="Open navigation menu" aria-expanded={open} className="rounded-md p-2 text-ink hover:bg-soft">
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-forest/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">
            {sidebar}
            <button onClick={() => setOpen(false)} aria-label="Close navigation menu" className="absolute right-2 top-4 rounded-md p-1.5 text-sage hover:bg-white/10">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      )}

      <main id="main" className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
        {/* Keeps the sidebar on screen while a lazily-loaded page is fetched. */}
        <Suspense fallback={<Spinner label="Loading page…" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
