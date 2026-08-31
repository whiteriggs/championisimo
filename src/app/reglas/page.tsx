"use client";

import { getStoredUser, clearUser } from "@/lib/auth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";

const ALL_RULES = [
  {
    title: "Cómo funciona",
    items: [
      "Elige entre 6 y 9 favoritos de los 36 equipos y entre 3 y 5 antifavoritos.",
      "Los antifavoritos solo pueden salir de los 24 primeros del ranking: son los que se presupone que al menos llegan al playoff.",
      "Tu puntuación = puntos de favoritos − puntos de antifavoritos.",
      "Apuestas idénticas se desempatan por orden de registro.",
    ],
  },
  {
    title: "Precio de los equipos",
    items: [
      "Cada equipo tiene su propio precio según el coeficiente UEFA: del PSG a 25 puntos al último del ranking a 2.",
      "Los precios están calibrados con lo que puntuó de verdad cada puesto en las dos temporadas ya jugadas con formato de 36, así que ninguna franja sale a cuenta por sí sola.",
      "La suma del precio de tus favoritos menos el de tus antifavoritos debe quedar entre 65 y 72 puntos.",
      "El bombo del sorteo solo se muestra como información: ya no manda en el precio ni obliga a repartir.",
    ],
  },
  {
    title: "Puntuación por partido",
    items: [
      "Fase liga: +1 por gol, +5 por empate, +10 por victoria.",
      "Acabar entre los 8 primeros de la fase liga: +20 puntos.",
      "Eliminatorias: +1 por gol, +5 por jugar, +5 por empate, +10 por victoria.",
      "Los cruces son a doble partido: ida y vuelta puntúan por separado, así que llegar lejos paga doble.",
      "El bonus de los 8 primeros compensa el playoff que se ahorran: si no, acabar noveno y ganar el cruce rentaría más que acabar primero.",
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
