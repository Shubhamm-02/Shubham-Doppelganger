import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const VISITOR_COOKIE = "wizard_visitor";

export type Visitor = { id: string; isNew: boolean };

export class VisitorConfigError extends Error {
  constructor() {
    super("VISITOR_COOKIE_SECRET must be set to at least 32 characters in production.");
    this.name = "VisitorConfigError";
  }
}

const MIN_SECRET_LENGTH = 32;
const DEVELOPMENT_SECRET = "wizard-development-only-visitor-cookie-secret";
// Chrome caps cookie lifetimes at 400 days, so a longer max-age buys nothing.
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

function cookieSecret() {
  const secret = process.env.VISITOR_COOKIE_SECRET;
  if (secret && secret.length >= MIN_SECRET_LENGTH) return secret;
  if (process.env.NODE_ENV === "production") throw new VisitorConfigError();
  return DEVELOPMENT_SECRET;
}

function signature(id: string, secret: string) {
  return createHmac("sha256", secret).update(id).digest("base64url");
}

function verifiedVisitorId(cookieValue: string, secret: string) {
  const [id, providedSignature, ...rest] = cookieValue.split(".");
  if (!id || !providedSignature || rest.length > 0) return null;

  const expected = Buffer.from(signature(id, secret));
  const provided = Buffer.from(providedSignature);
  if (provided.length !== expected.length) return null;

  return timingSafeEqual(provided, expected) ? id : null;
}

export async function getVisitor(): Promise<Visitor> {
  const secret = cookieSecret();
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(VISITOR_COOKIE)?.value;
  const existingId = cookieValue ? verifiedVisitorId(cookieValue, secret) : null;
  if (existingId) return { id: existingId, isNew: false };

  const id = randomUUID();
  cookieStore.set(VISITOR_COOKIE, `${id}.${signature(id, secret)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS
  });

  return { id, isNew: true };
}
