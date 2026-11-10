import {
  initialState,
  legalMoves,
  opposite,
  playMove,
  type GameState,
  type Side,
} from "./engine.ts";
export type Room = {
  code: string;
  white_hash: string;
  black_hash: string | null;
  white_name: string;
  black_name: string | null;
  state: GameState;
  version: number;
  round: number;
  draw_offer: Side | null;
  rematch_votes: Side[];
  white_seen: string;
  black_seen: string | null;
  created_at: string;
  updated_at: string;
};
export type PublicRoom = {
  code: string;
  whiteName: string;
  blackName: string | null;
  state: GameState;
  version: number;
  round: number;
  you: Side;
  drawOffer: Side | null;
  rematchVotes: Side[];
  opponentOnline: boolean;
};
export interface Store {
  get(code: string): Promise<Room | null>;
  insert(room: Room): Promise<boolean>;
  update(room: Room, expected: number): Promise<boolean>;
  touch(code: string, side: Side, now: string): Promise<void>;
}
export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type Command = {
  action: string;
  code?: string;
  token: string;
  payload?: Record<string, unknown>;
};
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const hashToken = async (token: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
const nameOf = (value: unknown) => {
  if (typeof value !== "string")
    throw new GameError("Digite seu nome para jogar.");
  const name = value.trim().replace(/[\p{Cc}\p{Cf}]/gu, "");
  if (!name || name.length > 24)
    throw new GameError("Use um nome com 1 a 24 caracteres.");
  return name;
};
function view(room: Room, you: Side): PublicRoom {
  const seen = you === "white" ? room.black_seen : room.white_seen;
  return {
    code: room.code,
    whiteName: room.white_name,
    blackName: room.black_name,
    state: room.state,
    version: room.version,
    round: room.round,
    you,
    drawOffer: room.draw_offer,
    rematchVotes: room.rematch_votes,
    opponentOnline: !!seen && Date.now() - Date.parse(seen) < 20000,
  };
}
export async function execute(
  store: Store,
  command: Command,
): Promise<PublicRoom> {
  const { action, token, payload = {} } = command;
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new GameError("Solicitação inválida.");
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw new GameError("Sessão inválida. Entre novamente na sala.", 401);
  const hash = await hashToken(token),
    now = new Date().toISOString();
  if (action === "create") {
    const name = nameOf(payload.name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      const code = Array.from(bytes, (v) => alphabet[v % alphabet.length]).join(
        "",
      );
      const room: Room = {
        code,
        white_hash: hash,
        black_hash: null,
        white_name: name,
        black_name: null,
        state: initialState(),
        version: 0,
        round: 1,
        draw_offer: null,
        rematch_votes: [],
        white_seen: now,
        black_seen: null,
        created_at: now,
        updated_at: now,
      };
      if (await store.insert(room)) return view(room, "white");
    }
    throw new GameError("Não foi possível criar a sala. Tente novamente.", 503);
  }
  const code = command.code?.toUpperCase();
  if (!code || !/^[A-HJ-NP-Z2-9]{8}$/.test(code))
    throw new GameError("O código da sala tem 8 caracteres.");
  const room = await store.get(code);
  if (!room) throw new GameError("Sala não encontrada ou expirada.", 404);
  if (Date.now() - Date.parse(room.updated_at) > 7 * 24 * 60 * 60 * 1000)
    throw new GameError("Esta sala expirou. Crie uma nova partida.", 410);
  let you: Side | null =
    hash === room.white_hash
      ? "white"
      : hash === room.black_hash
        ? "black"
        : null;
  const expected = room.version;
  if (action === "join") {
    if (you) {
      await store.touch(code, you, now);
      return view(room, you);
    }
    if (room.black_hash)
      throw new GameError("Esta sala já tem dois jogadores.", 409);
    room.black_name = nameOf(payload.name);
    room.black_hash = hash;
    room.black_seen = now;
    you = "black";
  } else {
    if (!you)
      throw new GameError("Entre na sala para acompanhar a partida.", 401);
    if (action === "read") {
      await store.touch(code, you, now);
      return view(room, you);
    }
    if (!room.black_hash)
      throw new GameError("Aguarde o outro jogador entrar.", 409);
    if (payload.version !== expected)
      throw new GameError("A partida mudou. O tabuleiro será atualizado.", 409);
    if (action === "move") {
      const path = payload.path;
      if (
        !Array.isArray(path) ||
        path.length < 2 ||
        path.length > 13 ||
        !path.every((sq) => Number.isInteger(sq) && sq >= 0 && sq < 64)
      )
        throw new GameError("Jogada inválida.");
      try {
        room.state = playMove(room.state, you, path as number[]);
      } catch (e) {
        throw new GameError((e as Error).message);
      }
      room.draw_offer = null;
    } else if (action === "resign") {
      if (room.state.winner) throw new GameError("Esta partida já terminou.");
      room.state = {
        ...room.state,
        winner: opposite(you),
        reason: "Vitória por desistência.",
      };
      room.draw_offer = null;
    } else if (action === "offer-draw") {
      if (room.state.winner) throw new GameError("Esta partida já terminou.");
      if (room.draw_offer)
        throw new GameError("Já existe uma proposta de empate.");
      room.draw_offer = you;
    } else if (action === "accept-draw") {
      if (room.state.winner || !room.draw_offer || room.draw_offer === you)
        throw new GameError("Nenhuma proposta de empate para aceitar.");
      room.state = {
        ...room.state,
        winner: "draw",
        reason: "Empate por acordo entre os jogadores.",
      };
      room.draw_offer = null;
    } else if (action === "decline-draw") {
      if (!room.draw_offer || room.draw_offer === you)
        throw new GameError("Nenhuma proposta de empate para recusar.");
      room.draw_offer = null;
    } else if (action === "rematch") {
      if (!room.state.winner)
        throw new GameError("Termine a partida antes da revanche.");
      if (!room.rematch_votes.includes(you)) room.rematch_votes.push(you);
      if (room.rematch_votes.length === 2) {
        [room.white_hash, room.black_hash] = [
          room.black_hash!,
          room.white_hash,
        ];
        [room.white_name, room.black_name] = [
          room.black_name!,
          room.white_name,
        ];
        [room.white_seen, room.black_seen] = [
          room.black_seen!,
          room.white_seen,
        ];
        room.state = initialState();
        room.round++;
        room.rematch_votes = [];
        room.draw_offer = null;
        you = opposite(you);
      }
    } else throw new GameError("Ação não reconhecida.");
  }
  room.version++;
  room.updated_at = now;
  if (you === "white") room.white_seen = now;
  else room.black_seen = now;
  if (!(await store.update(room, expected)))
    throw new GameError(
      "Outra jogada chegou primeiro. Atualize e tente novamente.",
      409,
    );
  await store.touch(code, you!, now);
  return view(room, you!);
}
export { legalMoves };
