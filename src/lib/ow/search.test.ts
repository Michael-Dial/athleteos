import { afterEach, describe, expect, it, vi } from "vitest";
import { searchUsers } from "./api";

delete process.env.DATABASE_URL;
process.env.OW_API_BASE = "http://ow.test/api/v1";
process.env.OW_API_KEY = "k";

const user = (id: string, first: string, last: string, email: string) =>
  ({ id, first_name: first, last_name: last, email, last_synced_at: null, last_synced_provider: null });

describe("searchUsers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("finds a full name although the backend matches one field at a time", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      // The backend got one word; it returns everyone with that word anywhere.
      return new Response(JSON.stringify({
        items: [user("1", "Ada", "Lovelace", "ada@x.test"), user("2", "Ada", "Byron", "a.byron@x.test"), user("3", "Lovelace", "Fan", "f@x.test")],
        has_next: false,
      }));
    }));
    const out = await searchUsers("  Ada   Lovelace ");
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]).searchParams.get("search")).toBe("lovelace"); // the longest word
    expect(out.map((u) => u.id)).toEqual(["1"]);
  });

  it("passes a single word straight through and asks nothing for an empty query", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ items: [user("9", "Ada", "L", "a@x.test")], has_next: false })));
    vi.stubGlobal("fetch", f);
    expect((await searchUsers("ada")).map((u) => u.id)).toEqual(["9"]);
    expect(await searchUsers("   ")).toEqual([]);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
