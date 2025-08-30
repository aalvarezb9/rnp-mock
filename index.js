// rnp-mock/index.js (CommonJS)
// deps: express, cors, ethers
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Estructura de db.json esperada:
// [
//   {"dni":"1","fingerprint":"1111","salt":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
//   {"dni":"2","fingerprint":"2222","salt":"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
//   {"dni":"3","fingerprint":"3333","salt":"0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}
// ]
const DB_PATH = path.join(__dirname, "db.json");
const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));

// Helper seguro: genera la hoja global sin center/mesa.
// leaf = keccak256( bytes32 salt, bytes32 keccak256(dniAscii) )
function leafFor(dni, saltHex) {
  if (!dni || !saltHex) throw new Error("dni o salt faltante");
  if (typeof saltHex !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(saltHex)) {
    throw new Error("salt inválido; debe ser 0x + 64 hex");
  }
  const dniHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(String(dni)));
  return ethers.utils.solidityKeccak256(["bytes32", "bytes32"], [saltHex, dniHash]);
}

// POST /verify { dni, fingerprint } -> { match, salt }
app.post("/verify", (req, res) => {
  try {
    const { dni, fingerprint } = req.body || {};
    if (!dni || !fingerprint) return res.status(400).json({ error: "dni y fingerprint requeridos" });
    const rec = db.find((x) => x.dni === String(dni));
    if (!rec) return res.json({ match: false });
    const match = rec.fingerprint === String(fingerprint);
    if (!match) return res.json({ match: false });
    return res.json({ match: true, salt: rec.salt });
  } catch (e) {
    console.error("/verify error:", e);
    res.status(500).json({ error: "verify-failed" });
  }
});

// GET /leaves -> { leaves: [...] }
app.get("/leaves", (_req, res) => {
  try {
    const leaves = db.map((r) => leafFor(r.dni, r.salt));
    res.json({ leaves });
  } catch (e) {
    console.error("/leaves error:", e);
    res.status(500).json({ error: "leaves-failed" });
  }
});

// Salud
app.get("/health", (_req, res) => res.json({ ok: true, count: db.length }));

const PORT = 4000;
app.listen(PORT, () => console.log(`RNP-mock http://127.0.0.1:${PORT}`));
