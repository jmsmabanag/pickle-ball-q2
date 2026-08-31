// Mirrors the removeCourt() mutation logic in Home.tsx to verify:
// - the court and its game are removed
// - displaced players are moved to the front of the queue (queueIds order)
// - displaced players get the earliest queuedAt so the matchmaking engine picks them next
// - players not on the removed court are untouched
// - removing an idle court (no game) is a no-op on players/queue

type Player = { id: string; name: string; queuedAt: number; result: "win" | "loss" | null };
type Game = { id: string; courtId: string; teamA: string[]; teamB: string[] };
type Court = { id: string; name: string };
type State = { players: Player[]; queueIds: string[]; courts: Court[]; games: Game[] };

function removeCourt(state: State, courtId: string): State {
  const draft: State = JSON.parse(JSON.stringify(state));
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
}

function selectNextPlayers(queue: Player[], groupSize = 4) {
  if (queue.length < groupSize) return null;
  const ordered = [...queue].sort((a, b) => a.queuedAt - b.queuedAt);
  return { players: ordered.slice(0, groupSize) };
}

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`PASS: ${name}`); }
  else { failed++; console.log(`FAIL: ${name}`); }
}

const baseState: State = {
  players: [
    { id: "q1", name: "Waiting1", queuedAt: 1000, result: null },
    { id: "q2", name: "Waiting2", queuedAt: 2000, result: null },
    { id: "p1", name: "OnCourt1", queuedAt: 500, result: "win" },
    { id: "p2", name: "OnCourt2", queuedAt: 600, result: "win" },
    { id: "p3", name: "OnCourt3", queuedAt: 700, result: "loss" },
    { id: "p4", name: "OnCourt4", queuedAt: 800, result: "loss" },
  ],
  queueIds: ["q1", "q2"],
  courts: [{ id: "court-1", name: "Court 1" }, { id: "court-2", name: "Court 2" }],
  games: [{ id: "g1", courtId: "court-1", teamA: ["p1", "p2"], teamB: ["p3", "p4"] }],
};

// 1. Remove a court WITH an active game
{
  const result = removeCourt(baseState, "court-1");
  check("court removed from courts list", !result.courts.some((c) => c.id === "court-1"));
  check("game for that court removed", !result.games.some((g) => g.courtId === "court-1"));
  check("displaced players prepended to queueIds", result.queueIds.slice(0, 4).join(",") === "p1,p2,p3,p4");
  check("previously waiting players pushed after displaced players", result.queueIds.slice(4).join(",") === "q1,q2");
  const p1 = result.players.find((p) => p.id === "p1")!;
  const q1 = result.players.find((p) => p.id === "q1")!;
  check("displaced player queuedAt is earlier than any pre-existing waiting player", p1.queuedAt < q1.queuedAt);
  check("other court untouched", result.courts.some((c) => c.id === "court-2"));

  // The matchmaking engine must now pick the displaced group first, ahead of q1/q2 who were already waiting.
  const queue = result.queueIds.map((id) => result.players.find((p) => p.id === id)!);
  const next = selectNextPlayers(queue)!;
  check("matchmaking picks the displaced 4 first after removal", next.players.map((p) => p.id).sort().join(",") === "p1,p2,p3,p4");
}

// 2. Remove an idle court (no active game) — should not touch players/queue at all
{
  const idleState: State = { ...baseState, games: [] };
  const result = removeCourt(idleState, "court-2");
  check("idle court removed", !result.courts.some((c) => c.id === "court-2"));
  check("idle-court removal leaves queueIds untouched", result.queueIds.join(",") === idleState.queueIds.join(","));
  check("idle-court removal leaves player queuedAt untouched", JSON.stringify(result.players) === JSON.stringify(idleState.players));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
