import type { Match } from "./scoring";
import { buildLeagueStandings } from "./standings";
import { TEAMS } from "./teams";

/** Ventaja de jugar en casa, en puntos Elo. */
export const HOME_ADV = 65;

const TOP_ELO = 2060;
const BOTTOM_ELO = 1400;

/**
 * Elo de partida interpolado sobre el coeficiente UEFA (rank 1-36). Es una
 * aproximación: el coeficiente mide los últimos cinco años, no la plantilla
 * de hoy.
 */
export const BASE_ELO: Record<string, number> = Object.fromEntries(
  TEAMS.map((t) => [
    t.name,
    Math.round(TOP_ELO - ((t.rank - 1) / 35) * (TOP_ELO - BOTTOM_ELO)),
  ])
);

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Corrige el Elo base con lo que cada equipo lleva hecho en la fase liga.
 * Se calcula una sola vez con resultados reales, no dentro de cada simulación.
 */
export function effectiveRatings(playedLeague: Match[]): Record<string, number> {
  const eff: Record<string, number> = { ...BASE_ELO };
  for (const s of buildLeagueStandings(playedLeague)) {
    if (s.played === 0) continue;
    const bonus = clamp(s.gd * 18 + (s.pts - s.played * 1.4) * 16, -150, 150);
    eff[s.name] = (BASE_ELO[s.name] ?? 1600) + bonus;
  }
  return eff;
}

/** Media de goles por equipo y partido; calibrada sobre la Champions reciente. */
const MU = 1.55;
const THETA = 0.55;

function poisson(lambda: number, rng: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return Math.min(k - 1, 8);
}

export function simulateScore(
  ratingHome: number,
  ratingAway: number,
  rng: () => number
): { h: number; a: number } {
  const d = (ratingHome - ratingAway) / 400;
  return {
    h: poisson(MU * Math.exp(THETA * d), rng),
    a: poisson(MU * Math.exp(-THETA * d), rng),
  };
}

export function shootoutWinner(
  ratingHome: number,
  ratingAway: number,
  rng: () => number
): "home" | "away" {
  const pHome = 1 / (1 + Math.pow(10, -(ratingHome - ratingAway) / 800));
  return rng() < pHome ? "home" : "away";
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
