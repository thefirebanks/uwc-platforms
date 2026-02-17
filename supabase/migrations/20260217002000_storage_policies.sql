create policy "applicant_upload_own_documents" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'application-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "applicant_read_own_documents" on storage.objects
for select to authenticated
using (
  bucket_id = 'application-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.current_user_role() = 'admin'
  )
);

create policy "admin_manage_documents" on storage.objects
for all to authenticated
using (
  bucket_id = 'application-documents'
  and public.current_user_role() = 'admin'
)
with check (
  bucket_id = 'application-documents'
  and public.current_user_role() = 'admin'
);
