# Frontend ⇄ backend alignment

The frontend now matches the backend's real API (routes, HTTP methods, field names, response and error shapes).
All translation between the backend's wire format and the UI types lives in `src/api/adapters.ts`; `src/api/services.ts`
only calls routes that exist.

## Routes / methods
| Was | Now |
|---|---|
| `PATCH /appointments/:id/status` | `POST /appointments/:id/arrive`, `POST /appointments/:id/complete` |
| `GET /appointments/mine` | `GET /appointments` (backend scopes doctors to their own) |
| `PATCH /appointments/:id` for doctor notes | `PATCH /appointments/:id/consultation` |
| slots via a guessed endpoint | `GET /doctors/:id/slots?date=` |
| `/auth/refresh`, `/auth/logout` without CSRF | send `X-CSRF-Token` (from login/refresh response, or `GET /auth/csrf` after reload) |

## Fields
`scheduledAt`→`appointmentDate`+`startTime` · `reason`→`purpose` · `phone`→`mobile` · `patientCode`←`patientId` · `id`←`_id` ·
`search`→`q` (≥2 chars) · `from/to`→`dateFrom/dateTo` · sort keys `scheduledAt`→`appointmentDate`, `status`
(patient/doctor-name sorting removed: the backend has none) · `meta.pages`→`totalPages` · removed `phone` on doctors/receptionists and
`address` on patients (not in the backend schema) · doctor email is not sent on update · passwords validated as 12+ chars with a letter and a digit.

## Schedules
The editor now edits the backend model: working days, one list of sessions, one list of breaks, slot duration, timezone, active flag.
A 409 `SCHEDULE_CONFLICT` lists the affected appointments; there is no "save anyway" (the backend has no override).

## Roles
Super admin is read-only on appointments (arrive/cancel/complete/edit are 403 in the backend). Receptionists edit purpose/notes
(SCHEDULED/ARRIVED). Doctors write consultation notes once the patient has arrived. Cancelling an ARRIVED appointment requires a reason.

## Real-time
Event names now match the backend: `appointment:created|updated|cancelled|status-changed`, `slot:updated`; plus `sync:required`
(refetch on every connect) and `auth:expired` (refresh token, reconnect). The unsupported `slots:watch` messages were removed.

## Errors
Reads the backend body `{ message, error: { code, details } }`: validation `details` become field errors (`mobile`→"Mobile" field, etc.);
other details (e.g. conflicting appointments) are exposed as `data`.

## Other bugs fixed along the way
* `Modal` stole focus on every parent render (typing in a controlled textarea stopped after one character).
* `AppLayout` crashed while logging out (user cleared before the redirect).
* Tailwind `bg-soft` was undefined, breaking `vite build` and several backgrounds.
* `@types/node` added so `npm run build` typechecks `vite.config.ts`.

## Tests
`src/test/contract.test.ts` checks every call's method, URL, params, body and response mapping against the backend contract.
171 tests pass; `tsc` and `vite build` pass. Not covered: a live run against a running backend/MongoDB.
