-- Sessões de conexão WhatsApp (QR via serviço Baileys no Railway)

create table if not exists wa_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  phone text,
  status text not null default 'pending' check (status in ('pending','connecting','qr','connected','disconnected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table wa_sessions enable row level security;

create policy "authenticated_read_wa_sessions"
  on wa_sessions for select to authenticated using (true);

create policy "authenticated_write_wa_sessions"
  on wa_sessions for insert to authenticated with check (true);

notify pgrst, 'reload schema';
