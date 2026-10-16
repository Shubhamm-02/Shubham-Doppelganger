import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractLatestEmail,
  extractName,
  isHostEmail,
  normalizeEmailCandidate
} from "@/lib/calendar/contacts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("normalizeEmailCandidate", () => {
  it("lowercases full addresses and trims punctuation", () => {
    expect(normalizeEmailCandidate(" Jane.Doe@Acme.COM. ")).toBe("jane.doe@acme.com");
    expect(normalizeEmailCandidate("<jane@acme.io>")).toBe("jane@acme.io");
  });

  it("turns a bare Gmail username into a Gmail address", () => {
    expect(normalizeEmailCandidate("rahul.verma")).toBe("rahul.verma@gmail.com");
    expect(normalizeEmailCandidate("rahul at gmail")).toBe("rahul@gmail.com");
  });

  it("reads spoken addresses", () => {
    expect(normalizeEmailCandidate("rahul dot verma at gmail dot com")).toBe(
      "rahul.verma@gmail.com"
    );
    expect(normalizeEmailCandidate("jane underscore doe at the rate acme dot co dot in")).toBe(
      "jane_doe@acme.co.in"
    );
    expect(normalizeEmailCandidate("rahul dot verma")).toBe("rahul.verma@gmail.com");
  });

  it("leaves written addresses containing spoken words alone", () => {
    expect(normalizeEmailCandidate("nat.dot@acme.com")).toBe("nat.dot@acme.com");
  });

  it("returns an empty string for invalid input", () => {
    expect(normalizeEmailCandidate("")).toBe("");
    expect(normalizeEmailCandidate("jane@")).toBe("");
    expect(normalizeEmailCandidate("jane@acme")).toBe("");
    expect(normalizeEmailCandidate("jane@@acme.com")).toBe("");
  });
});

describe("extractLatestEmail", () => {
  it("returns the last address mentioned", () => {
    expect(extractLatestEmail("old: a@x.com, use B@Acme.com instead.")).toBe("b@acme.com");
    expect(extractLatestEmail("no address here")).toBeNull();
  });

  it("finds spoken addresses in a sentence", () => {
    expect(extractLatestEmail("my email is rahul dot verma at gmail dot com thanks")).toBe(
      "rahul.verma@gmail.com"
    );
  });

  it("ignores times that look spoken", () => {
    expect(extractLatestEmail("free at 3 dot 30")).toBeNull();
  });
});

describe("extractName", () => {
  it("reads explicit introductions", () => {
    expect(extractName("My name is Jane Doe")).toBe("Jane Doe");
    expect(extractName("I'm Jane Doe and my email is jane@acme.com")).toBe("Jane Doe");
    expect(extractName("this is Rahul from Acme")).toBe("Rahul");
    expect(extractName("name: priya sharma")).toBe("priya sharma");
  });

  it("does not read states or plans as names", () => {
    expect(extractName("I am free tomorrow")).toBeNull();
    expect(extractName("I'm looking for a slot")).toBeNull();
    expect(extractName("sounds good")).toBeNull();
    expect(extractName("yes, book it")).toBeNull();
    expect(extractName("tomorrow at 3pm")).toBeNull();
  });

  it("reads the name written next to the email", () => {
    expect(extractName("Jane, jane@x.com, tomorrow 3pm")).toBe("Jane");
    expect(extractName("Book tomorrow 3pm for Jane Doe jane@x.com")).toBe("Jane Doe");
    expect(extractName("my email is jane@x.com")).toBeNull();
    expect(extractName("O'Brien, jane@x.com")).toBe("O'Brien");
  });

  it("does not read fillers and contractions next to an email as names", () => {
    expect(extractName("it's jane@acme.com")).toBeNull();
    expect(extractName("use jane@acme.com")).toBeNull();
    expect(extractName("you can send it to jane@acme.com")).toBeNull();
    expect(extractName("alright")).toBeNull();
    expect(extractName("hmm")).toBeNull();
  });

  it("reads a name on its own line", () => {
    expect(extractName("Jane Doe")).toBe("Jane Doe");
    expect(extractName("jane@acme.com\nRahul Verma")).toBe("Rahul Verma");
  });

  it("uses the known spelling of known callers", () => {
    expect(extractName("dhruv davda")).toBe("Dhruv Davda");
    expect(extractName("my name is tauseef ahmad")).toBe("Tauseef Ahmad");
  });
});

describe("isHostEmail", () => {
  it("blocks the default host addresses", () => {
    vi.stubEnv("CAL_HOST_EMAILS", "");
    vi.stubEnv("CAL_HOST_EMAIL", "");
    expect(isHostEmail("ShubhamShah473@gmail.com ")).toBe(true);
    expect(isHostEmail("jane@acme.com")).toBe(false);
    expect(isHostEmail(null)).toBe(false);
  });

  it("uses the configured host addresses instead of the defaults", () => {
    vi.stubEnv("CAL_HOST_EMAILS", "host@acme.com, Other@Acme.com");
    vi.stubEnv("CAL_HOST_EMAIL", "solo@acme.com");
    expect(isHostEmail("other@acme.com")).toBe(true);
    expect(isHostEmail("solo@acme.com")).toBe(true);
    expect(isHostEmail("shubhamshah473@gmail.com")).toBe(false);
  });
});
