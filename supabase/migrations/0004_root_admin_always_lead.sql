-- Root admin is always 'lead' in every team they join.

-- Backfill: promote existing root_admin rows to 'lead'
update public.team_members tm
set role_in_team = 'lead'
from public.profiles p
where p.id = tm.user_id
  and p.role = 'root_admin'
  and tm.role_in_team <> 'lead';

-- Trigger: force role_in_team='lead' on insert/update if user is root_admin
create or replace function public.enforce_root_admin_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r role_t;
begin
  select role into r from public.profiles where id = new.user_id;
  if r = 'root_admin' then
    new.role_in_team := 'lead';
  end if;
  return new;
end $$;

drop trigger if exists trg_root_admin_lead on public.team_members;
create trigger trg_root_admin_lead
  before insert or update on public.team_members
  for each row execute function public.enforce_root_admin_lead();
