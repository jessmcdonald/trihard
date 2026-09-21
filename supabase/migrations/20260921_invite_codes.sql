-- Invite-only signup
-- Shared production code (unlimited uses). Add more in Studio if needed:
--   insert into public.invite_codes (code) values ('another-code');
--   insert into public.invite_codes (code, max_uses) values ('friend-ada', 1);

create table invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace function normalize_invite_code()
returns trigger as $$
begin
  new.code := lower(trim(new.code));
  if new.code = '' then
    raise exception 'Invite code cannot be empty';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger invite_codes_normalize
  before insert or update on invite_codes
  for each row execute function normalize_invite_code();

alter table invite_codes enable row level security;

create or replace function is_valid_invite_code(invite text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from invite_codes
    where code = lower(trim(invite))
      and (max_uses is null or use_count < max_uses)
  );
$$;

revoke all on function is_valid_invite_code(text) from public;
grant execute on function is_valid_invite_code(text) to anon, authenticated;

-- Official Auth hook: reject the user before auth.users is written.
-- Enable in hosted Supabase: Authentication → Hooks → Before User Created
--   pg-functions://postgres/public/before_user_created
create or replace function before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  submitted text;
begin
  submitted := trim(coalesce(event->'user'->'user_metadata'->>'invite_code', ''));

  if not is_valid_invite_code(submitted) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Invalid invite code'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

revoke all on function before_user_created(jsonb) from public;
grant execute on function before_user_created(jsonb) to supabase_auth_admin;

create or replace function handle_new_user()
returns trigger as $$
declare
  submitted text;
begin
  submitted := lower(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));

  update invite_codes
    set use_count = use_count + 1
    where code = submitted
      and (max_uses is null or use_count < max_uses);

  if not found then
    raise exception 'Invalid invite code';
  end if;

  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));

  return new;
end;
$$ language plpgsql security definer
set search_path = public;

insert into public.invite_codes (code) values ('iheartjess');
