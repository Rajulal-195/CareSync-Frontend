/**
 * Interprets the payload of GET /api/v1/dashboard/stats without assuming its exact shape.
 * Numeric leaves are matched to known metrics by name (flat or nested); anything numeric that
 * isn't recognised is still surfaced as an "other" metric. Nothing is computed from appointment
 * lists, so global figures always come from the server.
 */
export type MetricId =
  | 'doctors' | 'receptionists' | 'patients'
  | 'today' | 'scheduled' | 'arrived' | 'completed' | 'cancelled';

export interface Metric {
  id: string;
  label: string;
  value: number;
  /** one of the known widgets (has a dedicated icon/position) */
  known: boolean;
}

interface KnownDef { id: MetricId; label: string; aliases: string[] }

const withVariants = (bases: string[]): string[] =>
  bases.flatMap((b) => [b, `total${b}`, `${b}total`, `${b}count`, `totalnumberof${b}`, `numberof${b}`]);

const KNOWN: KnownDef[] = [
  { id: 'doctors', label: 'Total doctors', aliases: [...withVariants(['doctors', 'doctor']), 'activedoctors'] },
  { id: 'receptionists', label: 'Total receptionists', aliases: [...withVariants(['receptionists', 'receptionist']), 'activereceptionists'] },
  { id: 'patients', label: 'Total patients', aliases: withVariants(['patients', 'patient']) },
  {
    id: 'today', label: 'Today’s appointments',
    aliases: ['today', 'todays', 'todaysappointments', 'todayappointments', 'appointmentstoday', 'todaytotal', 'todaycount', 'todaysappointmentscount', 'appointmentstodaytotal'],
  },
  { id: 'scheduled', label: 'Scheduled', aliases: ['scheduled', 'scheduledappointments', 'appointmentsscheduled', 'scheduledcount'] },
  { id: 'arrived', label: 'Arrived patients', aliases: ['arrived', 'arrivedpatients', 'arrivedappointments', 'appointmentsarrived', 'patientsarrived', 'arrivedcount'] },
  { id: 'completed', label: 'Completed', aliases: ['completed', 'completedappointments', 'appointmentscompleted', 'completedcount'] },
  { id: 'cancelled', label: 'Cancelled', aliases: ['cancelled', 'canceled', 'cancelledappointments', 'canceledappointments', 'appointmentscancelled', 'cancelledcount'] },
];

export const STATUS_METRICS: { id: MetricId; status: 'SCHEDULED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED' }[] = [
  { id: 'scheduled', status: 'SCHEDULED' },
  { id: 'arrived', status: 'ARRIVED' },
  { id: 'completed', status: 'COMPLETED' },
  { id: 'cancelled', status: 'CANCELLED' },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function humanize(path: string[]): string {
  const words = path
    .join(' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface Leaf { path: string[]; value: number }

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
}

function flatten(node: unknown, path: string[], out: Leaf[], depth = 0): void {
  if (depth > 4 || node == null) return;
  const n = toNumber(node);
  if (n !== null && path.length) { out.push({ path, value: n }); return; }
  if (typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) flatten(v, [...path, k], out, depth + 1);
  }
}

export interface NormalizedStats {
  /** recognised metrics, in a stable display order */
  known: Metric[];
  /** other numeric values the server returned */
  extras: Metric[];
  /** true when the response held no numeric metrics at all */
  isEmpty: boolean;
}

export function normalizeStats(raw: unknown): NormalizedStats {
  const leaves: Leaf[] = [];
  flatten(raw, [], leaves);

  const claimed = new Set<number>();
  const found = new Map<MetricId, Metric>();

  // Pass 1: the full dotted path (e.g. appointments.today); pass 2: the leaf key alone (e.g. today).
  for (const pass of ['full', 'leaf'] as const) {
    leaves.forEach((leaf, i) => {
      if (claimed.has(i)) return;
      const key = pass === 'full' ? norm(leaf.path.join('')) : norm(leaf.path[leaf.path.length - 1]);
      const def = KNOWN.find((d) => d.aliases.includes(key));
      if (def && !found.has(def.id)) {
        found.set(def.id, { id: def.id, label: def.label, value: leaf.value, known: true });
        claimed.add(i);
      }
    });
  }

  const known = KNOWN.filter((d) => found.has(d.id)).map((d) => found.get(d.id)!);
  const extras = leaves
    .filter((_, i) => !claimed.has(i))
    .map((l): Metric => ({ id: l.path.join('.'), label: humanize(l.path), value: l.value, known: false }));

  return { known, extras, isEmpty: leaves.length === 0 };
}
