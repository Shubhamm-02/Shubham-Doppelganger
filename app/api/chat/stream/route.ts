import { autoTitleSessionFromAnswer, ensureChatSession } from "@/lib/sessions";
import { calendarIntentResponse } from "@/lib/intent-responses";
import { chatRequestSchema } from "@/lib/chat-schema";
import {
  classifyIntent,
  isExplicitProfileRequest,
  isSchedulingCancelRequest
} from "@/lib/intent";
import { hasSupabaseConfig } from "@/lib/supabase";
import { streamProfileQuestion } from "@/lib/rag";
import { listRecentConversationTurns, tryLogConversation } from "@/lib/vector-store";

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

  return /i can book an interview|i can help schedule|i still need|available .*interview slots|which option|reply with the slot|book it end-to-end|could not find an open slot|could not check shubham's calendar|could not book the interview/i.test(
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

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sseComment(comment: string) {
  return `: ${comment}\n\n`;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request. Expected { message: string }." },
      { status: 400 }
    );
  }

  const message = parsed.data.message.trim();
  if (!message) {
    return Response.json({ error: "Message is required." }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendComment = (comment: string) => {
        controller.enqueue(encoder.encode(sseComment(comment)));
      };
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };

      try {
        sendComment("stream-open " + " ".repeat(4096));
        let sessionInfo: Awaited<ReturnType<typeof ensureChatSession>> | null = null;
        if (hasSupabaseConfig()) {
          try {
            sessionInfo = await ensureChatSession(message, parsed.data.sessionId);
          } catch (error) {
            console.warn("Chat session setup failed. Continuing without session.", error);
          }
        }

        const sessionId = sessionInfo?.id;
        if (sessionId) send("meta", { sessionId });

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
          send("token", { token: payload.answer ?? "" });

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
            await autoTitleSessionFromAnswer(sessionId, payload.answer, message).catch(
              () => {}
            );
          }

          send("done", {
            ...payload,
            sessionId,
            intent,
            schedulingActive: !isSchedulingComplete(payload.answer)
          });
          controller.close();
          return;
        }

        const result = await streamProfileQuestion(
          message,
          (token) => send("token", { token }),
          { sessionId }
        );

        if (sessionInfo?.created && sessionId && result.answer) {
          await autoTitleSessionFromAnswer(sessionId, result.answer, message).catch(
            () => {}
          );
        }

        send("done", { ...result, sessionId });
      } catch (error) {
        console.error("Streaming chat failed", error);
        send("error", {
          message:
            "I hit an error while streaming the answer. Please try again in a moment."
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
