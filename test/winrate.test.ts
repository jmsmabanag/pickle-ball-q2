// Mirrors winRate() and the Leaderboard sort in Home.tsx.
// Leaderboard now ranks by TOTAL WINS first (win rate and games played are
// only tiebreakers), per the redesign request. Win rate is still shown per
// row, just no longer the primary sort key.

type Player = { id: string; name: string; games: number; wins: number };
function winRate(p: Player) { return p.games > 0 ? Math.round((p.wins / p.games) * 100) : 0; }
function rankPlayers(players: Player[]) {
  return [...players].sort((a, b) => b.wins - a.wins || winRate(b) - winRate(a) || b.games - a.games);
}

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`PASS: ${name}`); }
  else { failed++; console.log(`FAIL: ${name}`); }
}

check("100% win rate", winRate({id:"a",name:"A",games:4,wins:4}) === 100);
check("50% win rate", winRate({id:"b",name:"B",games:4,wins:2}) === 50);
check("0 games -> 0%, no divide by zero crash", winRate({id:"c",name:"C",games:0,wins:0}) === 0);
check("rounds to nearest percent", winRate({id:"d",name:"D",games:3,wins:1}) === 33);

// The case that actually distinguishes "rank by wins" from "rank by win rate":
// a player with fewer total wins but a higher win rate must NOT outrank a
// player with more total wins but a lower win rate.
{
  const players: Player[] = [
    { id: "high-rate-few-games", name: "Y", games: 2, wins: 2 },   // 100% win rate, only 2 wins
    { id: "low-rate-many-wins", name: "X", games: 20, wins: 8 },   // 40% win rate, 8 wins
    { id: "mid", name: "Z", games: 10, wins: 6 },                  // 60% win rate, 6 wins
  ];
  const ranked = rankPlayers(players);
  check("leaderboard ranks by total wins first, not win rate", ranked.map(p => p.id).join(",") === "low-rate-many-wins,mid,high-rate-few-games");
}

// Tiebreak: equal wins -> higher win rate ranks first
{
  const players: Player[] = [
    { id: "efficient", name: "E", games: 8, wins: 5 },   // 62.5% -> 63%
    { id: "grindy", name: "G", games: 15, wins: 5 },     // 33%
  ];
  const ranked = rankPlayers(players);
  check("equal wins -> higher win rate breaks the tie", ranked.map(p => p.id).join(",") === "efficient,grindy");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
