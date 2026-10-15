import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  /** Epoch ms of the last success toast; lets live-update notices skip echoes of the user's own action. */
  lastSuccessAt: number;
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  lastSuccessAt: 0,
  push: (kind, message) => {
    // Identical toast already on screen: don't stack duplicates.
    if (get().toasts.some((t) => t.kind === kind && t.message === message)) return;
    const id = nextId++;
    set((s) => ({
      toasts: [...s.toasts, { id, kind, message }],
      lastSuccessAt: kind === 'success' ? Date.now() : s.lastSuccessAt,
    }));
    setTimeout(() => get().dismiss(id), 5000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (m: string) => useToastStore.getState().push('success', m),
  error: (m: string) => useToastStore.getState().push('error', m),
  info: (m: string) => useToastStore.getState().push('info', m),
};
