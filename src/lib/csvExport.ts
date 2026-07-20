/**
 * Export CSV (D7 dashboard — engagement contractuel art. 8 : données
 * exportables à tout moment).
 * Format Excel-suisse : UTF-8 avec BOM + séparateur « ; ».
 */

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

function escapeCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Anti-injection de formule (CWE-1236) ET préservation des téléphones
  // E.164 : Excel interprète toute cellule commençant par = + - @ (ou
  // tab/CR) comme une formule — un « +41791234567 » devient 4.18E+10 et
  // un nom malveillant « =HYPERLINK(...) » s'exécute à l'ouverture.
  // L'apostrophe de tête force le mode texte (masquée par Excel/LibreOffice).
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (s.includes(";") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const BOM = "﻿";
  const header = columns.map((c) => escapeCell(c.header)).join(";");
  const lines = rows.map((r) =>
    columns.map((c) => escapeCell(c.value(r))).join(";"),
  );
  return BOM + [header, ...lines].join("\r\n") + "\r\n";
}

/** Date du jour Europe/Zurich pour les noms de fichiers : "2026-07-19". */
export function zurichDateStamp(): string {
  const parts = new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Horodatage lisible Europe/Zurich pour les cellules : "19.07.2026 14:32". */
export function zurichDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
