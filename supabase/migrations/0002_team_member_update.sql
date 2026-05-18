-- Allow team leads (or admins) to update team_members.role_in_team
drop policy if exists tm_update on public.team_members;
create policy tm_update on public.team_members
  for update using (public.is_team_lead(team_id))
  with check (public.is_team_lead(team_id));
