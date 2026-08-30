import type { Match } from "./scoring";
import { TEAMS, UEFA_SEED } from "./teams";

export type TeamStanding = {
  name: string;
  pot: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number; // 3 victoria, 1 empate
  seed: number; // ranking bombo + coeficiente UEFA (0 = mejor)
};

/** Tramo de la tabla: 1-8 octavos directos, 9-24 playoff, 25-36 eliminados. */
export type Zone = "r16" | "playoff" | "out";

export function zoneForPosition(position: number): Zone {
  if (position <= 8) return "r16";
  if (position <= 24) return "playoff";
  return "out";
}

/**
 * Construye la tabla única de la fase liga (36 equipos).
 * Desempates: Pts → DG → GF → coeficiente UEFA → alfabético.
 */
export function buildLeagueStandings(matches: Match[]): TeamStanding[] {
  const table: Record<string, TeamStanding> = {};

  for (const team of TEAMS) {
    table[team.name] = {
      name: team.name,
      pot: team.pot,
      played: 0, won: 0, drawn: 0, lost: 0,
      gf: 0, ga: 0, gd: 0, pts: 0,
      seed: UEFA_SEED[team.name] ?? 99,
    };
  }

  for (const match of matches) {
    if (match.phase !== "league" || !match.played) continue;

    const home = table[match.home];
    const away = table[match.away];
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.gf += match.homeGoals;
    home.ga += match.awayGoals;
    away.gf += match.awayGoals;
    away.ga += match.homeGoals;

    if (match.homeGoals > match.awayGoals) { home.won++; home.pts += 3; away.lost++; }
    else if (match.awayGoals > match.homeGoals) { away.won++; away.pts += 3; home.lost++; }
    else { home.drawn++; away.drawn++; home.pts++; away.pts++; }
  }

  for (const s of Object.values(table)) s.gd = s.gf - s.ga;

  return Object.values(table).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    if (a.seed !== b.seed) return a.seed - b.seed;
    return a.name.localeCompare(b.name, "es");
  });
}
