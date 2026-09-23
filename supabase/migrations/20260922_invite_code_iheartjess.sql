-- Ensure the shared production code exists even if 20260921 was applied
-- before the insert was added to that migration.

insert into public.invite_codes (code) values ('iheartjess')
on conflict (code) do nothing;

grant execute on function public.is_valid_invite_code(text) to anon, authenticated, supabase_auth_admin;

create or replace function public.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  submitted text;
begin
  submitted := coalesce(
    event->'user'->'user_metadata'->>'invite_code',
    event->'user'->'raw_user_meta_data'->>'invite_code',
    event->'user_metadata'->>'invite_code',
    ''
  );

  if not public.is_valid_invite_code(submitted) then
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

notify pgrst, 'reload schema';
