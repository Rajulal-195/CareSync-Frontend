import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { AxiosError } from 'axios';
import LoginPage from '@/pages/LoginPage';
import { authApi } from '@/api/services';
import { useAuthStore } from '@/stores/authStore';
import { axiosError, deferred, renderWithProviders } from './utils';

vi.mock('@/api/services');

const login = vi.mocked(authApi.login);

function renderLogin() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin" element={<p>admin home</p>} />
      <Route path="/doctor" element={<p>doctor home</p>} />
    </Routes>,
    { route: '/login' },
  );
}

async function fillAndSubmit(email = 'staff@example.org', password = 'secret-pass') {
  await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('login: API failures', () => {
  beforeEach(() => vi.resetAllMocks());

  it('shows a clear message for invalid credentials', async () => {
    login.mockRejectedValue(axiosError(401, { message: 'Invalid credentials' }));
    renderLogin();
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('shows a rate-limit message', async () => {
    login.mockRejectedValue(axiosError(429));
    renderLogin();
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i);
  });

  it('explains a network failure', async () => {
    login.mockRejectedValue(new AxiosError('Network Error'));
    renderLogin();
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot reach the server/i);
  });

  it('hides server internals on a 500', async () => {
    login.mockRejectedValue(axiosError(500, { message: 'TypeError: cannot read properties of undefined\n    at /srv/app.js:12' }));
    renderLogin();
    await fillAndSubmit();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/server ran into a problem/i);
    expect(alert).not.toHaveTextContent(/TypeError|app\.js/);
  });

  it('disables the button while signing in', async () => {
    const d = deferred<never>();
    login.mockReturnValue(d.promise);
    renderLogin();
    await fillAndSubmit();
    expect(await screen.findByRole('button', { name: /signing in/i })).toBeDisabled();
    d.reject(axiosError(401));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });
});

describe('login: success', () => {
  beforeEach(() => vi.resetAllMocks());

  it('sends the credentials, keeps the token in memory only, and redirects by role', async () => {
    login.mockResolvedValue({ user: { id: '1', name: 'Dr A', email: 'a@example.org', role: 'DOCTOR' }, accessToken: 'tok-123' });
    renderLogin();
    await fillAndSubmit('a@example.org', 'secret-pass');
    expect(await screen.findByText('doctor home')).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith({ email: 'a@example.org', password: 'secret-pass' });
    expect(useAuthStore.getState().accessToken).toBe('tok-123');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('sends a Super Admin to the admin area', async () => {
    login.mockResolvedValue({ user: { id: '2', name: 'Admin', email: 'x@example.org', role: 'SUPER_ADMIN' }, accessToken: 't' });
    renderLogin();
    await fillAndSubmit();
    expect(await screen.findByText('admin home')).toBeInTheDocument();
  });
});
