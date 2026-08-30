// Canales de televisión por partido (España) para la Champions 2026/27.
//
// Movistar Plus+ tiene los derechos de todos los partidos de la competición,
// así que no hay reparto por equipos: mismo canal para todo el calendario.

export type TvChannel = {
  name: string;
  kind: "gratis" | "pago";
  url: string;
};

const MOVISTAR: TvChannel = {
  name: "Movistar Plus+",
  kind: "pago",
  url: "https://www.movistarplus.es/",
};

export function tvChannelsFor(match: { home: string; away: string }): TvChannel[] {
  void match;
  return [MOVISTAR];
}
