const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const db = JSON.parse(fs.readFileSync(path.join(__dirname, "db.json"), "utf8"));

// leaf(dni, salt, centerId, mesaId)
function leafFor(dni, saltHex, centerId, mesaId) {
  const dniHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(dni));
  return ethers.utils.solidityKeccak256(
    ["bytes32","bytes32","uint32","uint32"],
    [saltHex, dniHash, centerId, mesaId]
  );
}

// POST /verify {dni, fingerprint} -> {match, centerId, mesaId, leaf}
app.post("/verify", (req, res) => {
    const { dni, fingerprint } = req.body || {};
    if (!dni || !fingerprint) return res.status(400).json({ error: "dni y fingerprint requeridos" });
    const rec = db.find(x => x.dni === dni);
    if (!rec) return res.json({ match: false });
    const match = rec.fingerprint === fingerprint;
    if (!match) return res.json({ match: false });
  
    // Devolvemos el salt para que el relayer derive un nulificador ciego
    return res.json({ match: true, salt: rec.salt });
  });

// GET /leaves?centerId=..&mesaId=.. -> hojas de esa mesa
app.get("/leaves", (req, res) => {
  const centerId = req.query.centerId ? parseInt(req.query.centerId) : undefined;
  const mesaId   = req.query.mesaId   ? parseInt(req.query.mesaId)   : undefined;
  let rows = db;
  if (centerId !== undefined) rows = rows.filter(r => r.centerId === centerId);
  if (mesaId !== undefined)   rows = rows.filter(r => r.mesaId === mesaId);
  const leaves = rows.map(r => leafFor(r.dni, r.salt, r.centerId, r.mesaId));
  res.json({ leaves });
});

// (Opcional) catálogos para UI admin
app.get("/centers", (_req, res) => {
  // demo: deriva de db; en real sería una tabla de centros
  const centers = Array.from(new Set(db.map(r => r.centerId))).map(id => ({ centerId: id, name: `Centro ${id}` }));
  res.json({ centers });
});

app.get("/mesas", (req, res) => {
  const centerId = req.query.centerId ? parseInt(req.query.centerId) : undefined;
  if (centerId === undefined) return res.status(400).json({ error: "centerId requerido" });
  const mesas = Array.from(new Set(db.filter(r => r.centerId === centerId).map(r => r.mesaId))).sort();
  res.json({ mesas });
});

const PORT = 4000;
app.listen(PORT, () => console.log(`RNP-mock http://localhost:${PORT}`));
