/** Damas 8×8: flying kings, backwards captures, majority rule, promotion at turn end. */
export type Side = "white" | "black";
export type Piece = -2 | -1 | 0 | 1 | 2;
export type Move = { path: number[]; captures: number[]; promotes: boolean };
export type HistoryEntry = {
  side: Side;
  path: number[];
  captures: number;
  promotes: boolean;
};
export type GameState = {
  board: Piece[];
  turn: Side;
  winner: Side | "draw" | null;
  reason: string | null;
  quiet: number;
  positions: Record<string, number>;
  history: HistoryEntry[];
};
const dirs = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;
export const opposite = (s: Side): Side => (s === "white" ? "black" : "white");
export const owns = (p: Piece, side: Side) =>
  side === "white" ? p > 0 : p < 0;
const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const crowned = (p: Piece, sq: number) =>
  Math.abs(p) === 1 && (p > 0 ? sq < 8 : sq >= 56);
export const coordinate = (sq: number) =>
  "abcdefgh"[sq % 8] + (8 - Math.floor(sq / 8));
export const positionKey = (b: Piece[], s: Side) => `${s}:${b.join(",")}`;
export function initialState(): GameState {
  const board: Piece[] = Array(64).fill(0);
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if ((r + c) % 2) {
        if (r < 3) board[r * 8 + c] = -1;
        if (r > 4) board[r * 8 + c] = 1;
      }
  return {
    board,
    turn: "white",
    winner: null,
    reason: null,
    quiet: 0,
    positions: { [positionKey(board, "white")]: 1 },
    history: [],
  };
}
function capturesFrom(board: Piece[], sq: number): Move[] {
  const piece = board[sq],
    side: Side = piece > 0 ? "white" : "black",
    results: Move[] = [];
  function visit(b: Piece[], at: number, path: number[], captured: number[]) {
    let continued = false;
    for (const [dr, dc] of dirs) {
      let r = Math.floor(at / 8) + dr,
        c = (at % 8) + dc;
      if (Math.abs(piece) === 1) {
        const rr = r + dr,
          cc = c + dc;
        if (!inside(r, c) || !inside(rr, cc)) continue;
        const victim = r * 8 + c,
          to = rr * 8 + cc;
        if (
          b[victim] &&
          !owns(b[victim], side) &&
          !captured.includes(victim) &&
          !b[to]
        ) {
          continued = true;
          const next = b.slice();
          next[at] = 0;
          next[to] = piece;
          visit(next, to, [...path, to], [...captured, victim]);
        }
      } else {
        while (inside(r, c) && !b[r * 8 + c]) {
          r += dr;
          c += dc;
        }
        if (!inside(r, c)) continue;
        const victim = r * 8 + c;
        if (owns(b[victim], side) || captured.includes(victim)) continue;
        r += dr;
        c += dc;
        while (inside(r, c) && !b[r * 8 + c]) {
          continued = true;
          const to = r * 8 + c,
            next = b.slice();
          next[at] = 0;
          next[to] = piece;
          visit(next, to, [...path, to], [...captured, victim]);
          r += dr;
          c += dc;
        }
      }
    }
    if (!continued && captured.length)
      results.push({ path, captures: captured, promotes: crowned(piece, at) });
  }
  visit(board, sq, [sq], []);
  return results;
}
export function legalMoves(
  state: Pick<GameState, "board" | "turn" | "winner">,
): Move[] {
  if (state.winner) return [];
  const { board, turn } = state;
  let captures: Move[] = [];
  for (let sq = 0; sq < 64; sq++)
    if (owns(board[sq], turn)) captures.push(...capturesFrom(board, sq));
  if (captures.length) {
    const max = Math.max(...captures.map((m) => m.captures.length));
    return captures.filter((m) => m.captures.length === max);
  }
  const moves: Move[] = [];
  for (let sq = 0; sq < 64; sq++)
    if (owns(board[sq], turn)) {
      const p = board[sq];
      for (const [dr, dc] of dirs) {
        if (Math.abs(p) === 1 && dr !== (p > 0 ? -1 : 1)) continue;
        let r = Math.floor(sq / 8) + dr,
          c = (sq % 8) + dc;
        while (inside(r, c) && !board[r * 8 + c]) {
          const to = r * 8 + c;
          moves.push({
            path: [sq, to],
            captures: [],
            promotes: crowned(p, to),
          });
          if (Math.abs(p) === 1) break;
          r += dr;
          c += dc;
        }
      }
    }
  return moves;
}
export function playMove(
  state: GameState,
  side: Side,
  path: number[],
): GameState {
  if (state.winner) throw Error("Esta partida já terminou.");
  if (state.turn !== side) throw Error("Aguarde a sua vez.");
  const move = legalMoves(state).find(
    (m) =>
      m.path.length === path.length && m.path.every((sq, i) => sq === path[i]),
  );
  if (!move) throw Error("Jogada inválida. Confira as capturas obrigatórias.");
  const board = state.board.slice(),
    piece = board[path[0]],
    last = path[path.length - 1];
  board[path[0]] = 0;
  for (const sq of move.captures) board[sq] = 0;
  board[last] = move.promotes ? (piece > 0 ? 2 : -2) : piece;
  const turn = opposite(side),
    key = positionKey(board, turn),
    positions = { ...state.positions, [key]: (state.positions[key] || 0) + 1 };
  const quiet =
    move.captures.length || Math.abs(piece) === 1 ? 0 : state.quiet + 1;
  const next: GameState = {
    board,
    turn,
    winner: null,
    reason: null,
    quiet,
    positions,
    history: [
      ...state.history,
      {
        side,
        path: move.path,
        captures: move.captures.length,
        promotes: move.promotes,
      },
    ],
  };
  if (!legalMoves(next).length) {
    next.winner = side;
    next.reason = "Sem peças ou jogadas disponíveis.";
  } else if (positions[key] >= 3) {
    next.winner = "draw";
    next.reason = "A mesma posição se repetiu três vezes.";
  } else if (quiet >= 50) {
    next.winner = "draw";
    next.reason = "50 turnos sem captura nem movimento de pedra.";
  }
  return next;
}
