import type { PageMeta } from '@/types';

export interface PageInfo {
  page: number;
  /** null when the server gave neither totalPages nor total */
  totalPages: number | null;
  total: number | null;
  /** 1-based range shown on this page; 0 when empty */
  from: number;
  to: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/** Derives pagination display state from the server's `meta`, tolerating a missing total. */
export function pageInfo(meta: PageMeta | undefined, page: number, limit: number, count: number): PageInfo {
  const total = typeof meta?.total === 'number' ? meta.total : null;
  const totalPages =
    typeof meta?.totalPages === 'number'
      ? meta.totalPages
      : total !== null
        ? Math.max(1, Math.ceil(total / limit))
        : null;
  const from = count === 0 ? 0 : (page - 1) * limit + 1;
  const to = count === 0 ? 0 : from + count - 1;
  // Without totals the best signal is a full page: there may be another.
  const hasNext = totalPages !== null ? page < totalPages : count >= limit;
  return { page, totalPages, total, from, to, hasPrev: page > 1, hasNext };
}
