"use client";

import { useEffect, useState } from "react";
import { fetchLeaderboard, type LeaderboardRow } from "@/lib/leaderboard";

// Cierre de temporada: campeón de la porra, podio y farolillo rojo del grupo
// activo, con despedida hasta la próxima edición. Solo se muestra cuando ya se
// ha jugado la final.
const SEASON_END = new Date("2027-05-30T23:59:00");

export default function SeasonClosing({ group }: { group: string }) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);

  useEffect(() => {
    if (new Date() < SEASON_END) return;
    let alive = true;
    fetchLeaderboard()
      .then((r) => { if (alive) setRows(r.filter((x) => x.confirmed)); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [group]);

  if (!rows || rows.length === 0) return null;

  const podium = rows.slice(0, 3);
  const champ = podium[0];
  const lantern = rows[rows.length - 1];
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <section className="closing card">
      <div className="closing-inner">
        <p className="closing-eyebrow">Champions 26-27 · Se acabó</p>
        <h2 className="closing-title">🏆 Campeón de la porra</h2>
        <p className="closing-champ">
          {champ.user}
          <span className="closing-champ-pts">{champ.total} pts</span>
        </p>

        {/* Podio: 2.º – 1.º – 3.º */}
        <div className="closing-podium">
          {[1, 0, 2].map((idx) => {
            const row = podium[idx];
            if (!row) return null;
            return (
              <div key={row.user} className={`podium-spot podium-${idx + 1}`}>
                <span className="podium-medal">{medals[idx]}</span>
                <span className="podium-name">{row.user}</span>
                <span className="podium-pts">{row.total} pts</span>
                <div className="podium-bar"><span>{idx + 1}.º</span></div>
              </div>
            );
          })}
        </div>

        {lantern && lantern.user !== champ.user && (
          <p className="closing-lantern">
            🥄 Farolillo rojo: <strong>{lantern.user}</strong> <span className="closing-lantern-pts">({lantern.total} pts)</span>
          </p>
        )}

        <p className="closing-bye">
          Gracias por jugar una Champions increíble. Se ha peleado hasta el último penalti.
          <br />
          Nos vemos en la <strong>27-28</strong>. ⭐️
        </p>
      </div>
    </section>
  );
}
