"use client";

import { useEffect, useState } from "react";

const UFCC_BASE = "https://whiteriggs.github.io/UFCC";
const CACHE_KEY = "ufcc.champion";

type Cached = { name: string; crest: string };

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

export default function UfccChampion({ compact = false }: { compact?: boolean }) {
  const [name, setName] = useState<string | null>(null);
  const [crest, setCrest] = useState("");

  // Render the last known champion immediately so the pill never blanks out
  // across navigations if a single cross-origin fetch fails on mobile.
  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setName(cached.name);
      setCrest(cached.crest);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`${UFCC_BASE}/data/stats.json`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`${UFCC_BASE}/data/clubs.json`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([stats, clubs]) => {
        if (!alive) return;
        const champ: string = stats.current_champion;
        // En modo clubes el mapa da el nombre del fichero del escudo, no un emoji.
        const file: string | undefined = clubs[champ];
        const champCrest = file ? `${UFCC_BASE}/crests/${file}` : "";
        setName(champ);
        setCrest(champCrest);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ name: champ, crest: champCrest }));
        } catch {
          /* almacenamiento no disponible — ignoramos */
        }
      })
      .catch(() => {
        /* si falla la red, mantenemos el valor cacheado (si lo hay) */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!name) return null;

  return (
    <a
      href={`${UFCC_BASE}/?mode=clubs`}
      target="_blank"
      rel="noopener noreferrer"
      title="Campeón actual del Unofficial Football Club Championship — abre la web"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? "0.4rem" : "0.6rem",
        padding: compact ? "0.3rem 0.6rem" : "0.5rem 0.9rem",
        borderRadius: 999,
        border: "1px solid var(--line)",
        background: "var(--bg-2)",
        color: "var(--text)",
        textDecoration: "none",
        fontSize: compact ? "0.78rem" : "0.9rem",
        lineHeight: 1,
        width: "fit-content",
        whiteSpace: "nowrap",
        transition: "border-color 0.15s ease",
      }}
    >
      <span style={{ color: "var(--text-dim)", fontSize: compact ? "0.72rem" : "0.8rem" }}>
        {compact ? "UFCC" : "Campeón UFCC"}
      </span>
      {crest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={crest}
          alt=""
          width={compact ? 16 : 20}
          height={compact ? 16 : 20}
          style={{ objectFit: "contain", flexShrink: 0 }}
        />
      ) : (
        <span style={{ fontSize: compact ? "1.05rem" : "1.25rem" }}>🏆</span>
      )}
      <span style={{ fontWeight: 600 }}>{name}</span>
      <span style={{ color: "var(--accent)", fontSize: compact ? "0.72rem" : "0.8rem" }}>↗</span>
    </a>
  );
}
