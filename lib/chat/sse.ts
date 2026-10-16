import type { ChatStreamEvent } from "@/lib/chat/types";

type ChatEventName = ChatStreamEvent["event"];

const EVENT_NAMES = new Set<string>(["meta", "status", "token", "done", "error"]);

export function encodeSseEvent(event: ChatStreamEvent) {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function toChatEvent(name: string, data: string): ChatStreamEvent | null {
  if (!EVENT_NAMES.has(name)) return null;
  try {
    return { event: name as ChatEventName, data: JSON.parse(data) } as ChatStreamEvent;
  } catch {
    return null;
  }
}

// Events split across chunks are buffered until their blank line arrives; flush() at the end of
// the stream dispatches a last event that never got one.
export function createSseParser(onEvent: (event: ChatStreamEvent) => void) {
  let buffer = "";
  let eventName = "";
  let dataLines: string[] = [];
  let skipLineFeed = false;

  function dispatch() {
    const event = dataLines.length ? toChatEvent(eventName, dataLines.join("\n")) : null;
    eventName = "";
    dataLines = [];
    if (event) onEvent(event);
  }

  function readLine(line: string) {
    if (!line) return dispatch();
    if (line.startsWith(":")) return;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") eventName = value;
    if (field === "data") dataLines.push(value);
  }

  return {
    push(chunk: string) {
      // A chunk ending in "\r" already ended its line; a "\n" opening the next chunk completes
      // that "\r\n" rather than starting a blank line.
      buffer += skipLineFeed && chunk.startsWith("\n") ? chunk.slice(1) : chunk;
      if (chunk) skipLineFeed = chunk.endsWith("\r");

      const lines = buffer.split(/\r\n|\r|\n/);
      buffer = lines.pop() ?? "";
      lines.forEach(readLine);
    },
    flush() {
      if (buffer) readLine(buffer);
      buffer = "";
      skipLineFeed = false;
      dispatch();
    }
  };
}
