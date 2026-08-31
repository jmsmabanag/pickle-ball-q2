import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight, Check, ChevronDown, Clock3, Flag, Gauge, LockKeyhole, Plus,
  Trophy, Users, X, Play, RotateCcw, ShieldCheck, Trash2,
  Undo2, PlusCircle, AlertTriangle, LogOut
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Result = "win" | "loss" | null;
type View = "queue" | "leaderboard";
type MatchReason = "winner" | "loss" | "fifo";

type Player = {
  id: string;
  name: string;
  result: Result;
  queuedAt: number;
  games: number;
  wins: number;
};

type Game = {
  id: string;
  courtId: string;
  startedAt: number;
  teamA: string[];
  teamB: string[];
  reason: MatchReason;
};

type Court = { id: string; name: string };

type Snapshot = {
  players: Player[];
  queueIds: string[];
  courts: Court[];
  games: Game[];
};

type AppState = Snapshot & { version: number };

const STORAGE_KEY = "pickleball-open-play-state-v4";
const ADMIN_PIN = "4951";
const minute = 60_000;
const nowSeed = Date.now();

const samplePlayers: Player[] = [
  { id: "1", name: "Maya Chen", result: "win", queuedAt: nowSeed - 8.7 * minute, games: 7, wins: 6 },
  { id: "2", name: "Jordan Ellis", result: "win", queuedAt: nowSeed - 8.6 * minute, games: 6, wins: 5 },
  { id: "3", name: "Priya Shah", result: "win", queuedAt: nowSeed - 8.5 * minute, games: 8, wins: 6 },
  { id: "4", name: "Theo Martin", result: "win", queuedAt: nowSeed - 8.3 * minute, games: 5, wins: 4 },
  { id: "5", name: "Liam Brooks", result: "loss", queuedAt: nowSeed - 7.8 * minute, games: 8, wins: 4 },
  { id: "6", name: "Sofia Grant", result: "loss", queuedAt: nowSeed - 7.6 * minute, games: 6, wins: 2 },
  { id: "7", name: "Ari Patel", result: "loss", queuedAt: nowSeed - 7.3 * minute, games: 7, wins: 3 },
  { id: "8", name: "Noah Williams", result: null, queuedAt: nowSeed - 6.9 * minute, games: 2, wins: 1 },
  { id: "9", name: "Cameron Reed", result: "win", queuedAt: 0, games: 5, wins: 4 },
  { id: "10", name: "Sam Kim", result: "win", queuedAt: 0, games: 5, wins: 4 },
  { id: "11", name: "Riley Fox", result: "loss", queuedAt: 0, games: 5, wins: 2 },
  { id: "12", name: "Dani Moore", result: "loss", queuedAt: 0, games: 5, wins: 2 },
];

const defaultState: AppState = {
  version: 4,
  players: samplePlayers,
  queueIds: ["1", "2", "3", "4", "5", "6", "7", "8"],
  courts: [{ id: "court-1", name: "Court 1" }],
  games: [{ id: "game-1", courtId: "court-1", startedAt: nowSeed - 7 * minute, teamA: ["9", "10"], teamB: ["11", "12"], reason: "fifo" }],
};

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatWait(queuedAt: number, now = Date.now()) {
  if (!queuedAt) return "00:00";
  const seconds = Math.max(0, Math.floor((now - queuedAt) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function cloneState(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state));
}

function selectNextPlayers(queue: Player[], groupSize = 4) {
  if (queue.length < groupSize) return null;
  const ordered = [...queue].sort((a, b) => a.queuedAt - b.queuedAt);
  const first = ordered[0];

  if (first.result) {
    const matching = ordered.filter((player) => player.result === first.result);
    if (matching.length >= groupSize) {
      const selectedIds = new Set(matching.slice(0, groupSize).map((player) => player.id));
      const selected = ordered.filter((player) => selectedIds.has(player.id));
      return { players: selected, reason: first.result === "win" ? "winner" as const : "loss" as const };
    }
  }

  return { players: ordered.slice(0, groupSize), reason: "fifo" as const };
}

function buildNextGroups(queue: Player[], maxGroups = 8) {
  const groups: { players: Player[]; reason: MatchReason }[] = [];
  let remaining = [...queue];
  while (groups.length < maxGroups) {
    const next = selectNextPlayers(remaining);
    if (!next) break;
    groups.push(next);
    const selectedIds = new Set(next.players.map((p) => p.id));
    remaining = remaining.filter((p) => !selectedIds.has(p.id));
  }
  return groups;
}

function groupLabel(reason: MatchReason) {
  if (reason === "winner") return "Winners vs winners";
  if (reason === "loss") return "Loss vs loss";
  return "Open play";
}

function groupCopy(reason: MatchReason) {
  if (reason === "winner") return "Four winners grouped by the queue engine.";
  if (reason === "loss") return "Four players coming off a loss, grouped together.";
  return "Not enough matching results, so FIFO keeps the queue moving.";
}

const REALTIME_CHANNEL = "pickleball-open-play";
const REALTIME_EVENT = "state_update";

async function loadRemoteState(): Promise<AppState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("queue_state").select("state").eq("id", 1).maybeSingle();
  if (error || !data?.state) return null;
  const remote = data.state as Partial<AppState>;
  if (!Array.isArray(remote.players) || !Array.isArray(remote.queueIds) || !Array.isArray(remote.courts) || !Array.isArray(remote.games)) return null;
  return remote as AppState;
}

async function saveRemoteState(state: AppState, channel?: RealtimeChannel | null) {
  if (!supabase) return;
  const { error } = await supabase.from("queue_state").upsert({
    id: 1,
    state,
    updated_at: new Date().toISOString(),
  });

  // Persist first, then broadcast the exact same snapshot to all connected clients.
  if (!error && channel) {
    await channel.send({
      type: "broadcast",
      event: REALTIME_EVENT,
      payload: { state },
    });
  }
}

export default function Home() {
  const [view, setView] = useState<View>("queue");
  const [state, setState] = useState<AppState>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || defaultState; } catch { return defaultState; }
  });
  const [history, setHistory] = useState<AppState[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [logoTaps, setLogoTaps] = useState(0);
  const [confirmAction, setConfirmAction] = useState<"reset" | "addCourt" | "rollback" | "removeCourt" | "removePlayer" | null>(null);
  const [finishGameId, setFinishGameId] = useState<string | null>(null);
  const [removeCourtId, setRemoveCourtId] = useState<string | null>(null);
  const [removePlayerTarget, setRemovePlayerTarget] = useState<{ gameId: string; playerId: string } | null>(null);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [loadedRemote, setLoadedRemote] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const applyingRemoteRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoadedRemote(true);
      return;
    }

    let cancelled = false;
    const channel = supabase.channel(REALTIME_CHANNEL, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: REALTIME_EVENT }, ({ payload }) => {
        const remote = payload?.state as AppState | undefined;
        if (
          !remote ||
          !Array.isArray(remote.players) ||
          !Array.isArray(remote.queueIds) ||
          !Array.isArray(remote.courts) ||
          !Array.isArray(remote.games)
        ) return;

        applyingRemoteRef.current = true;
        setState(remote);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
      })
      .subscribe((status) => {
        if (cancelled) return;
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    realtimeChannelRef.current = channel;

    loadRemoteState().then((remote) => {
      if (cancelled) return;
      if (remote) {
        applyingRemoteRef.current = true;
        setState(remote);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
      }
      setLoadedRemote(true);
    });

    return () => {
      cancelled = true;
      realtimeChannelRef.current = null;
      setRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    // Never push localStorage/default state before the initial Supabase snapshot arrives.
    if (!loadedRemote) return;

    // A broadcast is already persisted by its sender. Do not echo it back.
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }

    void saveRemoteState(state, realtimeChannelRef.current);
  }, [state, loadedRemote]);

  const playersById = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players]);
  const queue = useMemo(() => state.queueIds.map((id) => playersById.get(id)).filter(Boolean) as Player[], [state.queueIds, playersById]);
  const nextGroups = useMemo(() => buildNextGroups(queue, Math.max(8, state.courts.length + 4)), [queue, state.courts.length]);
  const activeIds = useMemo(() => new Set(state.games.flatMap((g) => [...g.teamA, ...g.teamB])), [state.games]);
  const waitingGroups = nextGroups;

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  }

  function commit(mutator: (draft: AppState) => AppState, message?: string) {
    setHistory((h) => [...h.slice(-19), cloneState(state)]);
    const next = mutator(cloneState(state));
    setState(next);
    if (message) flash(message);
  }

  function handleLogoTap() {
    const next = logoTaps + 1;
    setLogoTaps(next);
    if (next >= 6) {
      setLogoTaps(0);
      setPin("");
      setPinOpen(true);
    }
    window.setTimeout(() => setLogoTaps(0), 1800);
  }

  function submitPin(event: FormEvent) {
    event.preventDefault();
    if (pin === ADMIN_PIN) {
      setPinOpen(false);
      setAdminOpen(true);
      flash("Admin mode enabled.");
    } else {
      flash("Incorrect PIN.");
      setPin("");
    }
  }

  function addPlayer(event: FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    commit((draft) => {
      draft.players.push({ id, name: clean, result: null, queuedAt: Date.now(), games: 0, wins: 0 });
      draft.queueIds.push(id);
      return draft;
    }, `${clean} added to the queue.`);
    setName("");
  }

  function assignGroupToCourt(draft: AppState, court: Court, players: Player[], reason: MatchReason) {
    const ids = players.map((p) => p.id);
    draft.queueIds = draft.queueIds.filter((id) => !ids.includes(id));
    draft.games = draft.games.filter((g) => g.courtId !== court.id);
    draft.games.push({
      id: `${court.id}-${Date.now()}`,
      courtId: court.id,
      startedAt: Date.now(),
      teamA: ids.slice(0, 2),
      teamB: ids.slice(2, 4),
      reason,
    });
  }

  function startNextOnCourt(court: Court) {
    if (state.games.some((g) => g.courtId === court.id)) return;
    const currentQueue = state.queueIds.map((id) => playersById.get(id)).filter(Boolean) as Player[];
    const next = selectNextPlayers(currentQueue);
    if (!next) return flash("There are not enough waiting players for this court.");
    commit((draft) => {
      const draftPlayers = draft.queueIds.map((id) => draft.players.find((p) => p.id === id)).filter(Boolean) as Player[];
      const fresh = selectNextPlayers(draftPlayers);
      if (fresh) assignGroupToCourt(draft, court, fresh.players, fresh.reason);
      return draft;
    }, `${groupLabel(next.reason)} started on ${court.name}.`);
  }

  function finishGame(winnerTeam: "A" | "B") {
    const game = state.games.find((g) => g.id === finishGameId);
    if (!game) return;
    const winnerIds = new Set(winnerTeam === "A" ? game.teamA : game.teamB);
    const finishedIds = new Set([...game.teamA, ...game.teamB]);
    const now = Date.now();

    commit((draft) => {
      draft.players = draft.players.map((player) => {
        if (!finishedIds.has(player.id)) return player;
        const won = winnerIds.has(player.id);
        return { ...player, result: won ? "win" : "loss", games: player.games + 1, wins: player.wins + (won ? 1 : 0), queuedAt: now };
      });
      draft.queueIds = [...draft.queueIds, ...Array.from(finishedIds)].filter((id, index, list) => list.indexOf(id) === index);
      draft.games = draft.games.filter((g) => g.id !== game.id);

      const waiting = draft.queueIds.map((id) => draft.players.find((p) => p.id === id)).filter(Boolean) as Player[];
      const next = selectNextPlayers(waiting);
      if (next) {
        const court = draft.courts.find((c) => c.id === game.courtId);
        if (court) assignGroupToCourt(draft, court, next.players, next.reason);
      }
      return draft;
    }, "Game finished. Results saved and the next group was calculated automatically.");
    setFinishGameId(null);
  }

  function resetAll() {
    commit(() => cloneState(defaultState), "All courts, players, and queue state were reset.");
    setConfirmAction(null);
  }

  function addCourt() {
    commit((draft) => {
      const number = draft.courts.length + 1;
      const court = { id: `court-${Date.now()}`, name: `Court ${number}` };
      draft.courts.push(court);
      const waiting = draft.queueIds.map((id) => draft.players.find((p) => p.id === id)).filter(Boolean) as Player[];
      const next = selectNextPlayers(waiting);
      if (next) assignGroupToCourt(draft, court, next.players, next.reason);
      return draft;
    }, "New court added and filled from Next Up when four players were available.");
    setConfirmAction(null);
  }

  function rollback() {
    const previous = history[history.length - 1];
    if (!previous) return flash("Nothing to roll back.");
    setState(cloneState(previous));
    setHistory((h) => h.slice(0, -1));
    setConfirmAction(null);
    flash("Last action rolled back.");
  }

  function requestRemoveCourt(courtId: string) {
    setRemoveCourtId(courtId);
    setConfirmAction("removeCourt");
  }

  function requestRemovePlayer(gameId: string, playerId: string) {
    setRemovePlayerTarget({ gameId, playerId });
    setConfirmAction("removePlayer");
  }

  function removePlayerFromGame() {
    const target = removePlayerTarget;
    if (!target) return;
    const removedPlayer = playersById.get(target.playerId);
    commit((draft) => {
      const game = draft.games.find((g) => g.id === target.gameId);
      if (!game) return draft;
      const onTeamA = game.teamA.includes(target.playerId);
      const teammates = [...game.teamA, ...game.teamB].filter((id) => id !== target.playerId);
      const waiting = draft.queueIds.map((id) => draft.players.find((p) => p.id === id)).filter(Boolean) as Player[];
      const replacement = [...waiting].sort((a, b) => a.queuedAt - b.queuedAt)[0];

      if (replacement) {
        // Swap the removed player out for the next eligible waiting player so the court keeps playing.
        if (onTeamA) game.teamA = game.teamA.map((id) => (id === target.playerId ? replacement.id : id));
        else game.teamB = game.teamB.map((id) => (id === target.playerId ? replacement.id : id));
        draft.queueIds = draft.queueIds.filter((id) => id !== replacement.id);
        draft.queueIds = [target.playerId, ...draft.queueIds];
        draft.players = draft.players.map((p) => (p.id === target.playerId ? { ...p, queuedAt: -Date.now() } : p));
      } else {
        // No one waiting to backfill the slot: the game can't continue as a valid game, so end it
        // and send everyone from that court back to the queue, with the removed player strictly first.
        draft.games = draft.games.filter((g) => g.id !== target.gameId);
        const base = -Date.now();
        const order = [target.playerId, ...teammates];
        draft.players = draft.players.map((p) => {
          const position = order.indexOf(p.id);
          return position === -1 ? p : { ...p, queuedAt: base + position };
        });
        draft.queueIds = [...order, ...draft.queueIds.filter((id) => !order.includes(id))];
      }
      return draft;
    }, `${removedPlayer?.name || "Player"} removed from the game and moved to the front of the queue.`);
    setConfirmAction(null);
    setRemovePlayerTarget(null);
  }

  function removeCourt() {
    const courtId = removeCourtId;
    if (!courtId) return;
    const court = state.courts.find((c) => c.id === courtId);
    commit((draft) => {
      const game = draft.games.find((g) => g.courtId === courtId);
      draft.courts = draft.courts.filter((c) => c.id !== courtId);
      draft.games = draft.games.filter((g) => g.courtId !== courtId);
      if (game) {
        const displacedIds = [...game.teamA, ...game.teamB];
        const base = -Date.now();
        draft.players = draft.players.map((player) => {
          const position = displacedIds.indexOf(player.id);
          return position === -1 ? player : { ...player, queuedAt: base + position };
        });
        draft.queueIds = [...displacedIds, ...draft.queueIds.filter((id) => !displacedIds.includes(id))];
      }
      return draft;
    }, `${court?.name || "Court"} removed.${court ? " Its players moved to the top of the queue." : ""}`);
    setConfirmAction(null);
    setRemoveCourtId(null);
  }

  function logoutAdmin() {
    setAdminOpen(false);
    flash("Admin mode disabled.");
  }

  const playingPlayers = state.games.flatMap((g) => [...g.teamA, ...g.teamB]).map((id) => playersById.get(id)).filter(Boolean) as Player[];
  const currentFinishGame = state.games.find((g) => g.id === finishGameId) || null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-lockup brand-button" onClick={handleLogoTap} aria-label="Open admin access">
          <span className="brand-mark-wrap" aria-hidden="true"><PickleballLogo /></span>
          <span><strong>unstckd</strong><span>open play club</span></span>
        </button>
        <nav className="topnav" aria-label="Primary navigation">
          <button className={view === "queue" ? "nav-pill active" : "nav-pill"} onClick={() => setView("queue")}>Live queue</button>
          <button className={view === "leaderboard" ? "nav-pill active" : "nav-pill"} onClick={() => setView("leaderboard")}>Leaderboard</button>
        </nav>
        <div className="topbar-actions">
          <div className="live-indicator"><span className="live-dot" /> <span className="live-text">LIVE</span></div>
        </div>
      </header>

      <main>
        <section className="hero-wrap next-hero-card">
          <div className="hero-copy"><span className="eyebrow light"><Gauge className="icon-sm" /> OPEN PLAY · LIVE BOARD</span><h1>Know when<br /><em>you’re up.</em></h1><p>Every Next Up group is already matched using the same winner, loss, and FIFO queue logic used by the courts.</p><div className="hero-meta"><span><span className="live-dot" /> {supabase ? (realtimeConnected ? "Live sync connected" : "Connecting live sync…") : "Local mode"}</span><span>{state.courts.length} court{state.courts.length === 1 ? "" : "s"}</span></div></div>
        </section>

        <section className="stats-row" aria-label="Session summary">
          <Stat icon={<Users />} value={queue.length} label="Waiting" tone="lime" />
          <Stat icon={<Flag />} value={playingPlayers.length} label="Playing now" tone="mint" />
          <Stat icon={<Trophy />} value={state.games.length} label="Courts active" tone="amber" />
          <div className="session-note"><span className="eyebrow">SESSION NOTE</span><strong>Winner vs winner<br />when possible.</strong></div>
        </section>

        {view === "queue" ? <div className="dashboard-grid">
          <section className="content-column" aria-labelledby="playing-title">
            <div className="section-heading"><div><span className="eyebrow">LIVE NOW</span><h2 id="playing-title">Playing</h2></div><span className="section-count"><span className="live-dot" /> {state.games.length} live court{state.games.length === 1 ? "" : "s"}</span></div>
            <div className="court-grid">
              {state.courts.map((court) => {
                const game = state.games.find((g) => g.courtId === court.id);
                const teamA = game ? game.teamA.map((id) => playersById.get(id)).filter(Boolean) as Player[] : [];
                const teamB = game ? game.teamB.map((id) => playersById.get(id)).filter(Boolean) as Player[] : [];
                return <article className="court-card" key={court.id}>
                  <div className="court-card-head"><div><span className="eyebrow">{game ? "LIVE GAME" : "READY"}</span><h3>{court.name}</h3></div><div className="court-card-head-actions">{game && <span className="timer-chip"><Clock3 className="icon-sm" /> {formatWait(game.startedAt, clock)}</span>}{adminOpen && <button className="icon-button danger" onClick={() => requestRemoveCourt(court.id)} aria-label={`Remove ${court.name}`}><Trash2 className="icon-sm" /></button>}</div></div>
                  {game ? <>
                    <div className="matchup"><Team label="TEAM A" players={teamA} tone="lime" adminOpen={adminOpen} onRemove={(playerId) => requestRemovePlayer(game.id, playerId)} /><div className="versus">VS</div><Team label="TEAM B" players={teamB} tone="blue" adminOpen={adminOpen} onRemove={(playerId) => requestRemovePlayer(game.id, playerId)} /></div>
                    <div className="court-card-foot"><span><span className="live-dot" /> {groupLabel(game.reason)}</span><span>First to 11 · win by 2</span></div>
                    {adminOpen && <button className="button primary finish-button" onClick={() => setFinishGameId(game.id)}><Check className="icon-sm" /> Finish game</button>}
                  </> : <div className="empty-court"><Play /><h3>{court.name} is ready</h3><p>Next Up will fill this court when four players are available.</p>{adminOpen && <button className="button primary" onClick={() => startNextOnCourt(court)} disabled={nextGroups.length === 0}><Play className="icon-sm" /> Start next game</button>}</div>}
                </article>;
              })}
            </div>

            {adminOpen && <section className="staff-panel admin-panel">
              <div className="admin-panel-head"><div><span className="eyebrow">ADMIN MODE</span><h3>Queue controls</h3><p>Only visible after the six-tap logo unlock and PIN.</p></div><button className="button ghost" onClick={logoutAdmin}><LogOut className="icon-sm" /> Exit admin</button></div>
              <form className="form-row" onSubmit={addPlayer}><input id="player-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter player name" aria-label="Player name" /><button className="button primary" type="submit"><Plus className="icon-sm" /> Add player</button></form>
              <div className="admin-actions"><button className="button ghost" onClick={() => setConfirmAction("addCourt")}><PlusCircle className="icon-sm" /> Add court</button><button className="button ghost" onClick={() => setConfirmAction("rollback")} disabled={!history.length}><Undo2 className="icon-sm" /> Roll back</button><button className="button danger" onClick={() => setConfirmAction("reset")}><Trash2 className="icon-sm" /> Reset all</button></div>
            </section>}
          </section>

          <aside className="queue-column" aria-labelledby="next-title">
            <div className="section-heading"><div><span className="eyebrow">YOUR TURN IS COMING</span><h2 id="next-title">Next up</h2></div><span className="section-count"><Clock3 className="icon-sm" /> {queue.length} waiting</span></div>
            <div className="next-group-stack">
              {waitingGroups.length === 0 ? <section className="next-card empty-next-card"><div className="empty-next">Waiting for enough players to build the next court group.</div></section> : waitingGroups.map((group, index) => <NextGroupCard key={`${group.players[0]?.id}-${index}`} group={group} index={index} />)}
            </div>
            <div className="queue-help"><ShieldCheck className="icon-sm" /><span>Each card is an actual four-player group produced by the same queue engine. When a court becomes available, the first card is used.</span></div>
          </aside>
        </div> : <Leaderboard players={state.players} />}
      </main>

      {pinOpen && <Modal title="Admin access" onClose={() => setPinOpen(false)}><form onSubmit={submitPin}><p>Tap the logo six times to unlock admin mode. Enter the PIN to continue.</p><input className="pin-input" inputMode="numeric" maxLength={4} autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" aria-label="Admin PIN" /><button className="button primary full-button" type="submit">Unlock admin</button></form></Modal>}

      {currentFinishGame && <Modal title={`Finish ${state.courts.find((c) => c.id === currentFinishGame.courtId)?.name || "game"}`} onClose={() => setFinishGameId(null)}><p>Select the winning team. The other team is automatically marked as loss, all four players return to the queue, and the same court immediately receives the next eligible group.</p><div className="result-options"><button className="result-option winner" onClick={() => finishGame("A")}><span className="result-badge"><Trophy /></span><div><strong>Team A won</strong><span>{currentFinishGame.teamA.map((id) => playersById.get(id)?.name).join(" & ")}</span></div><ArrowRight /></button><button className="result-option loser" onClick={() => finishGame("B")}><span className="result-badge"><Trophy /></span><div><strong>Team B won</strong><span>{currentFinishGame.teamB.map((id) => playersById.get(id)?.name).join(" & ")}</span></div><ArrowRight /></button></div><div className="modal-note"><RotateCcw className="icon-sm" /> W/L, games played, wins, queue time, court assignment, and Next Up all update together.</div></Modal>}

      {confirmAction && <Modal title={confirmAction === "reset" ? "Reset everything?" : confirmAction === "addCourt" ? "Add a new court?" : confirmAction === "removeCourt" ? `Remove ${state.courts.find((c) => c.id === removeCourtId)?.name || "this court"}?` : confirmAction === "removePlayer" ? `Remove ${playersById.get(removePlayerTarget?.playerId || "")?.name || "this player"}?` : "Roll back last action?"} onClose={() => { setConfirmAction(null); setRemoveCourtId(null); setRemovePlayerTarget(null); }}><div className="confirm-icon"><AlertTriangle /></div><p>{confirmAction === "reset" ? "This clears the current players, games, courts, and queue back to the starting state." : confirmAction === "addCourt" ? "A new court will be created and immediately filled from the first Next Up group if four players are available." : confirmAction === "removeCourt" ? (state.games.some((g) => g.courtId === removeCourtId) ? "This court will be removed. The four players currently on it will be sent to the top of the queue and matched again first." : "This court will be removed. It has no active game right now.") : confirmAction === "removePlayer" ? "This player will be pulled off the court and sent straight to the front of the queue. Everyone already waiting moves back one spot. If someone is waiting, they'll immediately fill the empty slot so the game keeps going." : "The previous saved state will be restored, including queue order, courts, and active games."}</p><div className="modal-actions"><button className="button ghost" onClick={() => { setConfirmAction(null); setRemoveCourtId(null); setRemovePlayerTarget(null); }}>Cancel</button><button className={`button ${confirmAction === "reset" || confirmAction === "removeCourt" || confirmAction === "removePlayer" ? "danger" : "primary"}`} onClick={confirmAction === "reset" ? resetAll : confirmAction === "addCourt" ? addCourt : confirmAction === "removeCourt" ? removeCourt : confirmAction === "removePlayer" ? removePlayerFromGame : rollback}>{confirmAction === "reset" ? "Reset all" : confirmAction === "addCourt" ? "Add court" : confirmAction === "removeCourt" ? "Remove court" : confirmAction === "removePlayer" ? "Remove player" : "Roll back"}</button></div></Modal>}

      {notice && <div className="toast" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}><X className="icon-sm" /></button></div>}
    </div>
  );
}

function PickleballLogo() {
  return <svg viewBox="0 0 40 40" className="pickle-logo"><circle cx="20" cy="20" r="17" fill="currentColor" opacity=".12"/><circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" strokeWidth="3"/><circle cx="15" cy="16" r="1.5" fill="currentColor"/><circle cx="24" cy="13" r="1.5" fill="currentColor"/><circle cx="26" cy="21" r="1.5" fill="currentColor"/><circle cx="16" cy="25" r="1.5" fill="currentColor"/><path d="M10 30c5-3 15-3 20 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}

function NextGroupCard({ group, index }: { group: { players: Player[]; reason: MatchReason }; index: number }) {
  const a = group.players.slice(0, 2), b = group.players.slice(2, 4);
  return <section className={`next-card reason-${group.reason}`}>
    <div className="next-card-content">
      <div className="next-card-head"><div><span className="eyebrow next-eyebrow"><span className="pulse-ring" /> {index === 0 ? "ON DECK" : `COURT GROUP ${index + 1}`}</span><h3>{groupLabel(group.reason)}</h3></div><span className="ready-chip">4 players</span></div>
      <p className="next-copy">{groupCopy(group.reason)}</p>
      <div className="next-matchup"><div><span className="team-label">TEAM A</span>{a.map((p) => <NextPlayer key={p.id} player={p} />)}</div><span className="next-vs">VS</span><div><span className="team-label">TEAM B</span>{b.map((p) => <NextPlayer key={p.id} player={p} />)}</div></div>
      <div className="next-card-footer"><span><Check className="icon-sm" /> Ready for next available court</span><span>{index === 0 ? "First group" : `Priority ${index + 1}`}</span></div>
    </div>
  </section>;
}

function NextPlayer({ player }: { player: Player }) { return <div className="next-player"><span className="avatar">{initials(player.name)}</span><div className="next-player-copy"><strong>{player.name}</strong><span>{player.result === "win" ? "Winner" : player.result === "loss" ? "Loss" : "New player"}</span></div></div>; }
function Stat({ icon, value, label, tone }: { icon: React.ReactNode; value: string | number; label: string; tone: string }) { return <div className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><strong>{value}</strong><span className="eyebrow">{label}</span></div>; }
function Team({ label, players, tone, adminOpen, onRemove }: { label: string; players: Player[]; tone: string; adminOpen?: boolean; onRemove?: (playerId: string) => void }) { return <div className={`team-panel ${tone}`}><span className="eyebrow">{label}</span>{players.map((player) => <div className="team-player" key={player.id}><span className="mini-avatar">{initials(player.name).slice(0, 1)}</span><span className="team-player-name">{player.name}</span>{adminOpen && onRemove && <button className="team-player-remove" onClick={() => onRemove(player.id)} aria-label={`Remove ${player.name} from the game`}><X className="icon-xs" /></button>}</div>)}</div>; }
function winRate(player: Player) { return player.games > 0 ? Math.round((player.wins / player.games) * 100) : 0; }
function Leaderboard({ players }: { players: Player[] }) { const ranked = [...players].sort((a, b) => b.wins - a.wins || winRate(b) - winRate(a) || b.games - a.games); return <section className="leaderboard-page"><div className="section-heading"><div><span className="eyebrow">CLUB RECORDS</span><h2>Leaderboard</h2></div><span className="section-count">Today’s session</span></div><div className="leaderboard-card"><div className="leaderboard-intro"><div><h3>Most wins on the board</h3><p>Every completed game updates this table.</p></div><Trophy className="trophy-large" /></div>{ranked.map((player, index) => <div className="rank-row" key={player.id}><span className={`rank-number rank-${index + 1}`}>{index + 1}</span><span className="avatar">{initials(player.name)}</span><div className="rank-copy"><strong>{player.name}</strong><span>{player.games} games played</span></div><span className="rank-winrate">{winRate(player)}%<small> win rate</small></span><strong className="rank-wins">{player.wins}<small> wins</small></strong><div className="rank-bar"><span style={{ width: `${Math.min(100, player.wins * 14)}%` }} /></div></div>)}</div></section>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="modal-backdrop"><section className="finish-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={onClose} aria-label="Close"><X /></button><span className="eyebrow">UNSTCKD ADMIN</span><h2>{title}</h2>{children}</section></div>; }
