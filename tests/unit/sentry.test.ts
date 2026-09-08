import { describe, it, expect } from "vitest";
import { notFound, redirect } from "next/navigation";
import { isNextControlFlowError } from "@/lib/sentry";

// isNextControlFlowError() stops Next's own internal control-flow signals
// (notFound()/redirect()/the static-rendering DYNAMIC_SERVER_USAGE probe)
// from being misreported to Sentry as real bugs — a viewer correctly
// getting 404'd is not an incident. This exercises it against the REAL
// vendored notFound()/redirect() (same convention as
// tests/integration/access.test.ts) rather than a hand-typed fake digest
// string, specifically because a Next upgrade silently changed
// notFound()'s digest format once already (NEXT_NOT_FOUND -> Next 16's
// NEXT_HTTP_ERROR_FALLBACK;404) and broke this exact check without any
// type error — only a live 404 test flagged it.

function thrown(fn: () => void): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected fn to throw");
}

describe("isNextControlFlowError", () => {
  it("recognizes a real notFound() as control flow, not an error", () => {
    const err = thrown(() => notFound());
    expect(isNextControlFlowError(err)).toBe(true);
  });

  it("recognizes a real redirect() as control flow, not an error", () => {
    const err = thrown(() => redirect("/login"));
    expect(isNextControlFlowError(err)).toBe(true);
  });

  it("recognizes the DYNAMIC_SERVER_USAGE static-rendering probe signal", () => {
    expect(isNextControlFlowError({ digest: "DYNAMIC_SERVER_USAGE" })).toBe(true);
  });

  it("does NOT recognize a genuine application error", () => {
    expect(isNextControlFlowError(new Error("a real bug"))).toBe(false);
    expect(isNextControlFlowError(new TypeError("cannot read property of undefined"))).toBe(false);
  });

  it("does NOT recognize an error with an unrelated digest-shaped string", () => {
    expect(isNextControlFlowError({ digest: "SOME_OTHER_INTERNAL_SIGNAL" })).toBe(false);
  });

  it("does NOT recognize an HTTP-fallback digest with an out-of-range status", () => {
    // Guards the status allowlist itself, not just the prefix match.
    expect(isNextControlFlowError({ digest: "NEXT_HTTP_ERROR_FALLBACK;500" })).toBe(false);
  });

  it("handles non-object / missing-digest input without throwing", () => {
    expect(isNextControlFlowError(null)).toBe(false);
    expect(isNextControlFlowError(undefined)).toBe(false);
    expect(isNextControlFlowError("just a string")).toBe(false);
    expect(isNextControlFlowError({})).toBe(false);
  });
});
