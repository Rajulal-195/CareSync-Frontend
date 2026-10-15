# Enterprise EMR — Appointment Management (Frontend)

React + Vite + TypeScript single-page app for managing clinic appointments. Three roles — **Super Admin**, **Receptionist**, **Doctor** — each get their own navigation and dashboard. The backend is the source of truth; the UI never invents data or fakes a successful response.

> **Verification status (please read).** The sandbox this was written in could not reach the npm registry, so `npm install` never ran. That means `tsc`, `vitest` and `vite build` have **not** been executed against this code. What *was* checked: every TS/TSX file (77) parses cleanly, and the pure-logic modules (validation, wizard steps, permissions, paging, stats normalisation, error messages, socket event→cache mapping) were run directly under Node and passed. Run the commands in [Tests and build](#tests-and-build) first; expect to fix a few small type or test issues.

## Features

- **Auth** – login (React Hook Form + Zod, show/hide password), role-based redirect, protected routes, silent session restore on reload, logout that clears all client state.
- **Dashboards** – Super Admin stats from `GET /dashboard/stats` (widgets adapt to the response actually returned; nothing is computed from a page of appointments), Receptionist and Doctor dashboards.
- **Doctors** – list/create. **Receptionists** – list/create (Super Admin only). **Departments** – list/create.
- **Doctor schedules** – timezone, working days, multiple sessions per day, breaks, slot duration, enable/disable; client validation, backend field errors, 409 conflict panel with explicit "Save anyway".
- **Scheduler** – department → doctor → date → slot grid (Available / Selected / Booked / Unavailable / Past), skeletons, refresh after booking/cancel, live updates.
- **Booking wizard** – 5 steps (department & doctor, slot, patient, visit details, confirm), per-step validation, state preserved when going back, 409 handling, no double submit, confirmation only after the backend succeeds.
- **Appointments list** – search, status / department / date-range filters, server-side pagination and sorting, details modal, edit, logical cancel with confirmation (never delete), mark arrived, complete; only actions valid for the role and current status are shown.
- **Patients** – debounced search by name / ID / mobile, select for booking, register (Receptionist / Super Admin only).
- **Real-time** – Socket.IO: `appointment:created|updated|cancelled|statusChanged`, `slots:updated`.
- **Accessibility** – semantic HTML, skip link, focus-visible styles, focus-trapped modals with Esc, `aria-sort` on tables, status always shown as icon **and** text, scrollable responsive tables.

## Technology stack

React 18 · Vite · TypeScript (strict) · React Router · Tailwind CSS (CSS-variable design tokens) · TanStack Query v5 · Zustand · Axios · React Hook Form + Zod · Lucide · socket.io-client · Vitest + Testing Library (jsdom).

## Folder structure

```
src/
  api/            client.ts (Axios + refresh), errors.ts, services.ts, socket.ts, events.ts
  components/ui/  Button, Field, Modal, Alert, StatusBadge, DatePicker, Toaster, Layout, feedback (Skeleton/Empty/Error/QueryBoundary)
  features/       appointments/ auth/ booking/ dashboard/ doctors/ patients/ receptionists/ scheduler/ schedules/
  hooks/          useDebounce, useLiveAppointments
  layouts/        AppLayout (role navigation, mobile drawer)
  pages/          LoginPage, AppointmentsPage, SchedulerPage, NotFoundPage, admin/, reception/, doctor/
  routes/         index.tsx (lazy routes), guards.tsx
  stores/         authStore (in-memory only), toastStore
  test/           Vitest suites + helpers
  types/ utils/ index.css (design tokens)
public/           logo.png (full logo), logo-mark.png (icon), favicon.png — CareSync branding
```

## Installation

```bash
npm install
cp .env.example .env
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:5000/api/v1` | REST base URL |
| `VITE_SOCKET_URL` | `http://localhost:5000` | Socket.IO server |

Only public URLs belong here — `VITE_*` values are bundled into the browser. `.env` is git-ignored; `.env.example` is committed.

## Run the frontend

```bash
npm run dev      # http://localhost:5173
npm run preview  # serve the production build
```

## Connect to the backend

1. Start the backend on the URLs above (or edit `.env`).
2. The backend must allow the frontend origin in CORS **with credentials** (`Access-Control-Allow-Credentials: true`, explicit origin, not `*`), for both REST and Socket.IO.
3. Refresh tokens must be an **HttpOnly cookie** set by the backend. The app keeps the access token in memory only; on load it calls the refresh endpoint to restore the session. Nothing is written to `localStorage`.
4. On `401` the client refreshes once (single-flight) and retries the request once. If refresh fails, state is cleared and the user is sent to login — no retry loops.

## Tests and build

```bash
npm run typecheck        # app code
npm run typecheck:tests  # test code
npm test                 # vitest run
npm run build            # tsc + vite build
```

Test coverage: login validation and API failure; role-based routes; scheduler rendering and slot states; booking wizard validation, duplicate-submit guard and 409; patient search and registration; list filters, sorting and pagination; loading/empty/error states; status actions and cache invalidation; socket listener cleanup, reconnect and cache refresh; error-message safety.

## Assumptions and limitations

Endpoint and payload shapes were inferred from the requirements and must be confirmed against the real backend (all live in `src/api/services.ts` and `src/types/index.ts`, so mismatches are easy to fix):

- Responses are `{ data, meta? }` envelopes; lists are paginated with `page`/`limit` and return total counts.
- Schedules: `GET/PUT /doctors/:id/schedule`; a conflict returns `409` with `data.conflicts`; `force: true` overrides.
- Slots: `GET /appointments/slots?doctorId&date` returns `{ start, status }` objects (ISO strings also tolerated).
- Appointments: `GET /appointments` (supports `search`, `status`, `departmentId`, `from`, `to`, `sortBy`, `sortOrder`), `GET /appointments/mine`, `GET/PATCH /appointments/:id`, status updates and `POST /appointments/:id/cancel` for logical cancel.
- Socket: the client emits `slots:watch` / `slots:unwatch` and expects the five events above. Payloads are **never displayed or logged**; they only decide which caches to refetch. Notices use fixed generic text.
- Stats shape is unknown, so widgets are matched by name/alias and unknown numeric fields are shown generically.

Known limitations:

- Not yet run through typecheck, Vitest or `vite build` (see top).
- Receptionists page is list + create only (no edit/deactivate).
- Consultation notes are display/edit only; there is no clinical workflow beyond completing a visit.
- No idempotency key on booking; duplicate submits are prevented client-side and by the backend's 409.
- Route guards are UX only; authorisation is enforced by the backend.
