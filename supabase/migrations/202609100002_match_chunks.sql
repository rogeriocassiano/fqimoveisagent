create or replace function match_chunks(
  query_embedding vector(768),
  filter_agent_id uuid,
  match_threshold float default 0.5,
  match_count int default 10
)
returns table(
  id uuid,
  document_id uuid,
  text text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    c.id,
    c.document_id,
    c.text,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on d.id = c.document_id
  join sources s on s.id = d.source_id
  where s.agent_id = filter_agent_id
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;
