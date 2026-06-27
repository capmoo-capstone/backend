# Coding Style

This backend uses a gradual coding style rollout. Formatting is enforced now, while stricter lint and typing cleanup can be improved over time without blocking normal work.

## Quick Summary

- Use Prettier for formatting: CRLF, semicolons, single quotes, and ES5 trailing commas.
- Use kebab-case filenames, such as `budget-plan.service.ts`.
- Use `snake_case` for schema payload fields, such as `project_id`, `workflow_type`, and `budget_year`.
- Use `camelCase` for local TypeScript variables and functions, such as `projectId`, `workflowType`, and `createProject`.
- Use `PascalCase` for schemas, DTOs, interfaces, types, classes, and error types.
- Keep routes thin, controllers HTTP-focused, and services responsible for business logic and Prisma access.
- Throw shared app errors from services and let the shared error middleware handle responses.
- Avoid new `any`; prefer Prisma types, DTOs, response types, or narrow local types.

## Formatting

- Use Prettier as the source of truth for formatting.
- Current Prettier settings are CRLF line endings, semicolons, single quotes, and ES5 trailing commas.
- Do not manually align object values or columns. Let Prettier decide spacing.
- Run `npm run format` before committing broad formatting changes.
- Run `npm run format:check` to verify formatting without rewriting files.

## Project Layout

- `src/routes`: define route paths and attach middleware.
- `src/controllers`: validate request data, call services, and shape HTTP responses.
- `src/services`: own business logic, Prisma calls, transactions, and domain rules.
- `src/schemas`: define Zod request schemas and DTO types inferred from them.
- `src/types`: define API response types and shared request context types.
- `src/lib`: shared domain helpers, constants, permissions, and errors.
- `src/middlewares`: Express middleware such as auth and error handling.

## Naming

- Use kebab-case for filenames, such as `budget-plan.service.ts`.
- Use camelCase for functions, variables, and object properties created in TypeScript.
- Use PascalCase for interfaces, type aliases, DTOs, schemas, classes, and error types.
- Use snake_case for schema payload fields because they represent API payloads aligned with Prisma and database fields.
- Preserve Prisma model, enum, and database field names when they come from generated Prisma types.
- Name controllers and services after their domain action, such as `createProject`, `listUsers`, or `approveSubmission`.

## Layering

- Routes should stay thin: route path, middleware, and controller only.
- Controllers should parse and validate inputs, pass authenticated context where needed, and return status codes consistently.
- Controllers should avoid local `try/catch`; let shared error middleware handle thrown errors.
- Services should throw shared `AppError` variants such as `BadRequestError`, `NotFoundError`, `ForbiddenError`, and `UnauthorizedError`.
- Services should be the only layer that contains Prisma queries except for narrow infrastructure helpers.

## Types

- Avoid new `any` usage. Prefer Prisma generated types, DTO types, response types, or narrow local types.
- If `any` is unavoidable during a gradual cleanup, keep it local and do not expose it in public service or controller contracts.
- Keep request DTOs inferred from Zod schemas when possible.
- Keep response types in `src/types` when the shape is shared or returned by a service.

## Checks

- `npm run lint` checks ESLint rules. Warnings are allowed during the gradual rollout, but new code should not add unused imports or avoidable `any`.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm run format:check` verifies Prettier formatting.
- Generated and local files such as `node_modules/`, `dist/`, `.env`, `.vercel/`, and `swagger-output.json` stay excluded from style enforcement.
