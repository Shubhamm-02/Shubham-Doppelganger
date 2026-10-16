import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVisitor, VISITOR_COOKIE, VisitorConfigError } from "@/lib/visitor";

const cookieStore = vi.hoisted(() => ({
  value: undefined as string | undefined,
  get: vi.fn(),
  set: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore
}));

const SECRET = "test-visitor-secret-that-is-long-enough";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function signed(id: string, secret = SECRET) {
  return `${id}.${createHmac("sha256", secret).update(id).digest("base64url")}`;
}

function issuedCookieValue() {
  return cookieStore.set.mock.calls[0][1] as string;
}

describe("getVisitor", () => {
  beforeEach(() => {
    cookieStore.value = undefined;
    cookieStore.get.mockReset();
    cookieStore.get.mockImplementation((name: string) =>
      name === VISITOR_COOKIE && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined
    );
    cookieStore.set.mockReset();
    vi.stubEnv("VISITOR_COOKIE_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("mints a signed visitor cookie when none is present", async () => {
    const visitor = await getVisitor();

    expect(visitor.isNew).toBe(true);
    expect(visitor.id).toMatch(UUID_PATTERN);
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    expect(cookieStore.set).toHaveBeenCalledWith(VISITOR_COOKIE, signed(visitor.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 400 * 24 * 60 * 60
    });
  });

  it("returns the existing visitor for a cookie it issued", async () => {
    const first = await getVisitor();
    cookieStore.value = issuedCookieValue();
    cookieStore.set.mockReset();

    const second = await getVisitor();

    expect(second).toEqual({ id: first.id, isNew: false });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty value", () => ""],
    ["a bare id", () => "8f1c3a52-6a8e-4d0c-9f43-2b9b7c1f0e11"],
    ["a missing signature", () => "8f1c3a52-6a8e-4d0c-9f43-2b9b7c1f0e11."],
    ["a missing id", () => `.${signed("x").split(".")[1]}`],
    ["extra segments", () => `${signed("8f1c3a52-6a8e-4d0c-9f43-2b9b7c1f0e11")}.extra`],
    ["a forged id", () => `attacker-chosen-id.${signed("real-id").split(".")[1]}`],
    ["a truncated signature", () => signed("real-id").slice(0, -1)],
    ["a signature from another secret", () => signed("real-id", "x".repeat(40))]
  ])("rejects %s and mints a fresh visitor", async (_label, value) => {
    cookieStore.value = value();

    const visitor = await getVisitor();

    expect(visitor.isNew).toBe(true);
    expect(visitor.id).not.toBe("real-id");
    expect(visitor.id).not.toBe("attacker-chosen-id");
    expect(issuedCookieValue()).toBe(signed(visitor.id));
  });

  it("falls back to a development secret outside production", async () => {
    vi.stubEnv("VISITOR_COOKIE_SECRET", "");

    const first = await getVisitor();
    cookieStore.value = issuedCookieValue();
    const second = await getVisitor();

    expect(second).toEqual({ id: first.id, isNew: false });
  });

  describe("in production", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
    });

    it("throws VisitorConfigError when the secret is missing", async () => {
      vi.stubEnv("VISITOR_COOKIE_SECRET", "");

      await expect(getVisitor()).rejects.toBeInstanceOf(VisitorConfigError);
      expect(cookieStore.set).not.toHaveBeenCalled();
    });

    it("throws VisitorConfigError when the secret is shorter than 32 characters", async () => {
      vi.stubEnv("VISITOR_COOKIE_SECRET", "x".repeat(31));

      await expect(getVisitor()).rejects.toBeInstanceOf(VisitorConfigError);
    });

    it("issues a secure cookie with a valid secret", async () => {
      const visitor = await getVisitor();

      expect(cookieStore.set).toHaveBeenCalledWith(
        VISITOR_COOKIE,
        signed(visitor.id),
        expect.objectContaining({ secure: true, httpOnly: true, sameSite: "lax" })
      );
    });
  });
});
