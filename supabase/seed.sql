insert into public.invite_codes (code) values ('iheartjess')
on conflict (code) do nothing;
