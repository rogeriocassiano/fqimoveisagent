-- Tabelas da Academia de Vendas FQ Imóveis

-- Módulos de treinamento (roleplay)
create table if not exists training_modules (
  id bigserial primary key,
  ordem int not null default 0,
  ativo boolean not null default true,
  titulo text not null,
  descricao text not null default '',
  objetivo text not null default '',
  emoji text not null default '',
  dificuldade text not null default 'Médio' check (dificuldade in ('Iniciante', 'Médio', 'Avançado')),
  prompt_instrucoes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Perfis de cliente para roleplay
create table if not exists training_profiles (
  id bigserial primary key,
  ordem int not null default 0,
  ativo boolean not null default true,
  nome text not null,
  negocio text not null default '',
  emoji text not null default '',
  dor text not null default '',
  estilo text not null default '',
  prompt_instrucoes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sessões de roleplay
create table if not exists roleplay_sessions (
  id bigserial primary key,
  agent_id uuid not null references agents(id) on delete cascade,
  vendedor_email text not null,
  modulo_id bigint references training_modules(id),
  perfil_id bigint references training_profiles(id),
  mensagens jsonb not null default '[]',
  duracao_segundos int not null default 0,
  nota numeric(4,2),
  feedback jsonb,
  created_at timestamptz not null default now()
);

-- RLS
alter table training_modules enable row level security;
alter table training_profiles enable row level security;
alter table roleplay_sessions enable row level security;

create policy "authenticated_read_training_modules"
  on training_modules for select to authenticated using (true);

create policy "authenticated_read_training_profiles"
  on training_profiles for select to authenticated using (true);

create policy "authenticated_read_roleplay_sessions"
  on roleplay_sessions for select to authenticated using (true);

create policy "authenticated_write_roleplay_sessions"
  on roleplay_sessions for insert to authenticated with check (true);

-- Seed módulos de treinamento imobiliário
insert into training_modules (ordem, ativo, titulo, descricao, objetivo, emoji, dificuldade)
values
  (0, true, 'Abertura & Conexão', 'Captar atenção nos primeiros 30s e criar rapport', 'Cliente concorda em ouvir a proposta', '📞', 'Iniciante'),
  (1, true, 'Qualificação BANT', 'Descobrir orçamento, autoridade, necessidade e timing', 'Entender perfil completo antes de propor', '🔍', 'Médio'),
  (2, true, 'Apresentação do Apartamento', 'Mostrar o imóvel conectando com a necessidade do cliente', 'Cliente visualiza valor do imóvel', '🏢', 'Médio'),
  (3, true, 'Objeção: Preço', 'Lidar com "está caro" e "encontrei mais barato"', 'Reverter objeção de preço e avançar', '💸', 'Médio'),
  (4, true, 'Objeção: Prazo e Entrega', 'Negociar prazos, entrega e condições de pagamento', 'Fechar condições favoráveis', '🚚', 'Avançado'),
  (5, true, 'Visitas e Proposta', 'Converter interesse em visita ou proposta formal', 'Cliente aceita visitar ou receber proposta', '📋', 'Médio'),
  (6, true, 'Fechamento & Próximo Passo', 'Propor ação concreta sem ser agressivo', 'Cliente confirma proposta ou agenda próxima etapa', '🤝', 'Avançado'),
  (7, true, 'Pós-Venda & Fidelização', 'Garantir satisfação e abrir oportunidade de indicação', 'Cliente satisfeito e indicação agendada', '🌟', 'Médio'),
  (8, true, 'Roleplay Livre', 'Simule uma ligação completa do zero ao fechamento', 'Conduzir toda a jornada comercial', '🎯', 'Avançado')
on conflict do nothing;

-- Seed perfis de clientes imobiliários
insert into training_profiles (ordem, ativo, nome, negocio, emoji, dor, estilo)
values
  (0, true, 'João', 'Primeiro apartamento', '🏠', 'inseguro sobre documentação e condições de financiamento', 'cauteloso, faz muitas perguntas, busca segurança e preço justo'),
  (1, true, 'Carlos', 'Investidor de imóveis', '💼', 'encontrar apartamento com boa rentabilidade e valorização', 'direto, focado em números, compara com outros investimentos'),
  (2, true, 'Mariana', 'Família com filhos', '👨‍👩‍👧‍👦', 'precisa de espaço, segurança e escola próxima', 'detalhista, pensa no bem-estar da família, visita várias vezes'),
  (3, true, 'Ana', 'Jovem casal', '💑', 'quer modernidade, condomínio com lazer e facilidade de acesso', 'visual, valoriza áreas comuns e estética, decide em conjunto'),
  (4, true, 'Roberto', 'Cliente de alto padrão', '🥂', 'busca exclusividade, local nobre e atendimento impecável', 'sofisticado, exige atenção, não discute preço abertamente')
on conflict do nothing;
