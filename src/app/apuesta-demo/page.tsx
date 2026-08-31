"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TEAMS, canBeAnti, ANTI_MAX_RANK } from "@/lib/teams";
import Crest from "@/components/Crest";

const favoriteBounds = { min: 6, max: 9 };
const antiBounds = { min: 3, max: 5 };
const ticketBounds = { min: 65, max: 72 };
const DEADLINE = new Date("2026-09-08T21:00:00");

/** Los 36 ordenados por coeficiente UEFA, que es de donde sale el precio. */
const rankedTeams = [...TEAMS].sort((a, b) => a.rank - b.rank);

export default function ApuestaDemoPage() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [antiFavorites, setAntiFavorites] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const isClosed = new Date() >= DEADLINE;

  const favoritesCost = useMemo(
    () => favorites.reduce((sum, id) => sum + (TEAMS.find((team) => team.id === id)?.price ?? 0), 0),
    [favorites]
  );

  const antiDiscount = useMemo(
    () => antiFavorites.reduce((sum, id) => sum + (TEAMS.find((team) => team.id === id)?.price ?? 0), 0),
    [antiFavorites]
  );

  const ticketCost = favoritesCost - antiDiscount;
  const overlap = favorites.some((id) => antiFavorites.includes(id));

  const validations = [
    {
      ok: favorites.length >= favoriteBounds.min && favorites.length <= favoriteBounds.max,
      text: `Favoritos: ${favoriteBounds.min}-${favoriteBounds.max} (actual ${favorites.length})`
    },
    {
      ok: antiFavorites.length >= antiBounds.min && antiFavorites.length <= antiBounds.max,
      text: `Antifavoritos: ${antiBounds.min}-${antiBounds.max} (actual ${antiFavorites.length})`
    },
    {
      ok: !overlap,
      text: "Un equipo no puede estar en ambos bloques"
    },
    {
      ok: ticketCost >= ticketBounds.min && ticketCost <= ticketBounds.max,
      text: `Coste total entre ${ticketBounds.min} y ${ticketBounds.max} pts (actual ${ticketCost} pts)`
    }
  ];

  const allValid = validations.every((rule) => rule.ok);

  function toggleTeam(teamId: string, isFavorite: boolean) {
    if (isFavorite) {
      setFavorites((current) =>
        current.includes(teamId) ? current.filter((id) => id !== teamId) : [...current, teamId]
      );
    } else {
      setAntiFavorites((current) =>
        current.includes(teamId) ? current.filter((id) => id !== teamId) : [...current, teamId]
      );
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Championisimo</h1>
          <span className="sub">Simulador de apuesta sin login</span>
        </div>
        <Link className="mini-action" href="/">
          Volver al inicio
        </Link>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">🏆</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Demo interactiva</div>
            <h2 className="hero-name">Creador de apuesta 26-27</h2>
            <p className="lead">
              Elige equipos y valida las reglas en tiempo real antes de pasar
              al registro con usuarios.
            </p>
          </div>
        </div>
      </section>

      <div className={`price-bar ${confirmed ? "price-confirmed" : ticketCost > ticketBounds.max ? "price-over" : ticketCost < ticketBounds.min && (favorites.length > 0 || antiFavorites.length > 0) ? "price-under" : ticketCost >= ticketBounds.min && ticketCost <= ticketBounds.max ? "price-ok" : ""}`}>
        <div className="price-bar-inner">
          <span className="price-bar-total">
            <span className="price-bar-label">{confirmed ? "Apuesta confirmada" : "Apuesta"}</span>
            <span className="price-bar-amount">{ticketCost} pts</span>
          </span>
          {!confirmed && <span className="price-bar-range">rango válido: {ticketBounds.min}-{ticketBounds.max} pts</span>}
          {confirmed && !isClosed && (
            <button className="btn edit-btn" onClick={() => setConfirmed(false)}>Editar apuesta</button>
          )}
          {isClosed && confirmed && (
            <span className="price-bar-range closed-label">Apuestas cerradas · Champions en marcha</span>
          )}
        </div>
      </div>

      <div className="bet-builder">
        <section className="bet-section">
          <div className="section-header">
            <h2>Selecciona tus equipos</h2>
            <div className="counters">
              <span className="counter fav-counter">
                <span className="dot-fav" /> Favoritos {favorites.length}/{favoriteBounds.min}-{favoriteBounds.max}
              </span>
              <span className="counter anti-counter">
                <span className="dot-anti" /> Antifavoritos {antiFavorites.length}/{antiBounds.min}-{antiBounds.max}
              </span>
            </div>
          </div>
          {!confirmed && <p className="muted">Usa los botones verdes para favoritos y rojos para antifavoritos. El precio sale del coeficiente UEFA; solo los {ANTI_MAX_RANK} primeros pueden ser antifavoritos.</p>}
          <div className="group-card teams-single">
            <h3 className="group-label">Los 36 por coeficiente UEFA</h3>
            <div className="group-teams">
              {rankedTeams.map((team) => {
                const teamId = team.id;
                const name = team.name;
                const isFav = favorites.includes(teamId);
                const isAnti = antiFavorites.includes(teamId);
                const antiAllowed = canBeAnti(teamId);

                if (confirmed) {
                  return (
                    <div className={`team-result ${isFav ? "team-result-fav" : isAnti ? "team-result-anti" : "team-result-neutral"}`} key={teamId}>
                      <span className="team-name"><span className="team-rank">{team.rank}</span><Crest name={name} />{name}</span>
                      <span className="team-result-badge">{isFav ? `+${team.price} pts` : isAnti ? `-${team.price} pts` : `${team.price} pts`}</span>
                    </div>
                  );
                }

                const favBlocked = !isFav && (favorites.length >= favoriteBounds.max || isAnti);
                const antiBlocked = !isAnti && (antiFavorites.length >= antiBounds.max || isFav || !antiAllowed);

                return (
                  <div className="team-dual" key={teamId}>
                    <div className="team-info">
                      <span className="team-name"><span className="team-rank">{team.rank}</span><Crest name={name} />{name}</span>
                      <span className="team-price">{team.price} pts</span>
                    </div>
                    <div className="team-controls">
                      <button
                        className={`team-btn fav-btn ${isFav ? "active" : ""} ${favBlocked ? "disabled" : ""}`}
                        onClick={() => toggleTeam(teamId, true)}
                        disabled={favBlocked}
                        title={isFav ? "Remover de favoritos" : isAnti ? "Ya es antifavorito" : "Marcar como favorito"}
                        aria-label={`${name} como favorito`}
                      />
                      <button
                        className={`team-btn anti-btn ${isAnti ? "active" : ""} ${antiBlocked ? "disabled" : ""}`}
                        onClick={() => toggleTeam(teamId, false)}
                        disabled={antiBlocked}
                        title={isAnti ? "Remover de antifavoritos" : isFav ? "Ya es favorito" : !antiAllowed ? `Solo los ${ANTI_MAX_RANK} primeros pueden ser antifavoritos` : "Marcar como antifavorito"}
                        aria-label={`${name} como antifavorito`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {!confirmed && !isClosed && (
            <div className="bet-actions">
              <button
                className={`btn confirm-btn ${allValid ? "" : "confirm-btn-disabled"}`}
                disabled={!allValid}
                onClick={() => setConfirmed(true)}
              >
                {allValid ? "Confirmar apuesta" : "Completa la apuesta para confirmar"}
              </button>
            </div>
          )}
          {isClosed && !confirmed && (
            <p className="deadline-notice ko">Las apuestas están cerradas desde el inicio de la Champions (8 sep 2026).</p>
          )}
        </section>
      </div>

      <div className="grid">
        <article className="card highlight summary-card">
          <h2>Resumen</h2>
          <p>Coste favoritos: {favoritesCost} pts</p>
          <p>Abono antifavoritos: {antiDiscount} pts</p>
          <p>
            <strong>Coste final: {ticketCost} pts</strong>
          </p>
          <h3>Validaciones</h3>
          <ul className="checks">
            {validations.map((rule) => (
              <li className={rule.ok ? "ok" : "ko"} key={rule.text}>
                {rule.ok ? "OK" : "REV"} - {rule.text}
              </li>
            ))}
          </ul>
          <p className={allValid ? "ok" : "ko"}>
            {allValid
              ? "Apuesta valida para registrar en la siguiente fase con usuarios."
              : "La apuesta aun no cumple todas las reglas."}
          </p>
        </article>
      </div>
    </main>
  );
}
