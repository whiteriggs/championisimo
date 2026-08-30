export type Team = {
  id: string;
  name: string;
  /** Bombo del sorteo (1-4). Determina el precio en la porra. */
  pot: number;
  price: number;
  /** id en football-data.org, usado para el escudo. */
  apiId: number;
  country: string;
};

/**
 * Bombos del sorteo de la fase liga 2026/27 (Mónaco, 27-ago-2026).
 * El orden dentro de cada bombo es el del coeficiente UEFA y se usa como
 * penúltimo criterio de desempate en la clasificación.
 */
export const POTS: Record<number, string[]> = {
  1: ["PSG", "Bayern", "Real Madrid", "Liverpool", "Inter", "Man City", "Arsenal", "Barça", "Atlético"],
  2: ["Dortmund", "Roma", "Sporting CP", "Aston Villa", "Porto", "Man United", "Brujas", "Betis", "PSV"],
  3: ["Feyenoord", "Lille", "Bodø/Glimt", "Nápoles", "RB Leipzig", "Villarreal", "Fenerbahçe", "Shakhtar", "Galatasaray"],
  4: ["Slavia Praga", "Slovan", "Stuttgart", "AEK Atenas", "LASK", "Como", "Lens", "Viking", "Sabah"],
};

const META: Record<string, { apiId: number; country: string }> = {
  "PSG": { apiId: 524, country: "Francia" },
  "Bayern": { apiId: 5, country: "Alemania" },
  "Real Madrid": { apiId: 86, country: "España" },
  "Liverpool": { apiId: 64, country: "Inglaterra" },
  "Inter": { apiId: 108, country: "Italia" },
  "Man City": { apiId: 65, country: "Inglaterra" },
  "Arsenal": { apiId: 57, country: "Inglaterra" },
  "Barça": { apiId: 81, country: "España" },
  "Atlético": { apiId: 78, country: "España" },
  "Dortmund": { apiId: 4, country: "Alemania" },
  "Roma": { apiId: 100, country: "Italia" },
  "Sporting CP": { apiId: 498, country: "Portugal" },
  "Aston Villa": { apiId: 58, country: "Inglaterra" },
  "Porto": { apiId: 503, country: "Portugal" },
  "Man United": { apiId: 66, country: "Inglaterra" },
  "Brujas": { apiId: 851, country: "Bélgica" },
  "Betis": { apiId: 90, country: "España" },
  "PSV": { apiId: 674, country: "Países Bajos" },
  "Feyenoord": { apiId: 675, country: "Países Bajos" },
  "Lille": { apiId: 521, country: "Francia" },
  "Bodø/Glimt": { apiId: 5721, country: "Noruega" },
  "Nápoles": { apiId: 113, country: "Italia" },
  "RB Leipzig": { apiId: 721, country: "Alemania" },
  "Villarreal": { apiId: 94, country: "España" },
  "Fenerbahçe": { apiId: 613, country: "Turquía" },
  "Shakhtar": { apiId: 1887, country: "Ucrania" },
  "Galatasaray": { apiId: 610, country: "Turquía" },
  "Slavia Praga": { apiId: 930, country: "Chequia" },
  "Slovan": { apiId: 7509, country: "Eslovaquia" },
  "Stuttgart": { apiId: 10, country: "Alemania" },
  "AEK Atenas": { apiId: 1899, country: "Grecia" },
  "LASK": { apiId: 2016, country: "Austria" },
  "Como": { apiId: 7397, country: "Italia" },
  "Lens": { apiId: 546, country: "Francia" },
  "Viking": { apiId: 5720, country: "Noruega" },
  "Sabah": { apiId: 10233, country: "Azerbaiyán" },
};

export const TEAMS: Team[] = Object.entries(POTS).flatMap(([pot, names]) =>
  names.map((name) => ({
    id: name,
    name,
    pot: Number(pot),
    price: 5 - Number(pot),
    apiId: META[name].apiId,
    country: META[name].country,
  }))
);

export const TEAM_NAMES: string[] = [...TEAMS.map((t) => t.name)].sort((a, b) =>
  a.localeCompare(b, "es")
);

/** Ranking global por bombo y coeficiente UEFA (0 = mejor). Desempate final. */
export const UEFA_SEED: Record<string, number> = Object.fromEntries(
  TEAMS.map((t) => [t.name, (t.pot - 1) * 9 + POTS[t.pot].indexOf(t.name)])
);

export function teamById(id: string): Team | undefined {
  return TEAMS.find((t) => t.id === id);
}

export function teamName(id: string): string {
  return teamById(id)?.name ?? id;
}

export function crestUrl(name: string): string | null {
  const team = teamById(name);
  return team ? `https://crests.football-data.org/${team.apiId}.png` : null;
}

// Códigos cortos (3 letras) para encabezados compactos, p. ej. "RMA-INT".
export const TEAM_CODES: Record<string, string> = {
  "PSG": "PSG", "Bayern": "BAY", "Real Madrid": "RMA", "Liverpool": "LIV",
  "Inter": "INT", "Man City": "MCI", "Arsenal": "ARS", "Barça": "BAR",
  "Atlético": "ATM", "Dortmund": "DOR", "Roma": "ROM", "Sporting CP": "SPO",
  "Aston Villa": "AVL", "Porto": "POR", "Man United": "MUN", "Brujas": "BRU",
  "Betis": "BET", "PSV": "PSV", "Feyenoord": "FEY", "Lille": "LIL",
  "Bodø/Glimt": "BOD", "Nápoles": "NAP", "RB Leipzig": "RBL", "Villarreal": "VIL",
  "Fenerbahçe": "FEN", "Shakhtar": "SHK", "Galatasaray": "GAL",
  "Slavia Praga": "SLA", "Slovan": "SLO", "Stuttgart": "STU", "AEK Atenas": "AEK",
  "LASK": "LSK", "Como": "COM", "Lens": "LEN", "Viking": "VIK", "Sabah": "SAB",
};

export function teamCode(name: string): string {
  return TEAM_CODES[name] ?? name.slice(0, 3).toUpperCase();
}
