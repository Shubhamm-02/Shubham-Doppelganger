import { NextResponse } from "next/server";
import { getAvailability } from "@/lib/calendar";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await getAvailability(body);
  return NextResponse.json(result, { status: result.configured ? 200 : 501 });
}
