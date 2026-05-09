create extension if not exists vector;

create table if not exists documents (
  id bigserial primary key,
  source_type text not null,
  source_name text not null,
  source_path text not null,
  source_url text,
  chunk_index int not null,
  content text not null,
  content_hash text not null,
  embedding_model text not null default 'text-embedding-3-small',
  metadata jsonb not null default '{}',
  embedding vector(1536),
  created_at timestamptz not null default now()
);

alter table documents
  add column if not exists source_path text;

alter table documents
  add column if not exists content_hash text;

alter table documents
  add column if not exists embedding_model text default 'text-embedding-3-small';

create table if not exists conversations (
  id bigserial primary key,
  session_id bigint,
  channel text not null,
  user_message text not null,
  assistant_message text,
  retrieved_document_ids bigint[] not null default '{}',
  grounded boolean,
  latency_ms int,
  created_at timestamptz not null default now()
);

create table if not exists chat_sessions (
  id bigserial primary key,
  title text not null,
  created_at timestamptz not null default now()
);

alter table conversations
  add column if not exists session_id bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_session_id_fkey'
  ) then
    alter table conversations
      add constraint conversations_session_id_fkey
      foreign key (session_id)
      references chat_sessions (id)
      on delete set null;
  end if;
end $$;

alter table documents enable row level security;
alter table conversations enable row level security;
alter table chat_sessions enable row level security;

create index if not exists documents_source_type_idx
  on documents (source_type);

create index if not exists documents_metadata_idx
  on documents using gin (metadata);

create unique index if not exists documents_source_path_chunk_idx
  on documents (source_path, chunk_index);

create index if not exists documents_embedding_idx
  on documents using hnsw (embedding vector_cosine_ops);

create index if not exists conversations_session_id_idx
  on conversations (session_id);

create index if not exists conversations_created_at_idx
  on conversations (created_at desc);

create index if not exists chat_sessions_created_at_idx
  on chat_sessions (created_at desc);

create or replace function match_documents(
  query_embedding vector(1536),
  match_count int default 6,
  match_threshold float default 0.18
)
returns table (
  id bigint,
  source_type text,
  source_name text,
  source_path text,
  source_url text,
  chunk_index int,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
as $$
  select
    documents.id,
    documents.source_type,
    documents.source_name,
    documents.source_path,
    documents.source_url,
    documents.chunk_index,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.embedding is not null
    and 1 - (documents.embedding <=> query_embedding) >= match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
$$;
