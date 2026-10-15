import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

// Keep global client state from leaking between tests.
afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, initialized: true });
  useToastStore.setState({ toasts: [], lastSuccessAt: 0 });
});
