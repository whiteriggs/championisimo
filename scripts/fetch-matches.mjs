// scripts/fetch-matches.mjs
// Llamado en prebuild — guarda public/matches.json con todos los partidos de la
// Champions. Se ejecuta en Node.js (sin CORS), así que la API responde bien.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "public/matches.json");
const OUT_STANDINGS = join(ROOT, "public/standings.json");

// Leer .env.local si existe (para desarrollo local)
const envLocal = join(ROOT, ".env.local");
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] ??= match[2].trim();
  }
}

const API_KEY = process.env.NEXT_PUBLIC_FOOTBALL_DATA_KEY ?? "";
const URL = "https://api.football-data.org/v4/competitions/CL/matches";

// Resultados forzados a mano (el plan gratuito de football-data.org a veces da
// el marcador y luego lo borra). Se tratan como si la API hubiera devuelto un
// FINISHED con ese resultado. Clave = id del partido en football-data.org.
const SCORE_OVERRIDES = {};

const NAME_MAP = {
  "Paris Saint-Germain FC": "PSG",
  "FC Bayern München": "Bayern", Bayern: "Bayern",
  "Real Madrid CF": "Real Madrid",
  "Liverpool FC": "Liverpool",
  "FC Internazionale Milano": "Inter",
  "Manchester City FC": "Man City",
  "Arsenal FC": "Arsenal",
  "FC Barcelona": "Barça",
  "Club Atlético de Madrid": "Atlético", Atleti: "Atlético",
  "Borussia Dortmund": "Dortmund",
  "AS Roma": "Roma",
  "Sporting Clube de Portugal": "Sporting CP",
  "Aston Villa FC": "Aston Villa",
  "FC Porto": "Porto",
  "Manchester United FC": "Man United",
  "Club Brugge KV": "Brujas", "Club Brugge": "Brujas",
  "Real Betis Balompié": "Betis", "Real Betis": "Betis",
  "Feyenoord Rotterdam": "Feyenoord",
  "Lille OSC": "Lille",
  "FK Bodø/Glimt": "Bodø/Glimt",
  "SSC Napoli": "Nápoles", Napoli: "Nápoles",
  "Villarreal CF": "Villarreal",
  "Fenerbahçe SK": "Fenerbahçe",
  "FK Shakhtar Donetsk": "Shakhtar", Shaktar: "Shakhtar",
  "Galatasaray SK": "Galatasaray",
  "SK Slavia Praha": "Slavia Praga", "Slavia Praha": "Slavia Praga",
  "ŠK Slovan Bratislava": "Slovan", "Sl. Bratislava": "Slovan",
  "VfB Stuttgart": "Stuttgart",
  "PAE AEK": "AEK Atenas",
  "LASK Linz": "LASK",
  "Como 1907": "Como",
  "Racing Club de Lens": "Lens", "RC Lens": "Lens",
  "Viking FK": "Viking",
  "Sabah FK": "Sabah",
};

function toName(n) { return NAME_MAP[n] ?? n; }

function stageToPhase(stage) {
  return stage === "LEAGUE_STAGE" ? "league" : "knockout";
}

// Goles de la tanda de penaltis = fullTime − (regularTime + extraTime).
function penTally(score) {
  if (score?.duration !== "PENALTY_SHOOTOUT" || !score?.fullTime || !score?.regularTime) return null;
  const et = score.extraTime ?? { home: 0, away: 0 };
  const home = (score.fullTime.home ?? 0) - (score.regularTime.home ?? 0) - (et.home ?? 0);
  const away = (score.fullTime.away ?? 0) - (score.regularTime.away ?? 0) - (et.away ?? 0);
  if (home < 0 || away < 0) return null;
  return { home, away };
}

const LIVE_STATUSES = new Set(["IN_PLAY", "PAUSED"]);

// Carga el matches.json del build anterior para no perder marcadores ya vistos.
// El plan gratuito de football-data.org a veces devuelve `null` en el marcador
// (incluso en partidos IN_PLAY o FINISHED). Si ya conocíamos un resultado, lo
// conservamos hasta que la API confirme uno nuevo.
async function loadPrevious() {
  const map = new Map();
  // 1) Build previo desplegado en GitHub Pages (estado persistente entre runs).
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  const [owner, name] = repo.split("/");
  if (owner && name && !name.endsWith(".github.io")) {
    try {
      const url = `https://${owner}.github.io/${name}/matches.json?t=${Date.now()}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) for (const m of data) map.set(m.id, m);
        console.log(`[fetch-matches] estado previo: ${map.size} partidos desde Pages`);
        return map;
      }
    } catch { /* ignorar */ }
  }
  // 2) Fallback: archivo local de un build anterior (desarrollo).
  try {
    if (existsSync(OUT)) {
      const data = JSON.parse(readFileSync(OUT, "utf8"));
      if (Array.isArray(data)) for (const m of data) map.set(m.id, m);
    }
  } catch { /* ignorar */ }
  return map;
}

async function main() {
  if (!API_KEY) {
    console.warn("[fetch-matches] Sin API key — se omite la generación de matches.json");
    return;
  }
  try {
    const res = await fetch(URL, { headers: { "X-Auth-Token": API_KEY } });
    if (!res.ok) {
      console.warn(`[fetch-matches] API ${res.status} — se omite matches.json`);
      return;
    }
    const data = await res.json();
    const prev = await loadPrevious();
    const matches = (data.matches ?? [])
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
      .map((m) => {
        const id = String(m.id);
        const old = prev.get(id);
        const override = SCORE_OVERRIDES[id];

        // Penaltis: cuenta el resultado del juego (prórroga incl.), SIN la tanda.
        // football-data mete la tanda en `fullTime`; usamos regularTime+extraTime.
        const pickHome =
          m.score?.duration === "PENALTY_SHOOTOUT" && m.score?.regularTime
            ? (m.score.regularTime.home ?? 0) + (m.score.extraTime?.home ?? 0)
            : (m.score?.fullTime?.home ?? null);
        const pickAway =
          m.score?.duration === "PENALTY_SHOOTOUT" && m.score?.regularTime
            ? (m.score.regularTime.away ?? 0) + (m.score.extraTime?.away ?? 0)
            : (m.score?.fullTime?.away ?? null);

        const apiHome = override ? override.homeGoals : pickHome;
        const apiAway = override ? override.awayGoals : pickAway;
        const apiHasScore = apiHome !== null || apiAway !== null;

        // Marcador provisional ya conocido de un build anterior.
        const knownHome = old?.homeGoals ?? null;
        const knownAway = old?.awayGoals ?? null;
        const hadKnown = knownHome !== null || knownAway !== null;

        // El resultado SOLO se da por confirmado cuando la API reporta FINISHED
        // con un marcador real (no null), o si ya estaba confirmado antes. Hasta
        // entonces el 2-0 se mantiene como provisional y se sigue consultando.
        // Un override manual cuenta como FINISHED confirmado.
        const confirmed =
          Boolean(override) ||
          (m.status === "FINISHED" && apiHasScore) || Boolean(old?.confirmed);

        let homeGoals;
        let awayGoals;
        if (apiHasScore) {
          // La API trae marcador fresco: es el más fiable.
          homeGoals = apiHome;
          awayGoals = apiAway;
        } else {
          // Sin marcador en la API: conservar el provisional conocido.
          homeGoals = hadKnown ? knownHome : null;
          awayGoals = hadKnown ? knownAway : null;
        }

        const hasScore = homeGoals !== null || awayGoals !== null;

        // `played` (resultado final fijado) solo si está confirmado.
        const played = confirmed;

        // Estado: confirmado → FINISHED; con marcador provisional pero sin
        // confirmar → mantener "en vivo" para que se muestre y se siga sondeando;
        // si no, lo que diga la API (sin degradar un estado ya avanzado a TIMED).
        let status;
        if (confirmed) {
          status = "FINISHED";
        } else if (hasScore) {
          status = LIVE_STATUSES.has(m.status) ? m.status : "IN_PLAY";
        } else if (m.status === "TIMED" && old && LIVE_STATUSES.has(old.status)) {
          status = old.status;
        } else {
          status = m.status;
        }

        const penalties = m.score?.duration === "PENALTY_SHOOTOUT" ||
          Boolean(old && old.penalties);

        // Ganador oficial; en penaltis sin ganador explícito se deduce del
        // fullTime (que incluye la tanda): el lado con más goles totales pasó.
        let winner = m.score?.winner ?? null;
        if (
          m.score?.duration === "PENALTY_SHOOTOUT" &&
          winner !== "HOME_TEAM" &&
          winner !== "AWAY_TEAM"
        ) {
          const ft = m.score?.fullTime;
          if (ft && ft.home != null && ft.away != null && ft.home !== ft.away) {
            winner = ft.home > ft.away ? "HOME_TEAM" : "AWAY_TEAM";
          }
        }

        return {
          id,
          utcDate: m.utcDate,
          status,
          confirmed,
          stage: m.stage,
          home: m.homeTeam?.name ? toName(m.homeTeam.name) : "Por determinar",
          away: m.awayTeam?.name ? toName(m.awayTeam.name) : "Por determinar",
          homeGoals,
          awayGoals,
          phase: stageToPhase(m.stage),
          penalties,
          penHome: penTally(m.score)?.home ?? null,
          penAway: penTally(m.score)?.away ?? null,
          winner,
          played,
          matchday: m.matchday ?? null,
        };
      });

    mkdirSync(join(__dirname, "../public"), { recursive: true });
    writeFileSync(OUT, JSON.stringify(matches));
    console.log(`[fetch-matches] OK — ${matches.length} partidos → public/matches.json`);
  } catch (err) {
    console.warn("[fetch-matches] Error:", err.message, "— se omite matches.json");
  }

  // ── Standings ────────────────────────────────────────────────────────────
  try {
    const sRes = await fetch(
      `https://api.football-data.org/v4/competitions/CL/standings`,
      { headers: { "X-Auth-Token": API_KEY } }
    );
    if (!sRes.ok) {
      console.warn(`[fetch-matches] standings API ${sRes.status} — se omite standings.json`);
    } else {
      const sData = await sRes.json();
      const league = (sData.standings ?? [])
        .find((s) => s.stage === "LEAGUE_STAGE" && s.type === "TOTAL");
      const table = (league?.table ?? []).map((row) => ({
        position: row.position,
        team: { name: toName(row.team?.name ?? "") || row.team?.name },
        playedGames: row.playedGames,
        won: row.won,
        draw: row.draw,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalDifference,
        points: row.points,
      }));
      writeFileSync(OUT_STANDINGS, JSON.stringify(table));
      console.log(`[fetch-matches] OK — ${table.length} equipos → public/standings.json`);
    }
  } catch (err) {
    console.warn("[fetch-matches] standings Error:", err.message, "— se omite standings.json");
  }
}

main();
