import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBadge } from '@/components/ui/StatusBadge';
import LoginPage from '@/pages/LoginPage';
import { RequireAuth } from '@/routes/guards';
import { useAuthStore } from '@/stores/authStore';

const wrap = (ui: React.ReactElement, path = '/') => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
  </QueryClientProvider>
);

describe('StatusBadge', () => {
  it.each([
    ['SCHEDULED', 'Scheduled'],
    ['ARRIVED', 'Arrived'],
    ['COMPLETED', 'Completed'],
    ['CANCELLED', 'Cancelled'],
  ] as const)('shows readable text for %s', (status, text) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe('LoginPage', () => {
  it('validates required fields before calling the API', async () => {
    render(wrap(<LoginPage />));
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    render(wrap(<LoginPage />));
    const input = screen.getByLabelText(/^password/i);
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(input).toHaveAttribute('type', 'text');
  });
});

describe('RequireAuth', () => {
  const tree = (
    <Routes>
      <Route path="/login" element={<p>login page</p>} />
      <Route element={<RequireAuth roles={['SUPER_ADMIN']} />}>
        <Route path="/admin" element={<p>admin area</p>} />
      </Route>
      <Route path="/reception" element={<p>reception home</p>} />
    </Routes>
  );

  beforeEach(() => useAuthStore.setState({ user: null, accessToken: null, initialized: true }));

  it('redirects anonymous users to login', () => {
    render(wrap(tree, '/admin'));
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('sends a wrong-role user to their own home', () => {
    useAuthStore.setState({ user: { id: '1', name: 'R', email: 'r@x.org', role: 'RECEPTIONIST' }, accessToken: 't' });
    render(wrap(tree, '/admin'));
    expect(screen.getByText('reception home')).toBeInTheDocument();
  });

  it('allows the right role', () => {
    useAuthStore.setState({ user: { id: '1', name: 'A', email: 'a@x.org', role: 'SUPER_ADMIN' }, accessToken: 't' });
    render(wrap(tree, '/admin'));
    expect(screen.getByText('admin area')).toBeInTheDocument();
  });
});
