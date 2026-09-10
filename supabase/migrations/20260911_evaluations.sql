-- Tabela de avaliações detalhadas de roleplay

create table if not exists training_evaluations (
  id bigserial primary key,
  session_id bigint not null references roleplay_sessions(id) on delete cascade,
  vendedor_email text not null,
  modulo_titulo text not null default '',
  nota_final numeric(4,2) not null,
  abertura_nota numeric(3,1) not null default 0,
  abertura_feedback text not null default '',
  qualificacao_nota numeric(3,1) not null default 0,
  qualificacao_feedback text not null default '',
  apresentacao_nota numeric(3,1) not null default 0,
  apresentacao_feedback text not null default '',
  objecoes_nota numeric(3,1) not null default 0,
  objecoes_feedback text not null default '',
  fechamento_nota numeric(3,1) not null default 0,
  fechamento_feedback text not null default '',
  linguagem_nota numeric(3,1) not null default 0,
  linguagem_feedback text not null default '',
  empatia_nota numeric(3,1) not null default 0,
  empatia_feedback text not null default '',
  pontos_fortes jsonb not null default '[]',
  pontos_melhora jsonb not null default '[]',
  acoes_sugeridas jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table training_evaluations enable row level security;

create policy "authenticated_read_training_evaluations"
  on training_evaluations for select to authenticated using (true);

create policy "authenticated_write_training_evaluations"
  on training_evaluations for insert to authenticated with check (true);
