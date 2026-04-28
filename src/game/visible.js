// Helpers that map the server's compact `{ you, top }` payload onto
// the 5-lane visual model the client renders. The server doesn't know
// or care about lanes — it just sends the player's full state plus the
// top-N horses by rank. This module decides who shows up where on
// screen.

// Role-based colors. With 150 racers we can't use lane-indexed colors;
// instead we map by ROLE so the player always sees themselves in
// amber, the leader in rose, etc. — and lane swaps don't change the
// color of a given role.
//
// Center slot (index 2) is always "you". The other four slots show
// the top racers, ranked outward from the center.
export const YOU_COLOR = 'amber';
export const RANK_COLORS = ['rose', 'sky', 'emerald', 'violet'];

const SLOT_LANES = [0, 1, 2, 3, 4];

// Build a 5-element array of horses to render in lane slots:
//   index 0 = top racer (slot 0, top-of-track)
//   index 1 = 2nd racer
//   index 2 = you
//   index 3 = next racer
//   index 4 = last visible racer
//
// `top` is the server-side rank-ordered list (excluding you only if you
// fell out of the top N — otherwise you're in there too). We strip you
// out of the others list, take 4, and apply role colors.
export function buildVisibleSlots(you, top) {
  if (!you) return SLOT_LANES.map(() => null);
  const others = (top || []).filter((h) => h.id !== you.id).slice(0, 4);
  const slot = (h, lane, color, isPlayer) =>
    h ? { ...h, color, lane, isPlayer } : null;
  return [
    slot(others[0], 0, RANK_COLORS[0], false),
    slot(others[1], 1, RANK_COLORS[1], false),
    { ...you, color: YOU_COLOR, lane: 2, isPlayer: true },
    slot(others[2], 3, RANK_COLORS[2], false),
    slot(others[3], 4, RANK_COLORS[3], false),
  ];
}

// Build a rank-ordered list (1st, 2nd, 3rd, 4th, 5th) for the
// leaderboard pill. If you're outside the top 5, you get appended in
// 5th slot so the player always sees their own pill.
export function buildLeaderboardList(you, top) {
  const t = top || [];
  if (!you) return t.map((h, i) => ({ ...h, color: rankColor(i, t.length), isPlayer: false }));
  const inTop = t.some((h) => h.id === you.id);
  const list = inTop
    ? t.map((h) => (h.id === you.id ? { ...you, isPlayer: true } : { ...h, isPlayer: false }))
    : [...t.slice(0, 4).map((h) => ({ ...h, isPlayer: false })), { ...you, isPlayer: true }];
  return list.map((h, i) =>
    h.isPlayer ? { ...h, color: YOU_COLOR } : { ...h, color: rankColor(i, list.length) },
  );
}

function rankColor(index, _total) {
  return RANK_COLORS[Math.min(index, RANK_COLORS.length - 1)];
}
