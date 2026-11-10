import { beforeEach, describe, expect, it } from "vitest";
import {
  execute,
  hashToken,
  type Room,
  type Store,
  type PublicRoom,
} from "../lib/game-service";
import { legalMoves } from "../lib/engine";
const white = "a".repeat(64),
  black = "b".repeat(64),
  stranger = "c".repeat(64);
class MemoryStore implements Store {
  rooms = new Map<string, Room>();
  async get(code: string) {
    return structuredClone(this.rooms.get(code) || null);
  }
  async insert(room: Room) {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, structuredClone(room));
    return true;
  }
  async update(room: Room, expected: number) {
    if (this.rooms.get(room.code)?.version !== expected) return false;
    this.rooms.set(room.code, structuredClone(room));
    return true;
  }
  async touch(code: string, side: "white" | "black", now: string) {
    const r = this.rooms.get(code);
    if (r) r[side === "white" ? "white_seen" : "black_seen"] = now;
  }
}
let store: MemoryStore, room: PublicRoom;
beforeEach(async () => {
  store = new MemoryStore();
  room = await execute(store, {
    action: "create",
    token: white,
    payload: { name: "Vini" },
  });
});
async function join() {
  room = await execute(store, {
    action: "join",
    code: room.code,
    token: black,
    payload: { name: "Ana" },
  });
  return room;
}
const cmd = (
  action: string,
  token = white,
  payload: Record<string, unknown> = {},
) =>
  execute(store, {
    action,
    code: room.code,
    token,
    payload: { version: room.version, ...payload },
  });
describe("room API authorization and concurrency", () => {
  it("creates an eight-character room with no credentials in the response", async () => {
    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(room.you).toBe("white");
    expect(JSON.stringify(room)).not.toContain(await hashToken(white));
  });
  it("rejects malformed session tokens", async () => {
    await expect(
      execute(store, {
        action: "create",
        token: "guess",
        payload: { name: "x" },
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("rejects empty and overlong names", async () => {
    await expect(
      execute(store, {
        action: "create",
        token: white,
        payload: { name: " " },
      }),
    ).rejects.toThrow("1 a 24");
    await expect(
      execute(store, {
        action: "create",
        token: white,
        payload: { name: "x".repeat(25) },
      }),
    ).rejects.toThrow("1 a 24");
  });
  it("allows exactly two players", async () => {
    await join();
    await expect(
      cmd("join", stranger, { name: "Intruso" }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("lets an existing seat rejoin without stealing another seat", async () => {
    await join();
    expect((await cmd("join", white, { name: "Outro" })).you).toBe("white");
  });
  it("prevents spectators from reading private games", async () => {
    await expect(cmd("read", stranger)).rejects.toMatchObject({ status: 401 });
  });
  it("does not let the white player move before another player joins", async () => {
    await expect(cmd("move", white, { path: [40, 33] })).rejects.toMatchObject({
      status: 409,
    });
  });
  it("does not trust client-supplied boards or turns", async () => {
    await join();
    const m = legalMoves(room.state)[0];
    const next = await cmd("move", white, {
      path: m.path,
      state: { winner: "white" },
      board: [],
    });
    expect(next.state.winner).toBeNull();
    expect(next.state.turn).toBe("black");
  });
  it("rejects an out-of-turn player", async () => {
    await join();
    await expect(cmd("move", black, { path: [17, 24] })).rejects.toThrow(
      "Aguarde",
    );
  });
  it("rejects a stale version", async () => {
    await join();
    await expect(
      cmd("move", white, { version: 0, path: [40, 33] }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("accepts only one of two concurrent moves", async () => {
    await join();
    const m = legalMoves(room.state)[0];
    const results = await Promise.allSettled([
      cmd("move", white, { path: m.path }),
      cmd("move", white, { path: m.path }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("allows resignation but only by a player", async () => {
    await join();
    await expect(cmd("resign", stranger)).rejects.toMatchObject({
      status: 401,
    });
    const next = await cmd("resign");
    expect(next.state.winner).toBe("black");
  });
  it("requires opponent consent to accept a draw", async () => {
    await join();
    room = await cmd("offer-draw");
    await expect(cmd("accept-draw", white)).rejects.toThrow("Nenhuma");
    room = await cmd("accept-draw", black);
    expect(room.state.winner).toBe("draw");
  });
  it("can decline a draw and continue", async () => {
    await join();
    room = await cmd("offer-draw");
    room = await cmd("decline-draw", black);
    expect(room.drawOffer).toBeNull();
    expect(room.state.winner).toBeNull();
  });
  it("requires both rematch votes, resets board, and swaps colors", async () => {
    await join();
    room = await cmd("resign");
    room = await cmd("rematch");
    expect(room.state.winner).toBe("black");
    room = await cmd("rematch", black);
    expect(room.round).toBe(2);
    expect(room.state.winner).toBeNull();
    expect(room.you).toBe("white");
    expect(room.whiteName).toBe("Ana");
    expect((await cmd("read", white)).you).toBe("black");
  });
  it("rejects unknown and expired rooms", async () => {
    await expect(
      execute(store, { action: "read", code: "ABCDEFGH", token: white }),
    ).rejects.toMatchObject({ status: 404 });
    store.rooms.get(room.code)!.updated_at = "2000-01-01T00:00:00Z";
    await expect(cmd("read")).rejects.toMatchObject({ status: 410 });
  });
});
