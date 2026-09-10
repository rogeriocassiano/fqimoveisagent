insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "Service role can manage documents"
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');
