import { useEffect } from 'react';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import { AppRoutes } from '@/routes';
import { Toaster } from '@/components/ui/Toaster';
import { bootstrapSession } from '@/features/auth/useAuth';
import { registerSessionExpiredHandler, toApiError } from '@/api/client';
import { toast } from '@/stores/toastStore';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      // Surface background-refetch failures only; initial loads render their own ErrorState.
      if (query.state.data !== undefined) toast.error(toApiError(err).message);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        const status = toApiError(err).status;
        return !(status && status >= 400 && status < 500) && count < 2;
      },
    },
  },
});

function SessionWatcher() {
  const navigate = useNavigate();
  useEffect(() => {
    registerSessionExpiredHandler(() => {
      queryClient.clear();
      toast.info('Your session expired. Please sign in again.');
      navigate('/login', { replace: true });
    });
  }, [navigate]);
  return null;
}

export default function App() {
  useEffect(() => { void bootstrapSession(); }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-fg">
          Skip to content
        </a>
        <SessionWatcher />
        <AppRoutes />
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
