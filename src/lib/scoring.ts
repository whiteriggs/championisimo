import { buildLeagueStandings, zoneForPosition } from "./standings";

export type Phase = "league" | "knockout";

/** Partidos que juega cada equipo en la fase liga. */
const LEAGUE_MATCHDAYS = 8;

/**
 * Bonus para los 8 primeros de la fase liga. Se saltan el playoff, así que
 * juegan dos partidos menos que los clasificados del 9 al 24; sin esto, acabar
 * noveno y ganar el playoff rentaría más que acabar primero.
 * El valor equivale a lo que saca de esa eliminatoria un equipo medio:
 * dos partidos × (+5 por jugar, +5 de media por resultado, ~1,3 goles).
 */
export const DIRECT_R16_BONUS = 20;

export type Match = {
  id: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  phase: Phase;
  penalties: boolean;
  played: boolean;
  matchday?: number | null;
  roundKey?: string;
  /** En un cruce decidido en penaltis, quién ganó la tanda. */
  penWinner?: "home" | "away";
  /** Goles de la tanda de penaltis (solo partidos reales con tanda oficial). */
  penHome?: number;
  penAway?: number;
};

/**
 * Opciones de puntuación para escenarios "qué pasaría si". Por defecto (ambas
 * false) se aplican las reglas oficiales de la porra.
 */
export interface ScoringOptions {
  /** Si true, un cruce decidido en penaltis cuenta como victoria del ganador (no empate). */
  penaltyWin?: boolean;
  /** Si true (requiere penaltyWin), suma los goles de la tanda de penaltis (solo con penHome/penAway). */
  penaltyGoals?: boolean;
}

/**
 * Returns points earned by each team in a single match.
 * Rules:
 *   Fase liga:   +1/goal, +5/draw, +10/win
 *   Eliminatorias: +1/goal, +5/playing, +5/draw, +10/win
 *   Los cruces son a doble partido, así que cada uno puntúa por separado.
 *   Penalties → counts as draw (+5 each). Goals in shootout don't count.
 * Con `opts.penaltyWin` el ganador de la tanda cobra la victoria (+10) en vez del
 * empate; con `opts.penaltyGoals` se suman además los goles de la tanda.
 */
export function matchPoints(match: Match, opts: ScoringOptions = {}): Record<string, number> {
  if (!match.played) return {};

  const pts: Record<string, number> = {
    [match.home]: match.homeGoals,
    [match.away]: match.awayGoals,
  };

  if (match.phase === "knockout") {
    pts[match.home] += 5;
    pts[match.away] += 5;
  }

  if (match.penalties) {
    // Goles de la tanda (solo si hay marcador real y el toggle está activo).
    if (opts.penaltyGoals && match.penHome != null && match.penAway != null) {
      pts[match.home] += match.penHome;
      pts[match.away] += match.penAway;
    }
    if (opts.penaltyWin && match.penWinner) {
      // Cuenta como victoria del que ganó la tanda; el perdedor no cobra bonus.
      const winner = match.penWinner === "home" ? match.home : match.away;
      pts[winner] += 10;
    } else {
      // Por defecto: se considera empate → ambos cobran el bonus de empate.
      pts[match.home] += 5;
      pts[match.away] += 5;
    }
  } else if (match.homeGoals > match.awayGoals) {
    pts[match.home] += 10;
  } else if (match.awayGoals > match.homeGoals) {
    pts[match.away] += 10;
  } else {
    pts[match.home] += 5;
    pts[match.away] += 5;
  }

  return pts;
}

/**
 * Los 8 primeros, pero solo con la fase liga ya terminada: mientras se juega,
 * el bonus bailaría de jornada en jornada.
 */
function directR16Teams(matches: Match[]): string[] {
  const table = buildLeagueStandings(matches);
  if (!table.every((row) => row.played === LEAGUE_MATCHDAYS)) return [];
  return table
    .filter((_, index) => zoneForPosition(index + 1) === "r16")
    .map((row) => row.name);
}

/** Accumulates all played matches into { teamName → totalPoints }. */
export function buildTeamTotals(matches: Match[], opts: ScoringOptions = {}): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const match of matches) {
    for (const [team, pts] of Object.entries(matchPoints(match, opts))) {
      totals[team] = (totals[team] ?? 0) + pts;
    }
  }
  for (const team of directR16Teams(matches)) {
    totals[team] = (totals[team] ?? 0) + DIRECT_R16_BONUS;
  }
  return totals;
}

/**
 * Calculates a user's total score from their bet.
 * score = sum(favorite team points) − sum(antifavorite team points)
 */
export function calcUserScore(
  favorites: string[],
  antiFavorites: string[],
  teamTotals: Record<string, number>
): number {
  const sum = (ids: string[]) =>
    ids.reduce((acc, id) => acc + (teamTotals[id] ?? 0), 0);
  return sum(favorites) - sum(antiFavorites);
}
