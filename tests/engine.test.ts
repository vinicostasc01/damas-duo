import { describe, it, expect } from "vitest";
import {
  initialState,
  legalMoves,
  playMove,
  positionKey,
  type GameState,
  type Piece,
} from "../lib/engine";
function setup(
  pieces: Record<number, Piece>,
  turn: "white" | "black" = "white",
): GameState {
  const s = initialState();
  s.board = Array(64).fill(0);
  for (const [sq, p] of Object.entries(pieces)) s.board[+sq] = p;
  s.turn = turn;
  s.positions = { [positionKey(s.board, turn)]: 1 };
  return s;
}
describe("authoritative checkers rules", () => {
  it("starts with 12 pieces per player and 7 legal white moves", () => {
    const s = initialState();
    expect(s.board.filter((p) => p === 1)).toHaveLength(12);
    expect(s.board.filter((p) => p === -1)).toHaveLength(12);
    expect(legalMoves(s)).toHaveLength(7);
  });
  it("never places pieces on light squares", () => {
    initialState().board.forEach((p, sq) => {
      if (p) expect((Math.floor(sq / 8) + (sq % 8)) % 2).toBe(1);
    });
  });
  it("switches turn and records an immutable move", () => {
    const s = initialState(),
      m = legalMoves(s)[0],
      next = playMove(s, "white", m.path);
    expect(next.turn).toBe("black");
    expect(next.history).toHaveLength(1);
    expect(s.history).toHaveLength(0);
    expect(s.board[m.path[0]]).toBe(1);
    expect(next.board[m.path[0]]).toBe(0);
  });
  it("rejects out-of-turn moves", () => {
    expect(() => playMove(initialState(), "black", [17, 24])).toThrow(
      "Aguarde",
    );
  });
  it("rejects teleporting or moving into occupied squares", () => {
    expect(() => playMove(initialState(), "white", [40, 1])).toThrow(
      "inválida",
    );
  });
  it("allows backwards captures by men", () => {
    const s = setup({ 26: 1, 35: -1, 1: -1 });
    expect(legalMoves(s).map((m) => m.path)).toContainEqual([26, 44]);
  });
  it("makes capture mandatory across the whole board", () => {
    const s = setup({ 42: 1, 33: -1, 46: 1 });
    const ms = legalMoves(s);
    expect(ms.every((m) => m.captures.length > 0)).toBe(true);
    expect(ms.every((m) => m.path[0] === 42)).toBe(true);
  });
  it("requires the maximum capture count", () => {
    const s = setup({ 42: 1, 46: 1, 33: -1, 17: -1, 37: -1 });
    const ms = legalMoves(s);
    expect(ms.every((m) => m.captures.length === 2)).toBe(true);
    expect(ms.map((m) => m.path)).toContainEqual([42, 24, 10]);
  });
  it("rejects an incomplete capture sequence", () => {
    const s = setup({ 42: 1, 33: -1, 17: -1 });
    expect(() => playMove(s, "white", [42, 24])).toThrow("inválida");
  });
  it("removes all captured pieces at the end of the turn", () => {
    const s = setup({ 42: 1, 33: -1, 17: -1 });
    const next = playMove(s, "white", [42, 24, 10]);
    expect(next.board[33]).toBe(0);
    expect(next.board[17]).toBe(0);
    expect(next.board[10]).toBe(1);
    expect(next.winner).toBe("white");
  });
  it("promotes a man on its final destination", () => {
    const s = setup({ 10: 1, 56: -1 });
    const next = playMove(s, "white", [10, 1]);
    expect(next.board[1]).toBe(2);
    expect(next.history[0].promotes).toBe(true);
  });
  it("promotes black in the opposite back rank", () => {
    const s = setup({ 53: -1, 1: 1 }, "black");
    expect(playMove(s, "black", [53, 60]).board[60]).toBe(-2);
  });
  it("does not promote halfway through a capture", () => {
    const s = setup({ 17: 1, 10: -1, 12: -1, 55: -1 });
    const ms = legalMoves(s);
    expect(ms.map((m) => m.path)).toContainEqual([17, 3, 21]);
    expect(ms.find((m) => m.path.join() === "17,3,21")?.promotes).toBe(false);
  });
  it("allows flying kings to move multiple empty squares", () => {
    const s = setup({ 42: 2, 0: -1 });
    expect(legalMoves(s).map((m) => m.path)).toContainEqual([42, 7]);
  });
  it("does not pass through friendly pieces", () => {
    const s = setup({ 42: 2, 33: 1, 7: -1 });
    expect(legalMoves(s).map((m) => m.path)).not.toContainEqual([42, 24]);
  });
  it("allows a king to land anywhere beyond one captured opponent", () => {
    const s = setup({ 42: 2, 28: -1, 0: -1 });
    expect(legalMoves(s).map((m) => m.path)).toContainEqual([42, 21]);
    expect(legalMoves(s).map((m) => m.path)).toContainEqual([42, 14]);
    expect(legalMoves(s).map((m) => m.path)).toContainEqual([42, 7]);
  });
  it("does not capture through an already captured blocking piece", () => {
    const s = setup({ 35: 2, 26: -1, 44: -1 });
    expect(legalMoves(s).every((m) => m.captures.length === 1)).toBe(true);
  });
  it("wins when the opponent has no legal moves", () => {
    const s = setup({ 17: 1, 56: -1 });
    expect(playMove(s, "white", [17, 8]).winner).toBe("white");
  });
  it("detects threefold repetition", () => {
    const s = setup({ 42: 2, 7: -2 });
    const future = playMove(s, "white", [42, 35]);
    s.positions[positionKey(future.board, future.turn)] = 2;
    expect(playMove(s, "white", [42, 35]).winner).toBe("draw");
  });
  it("draws after 50 quiet king turns", () => {
    const s = setup({ 42: 2, 7: -2 });
    s.quiet = 49;
    expect(playMove(s, "white", [42, 35]).winner).toBe("draw");
  });
  it("resets the quiet counter when a man moves", () => {
    const s = initialState();
    s.quiet = 49;
    expect(playMove(s, "white", legalMoves(s)[0].path).quiet).toBe(0);
  });
  it("cannot play after the game ends", () => {
    const s = initialState();
    s.winner = "draw";
    expect(legalMoves(s)).toHaveLength(0);
    expect(() => playMove(s, "white", [40, 33])).toThrow("terminou");
  });
  it("completes simulated games with consistent pieces and captures", () => {
    for (let seed = 0; seed < 6; seed++) {
      let s = initialState();
      for (let n = 0; n < 300 && !s.winner; n++) {
        const ms = legalMoves(s);
        expect(ms.length).toBeGreaterThan(0);
        const m = ms[(n * 17 + seed * 13) % ms.length],
          count = s.board.filter(Boolean).length;
        s = playMove(s, s.turn, m.path);
        expect(s.board.filter(Boolean).length).toBe(count - m.captures.length);
        expect(s.board.every((p) => [-2, -1, 0, 1, 2].includes(p))).toBe(true);
      }
    }
  });
});
