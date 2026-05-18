-- TaskFlow initial schema + RLS + triggers
-- Run in Supabase SQL editor (or via supabase CLI: supabase db push)

create extension if not exists "pgcrypto";

-- ============ ENUMS ============
do $$ begin
  create type role_t as enum ('root_admin', 'admin', 'team_lead', 'worker');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status_t as enum ('TODO', 'DOING', 'DONE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_action_t as enum (
    'task_created','task_updated','task_deleted',
    'status_changed','deadline_changed',
    'assignee_added','assignee_removed',
    'project_created','project_deleted',
    'team_created','team_deleted',
    'role_changed','invite_created','invite_used'
  );
exception when duplicate_object then null; end $$;

-- ============ TABLES ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  role role_t not null default 'worker',
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_in_team text not null default 'member' check (role_in_team in ('lead','member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  code char(6) unique not null,
  invited_username text,
  expires_at timestamptz not null,
  used_by uuid references public.profiles(id),
  used_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  status task_status_t not null default 'TODO',
  deadline date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  actor_id uuid references public.profiles(id),
  action activity_action_t not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tasks_project on public.tasks(project_id);
create index if not exists idx_assignees_user on public.task_assignees(user_id);
create index if not exists idx_logs_project on public.activity_logs(project_id, created_at desc);

-- ============ HELPER FUNCTIONS ============
create or replace function public.current_role()
returns role_t language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin_or_above()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','root_admin') from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_lead_or_above()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('team_lead','admin','root_admin') from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_team_member(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where team_id = p_team_id and user_id = auth.uid())
      or public.is_admin_or_above();
$$;

create or replace function public.is_team_lead(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = auth.uid() and role_in_team = 'lead'
  ) or public.is_admin_or_above();
$$;

create or replace function public.project_team(p_project_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.projects where id = p_project_id;
$$;

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uname text;
  dname text;
begin
  uname := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  dname := coalesce(new.raw_user_meta_data->>'display_name', uname);
  insert into public.profiles (id, username, display_name, role)
  values (new.id, uname, dname, 'worker')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ============ TASK / ASSIGNEE LOG TRIGGERS ============
create or replace function public.log_task_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  tid uuid;
begin
  if tg_op = 'INSERT' then
    pid := new.project_id;
    select team_id into tid from public.projects where id = pid;
    insert into public.activity_logs(project_id, team_id, task_id, actor_id, action, payload)
    values (pid, tid, new.id, auth.uid(), 'task_created',
      jsonb_build_object('title', new.title, 'status', new.status, 'deadline', new.deadline));
    return new;
  elsif tg_op = 'UPDATE' then
    pid := new.project_id;
    select team_id into tid from public.projects where id = pid;
    if new.status is distinct from old.status then
      insert into public.activity_logs(project_id, team_id, task_id, actor_id, action, payload)
      values (pid, tid, new.id, auth.uid(), 'status_changed',
        jsonb_build_object('title', new.title, 'from', old.status, 'to', new.status));
    end if;
    if new.deadline is distinct from old.deadline then
      insert into public.activity_logs(project_id, team_id, task_id, actor_id, action, payload)
      values (pid, tid, new.id, auth.uid(), 'deadline_changed',
        jsonb_build_object('title', new.title, 'from', old.deadline, 'to', new.deadline));
    end if;
    if new.title is distinct from old.title then
      insert into public.activity_logs(project_id, team_id, task_id, actor_id, action, payload)
      values (pid, tid, new.id, auth.uid(), 'task_updated',
        jsonb_build_object('from', old.title, 'to', new.title));
    end if;
    new.updated_at := now();
    return new;
  elsif tg_op = 'DELETE' then
    pid := old.project_id;
    select team_id into tid from public.projects where id = pid;
    insert into public.activity_logs(project_id, team_id, task_id, actor_id, action, payload)
    values (pid, tid, old.id, auth.uid(), 'task_deleted', jsonb_build_object('title', old.title));
    return old;
  end if;
  return null;
end $$;

drop trigger if exists trg_log_task on public.tasks;
create trigger trg_log_task
  after insert or update or delete on public.tasks
  for each row execute function public.log_task_change();

create or replace function public.log_assignee_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pid uuid; tid uuid; uname text;
begin
  if tg_op = 'INSERT' then
    select project_id into pid from public.tasks where id = new.task_id;
    select team_id into tid from public.projects where id = pid;
    select username into uname from public.profiles where id = new.user_id;
    insert into public.activity_logs(project_id, team_id, task_id, actor_id, action, payload)
    values (pid, tid, new.task_id, auth.uid(), 'assignee_added',
      jsonb_build_object('user_id', new.user_id, 'username', uname));
    return new;
  elsif tg_op = 'DELETE' then
    select project_id into pid from public.tasks where id = old.task_id;
    select team_id into tid from public.projects where id = pid;
    select username into uname from public.profiles where id = old.user_id;
    insert into public.activity_logs(project_id, team_id, task_id, actor_id, action, payload)
    values (pid, tid, old.task_id, auth.uid(), 'assignee_removed',
      jsonb_build_object('user_id', old.user_id, 'username', uname));
    return old;
  end if;
  return null;
end $$;

drop trigger if exists trg_log_assignee on public.task_assignees;
create trigger trg_log_assignee
  after insert or delete on public.task_assignees
  for each row execute function public.log_assignee_change();

-- ============ ENABLE RLS ============
alter table public.profiles       enable row level security;
alter table public.teams          enable row level security;
alter table public.team_members   enable row level security;
alter table public.team_invites   enable row level security;
alter table public.projects       enable row level security;
alter table public.tasks          enable row level security;
alter table public.task_assignees enable row level security;
alter table public.activity_logs  enable row level security;

-- ============ PROFILES POLICIES ============
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles
  for select using (auth.uid() is not null);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update using (public.is_admin_or_above())
  with check (public.is_admin_or_above() and role <> 'root_admin');

-- ============ TEAMS ============
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select using (public.is_team_member(id) or public.is_admin_or_above());

drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams
  for insert with check (public.is_lead_or_above() and created_by = auth.uid());

drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams
  for update using (public.is_team_lead(id));

drop policy if exists teams_delete on public.teams;
create policy teams_delete on public.teams
  for delete using (public.is_team_lead(id));

-- ============ TEAM MEMBERS ============
drop policy if exists tm_select on public.team_members;
create policy tm_select on public.team_members
  for select using (public.is_team_member(team_id));

drop policy if exists tm_insert on public.team_members;
create policy tm_insert on public.team_members
  for insert with check (public.is_team_lead(team_id) or user_id = auth.uid());

drop policy if exists tm_delete on public.team_members;
create policy tm_delete on public.team_members
  for delete using (public.is_team_lead(team_id) or user_id = auth.uid());

-- ============ INVITES ============
drop policy if exists inv_select on public.team_invites;
create policy inv_select on public.team_invites
  for select using (public.is_team_member(team_id) or invited_username =
    (select username from public.profiles where id = auth.uid()));

drop policy if exists inv_insert on public.team_invites;
create policy inv_insert on public.team_invites
  for insert with check (public.is_team_lead(team_id) and created_by = auth.uid());

drop policy if exists inv_update on public.team_invites;
create policy inv_update on public.team_invites
  for update using (auth.uid() is not null);

-- ============ PROJECTS ============
drop policy if exists proj_select on public.projects;
create policy proj_select on public.projects
  for select using (public.is_team_member(team_id));

drop policy if exists proj_insert on public.projects;
create policy proj_insert on public.projects
  for insert with check (public.is_team_lead(team_id) and created_by = auth.uid());

drop policy if exists proj_update on public.projects;
create policy proj_update on public.projects
  for update using (public.is_team_lead(team_id));

drop policy if exists proj_delete on public.projects;
create policy proj_delete on public.projects
  for delete using (public.is_team_lead(team_id));

-- ============ TASKS ============
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (public.is_team_member(public.project_team(project_id)));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert with check (public.is_team_lead(public.project_team(project_id)));

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update using (
    public.is_team_lead(public.project_team(project_id))
    or exists (select 1 from public.task_assignees where task_id = tasks.id and user_id = auth.uid())
  );

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete using (public.is_team_lead(public.project_team(project_id)));

-- ============ TASK ASSIGNEES ============
drop policy if exists ta_select on public.task_assignees;
create policy ta_select on public.task_assignees
  for select using (
    exists (select 1 from public.tasks t where t.id = task_id
            and public.is_team_member(public.project_team(t.project_id)))
  );

drop policy if exists ta_insert on public.task_assignees;
create policy ta_insert on public.task_assignees
  for insert with check (
    exists (select 1 from public.tasks t where t.id = task_id
            and public.is_team_lead(public.project_team(t.project_id)))
  );

drop policy if exists ta_delete on public.task_assignees;
create policy ta_delete on public.task_assignees
  for delete using (
    exists (select 1 from public.tasks t where t.id = task_id
            and public.is_team_lead(public.project_team(t.project_id)))
  );

-- ============ ACTIVITY LOGS ============
drop policy if exists log_select on public.activity_logs;
create policy log_select on public.activity_logs
  for select using (
    (team_id is not null and public.is_team_lead(team_id))
    or public.is_admin_or_above()
  );

-- ============ REALTIME ============
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_assignees;
alter publication supabase_realtime add table public.activity_logs;
