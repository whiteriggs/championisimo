import { Phase } from "./scoring";

const API_KEY = process.env.NEXT_PUBLIC_FOOTBALL_DATA_KEY ?? "";
const BASE = "https://api.football-data.org/v4";
const COMPETITION = "CL";

// Worker de Cloudflare que sirve los partidos en vivo (proxy con CORS + caché).
// Si está configurado, es la fuente preferente; si no, se usa el JSON estático.
const LIVE_MATCHES_URL = process.env.NEXT_PUBLIC_LIVE_MATCHES_URL ?? "";

// Estados de football-data.org que representan un partido en juego.
const LIVE_STATUSES = new Set(["IN_PLAY", "PAUSED", "LIVE"]);
export function isLiveStatus(status: string | null | undefined): boolean {
  return status != null && LIVE_STATUSES.has(status);
}

// Duración máxima estimada de un partido (90' + descanso + añadidos + posible
// prórroga holgada). Se usa para considerar "en directo" un partido que ya ha
// empezado por horario aunque la API tarde en cambiar su estado a IN_PLAY.
export const MATCH_LIVE_WINDOW_MS = 2.5 * 60 * 60 * 1000;

// ¿El partido ya ha arrancado (por reloj) y sigue dentro de la ventana en la
// que podría estar jugándose? No mira el estado de la API, solo la hora.
export function isWithinLiveWindow(utcDate: string): boolean {
  const start = new Date(utcDate).getTime();
  const now = Date.now();
  return start <= now && start + MATCH_LIVE_WINDOW_MS > now;
}

// Añade un parámetro anticaché para que el polling en vivo no reciba la copia
// que el CDN de GitHub Pages tenga guardada del JSON estático.
function bust(url: string): string {
  return `${url}?t=${Date.now()}`;
}

// ── Name mapping: football-data.org names → our short Spanish names ───────
// Se incluyen tanto el `name` completo como el `shortName` que devuelve la API.
export const API_NAME_MAP: Record<string, string> = {
  "Paris Saint-Germain FC": "PSG",
  "FC Bayern München": "Bayern",
  Bayern: "Bayern",
  "Real Madrid CF": "Real Madrid",
  "Liverpool FC": "Liverpool",
  "FC Internazionale Milano": "Inter",
  "Manchester City FC": "Man City",
  "Arsenal FC": "Arsenal",
  "FC Barcelona": "Barça",
  "Club Atlético de Madrid": "Atlético",
  Atleti: "Atlético",
  "Borussia Dortmund": "Dortmund",
  "AS Roma": "Roma",
  "Sporting Clube de Portugal": "Sporting CP",
  "Aston Villa FC": "Aston Villa",
  "FC Porto": "Porto",
  "Manchester United FC": "Man United",
  "Club Brugge KV": "Brujas",
  "Club Brugge": "Brujas",
  "Real Betis Balompié": "Betis",
  "Real Betis": "Betis",
  "Feyenoord Rotterdam": "Feyenoord",
  "Lille OSC": "Lille",
  "FK Bodø/Glimt": "Bodø/Glimt",
  "SSC Napoli": "Nápoles",
  Napoli: "Nápoles",
  "Villarreal CF": "Villarreal",
  "Fenerbahçe SK": "Fenerbahçe",
  "FK Shakhtar Donetsk": "Shakhtar",
  Shaktar: "Shakhtar",
  "Galatasaray SK": "Galatasaray",
  "SK Slavia Praha": "Slavia Praga",
  "Slavia Praha": "Slavia Praga",
  "ŠK Slovan Bratislava": "Slovan",
  "Sl. Bratislava": "Slovan",
  "VfB Stuttgart": "Stuttgart",
  "PAE AEK": "AEK Atenas",
  "LASK Linz": "LASK",
  "Como 1907": "Como",
  "Racing Club de Lens": "Lens",
  "RC Lens": "Lens",
  "Viking FK": "Viking",
  "Sabah FK": "Sabah",
};

export function toInternalName(apiName: string): string {
  return API_NAME_MAP[apiName] ?? apiName;
}

// ── Standings ──────────────────────────────────────────────────────────────
export type ApiTableRow = {
  position: number;
  team: { name: string };
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export type ApiStandingGroup = {
  stage: string; // "LEAGUE_STAGE"
  table: ApiTableRow[];
};

export async function fetchLeagueStandings(): Promise<ApiTableRow[]> {
  // 1. Intentar el JSON bakeado (sin CORS)
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  try {
    const staticRes = await fetch(bust(`${basePath}/standings.json`), { cache: "no-store" });
    if (staticRes.ok) {
      const data = await staticRes.json();
      if (Array.isArray(data) && data.length > 0) return data as ApiTableRow[];
    }
  } catch { /* ignorar */ }

  // 2. Fallback: llamada directa (funciona en local)
  const res = await fetch(`${BASE}/competitions/${COMPETITION}/standings`, {
    headers: { "X-Auth-Token": API_KEY },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`football-data.org ${res.status}: ${text}`);
  }
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const league = (data.standings as any[]).find(
    (s) => s.stage === "LEAGUE_STAGE" && s.type === "TOTAL"
  );
  return (league?.table ?? []) as ApiTableRow[];
}

// ── Matches ────────────────────────────────────────────────────────────────
function stageToPhase(stage: string): Phase {
  return stage === "LEAGUE_STAGE" ? "league" : "knockout";
}

// Goles de la tanda de penaltis = fullTime − (regularTime + extraTime).
// football-data mete la tanda en `fullTime`; el resto (juego + prórroga) está en
// regularTime + extraTime. Devuelve null si no es una tanda o faltan datos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function penTally(score: any): { home: number; away: number } | null {
  if (score?.duration !== "PENALTY_SHOOTOUT" || !score?.fullTime || !score?.regularTime) return null;
  const et = score.extraTime ?? { home: 0, away: 0 };
  const home = (score.fullTime.home ?? 0) - (score.regularTime.home ?? 0) - (et.home ?? 0);
  const away = (score.fullTime.away ?? 0) - (score.regularTime.away ?? 0) - (et.away ?? 0);
  if (home < 0 || away < 0) return null;
  return { home, away };
}

// ── Knockout bracket ───────────────────────────────────────────────────────
// football-data.org usa "PLAYOFFS" para la ronda previa (9º-24º) y "LAST_16"
// para los octavos. Los normalizamos a los nombres que usa el resto de la app.
const STAGE_CANON: Record<string, string> = {
  LAST_16: "ROUND_OF_16",
};
const KNOCKOUT_STAGES = new Set([
  "PLAYOFFS", "ROUND_OF_16", "LAST_16",
  "QUARTER_FINALS", "SEMI_FINALS", "FINAL",
]);

export type ApiKnockoutMatch = {
  id: string;
  stage: string;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
  finished: boolean;
  live: boolean;
  penalties: boolean;
  penHome: number | null;
  penAway: number | null;
  date: string;
  winner: "home" | "away" | null;
};

export async function fetchKnockoutMatches(): Promise<ApiKnockoutMatch[]> {
  // Deriva del mismo origen que el resto (Worker en vivo → JSON estático → API),
  // así el cuadro de eliminatorias también se actualiza en directo.
  const all = await fetchAllMatches();
  return all
    .filter((m) => KNOCKOUT_STAGES.has(m.stage))
    .map((m): ApiKnockoutMatch => ({
      id: m.id,
      stage: STAGE_CANON[m.stage] ?? m.stage,
      home: m.home,
      away: m.away,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
      finished: m.played,
      live: isLiveStatus(m.status),
      penalties: m.penalties,
      penHome: m.penHome ?? null,
      penAway: m.penAway ?? null,
      date: new Date(m.utcDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
      winner:
        m.homeGoals !== null && m.awayGoals !== null && m.homeGoals !== m.awayGoals
          ? m.homeGoals > m.awayGoals
            ? "home"
            : "away"
          : // Empate (o sin goles): si se decidió por penaltis, manda el ganador oficial.
          m.winner === "HOME_TEAM"
          ? "home"
          : m.winner === "AWAY_TEAM"
          ? "away"
          : null,
    }));
}

// ── All matches (schedule + results) ──────────────────────────────────────
export type ApiAllMatch = {
  id: string;
  utcDate: string;
  status: string;
  stage: string;
  matchday: number | null | undefined;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
  phase: Phase;
  penalties: boolean;
  played: boolean;  // Ganador oficial ("HOME_TEAM"/"AWAY_TEAM"/"DRAW"/null). Necesario para saber
  // quién pasa cuando una eliminatoria se decide en los penaltis.
  winner?: string | null;
  // Goles de la tanda de penaltis (fullTime − (regularTime+extraTime)). Solo en
  // eliminatorias decididas en la tanda; null en el resto.
  penHome?: number | null;
  penAway?: number | null;};

export async function fetchAllMatches(): Promise<ApiAllMatch[]> {
  // 0. Fuente en vivo: Worker de Cloudflare (datos frescos, con CORS).
  if (LIVE_MATCHES_URL) {
    try {
      const liveRes = await fetch(LIVE_MATCHES_URL, { cache: "no-store" });
      if (liveRes.ok) {
        const data = await liveRes.json();
        if (Array.isArray(data) && data.length > 0) return data as ApiAllMatch[];
      }
    } catch {
      // ignorar — caer al JSON estático
    }
  }

  // 1. Intentar el JSON pre-generado en build time (sin restricciones CORS)
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  try {
    const staticRes = await fetch(bust(`${basePath}/matches.json`), { cache: "no-store" });
    if (staticRes.ok) {
      const data = await staticRes.json();
      if (Array.isArray(data) && data.length > 0) return data as ApiAllMatch[];
    }
  } catch {
    // ignorar — intentar API directa
  }

  // 2. Fallback: llamada directa a la API (funciona en local, falla en producción por CORS)
  const res = await fetch(
    `${BASE}/competitions/${COMPETITION}/matches`,
    { headers: { "X-Auth-Token": API_KEY } }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`football-data.org ${res.status}: ${text}`);
  }
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.matches as any[])
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())
    .map((m): ApiAllMatch => ({
      id: String(m.id),
      utcDate: m.utcDate,
      status: m.status,
      stage: m.stage,
      home: m.homeTeam?.name ? toInternalName(m.homeTeam.name) : "Por determinar",
      away: m.awayTeam?.name ? toInternalName(m.awayTeam.name) : "Por determinar",
      // Penaltis: el resultado que cuenta es el del juego (prórroga incl.), sin la
      // tanda (football-data la mete en fullTime). Usamos regularTime + extraTime.
      homeGoals:
        m.score?.duration === "PENALTY_SHOOTOUT" && m.score?.regularTime
          ? (m.score.regularTime.home ?? 0) + (m.score.extraTime?.home ?? 0)
          : m.score?.fullTime?.home ?? null,
      awayGoals:
        m.score?.duration === "PENALTY_SHOOTOUT" && m.score?.regularTime
          ? (m.score.regularTime.away ?? 0) + (m.score.extraTime?.away ?? 0)
          : m.score?.fullTime?.away ?? null,
      phase: stageToPhase(m.stage),
      penalties: m.score?.duration === "PENALTY_SHOOTOUT",
      played: m.status === "FINISHED",
      // Goles de la tanda = fullTime − (regularTime + extraTime).
      penHome: penTally(m.score)?.home ?? null,
      penAway: penTally(m.score)?.away ?? null,
      // En penaltis sin ganador HOME/AWAY claro (null o "DRAW"), se deduce del
      // fullTime (que incluye la tanda): el lado con más goles totales pasó.
      winner:
        m.score?.duration === "PENALTY_SHOOTOUT" &&
        m.score?.winner !== "HOME_TEAM" &&
        m.score?.winner !== "AWAY_TEAM" &&
        m.score?.fullTime &&
        m.score.fullTime.home !== m.score.fullTime.away
          ? m.score.fullTime.home > m.score.fullTime.away
            ? "HOME_TEAM"
            : "AWAY_TEAM"
          : m.score?.winner ?? null,
      matchday: m.matchday ?? null,
    }));
}
