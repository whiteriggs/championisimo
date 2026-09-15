"use client";

import NavBar from "@/components/NavBar";
import Crest from "@/components/Crest";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearUser } from "@/lib/auth";
import { fetchAllMatches } from "@/lib/football-api";
import { getGroupId } from "@/lib/group";
import { fetchBetsRest, fetchUsersRest } from "@/lib/leaderboard";
import { teamName } from "@/lib/teams";
import {
  conditionalWinPct,
  type ProbBet,
  type ProbInput,
  type ProbabilityResult,
  type SimMatch,
} from "@/lib/winProbability";

const SIMS = 6000;
const OUTCOME_LABEL = ["Gana el local", "Empate", "Gana el visitante"];

function pct(n: number): string {
  if (n >= 9.95) return `${Math.round(n)}%`;
  if (n < 0.05) return "0%";
  return `${n.toFixed(1)}%`;
}

function ordinal(n: number): string {
  return `${n}.º`;
}

function posColor(index: number, total: number): string {
  const hue = total <= 1 ? 45 : 45 - (index / (total - 1)) * 45;
  return `hsl(${hue} 85% 58%)`;
}

export default function ProbabilidadesPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [prob, setProb] = useState<ProbabilityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, number>>({});
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.push("/login");
      return;
    }
    setUser(u);

    const worker = new Worker(new URL("../../lib/probWorker.ts", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<ProbabilityResult>) => {
      setProb(e.data);
      setLoading(false);
    };

    const groupId = getGroupId();
    Promise.all([fetchAllMatches(), fetchUsersRest(groupId), fetchBetsRest(groupId)])
      .then(([apiMatches, users, bets]) => {
        const simMatches: SimMatch[] = apiMatches.map((m) => ({
          id: m.id,
          utcDate: m.utcDate,
          home: m.home,
          away: m.away,
          homeGoals: m.homeGoals,
          awayGoals: m.awayGoals,
          phase: m.phase,
          penalties: m.penalties,
          played: m.played,
          matchday: m.matchday ?? null,
          penWinner:
            m.penalties && m.winner
              ? m.winner === "HOME_TEAM"
                ? "home"
                : "away"
              : undefined,
        }));

        // Orden de inscripción: es el último desempate de la porra.
        const probBets: ProbBet[] = users
          .map((u2) => bets.find((b) => b.user === u2.toLowerCase() && b.confirmed))
          .filter((b) => b !== undefined)
          .map((b) => ({
            user: users.find((u2) => u2.toLowerCase() === b.user) ?? b.user,
            favorites: b.favorites.map(teamName),
            antiFavorites: b.antiFavorites.map(teamName),
            superFavorite: b.superFavorite ? teamName(b.superFavorite) : null,
          }));

        if (probBets.length === 0) {
          setLoading(false);
          return;
        }
        const input: ProbInput = { matches: simMatches, bets: probBets, sims: SIMS };
        worker.postMessage(input);
      })
      .catch(() => {
        setError("No se han podido cargar los datos.");
        setLoading(false);
      });

    return () => worker.terminate();
  }, [router]);

  const teamPts = useMemo(
    () => new Map((prob?.teams ?? []).map((t) => [t.name, t.meanPts])),
    [prob]
  );

  const focused = prob?.users.find((u) => u.user === focus) ?? null;
  const conditional = useMemo(() => {
    if (!prob || Object.keys(selection).length === 0) return null;
    return conditionalWinPct(prob.scenarioSims, prob.users.length, selection);
  }, [prob, selection]);

  const pendingById = useMemo(
    () => new Map((prob?.pending ?? []).map((m) => [m.id, m])),
    [prob]
  );

  // Juan y JuanRa se cortan igual: busca el prefijo más corto que los distinga.
  const shortNames = useMemo(() => {
    const names = (prob?.users ?? []).map((u) => u.user);
    for (let len = 4; len < 12; len++) {
      const cut = names.map((n) => n.slice(0, len));
      if (new Set(cut).size === names.length) return cut;
    }
    return names;
  }, [prob]);

  function handleLogout() {
    clearUser();
    router.push("/login");
  }

  const isMe = (name: string) => user?.toLowerCase() === name.toLowerCase();

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Championisimo</h1>
          <span className="sub">Probabilidades</span>
        </div>
        <NavBar user={user} />
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">🎲</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Champions 26-27 · Simulación</div>
            <h2 className="hero-name">¿Quién va a ganar la porra?</h2>
            <p className="lead">
              Jugamos la temporada entera {SIMS.toLocaleString("es-ES")} veces —liga, playoff y
              eliminatorias— y contamos cuántas acaba ganando cada uno.
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="loading-screen">
          <p className="muted">Simulando la temporada…</p>
        </div>
      ) : error ? (
        <div className="results-section">
          <p className="api-notice">{error}</p>
        </div>
      ) : !prob ? (
        <div className="results-section">
          <p className="api-notice">Aún no hay participantes con la apuesta confirmada.</p>
        </div>
      ) : (
        <div className="results-section">
          <div className="prob-explainer">
            <h3>Cómo se calcula</h3>
            <p>
              Cada simulación reparte los {prob.matchesLeft} partidos que quedan según la fuerza
              de cada equipo (coeficiente UEFA corregido con lo que llevan hecho), monta la tabla
              final, sortea el playoff y las eliminatorias, y puntúa la porra con las mismas
              reglas de siempre. No es una predicción: es el reparto de lo que podría pasar.
            </p>
          </div>

          {prob.sharedFavorites.length > 0 && (
            <p className="prob-note muted">
              Ojo: {prob.sharedFavorites.join(" y ")}{" "}
              {prob.sharedFavorites.length > 1 ? "están" : "está"} en las apuestas de todos, así
              que {prob.sharedFavorites.length > 1 ? "sumen lo que sumen" : "sume lo que sume"} no
              {prob.sharedFavorites.length > 1 ? " mueven" : " mueve"} la clasificación. La porra
              se decide en los equipos que os separan.
            </p>
          )}

          <h3 className="results-title">Clasificación probable</h3>
          <div className="standings-wrap">
            <table className="standings-table prob-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Participante</th>
                  <th className="prob-col">Gana 🏆</th>
                  <th className="prob-col">Podio 🥉</th>
                  <th className="prob-col">Farolillo 🥄</th>
                  <th className="prob-col">Puntos</th>
                </tr>
              </thead>
              <tbody>
                {prob.users
                  .map((u, i) => ({ u, i }))
                  .sort((a, b) => b.u.winPct - a.u.winPct)
                  .map(({ u }, rank) => (
                    <tr
                      key={u.user}
                      className={[
                        "prob-row",
                        isMe(u.user) ? "row-me" : "",
                        focus === u.user ? "prob-row-focus" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setFocus(focus === u.user ? null : u.user)}
                    >
                      <td>{rank + 1}</td>
                      <td>
                        {u.user}
                        {isMe(u.user) && <span className="me-badge">tú</span>}
                      </td>
                      <td className="prob-col prob-win">{pct(u.winPct)}</td>
                      <td className="prob-col">{pct(u.podiumPct)}</td>
                      <td className="prob-col">{pct(u.lastPct)}</td>
                      <td className="prob-col">
                        <span className="prob-mean">{Math.round(u.meanScore)}</span>
                        <span className="prob-range">
                          {Math.round(u.p10)} – {Math.round(u.p90)}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="prob-note muted">Toca una fila para ver qué equipos te hacen ganar.</p>

          {focused && (
            <div className="prob-block">
              <div className="prob-block-head">
                <h3>{focused.user}</h3>
                <span className="prob-best">
                  Puesto más probable: {ordinal(focused.bestPos)}
                </span>
              </div>

              <div className="prob-balance">
                <div className="prob-bal-item prob-bal-fav">
                  <span className="prob-bal-label">Favoritos</span>
                  <span className="prob-bal-val">
                    {Math.round(
                      focused.edge
                        .filter((e) => e.kind === "fav")
                        .reduce((s, e) => s + e.meanPts, 0)
                    )}
                  </span>
                </div>
                <div className="prob-bal-item prob-bal-anti">
                  <span className="prob-bal-label">Antifavoritos</span>
                  <span className="prob-bal-val">
                    {Math.round(
                      focused.edge
                        .filter((e) => e.kind === "anti")
                        .reduce((s, e) => s + e.meanPts, 0)
                    )}
                  </span>
                </div>
                <div className="prob-bal-item prob-bal-net">
                  <span className="prob-bal-label">Puntos esperados</span>
                  <span className="prob-bal-val">{Math.round(focused.meanScore)}</span>
                </div>
              </div>

              <div className="prob-block">
                <h3>Lo que te diferencia</h3>
                <p className="prob-help muted">
                  Lo que tienen todos no cuenta. Estos son los equipos donde tu apuesta se
                  aparta de la del resto, y lo que se espera que sumen.
                </p>
                <div className="prob-cards">
                  {focused.edge.slice(0, 4).map((e) => (
                    <div className="prob-card" key={`${e.kind}-${e.team}`}>
                      <div className="prob-card-label">
                        {e.kind === "fav" ? "Favorito" : "Antifavorito"}
                        {e.exclusive ? " · solo tú" : ""}
                      </div>
                      <div className="prob-card-team">
                        <Crest name={e.team} />
                        {e.team}
                        <span
                          className={`prob-card-pts ${
                            e.impact >= 0 ? "prob-card-good" : "prob-card-bad"
                          }`}
                        >
                          {e.impact >= 0 ? "+" : ""}
                          {Math.round(e.impact)}
                        </span>
                      </div>
                      <div className="prob-card-foot">
                        Suma unos {Math.round(e.meanPts)} puntos de media
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="prob-block">
                <h3>Dónde acaba</h3>
                <div className="prob-posbar">
                  {focused.posDist.map((p, k) => (
                    <div
                      key={k}
                      className="prob-posseg"
                      style={{ width: `${p}%`, background: posColor(k, focused.posDist.length) }}
                      title={`${ordinal(k + 1)}: ${pct(p)}`}
                    >
                      {p >= 8 ? ordinal(k + 1) : ""}
                    </div>
                  ))}
                </div>
              </div>

              <div className="prob-block">
                <h3>¿A quién le gana?</h3>
                <div className="prob-h2h">
                  {prob.users.map((other, j) => {
                    if (other.user === focused.user) return null;
                    const value = focused.beats[j];
                    const win = value >= 50;
                    return (
                      <div className="prob-h2h-row" key={other.user}>
                        <span className="prob-h2h-name">{other.user}</span>
                        <span className="prob-h2h-bar">
                          <span
                            className={`prob-h2h-fill ${win ? "win" : "lose"}`}
                            style={{ width: `${value}%` }}
                          />
                        </span>
                        <span className={`prob-h2h-pct ${win ? "win" : "lose"}`}>
                          {pct(value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {prob.scenarios.length > 0 && (
            <>
              <h3 className="results-title">Partidos decisivos</h3>
              <p className="prob-help muted">
                De la próxima jornada, los que más mueven la porra.
              </p>
              <div className="scen-grid">
                {prob.scenarios.slice(0, 6).map((sc) => {
                  const match = pendingById.get(sc.id);
                  if (!match) return null;
                  return (
                    <div
                      className={`scen-card ${sc.swing >= 8 ? "scen-card--key" : ""}`}
                      key={sc.id}
                    >
                      <div className="scen-head">
                        <span className="scen-teams">
                          <Crest name={match.home} />
                          {match.home}
                          <span className="scen-vs">vs</span>
                          <Crest name={match.away} />
                          {match.away}
                        </span>
                        <span className="scen-round">mueve {Math.round(sc.swing)}%</span>
                      </div>
                      <table className="scen-table">
                        <thead>
                          <tr>
                            <th className="scen-outcome">Desenlace</th>
                            <th className="scen-p">Prob</th>
                            {prob.users.map((u, i) => (
                              <th key={u.user} className="scen-u">
                                {shortNames[i]}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[0, 1, 2].map((o) => {
                            const best = Math.max(...sc.winPct[o]);
                            return (
                              <tr
                                key={o}
                                className={sc.outcomeProb[o] < 1 ? "scen-rare" : undefined}
                              >
                                <td className="scen-outcome">{OUTCOME_LABEL[o]}</td>
                                <td className="scen-p">{pct(sc.outcomeProb[o])}</td>
                                {prob.users.map((u, i) => (
                                  <td
                                    key={u.user}
                                    className={`scen-u ${
                                      sc.winPct[o][i] === best && best > 0 ? "scen-u-lead" : ""
                                    }`}
                                  >
                                    {pct(sc.winPct[o][i])}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>

              <h3 className="results-title">Y si pasa esto…</h3>
              <div className="scen-explorer">
                <div className="scen-selects">
                  {prob.pending.map((m) => (
                    <label className="scen-select" key={m.id}>
                      <span className="scen-select-lbl">
                        <Crest name={m.home} />
                        {m.home} – {m.away}
                        <Crest name={m.away} />
                      </span>
                      <select
                        value={selection[m.id] ?? ""}
                        onChange={(e) =>
                          setSelection((prev) => {
                            const next = { ...prev };
                            if (e.target.value === "") delete next[m.id];
                            else next[m.id] = Number(e.target.value);
                            return next;
                          })
                        }
                      >
                        <option value="">Como salga</option>
                        <option value="0">Gana {m.home}</option>
                        <option value="1">Empate</option>
                        <option value="2">Gana {m.away}</option>
                      </select>
                    </label>
                  ))}
                </div>

                <div className="scen-out">
                  <h3>Con esos resultados</h3>
                  {conditional === null ? (
                    <p className="prob-help muted">Elige algún resultado para ver el efecto.</p>
                  ) : conditional.sample < 50 ? (
                    <p className="prob-help scen-warn">
                      Solo {conditional.sample} simulaciones encajan con esa combinación: el dato
                      no es fiable. Quita alguna condición.
                    </p>
                  ) : (
                    <table className="scen-cond-table">
                      <tbody>
                        {prob.users
                          .map((u, i) => ({ u, value: conditional.pct[i] }))
                          .sort((a, b) => b.value - a.value)
                          .map(({ u, value }) => (
                            <tr key={u.user}>
                              <td className="scen-cond-name">{u.user}</td>
                              <td className="scen-cond-val">{pct(value)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                  <div className="scen-actions">
                    <span className="muted">
                      {conditional ? `${conditional.sample} simulaciones` : ""}
                    </span>
                    {Object.keys(selection).length > 0 && (
                      <button className="mini-action" onClick={() => setSelection({})}>
                        Limpiar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          <h3 className="results-title">¿Quién levantará la copa?</h3>
          <div className="standings-wrap">
            <table className="standings-table prob-table">
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th className="prob-col">Campeón</th>
                  <th className="prob-col">Final</th>
                  <th className="prob-col">Octavos</th>
                  <th className="prob-col">Puntos</th>
                </tr>
              </thead>
              <tbody>
                {prob.teams.slice(0, 16).map((t) => (
                  <tr key={t.name}>
                    <td>
                      <span className="prob-teamcell">
                        <Crest name={t.name} />
                        {t.name}
                      </span>
                    </td>
                    <td className="prob-col prob-win">{pct(t.championPct)}</td>
                    <td className="prob-col">{pct(t.finalPct)}</td>
                    <td className="prob-col">{pct(t.r16Pct)}</td>
                    <td className="prob-col">{Math.round(t.meanPts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="prob-legend">
            <h3>Letra pequeña</h3>
            <ul>
              <li>
                <strong>Puntos</strong>: los esperados al final de temporada; debajo, el rango en
                el que caen 8 de cada 10 simulaciones.
              </li>
              <li>
                <strong>Lo que te diferencia</strong>: mide cuánto se aparta tu apuesta de la
                media del grupo en ese equipo. Un equipo que tenéis todos vale cero.
              </li>
              <li>
                La fuerza sale del coeficiente UEFA, que mide los últimos cinco años y no la
                plantilla de hoy. Se corrige con lo jugado, pero sigue siendo una estimación.
              </li>
              <li>
                El cuadro de eliminatorias usa el del año pasado, porque el de esta temporada no
                se sortea hasta enero. No se simula la prórroga: si un cruce acaba empatado, va
                directo a los penaltis.
              </li>
              <li>
                Un solo partido cambia poco, pero el número de favoritos que lleva cada uno pesa
                mucho: con las mismas reglas, más equipos en la apuesta significa más partidos
                sumando.
              </li>
            </ul>
          </div>
        </div>
      )}
    </main>
  );
}
