import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SYSTEM_PROMPT = `You are Shubham Shah's voice AI representative for recruiters and interviewers.

Core behavior:
- Keep responses short, spoken, and natural. Prefer 1-3 sentences.
- Do not invent facts about Shubham.
- For any question about Shubham's resume, projects, skills, education, links, internships, or experience, call search_profile first. Base your answer only on the tool result.
- If the tool result says the information is unavailable, say you do not have that information in Shubham's resume/project notes.

Scheduling behavior:
- If the user wants to schedule, interview, book, meet, call, or asks about availability, enter scheduling mode.
- While scheduling mode is active, do not answer with resume/RAG information unless the user clearly asks a profile question or cancels scheduling.
- Scheduling is India-only for now. Assume all requested times are Asia/Kolkata / IST.
- Collect these required fields: name, email, and preferred day/time window.
- Ask for missing fields one at a time when possible.
- Once a usable preferred window is present, call get_availability.
- Only call book_interview after you have name, email, a preferred window, and the user confirms the slot.
- If the user confirms by saying a slot number, pass that number as selection and keep the original preferredWindow.
- If a calendar tool says the calendar is not configured, explain that you can collect details but cannot finalize the booking yet.

Tool result rule:
- Treat tool results as authoritative.
- Never contradict a tool result.
- If a tool returns a sentence, say the meaning of that sentence clearly and do not make up extra details.`;

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env.local.`);
  }
  return value;
}

function toolServer(url: string) {
  return {
    url,
    timeoutSeconds: 30
  };
}

function functionTool(
  url: string,
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[]
) {
  return {
    type: "function",
    async: false,
    server: toolServer(url),
    function: {
      name,
      description,
      strict: true,
      parameters: {
        type: "object",
        properties,
        required
      }
    }
  };
}

function buildTools(url: string) {
  return [
    functionTool(
      url,
      "search_profile",
      "Search Shubham Shah's grounded resume and project notes. Use for all questions about projects, skills, experience, internships, education, links, or background.",
      {
        question: {
          type: "string",
          description:
            "The user's question rewritten as a clear search query about Shubham."
        }
      },
      ["question"]
    ),
    functionTool(
      url,
      "get_availability",
      "Check interview availability for Shubham after the user gives a preferred India-time day/time window.",
      {
        preferredWindow: {
          type: "string",
          description:
            "Preferred India-time day/time window, for example tomorrow 12 pm."
        }
      },
      ["preferredWindow"]
    ),
    functionTool(
      url,
      "book_interview",
      "Book an interview only after name, email, preferred India-time window, and explicit confirmation are present.",
      {
        name: {
          type: "string",
          description: "Interviewer's name."
        },
        email: {
          type: "string",
          description: "Interviewer's email address."
        },
        preferredWindow: {
          type: "string",
          description: "Confirmed India-time day/time window."
        },
        selection: {
          type: "string",
          description:
            "Optional chosen slot number or phrase, for example 1, 2, first one, or second one."
        }
      },
      ["name", "email", "preferredWindow"]
    )
  ];
}

async function vapiRequest<T>(
  path: string,
  init: RequestInit & { token: string }
): Promise<T> {
  const response = await fetch(`https://api.vapi.ai${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${init.token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(
      `Vapi request failed (${response.status}): ${JSON.stringify(payload)}`
    );
  }

  return payload as T;
}

async function main() {
  const token = requireEnv("VAPI_API_KEY");
  const assistantId =
    process.env.VAPI_ASSISTANT_ID?.trim() ||
    process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID?.trim();
  const toolsUrl = requireEnv("VAPI_TOOLS_URL");

  if (!assistantId) {
    throw new Error(
      "Missing VAPI_ASSISTANT_ID or NEXT_PUBLIC_VAPI_ASSISTANT_ID in .env.local."
    );
  }

  const assistant = await vapiRequest<Record<string, unknown>>(
    `/assistant/${assistantId}`,
    {
      method: "GET",
      token
    }
  );
  const existingModel =
    assistant.model && typeof assistant.model === "object"
      ? (assistant.model as Record<string, unknown>)
      : {};

  const patch = {
    firstMessage:
      "Hi, I am Shubham Shah's AI representative. I can answer questions about his work or help schedule an interview.",
    firstMessageMode: "assistant-speaks-first",
    serverMessages: [
      "tool-calls",
      "end-of-call-report",
      "conversation-update",
      "status-update"
    ],
    model: {
      provider: existingModel.provider ?? "openai",
      model: existingModel.model ?? "gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 350,
      ...existingModel,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        }
      ],
      tools: buildTools(toolsUrl)
    }
  };

  await vapiRequest(`/assistant/${assistantId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(patch)
  });

  console.log("Vapi assistant configured.");
  console.log(`Assistant ID: ${assistantId}`);
  console.log(`Tool URL: ${toolsUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
