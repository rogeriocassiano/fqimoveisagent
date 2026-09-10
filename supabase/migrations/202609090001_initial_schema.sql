create extension if not exists vector;
create extension if not exists pgcrypto;

create table organizations (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table profiles (id uuid primary key references auth.users on delete cascade, organization_id uuid not null references organizations on delete cascade, role text not null check (role in ('admin','director','broker')), name text, created_at timestamptz not null default now());
create table agents (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations on delete cascade, name text not null, persona text not null default '', tone text not null default '', status text not null default 'draft', created_at timestamptz not null default now());
create table agent_versions (id uuid primary key default gen_random_uuid(), agent_id uuid not null references agents on delete cascade, version integer not null, system_prompt text not null, config jsonb not null default '{}', published_at timestamptz, unique(agent_id, version));
create table sources (id uuid primary key default gen_random_uuid(), agent_id uuid not null references agents on delete cascade, type text not null, title text not null, uri text, status text not null default 'pending', priority integer not null default 0, valid_until timestamptz, metadata jsonb not null default '{}', created_at timestamptz not null default now());
create table documents (id uuid primary key default gen_random_uuid(), source_id uuid not null references sources on delete cascade, raw_content text, page_count integer, created_at timestamptz not null default now());
create table chunks (id uuid primary key default gen_random_uuid(), document_id uuid not null references documents on delete cascade, text text not null, embedding vector(768), metadata jsonb not null default '{}', token_count integer, page integer, audio_timestamp interval, search_vector tsvector generated always as (to_tsvector('portuguese', text)) stored);
create index chunks_embedding_hnsw on chunks using hnsw (embedding vector_cosine_ops);
create index chunks_search_vector_gin on chunks using gin(search_vector);
create table properties (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations on delete cascade, reference text not null, title text, type text, category text, city text, neighborhood text, address text, bedrooms integer, suites integer, bathrooms integer, parking_spaces integer, area numeric, sale_price numeric, rental_price numeric, condominium_fee numeric, property_tax numeric, status text not null default 'available', url text, payload jsonb not null default '{}', source_updated_at timestamptz, updated_at timestamptz not null default now(), unique(organization_id, reference));
create index properties_filters on properties(organization_id, status, city, neighborhood, type, bedrooms, sale_price);
create table conversations (id uuid primary key default gen_random_uuid(), agent_id uuid not null references agents on delete cascade, channel text not null, contact_id text not null, status text not null default 'open', assigned_to uuid references profiles, created_at timestamptz not null default now());
create table messages (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references conversations on delete cascade, role text not null, text text, audio_url text, tokens integer, latency_ms integer, cited_sources jsonb not null default '[]', feedback smallint, created_at timestamptz not null default now());
create table leads (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations on delete cascade, contact jsonb not null, source text, interest jsonb not null default '{}', score integer, broker_id uuid references profiles, created_at timestamptz not null default now());
create table audit_log (id bigint generated always as identity primary key, organization_id uuid not null references organizations on delete cascade, user_id uuid references profiles, action text not null, entity text not null, diff jsonb not null default '{}', created_at timestamptz not null default now());

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table agents enable row level security;
alter table agent_versions enable row level security;
alter table sources enable row level security;
alter table documents enable row level security;
alter table chunks enable row level security;
alter table properties enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table leads enable row level security;
alter table audit_log enable row level security;

create function current_organization_id() returns uuid language sql stable security definer set search_path = public as $$ select organization_id from profiles where id = auth.uid() $$;
create policy organization_members_read_properties on properties for select using (organization_id = current_organization_id());
create policy organization_members_read_agents on agents for select using (organization_id = current_organization_id());
create policy users_read_own_profile on profiles for select using (id = auth.uid());
