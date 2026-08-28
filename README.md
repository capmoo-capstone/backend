# Procurement & Project Management System — Backend

A RESTful API backend for managing procurement projects, workflows, staff assignments, and organizational structure. Built for supply operations departments with role-based access control and multi-step workflow support.

---

## Tech Stack

- **Runtime**: Node.js (TypeScript)
- **Framework**: Express 5
- **ORM**: Prisma 7 (PostgreSQL)
- **Auth**: JWT (`jsonwebtoken`) + SAML 2.0 (`@node-saml/node-saml`) + LRU in-memory cache
- **Validation**: Zod 4
- **Database**: PostgreSQL (via `pg` pool + `@prisma/adapter-pg`)
- **Dev Tools**: `tsx`, ESLint, Prettier, Swagger (`swagger-autogen`), Vitest

---

## Project Structure

```
├── prisma/
│   ├── schema.prisma         # Database schema & enums
│   ├── seed.ts               # Seed script with sample data
│   └── migrations/           # Prisma migration history
├── src/
│   ├── app.ts                # Express app setup
│   ├── local.ts              # Local dev entrypoint + Swagger UI
│   ├── config/
│   │   └── prisma.ts         # Prisma client with pg adapter
│   ├── controllers/          # Request handlers (thin layer)
│   ├── services/             # Business logic
│   │   ├── audit-log.service.ts
│   │   ├── auth.service.ts
│   │   ├── budget-plan.service.ts
│   │   ├── dashboard/
│   │   ├── delegation.service.ts
│   │   ├── department.service.ts
│   │   ├── holiday.service.ts
│   │   ├── notification/
│   │   ├── project-assignment.service.ts
│   │   ├── project-data.service.ts
│   │   ├── project-installment.service.ts
│   │   ├── project-lifecycle.service.ts
│   │   ├── project-query-own.helper.ts
│   │   ├── project-query.service.ts
│   │   ├── registration.service.ts
│   │   ├── saml.service.ts
│   │   ├── settings.service.ts
│   │   ├── storage.service.ts
│   │   ├── submission.service.ts
│   │   ├── unit.service.ts
│   │   └── user.service.ts
│   ├── routes/               # Express routers (protected routes registered via index)
│   ├── middlewares/
│   │   ├── auth.ts           # JWT protect + authorize middleware
│   │   ├── cron-auth.ts      # Cron authentication middleware
│   │   └── error.ts          # Global error handler
│   ├── schemas/              # Zod validation schemas + inferred DTOs
│   ├── types/                # TypeScript interfaces
│   └── lib/
│       ├── auth-cache.ts     # User auth LRU cache
│       ├── constant.ts       # OPS_DEPT_ID, unit IDs, workflow step orders
│       ├── date.ts           # Date & fiscal year helpers
│       ├── errors.ts         # AppError, NotFoundError, ForbiddenError, etc.
│       ├── helper.ts         # General helper utilities
│       ├── permissions.ts    # haveSupplyPermission, isSuperAdmin helpers
│       ├── phase-status.ts   # Procurement/contract phase sync logic
│       ├── project-installment.ts # Project installment status helpers
│       ├── roles.ts          # Role category helpers (dept-level vs unit-level)
│       ├── saml-cache.ts     # SAML SSO code exchange cache
│       ├── unit-type.ts      # Unit type validation helpers
│       ├── user-role.ts      # addRoleInternal, removeRoleInternal, role helpers
│       └── working-days.ts   # Working day & holiday calculations
├── filegen.ts                # Module scaffold generator
├── swagger.ts                # Swagger doc generator
└── prisma.config.ts          # Prisma config (env-aware DB URL)
```

---

## Getting Started

### Prerequisites

- Node.js >= 20.19
- PostgreSQL database

### Environment Setup

Copy `.env.example` to `.env` and fill in:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://...  # production
JWT_SECRET=your_jwt_secret
```

### Install & Run

```bash
npm install
# Prisma client is generated automatically via the postinstall hook

# Start dev server (generates Swagger + runs server)
npm run dev
```

The API will be available at `http://localhost:3000/api/v1`.
Swagger UI: `http://localhost:3000/api-docs`.

---

## Available Scripts

| Command                  | Description                                                      |
| ------------------------ | ---------------------------------------------------------------- |
| `npm run dev`            | Generate Swagger docs + start dev server                         |
| `npm run swagger`        | Regenerate `swagger-output.json`                                 |
| `npm run migrate`        | Run Prisma migrations                                            |
| `npm run migrate:reset`  | Reset and re-run all migrations                                  |
| `npm run studio`         | Open Prisma Studio                                               |
| `npm run generate`       | Regenerate Prisma client                                         |
| `npm run test`           | Run unit & integration test suite with Vitest                    |
| `npm run filegen -- <n>` | Scaffold a new module (controller, service, route, schema, type) |

---

## API Routes

All routes are prefixed with `/api/v1` and require a Bearer token, except public registration request, SAML SSO, and login endpoints.

### Auth — `/auth`

| Method | Path                    | Description                                                                                   |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/saml/metadata`        | Public SAML 2.0 Service Provider Metadata XML                                                 |
| GET    | `/saml/login`           | Initiate SAML SSO authentication flow                                                         |
| POST   | `/saml/acs`             | SAML Assertion Consumer Service callback endpoint                                             |
| POST   | `/saml/exchange`        | Exchange SAML single-use authorization code for JWT token                                     |
| POST   | `/create-request`       | Public account registration request (creates `PENDING` request)                               |
| GET    | `/requests`             | List paginated account registration requests (`?status=`, `?page=`, `?limit=`) (Supply ADMIN) |
| PATCH  | `/requests/:id/approve` | Approve registration request and create user account (Supply ADMIN)                           |
| PATCH  | `/requests/:id/reject`  | Reject registration request (Supply ADMIN)                                                    |
| POST   | `/login`                | Password login for an account with `STANDARD` access (returns JWT)                            |
| GET    | `/me`                   | Get current user profile                                                                      |
| PATCH  | `/logout`               | Invalidate current session cache                                                              |

### Users — `/users`

| Method | Path               | Description                                                                                                |
| ------ | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/`                | List users (optionally filter by `?unitId=`, `?deptId=`, or `?role=`)                                      |
| POST   | `/new`             | Create a new user account directly (Supply ADMIN)                                                          |
| GET    | `/:id`             | Get user details by ID                                                                                     |
| PATCH  | `/roles/supply`    | Bulk add/remove dept-level supply roles (`HEAD_OF_DEPARTMENT`, `ADMIN`, `FINANCE_STAFF`, `DOCUMENT_STAFF`) |
| POST   | `/:id/role`        | Add a role to a user (Supply ADMIN)                                                                        |
| PATCH  | `/:id/role/remove` | Remove a role from a user (Supply ADMIN)                                                                   |
| DELETE | `/:id`             | Delete a user (SUPER_ADMIN)                                                                                |

### Projects — `/projects`

| Method | Path                                       | Description                                                 |
| ------ | ------------------------------------------ | ----------------------------------------------------------- |
| POST   | `/`                                        | List projects with filters (role-scoped)                    |
| GET    | `/summary`                                 | Get project summary cards (scoped by role)                  |
| GET    | `/unassigned`                              | List unassigned projects (filtered by `?unitId=`)           |
| GET    | `/assigned`                                | List assigned projects (optionally filtered by `?date=`)    |
| GET    | `/waiting-cancel`                          | List projects pending cancellation (filtered by `?unitId=`) |
| GET    | `/own/total`                               | Get total count of projects assigned to current user        |
| GET    | `/own`                                     | List projects assigned to current user                      |
| GET    | `/workload`                                | Get staff workload stats (scoped by role, `?unitId=`)       |
| POST   | `/create`                                  | Create a new project                                        |
| POST   | `/import`                                  | Bulk import projects                                        |
| PATCH  | `/assign`                                  | Assign projects to a staff member (HEAD_OF_UNIT)            |
| PATCH  | `/accept`                                  | Accept assigned projects (GENERAL_STAFF)                    |
| POST   | `/contract/new`                            | Generate new contract number                                |
| PATCH  | `/contract/:contractId/cancel`             | Cancel contract number                                      |
| GET    | `/:id/history`                             | Get audit history for a project                             |
| GET    | `/:id/document-summary`                    | Get document summary for a project                          |
| GET    | `/:id`                                     | Get project detail                                          |
| PATCH  | `/:id/claim`                               | Self-assign an unassigned project                           |
| PATCH  | `/:id/change-assignee`                     | Replace current assignee                                    |
| PATCH  | `/:id/add-assignee`                        | Add additional assignee                                     |
| PATCH  | `/:id/return`                              | Return project to unassigned                                |
| PATCH  | `/:id/cancel`                              | Request cancellation                                        |
| PATCH  | `/:id/approve-cancel`                      | Approve cancellation request                                |
| PATCH  | `/:id/reject-cancel`                       | Reject cancellation request                                 |
| PATCH  | `/:id/complete-procurement`                | Advance to contract workflow                                |
| POST   | `/:id/complete-installment/:installmentNo` | Complete project installment step                           |
| PATCH  | `/:id/close`                               | Close a completed project (FINANCE_STAFF)                   |
| PATCH  | `/:id/update`                              | Update project information                                  |
| DELETE | `/:id`                                     | Delete a project (SUPER_ADMIN)                              |

### Submissions — `/submissions`

| Method | Path           | Description                                   |
| ------ | -------------- | --------------------------------------------- |
| GET    | `/:projectId`  | Get all submissions for a project             |
| POST   | `/`            | Create a new submission (GENERAL_STAFF)       |
| PATCH  | `/:id/approve` | Approve submission (HEAD_OF_UNIT)             |
| PATCH  | `/:id/propose` | Propose submission (DOCUMENT_STAFF)           |
| PATCH  | `/:id/sign`    | Sign and complete submission (DOCUMENT_STAFF) |
| PATCH  | `/:id/reject`  | Reject submission (HEAD_OF_UNIT)              |

### Installments — `/installments`

| Method | Path                | Description                                    |
| ------ | ------------------- | ---------------------------------------------- |
| GET    | `/`                 | List project installments                      |
| PATCH  | `/export`           | Export installments (FINANCE_STAFF)            |
| PATCH  | `/:id/request-edit` | Request editing an installment (FINANCE_STAFF) |

### Admin & Settings — `/admin`

| Method | Path                        | Description                                |
| ------ | --------------------------- | ------------------------------------------ |
| GET    | `/audit-logs`               | Get audit logs (HEAD_OF_DEPARTMENT, ADMIN) |
| GET    | `/settings/ops-units`       | Get ops units settings (ADMIN)             |
| GET    | `/settings/representatives` | Get representatives settings (ADMIN)       |
| GET    | `/settings/ops-staff`       | Get ops staff settings (ADMIN)             |

### Dashboard — `/dashboard`

| Method | Path                              | Description                              |
| ------ | --------------------------------- | ---------------------------------------- |
| GET    | `/periodic-summary`               | Get periodic project statistics summary  |
| GET    | `/procurement-overview`           | Get overall procurement status summary   |
| GET    | `/unit-group/executive-summary`   | Get unit group executive summary metrics |
| GET    | `/unit-group/procurement-metrics` | Get unit group procurement metrics       |
| GET    | `/unit-group/procurement-details` | Get unit group procurement details       |
| GET    | `/unit-group/top-delayed`         | Get unit group top delayed projects      |
| GET    | `/unit-group/staff-performance`   | Get unit group staff performance         |
| GET    | `/individual-todos`               | Get a selected user's project-own queue  |

### Units — `/units`

| Method | Path          | Description                                 |
| ------ | ------------- | ------------------------------------------- |
| GET    | `/`           | Paginated list of units                     |
| POST   | `/create`     | Create a unit (SUPER_ADMIN)                 |
| GET    | `/:id`        | Get unit by ID                              |
| GET    | `/:id/rep`    | Get the representative for a unit           |
| PATCH  | `/:id/users`  | Add/remove `GENERAL_STAFF` in a supply unit |
| PATCH  | `/:id/rep`    | Add/remove the representative for a unit    |
| PATCH  | `/:id/update` | Update a unit                               |
| DELETE | `/:id`        | Delete a unit                               |

### Departments — `/departments`

| Method | Path          | Description                       |
| ------ | ------------- | --------------------------------- |
| GET    | `/`           | List all departments (with units) |
| POST   | `/create`     | Create a department (SUPER_ADMIN) |
| GET    | `/:id`        | Get department by ID              |
| PATCH  | `/:id/update` | Update a department (SUPER_ADMIN) |
| DELETE | `/:id`        | Delete a department (SUPER_ADMIN) |

### Delegations — `/delegations`

| Method | Path          | Description                                                              |
| ------ | ------------- | ------------------------------------------------------------------------ |
| POST   | `/`           | Create a delegation for one role/scope                                   |
| GET    | `/active`     | Get the active delegation for a Supply Ops role/scope (`?role=&unitId=`) |
| GET    | `/:id`        | Get delegation by ID                                                     |
| PATCH  | `/:id/cancel` | Cancel a delegation                                                      |

### Budget Plans — `/budget-plans`

| Method | Path                       | Description                                           |
| ------ | -------------------------- | ----------------------------------------------------- |
| GET    | `/`                        | Paginated list of budget plans (filter by `?unitId=`) |
| POST   | `/`                        | Import budget plans (bulk)                            |
| PATCH  | `/:id/projects/:projectId` | Link a budget plan to a project                       |
| DELETE | `/:id`                     | Delete a budget plan                                  |

### Storage — `/storage`

| Method | Path                | Description                        |
| ------ | ------------------- | ---------------------------------- |
| POST   | `/presign-upload`   | Request presigned S3 upload URL    |
| POST   | `/presign-download` | Request presigned S3 download URL  |
| DELETE | `/delete`           | Delete a stored file (SUPER_ADMIN) |

### Vendors — `/vendors`

| Method | Path              | Description                                                |
| ------ | ----------------- | ---------------------------------------------------------- |
| POST   | `/presign-upload` | Request public presigned upload URL for vendor attachments |
| POST   | `/`               | Submit vendor document package                             |
| GET    | `/`               | List vendor submissions (Supply access)                    |

### Notifications — `/notifications`

| Method | Path        | Description                         |
| ------ | ----------- | ----------------------------------- |
| GET    | `/`         | List notifications for current user |
| PATCH  | `/read-all` | Mark all notifications as read      |
| PATCH  | `/:id/read` | Mark specific notification as read  |

### Holidays — `/holidays`

| Method | Path                  | Description                                                                         |
| ------ | --------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/`                   | List all holidays (filter by `?year=YYYY`)                                          |
| POST   | `/`                   | Add a new holiday (ADMIN / SUPER_ADMIN only)                                        |
| PUT    | `/:id`                | Update a holiday (ADMIN / SUPER_ADMIN only)                                         |
| DELETE | `/:id`                | Delete a holiday (ADMIN / SUPER_ADMIN only)                                         |
| POST   | `/calculate-timeline` | Calculate delivery date, remaining working days, and urgency level (all auth users) |

### Cron — `/cron`

| Method | Path                 | Description                                                              |
| ------ | -------------------- | ------------------------------------------------------------------------ |
| GET    | `/process-deadlines` | Process deadline notifications (Protected by `CRON_SECRET` bearer token) |

---

## Business Logic

### Working Days Calculation

Working days exclude:

- **Weekends** (Saturday and Sunday)
- **Public holidays** recorded in the `Holiday` table

All working-day arithmetic (adding days and counting remaining days) is performed by `holiday.service.ts`.

### Dashboard Working-Day Metrics

The dashboard uses the same `holiday.service.ts` functions as the delivery-date timeline. `countBangkokWorkingDays(from, to, holidayIndex)` normalizes both dates to Bangkok calendar days, excludes the start date, includes the end date, returns `0` for an invalid or same-day range, and excludes Saturdays, Sundays, and recorded public holidays.

`getBangkokWorkingDayHolidayIndex()` loads the relevant holiday window once per dashboard response. The index is shared for efficiency, while every individual count still excludes only holidays that fall within that item's own date range.

| Dashboard metric     | Counting logic                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff performance    | Counts each staff member's in-progress and completed phase work separately for their selected unit; `projectCount` is their total. Average duration in working days uses completed phase work only.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Individual summary   | Compares the selected staff member's average completed phase duration with the unit average, in working days.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Contract summary     | Average completed contract-phase duration in working days.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Executive summary    | Longest procurement method, average duration, and workload-duration timeline use project working-day durations. A closed project's endpoint is its `STATUS_UPDATE` history record that changed status to `CLOSED`, rather than its mutable `updated_at`; legacy records without that history fall back to `updated_at`. The completion timestamp is used only while the current project status is still `CLOSED`.                                                                                                                                                                                                                        |
| Procurement details  | Average completed procurement and contract phase durations use working days; the delayed-rate trend compares the current range with the prior range. No completed phase returns `0`.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Top delayed projects | `totalDays` is elapsed working time. The non-overlapping chart stages are assignment, procurement, contract, approval, and finance. Finance starts when the contract is completed and ends when the project closes (or today for an active project). Procurement and contract days exclude their approval intervals, so `assignmentDays + procurementDays + contractDays + approvalDays + financeDays` equals `totalDays`. Approval time runs from submission to completion; rejected submissions end at the rejection decision, unresolved submissions run through today, and direct completions with no approval event contribute `0`. |

Calendar-day arithmetic remains only where a calendar range is required, such as building daily/monthly chart buckets and comparing completion timestamps to an expected approval target.

### Default Delivery Date

When no `deliveryDate` is provided to `POST /holidays/calculate-timeline`, the system automatically computes it by advancing from **today** by the procurement-type quota:

| `unitResponsibilityType`        | Working-day quota |
| ------------------------------- | ----------------- |
| `LT100K`, `INTERNAL`            | 30 working days   |
| `LT500K`, `MT500K`, `SELECTION` | 60 working days   |
| `EBIDDING`                      | 120 working days  |

### Urgency Level

Derived from **remaining working days** between today and the delivery date:

| Level          | Condition                                                                              |
| -------------- | -------------------------------------------------------------------------------------- |
| `SUPER_URGENT` | `LT100K` or `LT500K` with ≤ 3 remaining working days                                   |
| `VERY_URGENT`  | `LT100K`/`INTERNAL` ≤ 7 · `LT500K`/`MT500K` ≤ 15 · `SELECTION` ≤ 30 · `EBIDDING` ≤ 60  |
| `URGENT`       | `LT100K`/`INTERNAL` ≤ 15 · `LT500K`/`MT500K` ≤ 30 · `SELECTION` ≤ 60 · `EBIDDING` ≤ 90 |
| `NORMAL`       | Does not meet any of the above conditions                                              |

The `urgencyWarningThreshold` field in the response always reflects the `URGENT` threshold for the given procurement type.

---

## Domain Concepts

### Roles & Permissions

Roles are scoped to a department and optionally a unit via `UserOrganizationRole`. A user can hold **multiple roles simultaneously** within or across departments (e.g. `ADMIN` + `FINANCE_STAFF` in the same department).

| Role                 | Level      | Scope                                                  |
| -------------------- | ---------- | ------------------------------------------------------ |
| `SUPER_ADMIN`        | Global     | Full access                                            |
| `ADMIN`              | Department | Department-level admin                                 |
| `HEAD_OF_DEPARTMENT` | Department | Manages all units in their department                  |
| `FINANCE_STAFF`      | Department | Department-level finance staff                         |
| `DOCUMENT_STAFF`     | Department | Department-level document staff                        |
| `HEAD_OF_UNIT`       | Unit       | Manages their specific unit                            |
| `GENERAL_STAFF`      | Unit       | Assigned to a unit; handles procurement/contract work  |
| `REPRESENTATIVE`     | Unit       | External requester from a non-supply department        |
| `GUEST`              | Department | Read-only placeholder; fallback when all roles removed |

Supply operations users belong to `DEPT-SUP-OPS` (`OPS_DEPT_ID`). The `haveSupplyPermission()` helper grants supply-specific access.

When a user's last real role in a department is removed, they automatically fall back to `GUEST` rather than being fully removed from that department.

### Account Registration & Role Management

User accounts can support one or both registration types (`RegisterType`): `SSO` and `STANDARD`.

Account creation and role management workflows:

1. **Account Registration Request Flow (`SSO`)**:
   - Requesters submit an account request via `POST /auth/create-request`.
   - The request enters `PENDING` state in the `RegistrationRequest` table.
   - The request body contains a `dept_id` and non-empty `unit_id` array. Every unit must belong to that department.
   - Supply `ADMIN` lists pending requests via `GET /auth/requests?status=PENDING`.
   - Supply `ADMIN` approves (`PATCH /auth/requests/:id/approve`) or rejects (`PATCH /auth/requests/:id/reject`) the request. Approval creates an SSO user and a `GUEST` organization role for every requested department/unit scope.

2. **Direct User Creation (`POST /users/new`)**:
   - Supply `ADMIN` creates a user account directly, specifying one or both `register_type` values (`STANDARD`, `SSO`), credentials, initial role, and organization scope. `STANDARD` requires a password; `SSO` requires an email.

3. **Role Management Endpoints**:
   - **`PATCH /users/roles/supply`** — bulk add/remove dept-level supply roles (`HEAD_OF_DEPARTMENT`, `ADMIN`, `FINANCE_STAFF`, `DOCUMENT_STAFF`) for `DEPT-SUP-OPS`. Enforces the one-head-per-dept constraint.
   - **`POST /users/:id/role`** / **`PATCH /users/:id/role/remove`** — add or remove a specific role for a user in any department. `SUPER_ADMIN` cannot be managed through these endpoints.
   - **`PATCH /units/:id/users`** — add/remove `GENERAL_STAFF` within a supply unit.
   - **`PATCH /units/:id/rep`** — add/remove the `REPRESENTATIVE` for a non-supply unit (max one per unit).

All role mutations touch `role_updated_at`, invalidating the auth cache.

### Project Lifecycle

```
UNASSIGNED → WAITING_ACCEPT → IN_PROGRESS → (procurement complete) → UNASSIGNED (CONTRACT) → IN_PROGRESS → NOT_EXPORTED → CLOSED
                                     ↓
                                WAITING_CANCEL → CANCELLED
                                     ↓
                                REQUEST_EDIT (from CLOSED)
```

Projects have two workflow phases: **procurement** and **contract**, each tracked via `procurement_status` / `contract_status` (`ProjectPhaseStatus`).

When the contract phase completes all steps, `contract_status` transitions to `NOT_EXPORTED` (not directly to `COMPLETED`) — the explicit `complete-contract` action is required to set this, and `close` requires `COMPLETED`.

### Workflow Types (`UnitResponsibleType`)

| Type        | Description               | Steps |
| ----------- | ------------------------- | ----- |
| `LT100K`    | Purchase < 100,000 THB    | 4     |
| `LT500K`    | Purchase < 500,000 THB    | 4     |
| `MT500K`    | Purchase > 500,000 THB    | 6     |
| `SELECTION` | Selective tendering       | 7     |
| `EBIDDING`  | Electronic bidding        | 10    |
| `INTERNAL`  | Internal procurement      | 4     |
| `CONTRACT`  | Contract management phase | 7     |

Each type maps to a fixed set of ordered workflow steps defined in `WORKFLOW_STEP_ORDERS` (in `src/lib/constant.ts`).

### Delegation

A user can delegate one specific role/scope to another user for a specified period. The delegatee inherits only that selected role during the active window. Role changes and delegations update `role_updated_at`, which invalidates the auth LRU cache.

`POST /delegations` requires the delegated scope:

```ts
{
  delegator_id: string
  delegatee_id: string
  role: 'HEAD_OF_DEPARTMENT' | 'HEAD_OF_UNIT'
  unit_id?: string
  start_date: string | Date
  end_date?: string | Date
}
```

Delegations are always for Supply Operations (`DEPT-SUP-OPS`). `HEAD_OF_UNIT` requires `unit_id`; `HEAD_OF_DEPARTMENT` must omit `unit_id`. A delegator can have active delegations for multiple different scopes, but only one active delegation per exact `role + unit_id` scope.

### Project Filtering

`POST /projects` accepts an optional `filter` body field with the following shape:

```ts
{
  search?: string            // matches receive_no or title (case-insensitive)
  title?: string
  dateFrom?: string
  dateTo?: string
  fiscalYear?: string | number
  procurementType?: ProcurementType[]
  status?: ProjectStatus[]
  procurementStatus?: ProjectPhaseStatus[]
  contractStatus?: ProjectPhaseStatus[]
  urgentStatus?: UrgentType[]
  assignees?: string[]       // user IDs
  units?: string[]           // requesting_unit_id values
  myTasks?: boolean          // scopes to caller's assignee / unit
  sortBy?: string            // receive_no | title | created_at | status | procurement_status | contract_status
  sortOrder?: 'asc' | 'desc'
}
```

When no date filter is provided, results are automatically scoped to the last 6 months.

---

## Authentication

Authentication uses stateless JWT tokens. On each authenticated request, the middleware:

1. Verifies the Bearer token.
2. Checks `role_updated_at` against an LRU cache entry (100-entry max, 10-minute TTL).
3. Returns cached role/delegation data if still fresh, otherwise re-fetches from the DB.

Tokens expire after **3 hours**.

### CU Portal SAML SSO

The API can act as a SAML 2.0 Service Provider for CU Portal while retaining
the existing username/password endpoint. Configure the `SAML_*` values in
`.env.example`, deploy the API on its public HTTPS URL, then provide CU Portal
with `GET /api/v1/auth/saml/metadata`. The SP Name and Entity ID are both
`nexusproc` by default.

The frontend starts SSO at `GET /api/v1/auth/saml/login`. CU Portal returns to
`POST /api/v1/auth/saml/acs`; successful sign-in sets a host-only, HttpOnly
cookie and redirects to `SAML_FRONTEND_SUCCESS_URL`. The API accepts that
cookie or the existing Bearer JWT. Only a pre-existing user whose `username`
matches CU Portal's `screenName` and whose login methods include `SSO` can
sign in; SSO never creates a user or role.

---

## Key Architectural Decisions

- **`prisma.$transaction([...])`** is used for summary/count queries to guarantee all reads come from the same database snapshot, ensuring consistency across totals — not just parallelism.
- **`ProcurementType` and `UnitResponsibleType`** are intentionally separate enums. They overlap in values (`LT100K`, `LT500K`, etc.) but have distinct domain meanings: `ProcurementType` describes what a project is, while `UnitResponsibleType` describes which unit handles it (and includes `CONTRACT` which has no procurement equivalent).
- **Workload aggregation** uses a single `prisma.project.findMany` + in-memory grouping to avoid N+1 queries.
- **`GENERAL_STAFF` is intentionally forbidden** from the workload endpoint — a `ForbiddenError` is thrown by design.
- **Multi-role architecture**: `addRoleInternal` / `removeRoleInternal` in `src/lib/user-role.ts` centralise all role mutation logic. Unit-level roles update the existing unit slot; dept-level roles replace a solo `GUEST` or append a new row. This allows a user to hold e.g. `ADMIN` + `FINANCE_STAFF` simultaneously.
- **Advisory locks** via `pg_advisory_xact_lock` guard sequential number generation (`getReceiveNumber`) and submission round incrementing (`getSubmissionRound`) — must use the direct Neon connection URL, not the pooled URL, as PgBouncer in transaction pooling mode does not guarantee connection affinity.
- **`NOT_EXPORTED` phase status**: after all contract steps complete, `syncProjectPhases` sets `contract_status` to `NOT_EXPORTED` rather than `COMPLETED`. The explicit `complete-contract` endpoint drives the transition to `COMPLETED`, keeping export confirmation a deliberate step.

---

## Known Issues / Tech Debt

- **`unit.service.ts` self-exclusion bug**: `checkValidateType` does not exclude the unit currently being updated, so updating a unit's type incorrectly conflicts with itself.
- **`getReceiveNumber` hardcoded year**: The `budget_year` parameter is unconditionally overwritten with a hardcoded value (`2569`) inside the function body.
- **`resolveAssigneeField` duplication**: An inline ternary still exists in `getAssignedProjects` within `project-query.service.ts` rather than using the shared `resolveAssigneeField` helper from `project-assignment.service.ts`.
