// Stocke et sert les fiches modèles (Netlify Functions v2 + Netlify Blobs).
// POST /api/fiche?m=rose            -> enregistre la fiche envoyée par la modèle
// GET  /api/fiche?m=rose  (X-Key)   -> renvoie la dernière fiche (lien équipe)
import { getStore } from "@netlify/blobs";

// Clé du lien équipe : jamais dans le code. Générée par le serveur au premier appel
// de GET /api/fiche?m=rose&setup=1 (une seule fois, verrouillé ensuite) et gardée dans Netlify Blobs.
import { randomBytes } from "node:crypto";
async function viewKey(st) { return process.env.VIEW_KEY || (await st.get("config/viewkey", { type: "text" })) || ""; }
const MODELS = ["rose"];
const MAX_BYTES = 400_000;

const json = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function store() {
  return globalThis.__FICHE_TEST_STORE__ || getStore({ name: "fiches", consistency: "strong" });
}

export default async (req) => {
  const url = new URL(req.url);
  const m = (url.searchParams.get("m") || "").toLowerCase();
  if (!MODELS.includes(m)) return json(404, { error: "modele_inconnu" });

  if (req.method === "POST") {
    const raw = await req.text();
    if (raw.length > MAX_BYTES) return json(413, { error: "trop_gros" });
    let body;
    try { body = JSON.parse(raw); } catch { return json(400, { error: "json_invalide" }); }
    const p = body && body.payload, s = body && body.state;
    if (!p || typeof p !== "object" || !s || typeof s !== "object") return json(400, { error: "format" });
    if (p["bot-field"]) return json(200, { ok: true }); // pot de miel anti-bot
    const age = parseInt(String(p.age || ""), 10);
    const nb = parseInt(String(p.nb_anecdotes || "0"), 10);
    if (!String(p.prenom || "").trim()) return json(422, { error: "prenom" });
    if (!(age >= 18 && age <= 99)) return json(422, { error: "age" });
    if (!(nb >= 10)) return json(422, { error: "anecdotes" });
    const savedAt = new Date().toISOString();
    const doc = { savedAt, payload: p, state: s };
    const st = store();
    await st.setJSON(`${m}/latest`, doc);
    await st.setJSON(`${m}/history/${savedAt.replace(/[:.]/g, "-")}`, doc);
    return json(200, { ok: true, savedAt });
  }

  if (req.method === "GET") {
    const st = store();
    let expected = await viewKey(st);
    if (url.searchParams.get("setup") === "1") {
      if (expected) return json(403, { error: "deja_configure" });
      const k = randomBytes(16).toString("hex");
      await st.set("config/viewkey", k);
      return json(200, { key: k });
    }
    if (!expected) return json(503, { error: "cle_non_configuree" });
    const key = req.headers.get("x-key") || "";
    if (key !== expected) return json(401, { error: "lien_invalide" });
    const doc = await st.get(`${m}/latest`, { type: "json" });
    return json(200, { fiche: doc || null });
  }

  return json(405, { error: "methode" });
};

export const config = { path: "/api/fiche" };
