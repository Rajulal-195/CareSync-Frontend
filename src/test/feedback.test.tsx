import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Alert } from '@/components/ui/Alert';
import { EmptyState, ErrorState, QueryBoundary, Skeleton } from '@/components/ui/feedback';
import { axiosError } from './utils';

const boundary = (over: Partial<React.ComponentProps<typeof QueryBoundary>> = {}) =>
  render(
    <QueryBoundary isLoading={false} isError={false} error={null} isEmpty={false} empty={<p>nothing here</p>} {...over}>
      <p>the content</p>
    </QueryBoundary>,
  );

describe('QueryBoundary', () => {
  it('shows a spinner while loading', () => {
    boundary({ isLoading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByText('the content')).not.toBeInTheDocument();
  });

  it('shows a friendly error with a working retry', async () => {
    const onRetry = vi.fn();
    boundary({ isError: true, error: axiosError(403), onRetry });
    expect(screen.getByRole('alert')).toHaveTextContent(/permission/i);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state', () => {
    boundary({ isEmpty: true });
    expect(screen.getByText('nothing here')).toBeInTheDocument();
  });

  it('shows content otherwise', () => {
    boundary();
    expect(screen.getByText('the content')).toBeInTheDocument();
  });
});

describe('feedback components', () => {
  it('EmptyState renders its title, description and action', () => {
    render(<EmptyState title="No patients" description="Try again" action={<button>Add</button>} />);
    expect(screen.getByText('No patients')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('ErrorState explains a 404 and a network failure in plain language', () => {
    const { rerender } = render(<ErrorState error={axiosError(404)} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/find that record/i);
    rerender(<ErrorState error={new Error('x')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('x');
  });

  it('Alert uses alert/status roles and pairs every tone with text', () => {
    const { rerender } = render(<Alert tone="error">Broken</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Broken');
    rerender(<Alert tone="info">FYI</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('FYI');
  });

  it('Skeleton is hidden from assistive tech', () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
