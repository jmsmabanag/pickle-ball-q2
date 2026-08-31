// Extracted pure-logic test for the matchmaking engine used in Home.tsx.
// This mirrors selectNextPlayers/buildNextGroups exactly to verify required test cases.

type Result = "win" | "loss" | null;
type MatchReason = "winner" | "loss" | "fifo";
type Player = { id: string; name: string; result: Result; queuedAt: number; games: number; wins: number };

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

function mk(id: string, result: Result, offsetMs: number): Player {
  return { id, name: `P${id}`, result, queuedAt: offsetMs, games: 0, wins: 0 };
}

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`PASS: ${name}`); }
  else { failed++; console.log(`FAIL: ${name}`); }
}

// 1. 4 new players -> FIFO
{
  const q = [mk("a", null, 1), mk("b", null, 2), mk("c", null, 3), mk("d", null, 4)];
  const r = selectNextPlayers(q)!;
  check("4 new players -> fifo", r.reason === "fifo" && r.players.map(p=>p.id).join(",") === "a,b,c,d");
}

// 2. Four winners available, oldest is WIN -> winner group selected, order preserved
{
  const q = [
    mk("w1","win",1), mk("l1","loss",2), mk("w2","win",3), mk("w3","win",4), mk("w4","win",5), mk("n1",null,6)
  ];
  const r = selectNextPlayers(q)!;
  check("4 winners, oldest WIN -> winner group", r.reason === "winner" && r.players.map(p=>p.id).join(",") === "w1,w2,w3,w4");
}

// 3. Four losses available, oldest is LOSS -> loss group selected
{
  const q = [
    mk("l1","loss",1), mk("w1","win",2), mk("l2","loss",3), mk("l3","loss",4), mk("l4","loss",5)
  ];
  const r = selectNextPlayers(q)!;
  check("4 losses, oldest LOSS -> loss group", r.reason === "loss" && r.players.map(p=>p.id).join(",") === "l1,l2,l3,l4");
}

// 4. Only 3 winners -> FIFO fallback
{
  const q = [mk("w1","win",1), mk("w2","win",2), mk("w3","win",3), mk("l1","loss",4)];
  const r = selectNextPlayers(q)!;
  check("only 3 winners -> fifo fallback", r.reason === "fifo" && r.players.map(p=>p.id).join(",") === "w1,w2,w3,l1");
}

// 5. Only 3 losses -> FIFO fallback
{
  const q = [mk("l1","loss",1), mk("l2","loss",2), mk("l3","loss",3), mk("w1","win",4)];
  const r = selectNextPlayers(q)!;
  check("only 3 losses -> fifo fallback", r.reason === "fifo" && r.players.map(p=>p.id).join(",") === "l1,l2,l3,w1");
}

// 6. Mixed results -> oldest player's result determines preferred group (loss oldest, enough losses further back)
{
  const q = [
    mk("l1","loss",1), mk("w1","win",2), mk("w2","win",3), mk("l2","loss",4), mk("l3","loss",5), mk("l4","loss",6)
  ];
  const r = selectNextPlayers(q)!;
  check("mixed results -> oldest's result (loss) wins when 4 losses exist", r.reason === "loss" && r.players.map(p=>p.id).join(",") === "l1,l2,l3,l4");
}

// 7. buildNextGroups produces sequential non-overlapping groups (simulation, no mutation of input)
{
  const q = [
    mk("w1","win",1), mk("w2","win",2), mk("w3","win",3), mk("w4","win",4),
    mk("l1","loss",5), mk("l2","loss",6), mk("l3","loss",7), mk("l4","loss",8),
    mk("n1",null,9), mk("n2",null,10), mk("n3",null,11), mk("n4",null,12),
  ];
  const originalLen = q.length;
  const groups = buildNextGroups(q);
  const allIds = groups.flatMap(g => g.players.map(p => p.id));
  const uniqueIds = new Set(allIds);
  check("buildNextGroups: 3 groups of 4, no overlap", groups.length === 3 && allIds.length === 12 && uniqueIds.size === 12);
  check("buildNextGroups: does not mutate original queue array", q.length === originalLen);
  check("buildNextGroups: group order is winner, loss, fifo", groups.map(g=>g.reason).join(",") === "winner,loss,fifo");
}

// 8. Fewer than 4 total waiting players anywhere -> no group
{
  const q = [mk("a", null, 1), mk("b", null, 2)];
  const r = selectNextPlayers(q);
  check("fewer than 4 players -> null (no premature group)", r === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
