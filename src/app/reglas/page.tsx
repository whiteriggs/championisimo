"use client";

import { getStoredUser, clearUser } from "@/lib/auth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";

const ALL_RULES = [
  {
    title: "Cómo funciona",
    items: [
      "Elige entre 6 y 9 favoritos y entre 3 y 5 antifavoritos de los 36 equipos.",
      "Máximo 3 favoritos y 2 antifavoritos del mismo bombo.",
      "Tu puntuación = puntos de favoritos − puntos de antifavoritos.",
      "Apuestas idénticas se desempatan por orden de registro.",
    ],
  },
  {
    title: "Precio de los equipos",
    items: [
      "El precio sale del bombo del sorteo: bombo 1 cuesta 4 puntos, bombo 2 vale 3, bombo 3 vale 2 y bombo 4 vale 1.",
      "La suma del precio de tus favoritos menos el de tus antifavoritos debe estar entre 12 y 18 puntos.",
      "Esto obliga a equilibrar: no puedes coger solo grandes sin arriesgarte a poner un grande de antifavorito.",
    ],
  },
  {
    title: "Puntuación por partido",
    items: [
      "Fase liga: +1 por gol, +5 por empate, +10 por victoria.",
      "Eliminatorias: +1 por gol, +5 por jugar, +5 por empate, +10 por victoria.",
      "Los cruces son a doble partido: ida y vuelta puntúan por separado, así que llegar lejos paga doble.",
      "Partidos resueltos en penaltis cuentan como empate.",
      "Los goles en la tanda de penaltis no puntúan.",
    ],
  },
  {
    title: "Desempates",
    items: [
      "Mejor posición media de tus favoritos en la tabla final de la fase liga (1-36).",
      "Si persiste el empate, decide el superfavorito.",
      "Último criterio: orden de inscripción.",
    ],
  },
];

export default function ReglasPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

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
          <span className="sub">Reglas</span>
        </div>
        <NavBar user={user} />
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">📋</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Porra de la Champions 26-27</div>
            <h2 className="hero-name">Reglas</h2>
            <p className="lead">Cómo funciona la porra, los precios, la puntuación y los desempates.</p>
          </div>
        </div>
      </section>

      <div className="page-content">
        <div className="home-rules" style={{ width: "fit-content", maxWidth: "100%", margin: "0 auto" }}>
          {ALL_RULES.map((section) => (
            <div key={section.title} className="home-rule-section">
              <h3>{section.title}</h3>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
