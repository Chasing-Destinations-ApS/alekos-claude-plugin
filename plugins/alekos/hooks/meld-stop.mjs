#!/usr/bin/env node
// Melder ét stop fra sikkerhedsvagten til Alekos-serveren (0.8.2, Caspers beslutning 10.11.2026). Startes løsrevet af
// vagt.mjs (bloker), så vagten aldrig venter. Data kommer KUN fra miljøvariablen ALEKOS_VAGT_MELD (lille JSON fra vagten).
// Fast metode (alekos/vagt_stop), fast adresse (faelles.MCP_URL) og kun de fire felter: regel, kategori, vaerktoej, plugin.
// Nøglen hentes som vagten gør (nødvejens nøgle, ellers Claude Codes browserlogin). Ingen nøgle = intet sendes.
// Svaret ignoreres; alle fejl sluges; der skrives aldrig noget ud. Højst 4 sek.
// Test: ALEKOS_VAGT_MELD_TEST_FIL=<sti> skriver den body, der ville blive sendt, til filen (ingen nøgle, intet netværk).
import fs from "node:fs";

const KATEGORIER = new Set(["browser", "noegle_data", "supabase", "indstillinger", "forbindelse", "soegning",
  "kode_uden_sandkasse", "ugyldigt_kald", "andet"]);

const stop = setTimeout(() => process.exit(0), 4500); // nødstop, hvis noget hænger

try {
  const d = JSON.parse(process.env.ALEKOS_VAGT_MELD ?? "");
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("ugyldig");
  const tekst = (v) => (typeof v === "string" ? v : "");
  const regel = tekst(d.regel).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120) || "Stoppet af vagten";
  const kategori = KATEGORIER.has(d.kategori) ? d.kategori : "andet";
  const vaerktoej = tekst(d.vaerktoej).replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 100) || "ukendt";
  const plugin = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(tekst(d.plugin)) ? d.plugin : "ukendt";
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "alekos/vagt_stop", params: { regel, kategori, vaerktoej, plugin } });

  const testFil = process.env.ALEKOS_VAGT_MELD_TEST_FIL;
  if (testFil) {
    fs.writeFileSync(testFil, body, { mode: 0o600 });
  } else if (process.env.ALEKOS_VAGT_OFFLINE !== "1" && process.env.ALEKOS_VAGT_INGEN_MELDING !== "1") {
    const faelles = await import("../scripts/faelles.mjs");
    let key = null;
    try { key = faelles.hentNoegle(); } catch { key = null; }
    if (!key && process.env.ALEKOS_VAGT_INGEN_NOEGLERING !== "1") {
      try { key = (await import("./noegle.mjs")).claudeCodeNoegle(); } catch { key = null; }
    }
    if (key) {
      await fetch(faelles.MCP_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
        body,
        signal: AbortSignal.timeout(4000),
        redirect: "error",
      });
    }
  }
} catch { /* sluges altid */ }
clearTimeout(stop);
process.exit(0);
