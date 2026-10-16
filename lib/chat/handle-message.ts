import { BookingError, createBooking } from "@/lib/calendar/booking";
import { findSlots } from "@/lib/calendar/slots";
import { routeMessage } from "@/lib/chat/router";
import { lockScheduling, type SchedulingLock } from "@/lib/chat/scheduling-lock";
import { chatRequestSchema, type ChatRequest } from "@/lib/chat/schema";
import type {
  ChatAction,
  ChatDone,
  ChatIntent,
  ChatStage,
  SchedulingSnapshot,
  Source,
  TurnMetadata
} from "@/lib/chat/types";
import { clientIp, jsonError } from "@/lib/http";
import type { ConversationTurn } from "@/lib/llm/grounded-answer";
import type { RequestLogger } from "@/lib/logger";
import { streamProfileAnswer } from "@/lib/profile/answer";
import { limitBookingAttempt, limitChatRequest } from "@/lib/rate-limit";
import { advanceScheduling, type SchedulingInput } from "@/lib/scheduling/flow";
import { toSnapshot, type SchedulingState } from "@/lib/scheduling/state";
import { titleFromConversation, titleFromUserMessage } from "@/lib/session-titles";
import { getChatStore } from "@/lib/store";
import type { ChatStore, NewTurn, SessionRecord, TurnRecord } from "@/lib/store/types";
import { getVisitor, type Visitor } from "@/lib/visitor";

const HISTORY_TURN_LIMIT = 6;
const SESSION_NOT_FOUND = "Chat session not found.";
const TURN_NOT_FOUND = "Only the latest answer in this chat can be regenerated.";
const BOOKING_TURN_NOT_REGENERABLE =
  "Booking replies can't be regenerated. Send a new message instead.";
const SCHEDULING_BUSY_REPLY =
  "I'm still working on your previous booking request in this chat. Give it a moment, then check the latest reply.";

class ChatNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatNotFoundError";
  }
}

type Identity = { ip: string; visitorId: string };

type ChatSession = {
  store: ChatStore;
  record: SessionRecord;
  isNew: boolean;
};

export type PreparedChatTurn = {
  message: string;
  action: ChatAction | null;
  replaceTurnId: number | null;
  identity: Identity;
  session: ChatSession | null;
  history: TurnRecord[];
};

export type ChatSink = {
  meta(sessionId: number | null): void;
  status(stage: ChatStage): void;
  token(token: string): void;
};

type TurnContext = {
  sink: ChatSink;
  signal: AbortSignal;
  logger: RequestLogger;
};

type TurnAnswer = {
  answer: string;
  intent: ChatIntent;
  grounded: boolean;
  sources: Source[];
  documentIds: number[];
  scheduling: { state: SchedulingState; lock: SchedulingLock } | null;
};

function retryMessage(seconds: number) {
  const unit = seconds === 1 ? "second" : "seconds";
  return `You're sending messages faster than I can answer. Try again in ${seconds} ${unit}.`;
}

function rejected(response: Response, logger: RequestLogger) {
  response.headers.set("x-request-id", logger.requestId);
  logger.set({ status: response.status });
  logger.flush(response.status >= 500 ? "error" : "rejected");
  return response;
}

async function openSession(
  store: ChatStore,
  visitorId: string,
  body: ChatRequest
): Promise<{ session: ChatSession; history: TurnRecord[] }> {
  if (body.sessionId === undefined) {
    if (body.replaceTurnId !== undefined) throw new ChatNotFoundError(TURN_NOT_FOUND);
    const summary = await store.createSession(visitorId, titleFromUserMessage(body.message));
    const record = { ...summary, scheduling: null, schedulingVersion: 0 };
    return { session: { store, record, isNew: true }, history: [] };
  }

  const record = await store.getSession(visitorId, body.sessionId);
  if (!record) throw new ChatNotFoundError(SESSION_NOT_FOUND);

  const turns = await store.recentTurns(record.id, HISTORY_TURN_LIMIT + 1);
  if (body.replaceTurnId === undefined) {
    return { session: { store, record, isNew: false }, history: turns.slice(-HISTORY_TURN_LIMIT) };
  }

  const target = turns.at(-1);
  if (target?.id !== body.replaceTurnId) throw new ChatNotFoundError(TURN_NOT_FOUND);
  // Regenerating a booking reply would rerun the booking and drop its confirmation card.
  if (target.metadata.intent === "scheduling") {
    throw new ChatNotFoundError(BOOKING_TURN_NOT_REGENERABLE);
  }
  return { session: { store, record, isNew: false }, history: turns.slice(0, -1) };
}

// Throws ChatNotFoundError for a session the visitor does not own, or a replaceTurnId that is
// not that session's latest answer to a profile question. Store outages degrade to answering
// without a session.
export async function prepareChatTurn({
  identity,
  body
}: {
  identity: Identity;
  body: ChatRequest;
}): Promise<PreparedChatTurn> {
  const store = getChatStore();
  let opened: Awaited<ReturnType<typeof openSession>> | null = null;

  if (store) {
    try {
      opened = await openSession(store, identity.visitorId, body);
    } catch (error) {
      if (error instanceof ChatNotFoundError) throw error;
      console.error("Chat history is unavailable; answering without it.", error);
    }
  }

  return {
    message: body.message,
    action: body.action ?? null,
    replaceTurnId: opened ? body.replaceTurnId ?? null : null,
    identity,
    session: opened?.session ?? null,
    history: opened?.history ?? []
  };
}

export async function startChatTurn(
  request: Request,
  logger: RequestLogger
): Promise<PreparedChatTurn | Response> {
  // Requiring JSON forces a CORS preflight, so other sites cannot drive chat from a visitor's browser.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return rejected(
      jsonError(415, "invalid_request", "Content-Type must be application/json."),
      logger
    );
  }

  const json = await request.json().catch(() => undefined);
  if (json === undefined) {
    return rejected(jsonError(400, "invalid_request", "Request body must be JSON."), logger);
  }

  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success) {
    return rejected(jsonError(400, "invalid_request", parsed.error.issues[0].message), logger);
  }

  let visitor: Visitor;
  try {
    visitor = await getVisitor();
  } catch (error) {
    console.error("Chat visitor setup failed.", error);
    return rejected(jsonError(503, "unavailable", "Chat is temporarily unavailable."), logger);
  }

  const identity = { ip: clientIp(request), visitorId: visitor.id };
  const limit = await limitChatRequest(identity);
  if (!limit.ok) {
    return rejected(
      jsonError(429, "rate_limited", retryMessage(limit.retryAfter), {
        retryAfter: limit.retryAfter
      }),
      logger
    );
  }
  logger.mark("intake");

  try {
    const turn = await prepareChatTurn({ identity, body: parsed.data });
    logger.mark("session");
    return turn;
  } catch (error) {
    if (!(error instanceof ChatNotFoundError)) throw error;
    return rejected(jsonError(404, "not_found", error.message), logger);
  }
}

function conversationTurns(history: TurnRecord[]): ConversationTurn[] {
  return history.map((turn) => ({ user: turn.userMessage, assistant: turn.assistantMessage }));
}

function schedulingAnswer(
  answer: string,
  scheduling: TurnAnswer["scheduling"]
): TurnAnswer {
  return { answer, intent: "scheduling", grounded: false, sources: [], documentIds: [], scheduling };
}

async function schedule(
  turn: PreparedChatTurn,
  input: SchedulingInput,
  { sink, signal, logger }: TurnContext
): Promise<TurnAnswer> {
  const now = new Date();
  const lock = await lockScheduling(turn.session, now);
  if (!lock) {
    sink.token(SCHEDULING_BUSY_REPLY);
    return schedulingAnswer(SCHEDULING_BUSY_REPLY, null);
  }
  // Nothing has reached Cal.com yet, so a stopped turn leaves the booking as it was.
  if (signal.aborted) {
    await lock.release(lock.state);
    return schedulingAnswer("", null);
  }

  let calledCalendar = false;
  let result: Awaited<ReturnType<typeof advanceScheduling>>;
  try {
    result = await advanceScheduling(lock.state, input, {
      now,
      findSlots: (dateKey, preference) => findSlots(dateKey, { preference }),
      async book({ slot, name, email }) {
        if (!(await limitBookingAttempt(turn.identity)).ok) {
          throw new BookingError("limit_reached");
        }
        return createBooking({ start: slot.start, name, email });
      },
      onStage(stage) {
        calledCalendar = true;
        sink.status(stage);
      }
    });
  } catch (error) {
    await lock.release(lock.state);
    throw error;
  }

  if (calledCalendar) logger.mark("calendar");
  sink.token(result.reply);
  return schedulingAnswer(result.reply, { state: result.state, lock });
}

async function answerProfile(
  question: string,
  history: ConversationTurn[],
  { sink, signal, logger }: TurnContext
): Promise<TurnAnswer> {
  sink.status("searching");
  let answering = false;
  const result = await streamProfileAnswer(question, {
    style: "chat",
    history,
    signal,
    onToken: (token) => {
      if (!answering) logger.mark("retrieval");
      answering = true;
      sink.token(token);
    }
  });
  logger.set({ retrieval: result.retrievalMode });

  return {
    answer: result.answer,
    intent: "profile",
    grounded: result.grounded,
    sources: result.sources,
    documentIds: result.documentIds,
    scheduling: null
  };
}

async function answerTurn(turn: PreparedChatTurn, context: TurnContext): Promise<TurnAnswer> {
  const { logger, signal } = context;
  if (turn.action) {
    logger.set({ intent: "scheduling", via: "action" });
    return schedule(turn, { kind: "action", action: turn.action }, context);
  }

  const history = conversationTurns(turn.history);
  const route = await routeMessage(
    {
      message: turn.message,
      schedulingStep: turn.session?.record.scheduling?.step ?? "idle",
      history
    },
    { signal }
  );
  logger.mark("routing");
  // Only profile answers can be regenerated, and they stay profile answers.
  const intent = turn.replaceTurnId === null ? route.intent : "profile";
  logger.set({ intent, via: route.via });

  if (intent === "profile") return answerProfile(route.query, history, context);
  if (intent === "cancel_scheduling") return schedule(turn, { kind: "cancel" }, context);
  return schedule(turn, { kind: "message", text: turn.message }, context);
}

function turnMetadata(
  result: TurnAnswer,
  snapshot: SchedulingSnapshot | null,
  stopped: boolean
): TurnMetadata {
  return {
    intent: result.intent,
    ...(result.sources.length ? { sources: result.sources } : {}),
    ...(snapshot ? { scheduling: snapshot } : {}),
    ...(stopped ? { stopped: true } : {})
  };
}

async function saveTurn(turn: PreparedChatTurn, newTurn: NewTurn) {
  const { session } = turn;
  if (!session) return null;
  const { store, record } = session;

  let saved: TurnRecord | null;
  try {
    saved =
      turn.replaceTurnId === null
        ? await store.appendTurn(record.id, newTurn)
        : await store.replaceTurn(record.id, turn.replaceTurnId, newTurn);
  } catch (error) {
    console.error("Chat turn could not be saved.", error);
    return null;
  }
  if (!saved) {
    console.warn("A newer turn arrived before the regenerated answer was saved.");
    return null;
  }

  // Only a session created by this turn can still carry its auto title; never overwrite a rename.
  if (session.isNew) {
    const title = titleFromConversation(turn.message, newTurn.assistantMessage);
    try {
      if (title !== record.title) {
        await store.renameSession(turn.identity.visitorId, record.id, title);
      }
    } catch (error) {
      console.warn("The new chat keeps its first title; renaming it failed.", error);
    }
  }
  return saved.id;
}

// Resolves to null when `signal` aborts; the turn is still saved with what was answered so far.
export async function runChatTurn(
  turn: PreparedChatTurn,
  sink: ChatSink,
  { signal, logger }: { signal: AbortSignal; logger: RequestLogger }
): Promise<ChatDone | null> {
  const sessionId = turn.session?.record.id ?? null;
  let answered = false;
  const context: TurnContext = {
    sink: {
      ...sink,
      token(token) {
        if (!answered) logger.mark("ttft");
        answered = true;
        sink.token(token);
      }
    },
    signal,
    logger
  };

  sink.meta(sessionId);
  const result = await answerTurn(turn, context);
  const snapshot = result.scheduling ? toSnapshot(result.scheduling.state) : null;
  const stopped = signal.aborted;

  const turnId = await saveTurn(turn, {
    userMessage: turn.message,
    assistantMessage: result.answer,
    grounded: result.grounded,
    retrievedDocumentIds: result.documentIds,
    latencyMs: Date.now() - logger.startedAt,
    metadata: turnMetadata(result, snapshot, stopped)
  });
  // Saved after the turn, so the transcript never trails the state another request can read.
  if (result.scheduling) await result.scheduling.lock.release(result.scheduling.state);
  if (stopped) return null;

  return {
    turnId,
    sessionId,
    answer: result.answer,
    intent: result.intent,
    grounded: result.grounded,
    sources: result.sources,
    scheduling: snapshot
  };
}
