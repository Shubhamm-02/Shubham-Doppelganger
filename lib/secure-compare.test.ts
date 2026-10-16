import { describe, expect, it } from "vitest";
import { safeEqual } from "@/lib/secure-compare";

describe("safeEqual", () => {
  it("accepts identical strings", () => {
    expect(safeEqual("s3cret-token-value", "s3cret-token-value")).toBe(true);
  });

  it("rejects strings of the same length that differ", () => {
    expect(safeEqual("s3cret-token-value", "s3cret-token-valuf")).toBe(false);
  });

  it("rejects strings of different lengths without throwing", () => {
    expect(safeEqual("short", "a considerably longer secret")).toBe(false);
    expect(safeEqual("", "secret")).toBe(false);
  });

  it("is case sensitive", () => {
    expect(safeEqual("Secret", "secret")).toBe(false);
  });
});
