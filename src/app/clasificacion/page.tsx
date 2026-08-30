"use client";

import NavBar from "@/components/NavBar";
import Crest from "@/components/Crest";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearUser } from "@/lib/auth";
import { fetchAllMatches, type ApiAllMatch, isLiveStatus } from "@/lib/football-api";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { buildLeagueStandings, zoneForPosition, type Zone } from "@/lib/standings";
import { Match } from "@/lib/scoring";

const ZONE_LABEL: Record<Zone, string> = {
  r16: "Octavos directos (1-8)",
  playoff: "Playoff (9-24)",
  out: "Eliminados (25-36)",
};

export default function ClasificacionPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiMatches, setApiMatches] = useState<ApiAllMatch[]>([]);

  const loadData = useCallback(
    () => fetchAllMatches().then(setApiMatches).catch(() => setApiMatches([])),
    []
  );

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.push("/login"); return; }
    setUser(u);
    loadData().finally(() => setLoading(false));
  }, [router, loadData]);

  useLiveRefresh(loadData);

  // Incluye los partidos en vivo con su marcador parcial: la tabla se mueve
  // en directo igual que la clasificación de la porra.
  const standings = useMemo(() => {
    const matches: Match[] = apiMatches
      .filter((m) => m.phase === "league" && (m.played || isLiveStatus(m.status)))
      .map((m) => ({
        id: m.id,
        home: m.home,
        away: m.away,
        homeGoals: m.homeGoals ?? 0,
        awayGoals: m.awayGoals ?? 0,
        phase: "league" as const,
        penalties: false,
        played: true,
        matchday: m.matchday ?? null,
      }));
    return buildLeagueStandings(matches);
  }, [apiMatches]);

  const anyPlayed = standings.some((s) => s.played > 0);

  function handleLogout() {
    clearUser();
    router.push("/login");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Championisimo</h1>
          <span className="sub">Clasificación</span>
        </div>
        <NavBar user={user} />
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">🏆</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Champions 26-27 · Fase liga</div>
            <h2 className="hero-name">La tabla de los 36</h2>
            <p className="lead">
              Ocho jornadas, una sola clasificación. Del 1 al 8 pasan directos a octavos,
              del 9 al 24 juegan el playoff y del 25 al 36 a casa.
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="loading-screen"><p className="muted">Cargando clasificación…</p></div>
      ) : (
        <div className="results-section">
          {!anyPlayed && (
            <p className="api-notice">
              Todavía no se ha jugado ninguna jornada. La tabla se llenará sola en cuanto ruede el balón.
            </p>
          )}

          <div className="group-standing-card">
            <table className="standings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Equipo</th>
                  <th>PJ</th>
                  <th>G</th>
                  <th>E</th>
                  <th>P</th>
                  <th>GF</th>
                  <th>GC</th>
                  <th>DG</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, i) => {
                  const position = i + 1;
                  const zone = zoneForPosition(position);
                  const prevZone = i > 0 ? zoneForPosition(i) : null;
                  return (
                    <tr key={row.name} data-zone={zone} className={prevZone && prevZone !== zone ? "zone-start" : undefined}>
                      <td>{position}</td>
                      <td className="team-name">
                        <Crest name={row.name} />
                        {row.name}
                      </td>
                      <td>{row.played}</td>
                      <td>{row.won}</td>
                      <td>{row.drawn}</td>
                      <td>{row.lost}</td>
                      <td>{row.gf}</td>
                      <td>{row.ga}</td>
                      <td>{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                      <td><strong>{row.pts}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="zone-legend">
            {(Object.keys(ZONE_LABEL) as Zone[]).map((z) => (
              <li key={z}>
                <span className="zone-swatch" data-zone={z} />
                {ZONE_LABEL[z]}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
