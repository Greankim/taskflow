# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Next.js dev server on http://localhost:3000
npm run build            # Production build
npm run start            # Run production build
npm run lint             # next lint
npm run seed:root-admin  # Create / promote ROOT_ADMIN_USERNAME from env to root_admin role
```

There is no test runner configured. Migrations under `supabase/migrations/*.sql` are not applied automatically — run them manually in the Supabase SQL Editor (or via Supabase CLI) in numeric order. When schema changes, add a new numbered migration file rather than editing past ones.

The dev server is Windows / PowerShell oriented (paths use `D:\Claudecode Project\taskflow`). `tsx` is used to run TypeScript scripts; the seed script loads `.env.local` via `dotenv` (see `scripts/seed-root-admin.ts`).

## Architecture

**Stack:** Next.js 14 App Router (TypeScript, Server Actions) + Supabase (Postgres + Realtime + Auth) + Tailwind. Deployed: Vercel (frontend), Supabase (backend).

### Auth model: username + password via synthetic email

The login UI accepts a username and password, but Supabase Auth requires an email. `lib/utils.ts::usernameToEmail()` maps `username` → `<username>@taskflow.app` (NOT `.local` — Supabase rejects `.local` as invalid). The seed script, register action, and login action all use this exact transform, so they must stay in sync. Email confirmation is disabled by always passing `email_confirm: true` when creating users via the admin API — this also sidesteps Supabase's email rate limit.

`/register` and `/admin/users` use the **service_role** client (`createAdminSupabase`) so they can create auth users and update roles without RLS interference. Regular pages use `createServerSupabase` (cookie-bound, RLS-enforced).

### Two-tier role system

Permission checks combine **global role** (`profiles.role`) and **per-team membership** (`team_members.role_in_team`):

- Global roles: `root_admin` | `admin` | `team_lead` | `worker` (set in `profiles.role`)
- Per-team roles: `lead` | `member` (in `team_members.role_in_team`)

The "can manage this team's projects/tasks" gate is:

```
isAdminOrAbove(globalRole) || myMembership?.role_in_team === "lead"
```

This pattern (called `iAmTeamLead` / `canManage` in page code) is repeated in `app/(app)/teams/[id]/page.tsx`, `app/(app)/projects/[id]/page.tsx`, and `TaskBoard.tsx`. Global `team_lead` role alone does NOT grant edit access to a specific team — only being a `lead` in that team's `team_members` row does (or being `admin` / `root_admin`).

`root_admin` is special: a DB trigger (`enforce_root_admin_lead`, migration 0004) forces `team_members.role_in_team = 'lead'` whenever a root_admin user is inserted/updated. UI also defensively treats root_admin as `lead` regardless of the row value, and blocks demoting/removing root_admin.

### Defense-in-depth for mutations

Every destructive / role-changing operation is enforced at **three** layers — keep all three in sync when adding features:

1. **UI gate** — hide the button/dropdown unless `canManage`/`iAmTeamLead` is true
2. **Server action** — re-check the actor via `assertActorIsLead(team_id)` or equivalent (`canSetUserRole` in `lib/permissions.ts`); refuse if target is `root_admin` and the action would demote
3. **RLS policy** — Postgres policy using `is_team_lead()` / `is_admin_or_above()` SQL helpers (migration 0001)

If you find yourself updating a server action that bypasses RLS via `createAdminSupabase()`, the actor check above it is the ONLY thing standing between a user and the data — do not remove it.

### Realtime sync

Supabase Realtime is enabled on `tasks`, `task_assignees`, `activity_logs` (added to `supabase_realtime` publication in 0001). Two patterns:

- `components/TaskBoard.tsx` (client) — subscribes per-project and invalidates a React Query key
- `components/RealtimeRefresher.tsx` (client, embedded in server components like `/dashboard`) — listens globally, debounces 250ms, then calls `router.refresh()` so the server component re-fetches

Use `RealtimeRefresher` for server-rendered pages that need to reflect data changes without manual refresh.

### Activity log via DB triggers

The `activity_logs` table is populated by Postgres triggers (`log_task_change`, `log_assignee_change`) — application code does NOT write to it for task/assignee events. When adding a new "loggable" task field, edit the trigger function in `supabase/migrations/` rather than peppering `INSERT` calls in TypeScript. The action enum (`activity_action_t`) is closed — adding new actions requires a migration.

### File layout reminders

- `app/(auth)/` — login, register (public)
- `app/(app)/` — authenticated app; layout includes the sidebar + `QueryProvider`
- `middleware.ts` — redirects unauthenticated requests to `/login`; matcher excludes `api/export` so CSV downloads work for the current session
- `lib/supabase/server.ts` — exports `createServerSupabase` (RLS) and `createAdminSupabase` (service_role bypass; server-only)
- `lib/permissions.ts` — pure helpers for global-role checks; team-level checks live inline in pages because they need DB data

### CSV export

`/api/export/tasks` and `/api/export/activity` are server route handlers that query under the caller's session (RLS-respecting), then stream CSV via `papaparse`. The middleware matcher explicitly excludes `/api/export` so the browser's direct navigation (`window.location.href = ...`) keeps the auth cookie. Column headers are in Thai; the CSV is prefixed with a UTF-8 BOM (`﻿`) so Excel opens it correctly.

### Things to know when changing the schema

- `display_name` was removed (migration 0003). UI shows `@username` everywhere — do not reintroduce it.
- The `handle_new_user` trigger reads `raw_user_meta_data->>'username'` from `auth.users` and creates the `profiles` row with `role='worker'`. If you change profile fields, update both the trigger and `register/page.tsx` `user_metadata`.
- RLS policies use SQL helper functions (`is_team_member`, `is_team_lead`, `is_admin_or_above`, `project_team`) — adding a new permission check should reuse these.
