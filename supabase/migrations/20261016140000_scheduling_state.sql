-- Store each chat session's scheduling state and each turn's metadata
-- (sources, scheduling card, stopped flag) so reloaded chats can render them.
--
-- Apply after 20261016120000_visitor_scoped_sessions.sql, either by pasting
-- this file into the Supabase SQL editor or with:
--   psql "$DATABASE_URL" -f supabase/migrations/20261016140000_scheduling_state.sql
-- The migration is idempotent, so running it again is harmless.
--
-- Existing sessions get a null scheduling state (no booking in progress) and
-- existing turns get empty metadata.

alter table chat_sessions
  add column if not exists scheduling jsonb;

-- Bumped on every scheduling save; a save names the version it read, so two
-- requests in one chat cannot overwrite each other's booking state.
alter table chat_sessions
  add column if not exists scheduling_version integer not null default 0;

alter table conversations
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Regenerating an answer replaces the session's newest chat turn. The newest
-- check and the update run as one statement, so a turn that arrives in between
-- is never overwritten.
create or replace function replace_latest_chat_turn(
  target_session_id bigint,
  target_turn_id bigint,
  user_message text,
  assistant_message text,
  retrieved_document_ids bigint[],
  grounded boolean,
  latency_ms int,
  metadata jsonb
)
returns setof conversations
language sql
as $$
  update conversations
  set user_message = replace_latest_chat_turn.user_message,
      assistant_message = replace_latest_chat_turn.assistant_message,
      retrieved_document_ids = replace_latest_chat_turn.retrieved_document_ids,
      grounded = replace_latest_chat_turn.grounded,
      latency_ms = replace_latest_chat_turn.latency_ms,
      metadata = replace_latest_chat_turn.metadata
  where id = target_turn_id
    and session_id = target_session_id
    and channel = 'chat'
    and id = (
      select max(id)
      from conversations
      where session_id = target_session_id
        and channel = 'chat'
    )
  returning *;
$$;

-- Only the server (service role) calls this; keep it off the public API.
revoke execute on function replace_latest_chat_turn(bigint, bigint, text, text, bigint[], boolean, int, jsonb)
  from public, anon, authenticated;
