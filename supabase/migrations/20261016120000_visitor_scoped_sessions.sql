-- Scope chat sessions to the anonymous visitor cookie and cascade session
-- deletes to their conversation turns.
--
-- Apply after supabase/schema.sql, either by pasting this file into the
-- Supabase SQL editor or with:
--   psql "$DATABASE_URL" -f supabase/migrations/20261016120000_visitor_scoped_sessions.sql
-- The migration is idempotent, so running it again is harmless.
--
-- Sessions created before this migration have no visitor_id, so no visitor
-- can list or open them.

alter table chat_sessions
  add column if not exists visitor_id text;

alter table chat_sessions
  add column if not exists updated_at timestamptz not null default now();

create index if not exists chat_sessions_visitor_updated_at_idx
  on chat_sessions (visitor_id, updated_at desc);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'conversations_session_id_fkey'
      and conrelid = 'conversations'::regclass
      and confdeltype <> 'c'
  ) then
    alter table conversations
      drop constraint conversations_session_id_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_session_id_fkey'
      and conrelid = 'conversations'::regclass
  ) then
    alter table conversations
      add constraint conversations_session_id_fkey
      foreign key (session_id)
      references chat_sessions (id)
      on delete cascade;
  end if;
end $$;
