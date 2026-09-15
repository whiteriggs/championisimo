import { buildTeamTotals, calcUserScore, type Match, type Phase } from "./scoring";
import { buildLeagueStandings, type TeamStanding } from "./standings";
import {
  HOME_ADV,
  effectiveRatings,
  mulberry32,
  shootoutWinner,
  simulateScore,
} from "./strength";

export type SimMatch = {
  id: string;
  utcDate: string;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
  phase: Phase;
  penalties: boolean;
  played: boolean;
  matchday: number | null;
  penWinner?: "home" | "away";
};

/** Apuesta ya resuelta a nombres de equipo y en orden de inscripción. */
export type ProbBet = {
  user: string;
  favorites: string[];
  antiFavorites: string[];
  superFavorite: string | null;
};

export type ProbInput = { matches: SimMatch[]; bets: ProbBet[]; sims: number };

/** Un equipo que te separa del resto: cuánto suma y cuánto te diferencia. */
export type EdgeTeam = {
  team: string;
  kind: "fav" | "anti";
  meanPts: number;
  impact: number;
  exclusive: boolean;
};

export type UserProbability = {
  user: string;
  winPct: number;
  podiumPct: number;
  lastPct: number;
  meanScore: number;
  p10: number;
  p90: number;
  posDist: number[];
  bestPos: number;
  beats: number[];
  edge: EdgeTeam[];
};

export type TeamProbability = {
  name: string;
  championPct: number;
  finalPct: number;
  r16Pct: number;
  meanPts: number;
};

export type PendingMatch = {
  id: string;
  home: string;
  away: string;
  utcDate: string;
};

/** winPct[desenlace][participante]; desenlace 0 local, 1 empate, 2 visitante. */
export type MatchScenario = {
  id: string;
  outcomeProb: number[];
  winPct: number[][];
  swing: number;
};

export type ScenarioSims = {
  sims: number;
  pendingIds: string[];
  outcomes: Int8Array;
  winners: Int8Array;
};

export type ProbabilityResult = {
  users: UserProbability[];
  teams: TeamProbability[];
  sims: number;
  pending: PendingMatch[];
  scenarios: MatchScenario[];
  scenarioSims: ScenarioSims;
  sharedFavorites: string[];
  matchesLeft: number;
};

/**
 * Cuadro de la fase eliminatoria. Las secciones del playoff están en el
 * reglamento; el reparto de octavos hacia cuartos y semifinales sigue el
 * cuadro publicado en 2025/26, porque el de esta temporada no se conoce hasta
 * el sorteo de enero.
 */
const PLAYOFF_SECTIONS = [
  { seeded: [9, 10], unseeded: [23, 24], r16Seeds: [7, 8] },
  { seeded: [11, 12], unseeded: [21, 22], r16Seeds: [5, 6] },
  { seeded: [13, 14], unseeded: [19, 20], r16Seeds: [3, 4] },
  { seeded: [15, 16], unseeded: [17, 18], r16Seeds: [1, 2] },
];
/** Cuartos: pares de huecos de octavos (0 = el del 1.º de la liga … 7 = el del 8.º). */
const QF_PAIRS = [
  [0, 6],
  [1, 7],
  [2, 5],
  [3, 4],
];
const SF_PAIRS = [
  [2, 1],
  [3, 0],
];

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function toMatch(
  id: string,
  home: string,
  away: string,
  homeGoals: number,
  awayGoals: number,
  phase: Phase,
  roundKey: string,
  penalties = false
): Match {
  return { id, home, away, homeGoals, awayGoals, phase, penalties, played: true, roundKey };
}

type SeasonOutcome = {
  matches: Match[];
  standings: TeamStanding[];
  champion: string;
  finalists: string[];
  r16Teams: string[];
};

/**
 * Juega un cruce a doble partido. El mejor clasificado recibe en la vuelta.
 * Si de un partido ya existe el dato real se usa ese marcador y no se emite
 * como simulado, porque los reales ya están sumados aparte.
 */
function playTie(
  better: string,
  worse: string,
  phase: Phase,
  roundKey: string,
  eff: Record<string, number>,
  rng: () => number,
  legsByPair: Map<string, SimMatch[]>,
  out: Match[]
): string {
  const real = legsByPair.get(pairKey(better, worse)) ?? [];
  const legFor = (home: string) => real.find((m) => m.home === home);

  const goals: Record<string, number> = { [better]: 0, [worse]: 0 };
  let penWinner: "home" | "away" | null = null;
  let decided = false;

  for (const host of [worse, better]) {
    const guest = host === worse ? better : worse;
    const leg = legFor(host);
    if (leg?.played) {
      goals[host] += leg.homeGoals ?? 0;
      goals[guest] += leg.awayGoals ?? 0;
      if (leg.penalties && leg.penWinner) {
        penWinner = leg.penWinner === "home" ? "home" : "away";
        decided = true;
      }
      continue;
    }
    const s = simulateScore(eff[host] + HOME_ADV, eff[guest], rng);
    goals[host] += s.h;
    goals[guest] += s.a;
    out.push(
      toMatch(leg?.id ?? `${roundKey}-${host}`, host, guest, s.h, s.a, phase, roundKey)
    );
  }

  if (goals[better] > goals[worse]) return better;
  if (goals[worse] > goals[better]) return worse;

  if (decided && penWinner) {
    // La vuelta la jugó en casa el mejor clasificado.
    return penWinner === "home" ? better : worse;
  }
  // Empate al final de la vuelta: la tanda va en el partido de vuelta.
  const last = out[out.length - 1];
  if (last && last.home === better) last.penalties = true;
  return shootoutWinner(eff[better], eff[worse], rng) === "home" ? better : worse;
}

function resolveSeason(
  standings: TeamStanding[],
  eff: Record<string, number>,
  rng: () => number,
  legsByPair: Map<string, SimMatch[]>
): Omit<SeasonOutcome, "standings"> {
  const out: Match[] = [];
  const at = (pos: number) => standings[pos - 1].name;
  const posOf = new Map(standings.map((s, i) => [s.name, i + 1]));
  const tie = (a: string, b: string, phase: Phase, roundKey: string) => {
    const aFirst = (posOf.get(a) ?? 99) <= (posOf.get(b) ?? 99);
    return playTie(
      aFirst ? a : b,
      aFirst ? b : a,
      phase,
      roundKey,
      eff,
      rng,
      legsByPair,
      out
    );
  };

  const r16Teams: string[] = [];
  const r16Winners: string[] = new Array(8);

  for (const section of PLAYOFF_SECTIONS) {
    const seeded = section.seeded.map(at);
    const unseeded = section.unseeded.map(at);
    const crossed = rng() < 0.5;
    const qualified = seeded.map((s, i) =>
      tie(s, unseeded[crossed ? 1 - i : i], "playoff", "PLAYOFF")
    );

    const heads = section.r16Seeds.map(at);
    r16Teams.push(...heads, ...qualified);
    const crossedR16 = rng() < 0.5;
    heads.forEach((head, i) => {
      const slot = section.r16Seeds[i] - 1;
      r16Winners[slot] = tie(head, qualified[crossedR16 ? 1 - i : i], "knockout", "R16");
    });
  }

  const qf = QF_PAIRS.map(([x, y]) => tie(r16Winners[x], r16Winners[y], "knockout", "QF"));
  const sf = SF_PAIRS.map(([x, y]) => tie(qf[x], qf[y], "knockout", "SF"));

  // La final es a partido único en campo neutral: sin ventaja de campo.
  const [a, b] = sf;
  const s = simulateScore(eff[a], eff[b], rng);
  let champion: string;
  if (s.h !== s.a) {
    champion = s.h > s.a ? a : b;
    out.push(toMatch("FINAL", a, b, s.h, s.a, "knockout", "FINAL"));
  } else {
    champion = shootoutWinner(eff[a], eff[b], rng) === "home" ? a : b;
    out.push(toMatch("FINAL", a, b, s.h, s.a, "knockout", "FINAL", true));
  }

  return { matches: out, champion, finalists: sf, r16Teams };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

export function computeWinProbabilities({
  matches,
  bets,
  sims,
}: ProbInput): ProbabilityResult {
  const n = bets.length;
  const played = matches.filter((m) => m.played);
  const realScored: Match[] = played.map((m) => ({
    id: m.id,
    home: m.home,
    away: m.away,
    homeGoals: m.homeGoals ?? 0,
    awayGoals: m.awayGoals ?? 0,
    phase: m.phase,
    penalties: m.penalties,
    played: true,
  }));
  const realTotals = buildTeamTotals(realScored);
  const playedLeague = realScored.filter((m) => m.phase === "league");
  const eff = effectiveRatings(playedLeague);

  const remainingLeague = matches.filter((m) => m.phase === "league" && !m.played);
  const legsByPair = new Map<string, SimMatch[]>();
  for (const m of matches) {
    if (m.phase === "league") continue;
    const key = pairKey(m.home, m.away);
    const list = legsByPair.get(key);
    if (list) list.push(m);
    else legsByPair.set(key, [m]);
  }

  // Los partidos que el usuario puede manipular en el explorador: la siguiente
  // tanda con los dos equipos ya conocidos.
  const nextPending = [...matches]
    .filter((m) => !m.played)
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  const firstMatchday = nextPending[0]?.matchday ?? null;
  const pendingList = nextPending
    .filter((m) => m.matchday === firstMatchday)
    .slice(0, 18);
  const pending: PendingMatch[] = pendingList.map((m) => ({
    id: m.id,
    home: m.home,
    away: m.away,
    utcDate: m.utcDate,
  }));
  const pendingIndex = new Map(pending.map((m, i) => [m.id, i]));
  const P = pending.length;

  const teamIndex = new Map<string, number>();
  for (const s of buildLeagueStandings([])) teamIndex.set(s.name, teamIndex.size);
  const teamNamesOrdered = [...teamIndex.keys()];
  const T = teamNamesOrdered.length;

  const winCount = new Float64Array(n);
  const podiumCount = new Float64Array(n);
  const lastCount = new Float64Array(n);
  const scoreSum = new Float64Array(n);
  const posCount = Array.from({ length: n }, () => new Float64Array(n));
  const beatCount = Array.from({ length: n }, () => new Float64Array(n));
  const allScores = Array.from({ length: n }, () => [] as number[]);
  const champCount = new Float64Array(T);
  const finalCount = new Float64Array(T);
  const r16Count = new Float64Array(T);
  const teamPtsSum = new Float64Array(T);
  const outcomes = new Int8Array(sims * P);
  const winners = new Int8Array(sims);

  const seed =
    playedLeague.length * 131 +
    playedLeague.reduce((s, m) => s + m.homeGoals * 7 + m.awayGoals * 3, 0) * 13 +
    1;
  const rng = mulberry32(seed);

  const scores = new Float64Array(n);
  const avgFav = new Float64Array(n);
  const superPts = new Float64Array(n);
  const order = new Array<number>(n);

  for (let s = 0; s < sims; s++) {
    const simLeague: Match[] = remainingLeague.map((m) => {
      const g = simulateScore(eff[m.home] + HOME_ADV, eff[m.away], rng);
      return toMatch(m.id, m.home, m.away, g.h, g.a, "league", "LEAGUE");
    });

    const standings = buildLeagueStandings([...playedLeague, ...simLeague]);
    const season = resolveSeason(standings, eff, rng, legsByPair);

    const totals: Record<string, number> = { ...realTotals };
    for (const [team, pts] of Object.entries(
      buildTeamTotals([...simLeague, ...season.matches])
    )) {
      totals[team] = (totals[team] ?? 0) + pts;
    }

    const position = new Map(standings.map((row, i) => [row.name, i + 1]));
    for (let i = 0; i < n; i++) {
      const bet = bets[i];
      scores[i] = calcUserScore(bet.favorites, bet.antiFavorites, totals);
      avgFav[i] =
        bet.favorites.reduce((acc, t) => acc + (position.get(t) ?? 36), 0) /
        Math.max(1, bet.favorites.length);
      superPts[i] = bet.superFavorite ? totals[bet.superFavorite] ?? 0 : 0;
      order[i] = i;
    }
    order.sort(
      (i, j) =>
        scores[j] - scores[i] ||
        avgFav[i] - avgFav[j] ||
        superPts[j] - superPts[i] ||
        i - j
    );

    for (let rank = 0; rank < n; rank++) {
      const i = order[rank];
      posCount[i][rank]++;
      scoreSum[i] += scores[i];
      allScores[i].push(scores[i]);
      if (rank === 0) winCount[i]++;
      if (rank < 3) podiumCount[i]++;
      if (rank === n - 1) lastCount[i]++;
    }
    winners[s] = order[0];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j && scores[i] > scores[j]) beatCount[i][j]++;
      }
    }

    for (const t of season.r16Teams) r16Count[teamIndex.get(t) ?? 0]++;
    for (const t of season.finalists) finalCount[teamIndex.get(t) ?? 0]++;
    champCount[teamIndex.get(season.champion) ?? 0]++;
    for (let t = 0; t < T; t++) teamPtsSum[t] += totals[teamNamesOrdered[t]] ?? 0;

    if (P > 0) {
      for (const m of simLeague) {
        const idx = pendingIndex.get(m.id);
        if (idx === undefined) continue;
        outcomes[s * P + idx] =
          m.homeGoals > m.awayGoals ? 0 : m.homeGoals === m.awayGoals ? 1 : 2;
      }
      for (const m of season.matches) {
        const idx = pendingIndex.get(m.id);
        if (idx === undefined) continue;
        outcomes[s * P + idx] =
          m.homeGoals > m.awayGoals ? 0 : m.homeGoals === m.awayGoals ? 1 : 2;
      }
    }
  }

  const meanPts = (team: string) => teamPtsSum[teamIndex.get(team) ?? 0] / sims;

  // Exposición media de cada equipo: lo que todos comparten no mueve el ranking.
  const exposure = (i: number, team: string) =>
    bets[i].favorites.includes(team) ? 1 : bets[i].antiFavorites.includes(team) ? -1 : 0;
  const meanExposure = new Map(
    teamNamesOrdered.map((team) => [
      team,
      bets.reduce((acc, _, i) => acc + exposure(i, team), 0) / Math.max(1, n),
    ])
  );
  const sharedFavorites = teamNamesOrdered.filter(
    (team) => n > 1 && bets.every((b) => b.favorites.includes(team))
  );

  const users: UserProbability[] = bets.map((bet, i) => {
    const sorted = [...allScores[i]].sort((a, b) => a - b);
    const dist = Array.from(posCount[i], (c) => (c / sims) * 100);
    const edge: EdgeTeam[] = [...bet.favorites, ...bet.antiFavorites]
      .map((team) => {
        const kind: "fav" | "anti" = bet.favorites.includes(team) ? "fav" : "anti";
        const diff = exposure(i, team) - (meanExposure.get(team) ?? 0);
        const exclusive = bets.every(
          (other, j) => j === i || exposure(j, team) !== exposure(i, team)
        );
        return { team, kind, meanPts: meanPts(team), impact: diff * meanPts(team), exclusive };
      })
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

    return {
      user: bet.user,
      winPct: (winCount[i] / sims) * 100,
      podiumPct: (podiumCount[i] / sims) * 100,
      lastPct: (lastCount[i] / sims) * 100,
      meanScore: scoreSum[i] / sims,
      p10: percentile(sorted, 10),
      p90: percentile(sorted, 90),
      posDist: dist,
      bestPos: dist.indexOf(Math.max(...dist)) + 1,
      beats: Array.from(beatCount[i], (c) => (c / sims) * 100),
      edge,
    };
  });

  const teams: TeamProbability[] = teamNamesOrdered
    .map((name, t) => ({
      name,
      championPct: (champCount[t] / sims) * 100,
      finalPct: (finalCount[t] / sims) * 100,
      r16Pct: (r16Count[t] / sims) * 100,
      meanPts: teamPtsSum[t] / sims,
    }))
    .sort((a, b) => b.championPct - a.championPct);

  const scenarios: MatchScenario[] = pending.map((m, c) => {
    const cnt = [0, 0, 0];
    const wins = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    for (let s = 0; s < sims; s++) {
      const o = outcomes[s * P + c];
      cnt[o]++;
      wins[o][winners[s]]++;
    }
    const winPct = wins.map((w, o) =>
      Array.from(w, (v) => (cnt[o] > 0 ? (v / cnt[o]) * 100 : 0))
    );
    let swing = 0;
    for (let i = 0; i < n; i++) {
      const vals = [0, 1, 2].filter((o) => cnt[o] > 0).map((o) => winPct[o][i]);
      if (vals.length > 1) swing = Math.max(swing, Math.max(...vals) - Math.min(...vals));
    }
    return {
      id: m.id,
      outcomeProb: cnt.map((c2) => (c2 / sims) * 100),
      winPct,
      swing,
    };
  });
  scenarios.sort((a, b) => b.swing - a.swing);

  return {
    users,
    teams,
    sims,
    pending,
    scenarios,
    scenarioSims: { sims, pendingIds: pending.map((m) => m.id), outcomes, winners },
    sharedFavorites,
    matchesLeft: matches.filter((m) => !m.played).length,
  };
}

/** Probabilidad de ganar condicionada a unos desenlaces concretos. */
export function conditionalWinPct(
  sims: ScenarioSims,
  userCount: number,
  selection: Record<string, number>
): { pct: number[]; sample: number } {
  const picks = Object.entries(selection)
    .map(([id, outcome]) => [sims.pendingIds.indexOf(id), outcome] as const)
    .filter(([idx]) => idx >= 0);
  const P = sims.pendingIds.length;
  const counts = new Float64Array(userCount);
  let sample = 0;

  for (let s = 0; s < sims.sims; s++) {
    let ok = true;
    for (const [idx, outcome] of picks) {
      if (sims.outcomes[s * P + idx] !== outcome) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    sample++;
    counts[sims.winners[s]]++;
  }

  return {
    pct: Array.from(counts, (c) => (sample > 0 ? (c / sample) * 100 : 0)),
    sample,
  };
}
