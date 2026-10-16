import { runChatTurn, startChatTurn } from "@/lib/chat/handle-message";
import { encodeSseEvent } from "@/lib/chat/sse";
import type { ChatStreamEvent } from "@/lib/chat/types";
import { createRequestLogger } from "@/lib/logger";

export const runtime = "nodejs";

const STREAM_ERROR_MESSAGE =
  "I hit an error while streaming the answer. Please try again in a moment.";

export async function POST(request: Request) {
  const logger = createRequestLogger("chat.stream", request);
  const turn = await startChatTurn(request, logger);
  if (turn instanceof Response) return turn;

  const encoder = new TextEncoder();
  const cancelled = new AbortController();
  const signal = AbortSignal.any([request.signal, cancelled.signal]);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(event: ChatStreamEvent) {
        if (!signal.aborted) controller.enqueue(encoder.encode(encodeSseEvent(event)));
      }

      try {
        const done = await runChatTurn(
          turn,
          {
            meta: (sessionId) => send({ event: "meta", data: { sessionId } }),
            status: (stage) => send({ event: "status", data: { stage } }),
            token: (token) => send({ event: "token", data: { token } })
          },
          { signal, logger }
        );
        if (done) send({ event: "done", data: done });
        logger.flush(done ? "ok" : "stopped");
      } catch (error) {
        console.error("Streaming chat failed.", error);
        send({ event: "error", data: { code: "internal", message: STREAM_ERROR_MESSAGE } });
        logger.flush("error");
      } finally {
        if (!cancelled.signal.aborted) controller.close();
      }
    },
    cancel() {
      cancelled.abort();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "x-request-id": logger.requestId
    }
  });
}
