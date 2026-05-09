import { NextResponse } from "next/server";
import { answerProfileQuestion } from "@/lib/rag";
import { chatRequestSchema } from "@/lib/chat-schema";
import {
  classifyIntent,
  isExplicitProfileRequest,
  isSchedulingCancelRequest
} from "@/lib/intent";
import { calendarIntentResponse } from "@/lib/intent-responses";
import { listRecentConversationTurns, tryLogConversation } from "@/lib/vector-store";
import { hasSupabaseConfig } from "@/lib/supabase";
import { autoTitleSessionFromAnswer, ensureChatSession } from "@/lib/sessions";

export const runtime = "nodejs";

function hasActiveSchedulingFlow(
  turns: Awaited<ReturnType<typeof listRecentConversationTurns>>
) {
  const latestAssistant = turns.find((turn) => turn.assistant_message)
    ?.assistant_message;
  if (!latestAssistant) return false;
  if (/booked|confirmed for|calendar invite/i.test(latestAssistant)) {
    return false;
  }

  return /i can book an interview|i can help schedule|i still need|available interview slots|reply with the slot|book it end-to-end|could not find an open slot|could not check shubham's calendar|could not book the interview/i.test(
    latestAssistant
  );
}

function schedulingContextText(
  turns: Awaited<ReturnType<typeof listRecentConversationTurns>>,
  message: string
) {
  return [...turns]
    .reverse()
    .map((turn) => turn.user_message)
    .concat(message)
    .join("\n");
}

function isSchedulingComplete(answer: string) {
  return /booked|confirmed for|calendar invite/i.test(answer);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request. Expected { message: string }." },
      { status: 400 }
    );
  }

  const message = parsed.data.message.trim();
  if (!message) {
    return NextResponse.json(
      { error: "Message is required." },
      { status: 400 }
    );
  }

  const sessionInfo = hasSupabaseConfig()
    ? await ensureChatSession(message, parsed.data.sessionId)
    : null;
  const sessionId = sessionInfo?.id;
  const recentTurns = sessionId
    ? await listRecentConversationTurns(sessionId).catch(() => [])
    : [];

  let intent = classifyIntent(message);
  const schedulingActive = hasActiveSchedulingFlow(recentTurns);

  if (
    intent === "profile" &&
    (schedulingActive || parsed.data.schedulingMode) &&
    !isExplicitProfileRequest(message) &&
    !isSchedulingCancelRequest(message)
  ) {
    intent = "booking";
  }

  if (intent !== "profile") {
    const responseInput =
      (schedulingActive || parsed.data.schedulingMode) &&
      !isSchedulingCancelRequest(message)
        ? parsed.data.schedulingContext
          ? `${parsed.data.schedulingContext}\n${message}`
          : schedulingContextText(recentTurns, message)
        : message;
    const payload = await calendarIntentResponse(intent, responseInput, message);
    await tryLogConversation({
      channel: "chat",
      sessionId,
      userMessage: message,
      assistantMessage: payload.answer ?? "",
      retrievedDocumentIds: [],
      grounded: false,
      latencyMs: Date.now() - startedAt
    });
    if (sessionInfo?.created && sessionId && payload.answer) {
      await autoTitleSessionFromAnswer(sessionId, payload.answer).catch(() => {});
    }
    return NextResponse.json({
      ...payload,
      sessionId,
      intent,
      schedulingActive: !isSchedulingComplete(payload.answer)
    });
  }

  const result = await answerProfileQuestion(message, { sessionId });
  if (sessionInfo?.created && sessionId && result.answer) {
    await autoTitleSessionFromAnswer(sessionId, result.answer).catch(() => {});
  }
  return NextResponse.json({ ...result, sessionId } satisfies unknown);
}
