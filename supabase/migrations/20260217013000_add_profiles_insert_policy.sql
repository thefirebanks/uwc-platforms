create policy "profiles_insert_self" on public.profiles
for insert
with check (auth.uid() = id);
