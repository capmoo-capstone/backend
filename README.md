# Procurement & Project Management System — Backend

A RESTful API backend for managing procurement projects, workflows, staff assignments, and organizational structure. Built for supply operations departments with role-based access control and multi-step workflow support.

---

## Tech Stack

- **Runtime**: Node.js (TypeScript)
- **Framework**: Express 5
- **ORM**: Prisma 7 (PostgreSQL)
- **Auth**: JWT (`jsonwebtoken`) + LRU in-memory cache
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
│   │   ├── auth.service.ts
│   │   ├── project-query.service.ts
│   │   ├── project-assignment.service.ts
│   │   ├── project-data.service.ts
│   │   ├── project-lifecycle.service.ts
│   │   ├── submission.service.ts
│   │   ├── unit.service.ts
│   │   ├── user.service.ts
│   │   ├── department.service.ts
│   │   ├── delegation.service.ts
│   │   └── budget-plan.service.ts
│   ├── routes/               # Express routers (protected routes registered via loop)
│   ├── middlewares/
│   │   ├── auth.ts           # JWT protect + authorize middleware
│   │   └── error.ts          # Global error handler
│   ├── schemas/              # Zod validation schemas + inferred DTOs
│   ├── types/                # TypeScript interfaces
│   └── lib/
│       ├── constant.ts       # OPS_DEPT_ID, unit IDs, workflow step orders
│       ├── errors.ts         # AppError, NotFoundError, ForbiddenError, etc.
│       ├── permissions.ts    # haveSupplyPermission, isSuperAdmin helpers
│       ├── roles.ts          # Role category helpers (dept-level vs unit-level)
│       ├── user-role.ts      # addRoleInternal, removeRoleInternal, role helpers
│       └── phase-status.ts   # Procurement/contract phase sync logic
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
| `npm run filegen -- <n>` | Scaffold a new module (controller, service, route, schema, type) |

---

## API Routes

All routes are prefixed with `/api/v1` and require a Bearer token (except `/auth/register` and `/auth/login`).

### Auth — `/auth`

| Method | Path        | Description              |
| ------ | ----------- | ------------------------ |
| POST   | `/register` | Register a new user      |
| POST   | `/login`    | Login (returns JWT)      |
| GET    | `/me`       | Get current user profile |

### Projects — `/projects`

| Method | Path                        | Description                                                 |
| ------ | --------------------------- | ----------------------------------------------------------- |
| POST   | `/`                         | List projects with filters (role-scoped)                    |
| POST   | `/create`                   | Create a new project                                        |
| POST   | `/import`                   | Bulk import projects                                        |
| GET    | `/unassigned`               | List unassigned projects (filtered by `?unitId=`)           |
| GET    | `/assigned`                 | List assigned projects (optionally filtered by `?date=`)    |
| GET    | `/waiting-cancel`           | List projects pending cancellation (filtered by `?unitId=`) |
| GET    | `/own`                      | List projects assigned to the current user                  |
| GET    | `/workload`                 | Get staff workload stats (scoped by role, `?unitId=`)       |
| GET    | `/summary`                  | Get project summary cards (scoped by role)                  |
| PATCH  | `/assign`                   | Assign projects to a staff member                           |
| PATCH  | `/accept`                   | Accept assigned projects                                    |
| GET    | `/:id`                      | Get project detail                                          |
| PATCH  | `/:id/claim`                | Self-assign an unassigned project                           |
| PATCH  | `/:id/change-assignee`      | Replace the current assignee                                |
| PATCH  | `/:id/add-assignee`         | Add an additional assignee                                  |
| PATCH  | `/:id/return`               | Return a project to unassigned                              |
| PATCH  | `/:id/cancel`               | Request cancellation                                        |
| PATCH  | `/:id/approve-cancel`       | Approve a cancellation request                              |
| PATCH  | `/:id/reject-cancel`        | Reject a cancellation request                               |
| PATCH  | `/:id/complete-procurement` | Advance to contract workflow                                |
| PATCH  | `/:id/complete-contract`    | Mark contract phase as complete (NOT_EXPORTED)              |
| PATCH  | `/:id/close`                | Close a completed project                                   |
| PATCH  | `/:id/request-edit`         | Reopen a closed project for editing (requires `reason`)     |
| PATCH  | `/:id/update`               | Update project information                                  |
| DELETE | `/:id`                      | Delete a project                                            |

### Submissions — `/submissions`

| Method | Path           | Description                                                       |
| ------ | -------------- | ----------------------------------------------------------------- |
| GET    | `/:projectId`  | Get all submissions for a project                                 |
| POST   | `/`            | Create a new submission (STAFF type)                              |
| PATCH  | `/:id/:action` | Handle submission action (`approve`, `propose`, `sign`, `reject`) |

### Users — `/users`

| Method | Path               | Description                                                                                                |
| ------ | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/`                | List users (optionally filter by `?unitId=` or `?deptId=`)                                                 |
| GET    | `/:id`             | Get user by ID                                                                                             |
| PATCH  | `/roles/supply`    | Bulk add/remove dept-level supply roles (`HEAD_OF_DEPARTMENT`, `ADMIN`, `FINANCE_STAFF`, `DOCUMENT_STAFF`) |
| POST   | `/:id/role`        | Add a role to a user (admin)                                                                               |
| PATCH  | `/:id/role/remove` | Remove a role from a user (admin)                                                                          |
| DELETE | `/:id`             | Delete a user                                                                                              |

### Units — `/units`

| Method | Path          | Description                                 |
| ------ | ------------- | ------------------------------------------- |
| GET    | `/`           | Paginated list of units                     |
| POST   | `/create`     | Create a unit                               |
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
| POST   | `/create`     | Create a department               |
| GET    | `/:id`        | Get department by ID              |
| PATCH  | `/:id/update` | Update a department               |
| DELETE | `/:id`        | Delete a department               |

### Delegations — `/delegations`

| Method | Path          | Description                                       |
| ------ | ------------- | ------------------------------------------------- |
| POST   | `/`           | Create a delegation                               |
| GET    | `/active`     | Get the active delegation for a unit (`?unitId=`) |
| GET    | `/:id`        | Get delegation by ID                              |
| PATCH  | `/:id/cancel` | Cancel a delegation                               |

### Budget Plans — `/budget-plans`

| Method | Path                       | Description                                           |
| ------ | -------------------------- | ----------------------------------------------------- |
| GET    | `/`                        | Paginated list of budget plans (filter by `?unitId=`) |
| POST   | `/`                        | Import budget plans (bulk)                            |
| PATCH  | `/:id/projects/:projectId` | Link a budget plan to a project                       |
| DELETE | `/:id`                     | Delete a budget plan                                  |

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

### Role Management Endpoints

Role mutations are split across two surfaces depending on context:

- **`PATCH /users/roles/supply`** — bulk add/remove dept-level supply roles (`HEAD_OF_DEPARTMENT`, `ADMIN`, `FINANCE_STAFF`, `DOCUMENT_STAFF`) for `DEPT-SUP-OPS`. Enforces the one-head-per-dept constraint.
- **`POST /users/:id/role`** / **`PATCH /users/:id/role/remove`** — general-purpose add/remove for any role in any department (admin use).
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

A user can delegate their roles to another user for a specified period. The delegatee inherits the delegator's roles during that window. Role changes and delegations update `role_updated_at`, which invalidates the auth LRU cache.

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
