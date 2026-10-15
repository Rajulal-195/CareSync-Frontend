import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { authApi } from '@/api/services';
import { useAuthStore } from '@/stores/authStore';
import { axiosError, renderWithProviders, signIn } from './utils';
import type { Role } from '@/types';

vi.mock('@/api/services');
// The layout opens a live-updates socket; keep it offline in these tests.
vi.mock('@/api/socket', () => ({ connectSocket: vi.fn(() => null), disconnectSocket: vi.fn() }));

function renderShell(role: Role) {
  signIn(role);
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<p>login page</p>} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<p>page content</p>} />
      </Route>
    </Routes>,
  );
}

const nav = () => screen.getByRole('navigation', { name: 'Primary' });
const links = () => within(nav()).getAllByRole('link').map((a) => a.textContent);

describe('role-aware navigation', () => {
  beforeEach(() => vi.resetAllMocks());

  it('gives Super Admin the management pages', () => {
    renderShell('SUPER_ADMIN');
    expect(links()).toEqual(['Dashboard', 'Doctors', 'Receptionists', 'Doctor Schedules', 'Scheduler', 'Appointments', 'Departments']);
  });

  it('gives Receptionist the front-desk pages only', () => {
    renderShell('RECEPTIONIST');
    expect(links()).toEqual(['Dashboard', 'Patients', 'Scheduler', 'Appointments']);
    expect(within(nav()).queryByRole('link', { name: 'Doctors' })).toBeNull();
    expect(within(nav()).queryByRole('link', { name: 'Departments' })).toBeNull();
  });

  it('gives Doctor only their own pages', () => {
    renderShell('DOCTOR');
    expect(links()).toEqual(['Dashboard', 'My Appointments']);
  });

  it('shows who is signed in', () => {
    renderShell('DOCTOR');
    expect(within(nav()).getByText('Test User')).toBeInTheDocument();
    expect(within(nav()).getByText('Doctor')).toBeInTheDocument();
  });
});

describe('sign out', () => {
  beforeEach(() => vi.resetAllMocks());

  it('calls the logout API, clears client state and returns to login', async () => {
    vi.mocked(authApi.logout).mockResolvedValue(null);
    const { queryClient } = renderShell('RECEPTIONIST');
    queryClient.setQueryData(['appointments', 'cached'], { items: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(authApi.logout).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(queryClient.getQueryData(['appointments', 'cached'])).toBeUndefined();
  });

  it('still signs the user out locally if the logout request fails', async () => {
    vi.mocked(authApi.logout).mockRejectedValue(axiosError(500));
    renderShell('DOCTOR');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
