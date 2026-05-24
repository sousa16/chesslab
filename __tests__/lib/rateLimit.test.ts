import { checkRateLimit } from "@/lib/rateLimit";

describe("checkRateLimit", () => {
  it("allows requests within the window", () => {
    const cfg = { max: 3, windowMs: 60_000 };
    expect(checkRateLimit("test-a", cfg).ok).toBe(true);
    expect(checkRateLimit("test-a", cfg).ok).toBe(true);
    expect(checkRateLimit("test-a", cfg).ok).toBe(true);
  });

  it("blocks after max and returns retry-after", () => {
    const cfg = { max: 2, windowMs: 60_000 };
    checkRateLimit("test-b", cfg);
    checkRateLimit("test-b", cfg);
    const blocked = checkRateLimit("test-b", cfg);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("tracks separate keys independently", () => {
    const cfg = { max: 1, windowMs: 60_000 };
    expect(checkRateLimit("test-c1", cfg).ok).toBe(true);
    expect(checkRateLimit("test-c2", cfg).ok).toBe(true);
  });
});
