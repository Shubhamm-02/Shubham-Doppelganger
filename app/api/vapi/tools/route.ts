import { NextResponse } from "next/server";
import { bookInterview, getAvailability } from "@/lib/calendar";
import { answerVoiceProfileQuestion } from "@/lib/rag";

export const runtime = "nodejs";

type ToolCall = {
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
};

function asObject(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    return JSON.parse(value) as Record<string, unknown>;
  }
  return asObject(value);
}

function normalizeToolCall(value: unknown): ToolCall {
  const call = asObject(value);
  const fn = asObject(call.function);
  return {
    id: typeof call.id === "string" ? call.id : undefined,
    name:
      typeof call.name === "string"
        ? call.name
        : typeof fn.name === "string"
          ? fn.name
          : undefined,
    arguments: parseArguments(call.arguments ?? fn.arguments)
  };
}

function extractToolCalls(body: Record<string, unknown>): ToolCall[] {
  const direct = body.toolCall as ToolCall | undefined;
  if (direct?.name) return [normalizeToolCall(direct)];

  const message = body.message as Record<string, unknown> | undefined;
  const nested = message?.toolCall as ToolCall | undefined;
  if (nested?.name) return [normalizeToolCall(nested)];

  const functionCall = asObject(body.functionCall);
  if (typeof functionCall.functionName === "string") {
    return [
      {
        id: typeof functionCall.id === "string" ? functionCall.id : undefined,
        name: functionCall.functionName,
        arguments: parseArguments(functionCall.parameters)
      }
    ];
  }

  const toolCalls = message?.toolCalls ?? message?.toolCallList ?? body.toolCalls;
  if (Array.isArray(toolCalls)) {
    return toolCalls.map(normalizeToolCall).filter((call) => call.name);
  }

  return [];
}

function singleLine(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replace(/\s+/g, " ").trim();
}

function calendarToolResult(result: {
  message: string;
  slots?: Array<{ start: string; label: string }>;
}) {
  return {
    spokenMessage: result.message,
    bookingSlots:
      result.slots?.map((slot, index) => ({
        selection: String(index + 1),
        label: slot.label,
        slotStart: slot.start
      })) ?? []
  };
}

async function runTool(toolCall: ToolCall) {
  const args = toolCall.arguments ?? {};

  if (toolCall.name === "search_profile") {
    const question =
      typeof args.question === "string" ? args.question : "Summarize profile.";
    const result = await answerVoiceProfileQuestion(question);
    return result.answer;
  }

  if (toolCall.name === "get_availability") {
    const result = await getAvailability(args);
    return calendarToolResult(result);
  }

  if (toolCall.name === "book_interview") {
    const result = await bookInterview(args);
    return result.message;
  }

  throw new Error(
    "Unknown tool. Expected search_profile, get_availability, or book_interview."
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const toolCalls = extractToolCalls(body);

  if (!toolCalls.length) {
    return NextResponse.json(
      {
        error:
          "No tool call found. Expected a Vapi tool-calls payload or a direct toolCall."
      },
      { status: 400 }
    );
  }

  const results = await Promise.all(
    toolCalls.map(async (toolCall, index) => {
      const toolCallId = toolCall.id ?? `tool_call_${index}`;
      try {
        const result = await runTool(toolCall);
        return { toolCallId, result: singleLine(result) };
      } catch (error) {
        return {
          toolCallId,
          error: error instanceof Error ? error.message : "Tool failed."
        };
      }
    })
  );

  if (toolCalls.some((toolCall) => toolCall.id)) {
    return NextResponse.json({ results });
  }

  return NextResponse.json({ result: results[0]?.result ?? "" });
}
