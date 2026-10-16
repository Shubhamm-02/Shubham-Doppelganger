import { NextResponse } from "next/server";
import { runChatTurn, startChatTurn, type ChatSink } from "@/lib/chat/handle-message";
import { jsonError } from "@/lib/http";
import { createRequestLogger } from "@/lib/logger";

export const runtime = "nodejs";

const SILENT_SINK: ChatSink = { meta() {}, status() {}, token() {} };

export async function POST(request: Request) {
  const logger = createRequestLogger("chat", request);
  const turn = await startChatTurn(request, logger);
  if (turn instanceof Response) return turn;

  const headers = { "x-request-id": logger.requestId };
  try {
    const done = await runChatTurn(turn, SILENT_SINK, { signal: request.signal, logger });
    logger.flush(done ? "ok" : "stopped");
    // 499: the client closed the request, so nobody reads this response.
    return done ? NextResponse.json(done, { headers }) : new Response(null, { status: 499, headers });
  } catch (error) {
    console.error("Chat request failed.", error);
    logger.flush("error");
    const response = jsonError(
      500,
      "internal",
      "I hit an error while answering. Please try again in a moment."
    );
    response.headers.set("x-request-id", logger.requestId);
    return response;
  }
}
