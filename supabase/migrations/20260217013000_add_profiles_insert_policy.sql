do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_insert_self'
  ) then
    create policy "profiles_insert_self" on public.profiles
    for insert
    with check (auth.uid() = id);
  end if;
end
$$;
