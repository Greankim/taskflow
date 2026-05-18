-- Drop display_name column from profiles. Username is sufficient as display.

-- Rewrite the auth.users insert trigger without display_name
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uname text;
begin
  uname := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  insert into public.profiles (id, username, role)
  values (new.id, uname, 'worker')
  on conflict (id) do nothing;
  return new;
end $$;

alter table public.profiles drop column if exists display_name;
