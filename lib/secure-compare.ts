import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function safeEqual(a: string, b: string) {
  return timingSafeEqual(digest(a), digest(b));
}
