create or replace function public.__vault_probe()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = 'cron_secret';
  return v is not null and length(v) > 0;
end;
$$;

create or replace function public.__vault_names()
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare n text[];
begin
  select array_agg(name order by name) into n from vault.decrypted_secrets
  where name in ('cron_secret','supabase_url');
  return n;
end;
$$;

revoke all on function public.__vault_probe() from public, anon, authenticated;
revoke all on function public.__vault_names() from public, anon, authenticated;