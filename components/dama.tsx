"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  coordinate,
  initialState,
  legalMoves,
  owns,
  playMove,
  type Move,
  type Piece,
  type Side,
} from "@/lib/engine";
import type { PublicRoom } from "@/lib/game-service";
import { Icon } from "./icons";

const labelSide = (side: Side) => (side === "white" ? "claras" : "escuras");
function PieceView({
  piece,
  small = false,
}: {
  piece: Piece;
  small?: boolean;
}) {
  return (
    <span
      className={`piece ${piece > 0 ? "ivory" : "plum"} ${small ? "small-piece" : ""}`}
    >
      <span className="piece-ring">
        {Math.abs(piece) === 2 && <Icon name="crown" size={24} />}
      </span>
    </span>
  );
}
function Board({
  board,
  flipped = false,
  selected = [],
  choices = [],
  lastMove = [],
  onSquare,
  disabled = false,
  decorative = false,
}: {
  board: Piece[];
  flipped?: boolean;
  selected?: number[];
  choices?: number[];
  lastMove?: number[];
  onSquare?: (sq: number) => void;
  disabled?: boolean;
  decorative?: boolean;
}) {
  const squares = Array.from({ length: 64 }, (_, i) => (flipped ? 63 - i : i));
  const display = board.slice();
  if (selected.length > 1) {
    const p = display[selected[0]];
    display[selected[0]] = 0;
    display[selected.at(-1)!] = p;
  }
  return (
    <div className={`board-frame ${decorative ? "decorative-board" : ""}`}>
      <div
        className="board"
        role={decorative ? "img" : "group"}
        aria-label={
          decorative
            ? "Tabuleiro de damas com peças claras e escuras"
            : "Tabuleiro de damas"
        }
      >
        {squares.map((sq, i) => {
          const dark = (Math.floor(sq / 8) + (sq % 8)) % 2 === 1,
            p = display[sq],
            target = choices.includes(sq),
            active = selected.at(-1) === sq;
          const classes = `square ${dark ? "dark" : "light"} ${active ? "selected" : ""} ${lastMove.includes(sq) ? "last-move" : ""} ${target ? "target" : ""}`;
          const content = (
            <>
              {i % 8 === 0 && (
                <span className="rank">{8 - Math.floor(sq / 8)}</span>
              )}
              {i >= 56 && <span className="file">{"abcdefgh"[sq % 8]}</span>}
              {p !== 0 && <PieceView piece={p} />}{" "}
              {target && <span className={`move-dot ${p ? "occupied" : ""}`} />}
            </>
          );
          if (decorative)
            return (
              <div key={sq} className={classes}>
                {content}
              </div>
            );
          return (
            <button
              key={sq}
              className={classes}
              data-square={sq}
              onClick={() => onSquare?.(sq)}
              disabled={disabled || !dark}
              aria-label={`${coordinate(sq)}${p ? `, ${Math.abs(p) === 2 ? "dama" : "pedra"} ${p > 0 ? "clara" : "escura"}` : ", vazia"}${target ? ", destino disponível" : ""}`}
              aria-pressed={active}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
async function callApi(
  code: string | null,
  body?: Record<string, unknown>,
): Promise<PublicRoom> {
  const res = await fetch(code ? `/api/rooms/${code}` : "/api/rooms", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  if (!res.ok)
    throw Object.assign(new Error(data.error || "Não foi possível conectar."), {
      status: res.status,
    });
  return data.room;
}
export default function Dama() {
  const [room, setRoom] = useState<PublicRoom | null>(null),
    [local, setLocal] = useState(false),
    [name, setName] = useState(""),
    [code, setCode] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [prefix, setPrefix] = useState<number[]>([]),
    [connected, setConnected] = useState(true);
  const [restoring, setRestoring] = useState(true),
    [resignOpen, setResignOpen] = useState(false),
    [copied, setCopied] = useState(false);
  const rulesRef = useRef<HTMLDialogElement>(null),
    confirmRef = useRef<HTMLDialogElement>(null),
    roomRef = useRef<PublicRoom | null>(null),
    busyRef = useRef(false);
  roomRef.current = room;
  busyRef.current = busy;
  const accept = useCallback((next: PublicRoom) => {
    setRoom((prev) =>
      prev && prev.code === next.code && prev.version > next.version
        ? prev
        : next,
    );
    setConnected(true);
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem("dama-name");
    if (saved) setName(saved);
    const invite = new URLSearchParams(window.location.search)
      .get("sala")
      ?.toUpperCase();
    if (invite) {
      setCode(invite);
      if (/^[A-HJ-NP-Z2-9]{8}$/.test(invite))
        callApi(invite)
          .then(accept)
          .catch((e) => {
            if (e.status !== 401) setError(e.message);
          })
          .finally(() => setRestoring(false));
      else {
        setError("Esse código de sala não é válido.");
        setRestoring(false);
      }
    } else setRestoring(false);
  }, [accept]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!room || local) return;
    let stopped = false;
    const poll = async () => {
      if (document.hidden || busyRef.current) return;
      try {
        const next = await callApi(room.code);
        if (!stopped) accept(next);
      } catch {
        if (!stopped) setConnected(false);
      }
    };
    const interval = setInterval(poll, 2500);
    const visible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [room?.code, local, accept]); // Only one poller per room; version changes do not recreate it.
  useEffect(() => {
    setPrefix([]);
    setError("");
  }, [room?.version, room?.code]);
  useEffect(() => {
    if (resignOpen) confirmRef.current?.showModal();
    else confirmRef.current?.close();
  }, [resignOpen]);
  const state = room?.state || initialState();
  const moves = useMemo(() => legalMoves(state), [state]);
  const yourTurn =
    !!room &&
    (local || state.turn === room.you) &&
    !!room.blackName &&
    !state.winner;
  const candidates = moves.filter((m) =>
    prefix.every((sq, i) => m.path[i] === sq),
  );
  const choices =
    yourTurn && prefix.length
      ? [
          ...new Set(
            candidates
              .map((m) => m.path[prefix.length])
              .filter((v): v is number => v !== undefined),
          ),
        ]
      : [];
  const captureRequired = moves.some((m) => m.captures.length > 0),
    last = state.history.at(-1);
  const whiteCount = state.board.filter((p) => p > 0).length,
    blackCount = state.board.filter((p) => p < 0).length;
  async function enter(join: boolean) {
    if (busyRef.current) return;
    if (!name.trim()) {
      setError("Como podemos chamar você? Digite seu nome.");
      document.getElementById("nickname")?.focus();
      return;
    }
    if (join && !/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
      setError("Digite os 8 caracteres do código da sala.");
      return;
    }
    setBusy(true);
    setError("");
    localStorage.setItem("dama-name", name.trim());
    try {
      const next = await callApi(join ? code : null, {
        action: join ? "join" : "create",
        name: name.trim(),
      });
      setLocal(false);
      accept(next);
      window.history.replaceState({}, "", `?sala=${next.code}`);
      setCode(next.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }
  function practice() {
    const n = name.trim() || "Jogador 1";
    setLocal(true);
    setRoom({
      code: "LOCAL",
      whiteName: n,
      blackName: "Jogador 2",
      state: initialState(),
      you: "white",
      version: 0,
      round: 1,
      drawOffer: null,
      rematchVotes: [],
      opponentOnline: true,
    });
    setPrefix([]);
    setError("");
    window.history.replaceState({}, "", "/");
  }
  async function action(kind: string, extra: Record<string, unknown> = {}) {
    const current = roomRef.current;
    if (!current || busyRef.current) return;
    setBusy(true);
    setError("");
    try {
      if (local) {
        if (kind === "move") {
          const next = playMove(
            current.state,
            current.state.turn,
            extra.path as number[],
          );
          accept({
            ...current,
            state: next,
            you: next.turn,
            version: current.version + 1,
          });
        }
        if (kind === "resign")
          accept({
            ...current,
            state: {
              ...current.state,
              winner: current.state.turn === "white" ? "black" : "white",
              reason: "Vitória por desistência.",
            },
            version: current.version + 1,
          });
        if (kind === "rematch")
          accept({
            ...current,
            state: initialState(),
            you: "white",
            round: current.round + 1,
            version: current.version + 1,
          });
      } else
        accept(
          await callApi(current.code, {
            action: kind,
            version: current.version,
            ...extra,
          }),
        );
    } catch (e) {
      if (
        !local &&
        kind === "rematch" &&
        (e as { status?: number }).status === 409
      ) {
        // Both players often accept at once. Refresh and retry this idempotent vote once.
        try {
          let latest = await callApi(current.code);
          if (latest.state.winner && !latest.rematchVotes.includes(latest.you))
            latest = await callApi(current.code, {
              action: "rematch",
              version: latest.version,
            });
          accept(latest);
          return;
        } catch {
          setError("A revanche está sendo atualizada. Tente novamente.");
        }
      } else
        setError(e instanceof Error ? e.message : "Não foi possível concluir.");
      if (!local)
        try {
          accept(await callApi(current.code));
        } catch {
          setConnected(false);
        }
    } finally {
      setBusy(false);
    }
  }
  function select(sq: number) {
    if (!yourTurn || busy) return;
    if (prefix.length && choices.includes(sq)) {
      const next = [...prefix, sq],
        complete = moves.find(
          (m) =>
            m.path.length === next.length &&
            next.every((v, i) => m.path[i] === v),
        );
      if (complete) {
        setPrefix([]);
        void action("move", { path: complete.path });
      } else setPrefix(next);
      return;
    }
    if (prefix.length > 1) {
      setToast("Continue a captura com a mesma peça.");
      return;
    }
    if (
      owns(state.board[sq], state.turn) &&
      moves.some((m) => m.path[0] === sq)
    )
      setPrefix(prefix[0] === sq ? [] : [sq]);
    else if (owns(state.board[sq], state.turn) && captureRequired)
      setToast("Há uma captura obrigatória com outra peça.");
    else setPrefix([]);
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/?sala=${room?.code}`,
      );
      setCopied(true);
      setToast("Link copiado. Agora é só enviar para seu amigo.");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setToast(
        `Compartilhe o código ${room?.code} ou copie o endereço do navegador.`,
      );
    }
  }
  const playerName = (s: Side) =>
    s === "white" ? room?.whiteName : room?.blackName;
  const status = !room?.blackName
    ? "A boa companhia está a caminho."
    : state.winner === "draw"
      ? "Uma partida equilibrada."
      : state.winner
        ? `${playerName(state.winner)} venceu!`
        : local
          ? `Vez de ${playerName(state.turn)}`
          : yourTurn
            ? "Sua vez de fazer história."
            : `${playerName(state.turn)} está pensando…`;
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Dama início">
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            dama<span className="brand-period">.</span>
          </span>
          <span className="brand-tag">BONS ENCONTROS, BOAS JOGADAS.</span>
        </a>
        <button
          className="text-button rules-button"
          onClick={() => rulesRef.current?.showModal()}
        >
          <Icon name="help" size={18} />
          <span>Como jogar</span>
        </button>
      </header>
      <main>
        {!room ? (
          <section className="lobby">
            <div className="lobby-content">
              <div className="eyebrow">
                <span className="live-dot" />
                DUAS PESSOAS. UM TABULEIRO.
              </div>
              <h1>
                Uma boa jogada
                <br />
                merece <em>companhia.</em>
              </h1>
              <p className="intro">
                O clássico de sempre, a um link de distância.
                <br className="desktop-break" /> Chame alguém, escolha seu lado
                e aproveite a partida.
              </p>
              <div className="lobby-form">
                <label htmlFor="nickname">COMO PODEMOS CHAMAR VOCÊ?</label>
                <input
                  id="nickname"
                  autoComplete="nickname"
                  placeholder="Seu nome ou apelido"
                  maxLength={24}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void enter(!!code);
                  }}
                />
                <button
                  className="button primary create-button"
                  disabled={busy || restoring}
                  onClick={() => void enter(false)}
                >
                  {busy
                    ? "Preparando o tabuleiro…"
                    : restoring
                      ? "Reconectando…"
                      : "Criar uma partida"}
                  <Icon name="arrow" />
                </button>
                <div className="or-divider">
                  <span />
                  ou entre na sala de um amigo
                  <span />
                </div>
                <form
                  className="join-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void enter(true);
                  }}
                >
                  <label className="sr-only" htmlFor="room-code">
                    Código da sala
                  </label>
                  <Icon name="link" size={18} />
                  <input
                    id="room-code"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Código da sala"
                    maxLength={8}
                    value={code}
                    onChange={(e) =>
                      setCode(
                        e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                      )
                    }
                  />
                  <button type="submit" disabled={busy || restoring}>
                    Entrar
                    <Icon name="arrow" size={17} />
                  </button>
                </form>
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <p className="no-signup">
                  <Icon name="shield" size={15} />
                  Sem cadastro. Sem download. Só jogar.
                </p>
              </div>
            </div>
            <div className="lobby-visual">
              <div className="board-orbit orbit-one" />
              <div className="board-orbit orbit-two" />
              <div className="floating-note">
                <span className="note-icon">
                  <Icon name="people" size={21} />
                </span>
                <div>
                  <strong>Melhor a dois.</strong>
                  <span>Mesmo a quilômetros de distância.</span>
                </div>
              </div>
              <Board board={initialState().board} decorative />
              <div className="visual-caption">
                <span className="caption-line" />
                <span>12 peças. Infinitas possibilidades.</span>
                <Icon name="spark" size={17} />
              </div>
            </div>
            <div className="lobby-bottom">
              <div>
                <span className="tiny-board">
                  <Icon name="grid" size={18} />
                </span>
                <p>
                  <strong>Clássico no jeito de jogar.</strong>
                  <span>Leve no jeito de se conectar.</span>
                </p>
              </div>
              <button
                className="text-button practice-button"
                onClick={practice}
              >
                Só quer experimentar?{" "}
                <span>
                  Jogue neste dispositivo
                  <Icon name="arrow" size={16} />
                </span>
              </button>
            </div>
          </section>
        ) : (
          <section className="game-section">
            <div className="game-heading">
              <div>
                <div className="eyebrow">
                  <span className={`live-dot ${!connected ? "offline" : ""}`} />
                  {local
                    ? "PARTIDA NO MESMO DISPOSITIVO"
                    : connected
                      ? "VOCÊS ESTÃO CONECTADOS"
                      : "RECONECTANDO À PARTIDA"}
                </div>
                <h1>
                  Bom ter você à mesa<span>.</span>
                </h1>
              </div>
              <div className="room-badge">
                <span>{local ? "MODO LOCAL" : "SALA PRIVADA"}</span>
                <strong>{room.code}</strong>
              </div>
            </div>
            {!connected && (
              <div className="connection-alert" role="status">
                A conexão oscilou. Vamos reconectar automaticamente; sua partida
                está salva.
              </div>
            )}
            <div className="game-layout">
              <div className="game-board-column">
                <div className="player-strip">
                  <Player
                    name={
                      local
                        ? room.blackName
                        : playerName(room.you === "white" ? "black" : "white")
                    }
                    side={
                      local ? "black" : room.you === "white" ? "black" : "white"
                    }
                    active={
                      !state.winner &&
                      state.turn ===
                        (local
                          ? "black"
                          : room.you === "white"
                            ? "black"
                            : "white")
                    }
                    count={
                      local
                        ? blackCount
                        : room.you === "white"
                          ? blackCount
                          : whiteCount
                    }
                    detail={
                      !room.blackName
                        ? "Aguardando entrar"
                        : local
                          ? "Jogador 2"
                          : room.opponentOnline
                            ? "Na mesa"
                            : "Fora da mesa · pode reconectar"
                    }
                  />
                </div>
                <Board
                  board={state.board}
                  flipped={!local && room.you === "black"}
                  selected={prefix}
                  choices={choices}
                  lastMove={last?.path || []}
                  onSquare={select}
                  disabled={!yourTurn || busy || (!connected && !local)}
                />
                <div className="player-strip bottom-player">
                  <Player
                    name={local ? room.whiteName : playerName(room.you)}
                    side={local ? "white" : room.you}
                    active={
                      !state.winner &&
                      state.turn === (local ? "white" : room.you)
                    }
                    count={
                      local
                        ? whiteCount
                        : room.you === "white"
                          ? whiteCount
                          : blackCount
                    }
                    detail={
                      local
                        ? "Jogador 1"
                        : `Você joga com as ${labelSide(room.you)}`
                    }
                  />
                </div>
              </div>
              <aside className="game-sidebar">
                <div className={`turn-card ${state.winner ? "finished" : ""}`}>
                  <span className="card-eyebrow">
                    {state.winner
                      ? "FIM DE PARTIDA"
                      : !room.blackName
                        ? "QUASE TUDO PRONTO"
                        : `PARTIDA ${String(room.round).padStart(2, "0")}`}
                  </span>
                  <div className="status-symbol">
                    <Icon
                      name={
                        state.winner
                          ? "crown"
                          : room.blackName
                            ? "spark"
                            : "people"
                      }
                      size={29}
                    />
                  </div>
                  <h2 aria-live="polite">{status}</h2>
                  <p>
                    {state.winner
                      ? state.reason
                      : !room.blackName
                        ? "Compartilhe o link e convide alguém para o outro lado do tabuleiro."
                        : yourTurn
                          ? captureRequired
                            ? "Captura obrigatória: escolha uma peça destacada pelas jogadas disponíveis."
                            : "Selecione uma peça e depois uma das casas marcadas."
                          : "Enquanto isso, pense na sua próxima jogada."}
                  </p>
                  {!local && !room.blackName && (
                    <button
                      className="button primary"
                      onClick={() => void copyInvite()}
                    >
                      <Icon name={copied ? "check" : "copy"} size={18} />
                      {copied ? "Link copiado!" : "Convidar por link"}
                    </button>
                  )}
                  {state.winner && (
                    <button
                      className="button primary"
                      disabled={
                        busy || (!local && room.rematchVotes.includes(room.you))
                      }
                      onClick={() => void action("rematch")}
                    >
                      <Icon name="refresh" size={18} />
                      {!local && room.rematchVotes.includes(room.you)
                        ? "Aguardando revanche…"
                        : "Jogar novamente"}
                    </button>
                  )}
                  {state.winner &&
                    !local &&
                    room.rematchVotes.length > 0 &&
                    !room.rematchVotes.includes(room.you) && (
                      <small>Seu adversário quer uma revanche. Vamos?</small>
                    )}
                </div>
                {!local && room.blackName && (
                  <button
                    className="share-button"
                    onClick={() => void copyInvite()}
                  >
                    <Icon name={copied ? "check" : "link"} size={17} />
                    {copied ? "Link copiado" : "Copiar link da sala"}
                    <Icon name="copy" size={16} />
                  </button>
                )}
                {room.drawOffer && !state.winner && (
                  <div className="draw-card">
                    <Icon name="equal" />
                    <p>
                      {room.drawOffer === room.you
                        ? "Proposta de empate enviada."
                        : "Seu adversário propôs um empate."}
                    </p>
                    {room.drawOffer !== room.you && (
                      <div>
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() => void action("accept-draw")}
                        >
                          Aceitar
                        </button>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => void action("decline-draw")}
                        >
                          Continuar jogando
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <div className="history-card">
                  <div className="card-title">
                    <h3>O caminho até aqui</h3>
                    <span>
                      {state.history.length}{" "}
                      {state.history.length === 1 ? "jogada" : "jogadas"}
                    </span>
                  </div>
                  <div
                    className="move-history"
                    aria-label="Histórico de jogadas"
                  >
                    {!state.history.length ? (
                      <div className="history-empty">
                        <Icon name="grid" size={25} />
                        <p>
                          Toda boa partida começa
                          <br />
                          com uma primeira jogada.
                        </p>
                      </div>
                    ) : (
                      Array.from(
                        { length: Math.ceil(state.history.length / 2) },
                        (_, i) => (
                          <div className="history-row" key={i}>
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            {[
                              state.history[i * 2],
                              state.history[i * 2 + 1],
                            ].map((m, j) => (
                              <strong key={j}>
                                {m ? (
                                  <>
                                    {m.path
                                      .map(coordinate)
                                      .join(m.captures ? " × " : " – ")}
                                    {m.promotes && " ♛"}
                                  </>
                                ) : (
                                  "—"
                                )}
                              </strong>
                            ))}
                          </div>
                        ),
                      ).reverse()
                    )}
                  </div>
                </div>
                {error && (
                  <p role="alert" className="error game-error">
                    {error}
                  </p>
                )}
                {!!room.blackName && !state.winner && (
                  <div className="game-actions">
                    {!local && (
                      <button
                        className="text-button"
                        disabled={busy || !!room.drawOffer}
                        onClick={() => void action("offer-draw")}
                      >
                        <Icon name="equal" size={18} />
                        Propor empate
                      </button>
                    )}
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => setResignOpen(true)}
                    >
                      <Icon name="flag" size={17} />
                      Desistir
                    </button>
                  </div>
                )}
                <div className="table-note">
                  <Icon name="shield" size={18} />
                  <p>
                    {local
                      ? "Um tabuleiro para vocês dois. Alternem as jogadas neste dispositivo."
                      : "Pode atualizar a página. Sua cadeira e sua partida continuam aqui."}
                  </p>
                </div>
                <button
                  className="text-button return-button"
                  onClick={() => {
                    setRoom(null);
                    setLocal(false);
                    setError("");
                    setCode("");
                    window.history.replaceState({}, "", "/");
                  }}
                >
                  <Icon name="back" size={16} />
                  Voltar ao início
                </button>
              </aside>
            </div>
          </section>
        )}
      </main>
      <footer className="site-footer">
        <span>Feito para desacelerar. E pensar uma jogada à frente.</span>
        <span>
          DAMAS 8 × 8 <i />{" "}
          {room && !local ? "PARTIDA ONLINE" : "JOGUE NO SEU TEMPO"}
        </span>
      </footer>
      <dialog
        className="modal"
        ref={rulesRef}
        onClick={(e) => {
          if (e.target === rulesRef.current) rulesRef.current.close();
        }}
      >
        <button
          aria-label="Fechar regras"
          className="icon-button modal-close"
          onClick={() => rulesRef.current?.close()}
        >
          <Icon name="close" />
        </button>
        <div className="eyebrow">BEM-VINDO AO TABULEIRO</div>
        <h2>
          Simples de aprender.
          <br />
          <em>Bom de jogar.</em>
        </h2>
        <ol className="rules-list">
          <li>
            <strong>As claras começam.</strong>
            <span>
              São 12 peças de cada lado. Pedras avançam uma casa na diagonal,
              pelas casas escuras.
            </span>
          </li>
          <li>
            <strong>Capturar faz parte.</strong>
            <span>
              Salte uma peça adversária, inclusive para trás. A captura é
              obrigatória e você deve escolher a sequência que captura mais
              peças. Clique em cada destino até terminar.
            </span>
          </li>
          <li>
            <strong>Chegou ao outro lado? Dama.</strong>
            <span>
              A promoção acontece ao terminar a jogada na última fileira. Damas
              deslizam por várias casas na diagonal e também capturam à
              distância.
            </span>
          </li>
          <li>
            <strong>A última boa jogada vence.</strong>
            <span>
              Vence quem deixa o outro sem peças ou movimentos. Há empate por
              acordo, três repetições da posição ou 50 turnos seguidos só com
              damas, sem capturas.
            </span>
          </li>
        </ol>
        <p className="rules-footnote">
          Variante casual 8×8 com regra da maior captura. Sem relógio e sem
          penalidade por desconexão. Salas expiram após 7 dias sem jogadas.
        </p>
        <button
          className="button primary"
          onClick={() => rulesRef.current?.close()}
        >
          Entendi, vamos jogar
          <Icon name="arrow" size={18} />
        </button>
      </dialog>
      <dialog
        className="modal confirm-modal"
        ref={confirmRef}
        onCancel={() => setResignOpen(false)}
      >
        <div className="status-symbol">
          <Icon name="flag" size={28} />
        </div>
        <h2>Encerrar por aqui?</h2>
        <p>
          Ao desistir, a vitória fica com o outro jogador. Vocês podem começar
          uma revanche depois.
        </p>
        <button
          className="button primary"
          onClick={() => {
            setResignOpen(false);
            void action("resign");
          }}
        >
          Sim, desistir
        </button>
        <button
          className="button secondary"
          onClick={() => setResignOpen(false)}
        >
          Continuar a partida
        </button>
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
function Player({
  name,
  side,
  active,
  count,
  detail,
}: {
  name: string | null | undefined;
  side: Side;
  active: boolean;
  count: number;
  detail: string;
}) {
  return (
    <>
      <div className={`player-avatar ${side}`}>
        <PieceView piece={side === "white" ? 1 : -1} small />
      </div>
      <div className="player-info">
        <strong>
          {name || "Uma cadeira esperando"}
          {active && <span className="turn-pill">NA VEZ</span>}
        </strong>
        <span>{detail}</span>
      </div>
      <span className="piece-count">
        {count}
        <small>peças</small>
      </span>
    </>
  );
}
