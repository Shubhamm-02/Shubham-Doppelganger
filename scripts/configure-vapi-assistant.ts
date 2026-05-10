import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SYSTEM_PROMPT = `You are Shubham Shah's voice AI representative for recruiters and interviewers.

Core behavior:
- Keep responses short, spoken, and natural. Prefer 1-2 sentences.
- For voice, optimize for speed: answer directly, avoid long setup, and do not read long lists unless asked.
- Do not invent facts about Shubham.
- For any question about Shubham's resume, projects, skills, education, links, internships, or experience, call search_profile first. Base your answer only on the tool result.
- If the tool result says the information is unavailable, say you do not have that information in Shubham's resume/project notes.

Scheduling behavior:
- If the user wants to schedule, interview, book, meet, call, or asks about availability, enter scheduling mode.
- While scheduling mode is active, do not answer with resume/RAG information unless the user clearly asks a profile question or cancels scheduling.
- Scheduling is India-only for now. Assume all requested times are Asia/Kolkata / IST.
- Interviews are 15 minutes long. State this before asking the user for their preferred day/time window.
- Collect these required fields: name, email, and preferred day/time window.
- After the caller gives an email address, read it back and ask them to confirm it is correct before booking.
- Ask for missing fields one at a time when possible.
- Once a usable preferred window is present, call get_availability.
- Only call book_interview after you have name, email, email confirmation, and the user confirms a slot.
- If get_availability returns bookingSlots, speak only spokenMessage and keep bookingSlots internally for booking.
- If the caller chooses a slot, call book_interview with the selected bookingSlots item's slotStart, plus selection, name, email, emailConfirmed=true, and the original preferredWindow if available.
- If the user confirms by saying a slot number, pass that number as selection.
- If a calendar tool says the calendar is not configured, explain that you can collect details but cannot finalize the booking yet.

Tool result rule:
- Treat tool results as authoritative.
- Never contradict a tool result.
- Do not read slotStart, JSON, or bookingSlots aloud.
- If search_profile returns grounded facts, synthesize them into a concise spoken answer instead of reading the raw facts aloud.
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
    timeoutSeconds: 12
  };
}

function tuneVoiceConfig(voice: Record<string, unknown>) {
  const provider = typeof voice.provider === "string" ? voice.provider : "";

  if (provider === "11labs") {
    return {
      ...voice,
      model: voice.model ?? "eleven_turbo_v2_5",
      optimizeStreamingLatency: 4,
      useSpeakerBoost: true,
      stability: voice.stability ?? 0.55,
      similarityBoost: voice.similarityBoost ?? 0.85,
      style: voice.style ?? 0.3,
      speed: voice.speed ?? 1.06
    };
  }

  if (provider === "cartesia") {
    const generationConfig =
      voice.generationConfig && typeof voice.generationConfig === "object"
        ? (voice.generationConfig as Record<string, unknown>)
        : {};

    return {
      ...voice,
      generationConfig: {
        ...generationConfig,
        speed: generationConfig.speed ?? 1.05,
        volume: generationConfig.volume ?? 1.35
      }
    };
  }

  if (provider === "minimax") {
    return {
      ...voice,
      speed: voice.speed ?? 1.05,
      volume: voice.volume ?? 1.5
    };
  }

  if (provider === "openai") {
    return {
      ...voice,
      speed: voice.speed ?? 1.05,
      instructions:
        voice.instructions ??
        "Speak clearly at a strong, audible volume with crisp articulation."
    };
  }

  return voice;
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
      "Check 15-minute interview availability for Shubham after the user gives a preferred India-time day/time window.",
      {
        preferredWindow: {
          type: "string",
          description:
            "Preferred India-time day/time window for a 15-minute interview, for example tomorrow 12 pm."
        }
      },
      ["preferredWindow"]
    ),
    functionTool(
      url,
      "book_interview",
      "Book a 15-minute interview only after name, email, preferred India-time window, and explicit confirmation are present.",
      {
        name: {
          type: "string",
          description: "Interviewer's name."
        },
        email: {
          type: "string",
          description: "Interviewer's email address."
        },
        emailConfirmed: {
          type: "boolean",
          description:
            "True only after the caller explicitly confirms the email address was heard correctly."
        },
        preferredWindow: {
          type: "string",
          description: "Confirmed India-time day/time window for a 15-minute interview."
        },
        slotStart: {
          type: "string",
          description:
            "Exact ISO start time from the selected get_availability bookingSlots item. Use this whenever available."
        },
        selection: {
          type: "string",
          description:
            "Optional chosen slot number or phrase, for example 1, 2, first one, or second one."
        }
      },
      ["name", "email", "emailConfirmed", "preferredWindow"]
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
  const existingVoice =
    assistant.voice && typeof assistant.voice === "object"
      ? (assistant.voice as Record<string, unknown>)
      : {};

  const patch = {
    firstMessage:
      "Hi, I am Shubham Shah's AI representative. I can answer questions about his work or help schedule an interview.",
    firstMessageMode: "assistant-speaks-first",
    backgroundSound: "off",
    startSpeakingPlan: {
      waitSeconds: 0.25,
      smartEndpointingPlan: {
        provider: "livekit",
        waitFunction: "2000 / (1 + exp(-10 * (x - 0.5)))"
      }
    },
    stopSpeakingPlan: {
      numWords: 10,
      backoffSeconds: 0.8,
      acknowledgementPhrases: [
        "okay",
        "ok",
        "yeah",
        "yes",
        "right",
        "sure",
        "got it",
        "mhm",
        "mm-hmm",
        "uh-huh"
      ],
      interruptionPhrases: [
        "stop",
        "stop speaking",
        "pause",
        "wait",
        "wait a minute",
        "hold on",
        "hang on",
        "one second",
        "give me a second",
        "let me speak",
        "enough"
      ]
    },
    serverMessages: [
      "tool-calls",
      "end-of-call-report",
      "conversation-update",
      "status-update"
    ],
    voice: tuneVoiceConfig(existingVoice),
    model: {
      provider: existingModel.provider ?? "openai",
      model: existingModel.model ?? "gpt-4o-mini",
      ...existingModel,
      temperature: 0.2,
      maxTokens: 180,
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
