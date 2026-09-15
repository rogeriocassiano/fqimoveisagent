-- Adiciona papel trainee para usuários que só fazem roleplay
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin','director','broker','trainee'));

-- Permite que admins e diretores vejam todos os perfis da organização
create policy organization_read_profiles
  on profiles for select
  to authenticated
  using (
    organization_id = current_organization_id()
    and exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('admin','director')
    )
  );

-- Permite que admins e diretores criem perfis na organização
create policy organization_insert_profiles
  on profiles for insert
  to authenticated
  with check (
    organization_id = current_organization_id()
    and exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('admin','director')
    )
  );
