// Mirrors removePlayerFromGame() in Home.tsx.
// Covers: with a waiting replacement (court keeps playing), and without one
// (game ends, everyone from that court returns to queue, removed player first).

type Player = { id: string; name: string; queuedAt: number };
type Game = { id: string; courtId: string; teamA: string[]; teamB: string[] };
type State = { players: Player[]; queueIds: string[]; games: Game[] };

function removePlayerFromGame(state: State, gameId: string, playerId: string): State {
  const draft: State = JSON.parse(JSON.stringify(state));
  const game = draft.games.find((g) => g.id === gameId);
  if (!game) return draft;
  const onTeamA = game.teamA.includes(playerId);
  const teammates = [...game.teamA, ...game.teamB].filter((id) => id !== playerId);
  const waiting = draft.queueIds.map((id) => draft.players.find((p) => p.id === id)).filter(Boolean) as Player[];
  const replacement = [...waiting].sort((a, b) => a.queuedAt - b.queuedAt)[0];

  if (replacement) {
    if (onTeamA) game.teamA = game.teamA.map((id) => (id === playerId ? replacement.id : id));
    else game.teamB = game.teamB.map((id) => (id === playerId ? replacement.id : id));
    draft.queueIds = draft.queueIds.filter((id) => id !== replacement.id);
    draft.queueIds = [playerId, ...draft.queueIds];
    draft.players = draft.players.map((p) => (p.id === playerId ? { ...p, queuedAt: -Date.now() } : p));
  } else {
    draft.games = draft.games.filter((g) => g.id !== gameId);
    const base = -Date.now();
    const order = [playerId, ...teammates];
    draft.players = draft.players.map((p) => {
      const position = order.indexOf(p.id);
      return position === -1 ? p : { ...p, queuedAt: base + position };
    });
    draft.queueIds = [...order, ...draft.queueIds.filter((id) => !order.includes(id))];
  }
  return draft;
}

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`PASS: ${name}`); }
  else { failed++; console.log(`FAIL: ${name}`); }
}

// Case 1: someone is waiting -> they backfill the court, removed player goes to front,
// everyone previously waiting shifts back by exactly one position.
{
  const state: State = {
    players: [
      { id: "p1", name: "A", queuedAt: 100 }, { id: "p2", name: "B", queuedAt: 200 },
      { id: "p3", name: "C", queuedAt: 300 }, { id: "p4", name: "D", queuedAt: 400 },
      { id: "w1", name: "Waiter1", queuedAt: 10 }, { id: "w2", name: "Waiter2", queuedAt: 20 },
    ],
    queueIds: ["w1", "w2"],
    games: [{ id: "g1", courtId: "court-1", teamA: ["p1", "p2"], teamB: ["p3", "p4"] }],
  };
  const before = state.queueIds.slice();
  const result = removePlayerFromGame(state, "g1", "p1");
  const game = result.games.find((g) => g.id === "g1")!;
  check("game still exists (backfilled, not ended)", !!game);
  check("removed player p1 is no longer on the court", !game.teamA.includes("p1") && !game.teamB.includes("p1"));
  check("court still has 4 players total", game.teamA.length + game.teamB.length === 4);
  check("the oldest waiter (w1) backfilled the vacated slot", game.teamA.includes("w1") || game.teamB.includes("w1"));
  check("removed player p1 is now at the very front of the queue", result.queueIds[0] === "p1");
  check("w1 (who backfilled) is no longer in the queue", !result.queueIds.includes("w1"));
  check("w2 shifted back by exactly one position (was index 1, now index 1 behind p1)", result.queueIds.indexOf("w2") === 1);
  check("queue length unchanged (one out to court, one in from court)", result.queueIds.length === before.length);
  const p1After = result.players.find((p) => p.id === "p1")!;
  const w2After = result.players.find((p) => p.id === "w2")!;
  check("removed player has an earlier queuedAt than the player who was already waiting", p1After.queuedAt < w2After.queuedAt);
}

// Case 2: nobody waiting -> game ends, all 4 return to queue, removed player strictly first
{
  const state: State = {
    players: [
      { id: "p1", name: "A", queuedAt: 100 }, { id: "p2", name: "B", queuedAt: 200 },
      { id: "p3", name: "C", queuedAt: 300 }, { id: "p4", name: "D", queuedAt: 400 },
    ],
    queueIds: [],
    games: [{ id: "g1", courtId: "court-1", teamA: ["p1", "p2"], teamB: ["p3", "p4"] }],
  };
  const result = removePlayerFromGame(state, "g1", "p3");
  check("game ended (no one to backfill)", !result.games.some((g) => g.id === "g1"));
  check("removed player p3 is first in queue", result.queueIds[0] === "p3");
  check("all 4 players from the court are back in the queue", result.queueIds.length === 4 && ["p1", "p2", "p3", "p4"].every((id) => result.queueIds.includes(id)));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
