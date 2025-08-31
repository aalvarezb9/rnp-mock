// rnp-mock/index.js (CommonJS)
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const app = express();
app.use(cors());
app.use(express.json());

const DB_PATH = path.join(__dirname, "db.json");
const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));

// cache por elección
const cache = new Map(); // key: electionId -> {leaves, tree, root}

function leafForElection(dni, saltHex, electionId) {
  if (!dni || !saltHex) throw new Error("dni o salt faltante");
  if (!/^0x[0-9a-fA-F]{64}$/.test(saltHex)) throw new Error("salt inválido");
  const dniHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(String(dni)));
  return ethers.utils.solidityKeccak256(
    ["bytes32", "bytes32", "uint256"],
    [saltHex, dniHash, ethers.BigNumber.from(electionId)]
  );
}

function ensureTree(electionId) {
  const id = Number(electionId || 1);
  const cached = cache.get(id);
  if (cached) return cached;

  const leaves = db.map((r) => leafForElection(r.dni, r.salt, id));
  const leavesBuf = leaves.map((h) => Buffer.from(h.slice(2), "hex"));
  const tree = new MerkleTree(leavesBuf, keccak256, { sortPairs: true });
  const root = "0x" + tree.getRoot().toString("hex");
  const entry = { leaves, tree, root };
  cache.set(id, entry);
  return entry;
}

// salud
app.get("/health", (_req, res) => res.json({ ok: true, voters: db.length }));

// root público por elección
app.get("/root", (req, res) => {
  try {
    const electionId = Number(req.query.electionId || "1");
    const { root } = ensureTree(electionId);
    res.json({ electionId, root });
  } catch (e) {
    res.status(500).json({ error: "root-failed", detail: String(e) });
  }
});

// prueba privada: no devuelve salt, solo leaf/proof/root
app.post("/proof", (req, res) => {
  try {
    const { dni, fingerprint, electionId } = req.body || {};
    if (!dni || !fingerprint) return res.status(400).json({ error: "dni y fingerprint requeridos" });
    const rec = db.find((x) => x.dni === String(dni));
    if (!rec || rec.fingerprint !== String(fingerprint)) {
      return res.status(401).json({ error: "verificacion-fallida" });
    }
    const id = Number(electionId || 1);
    const { tree, root } = ensureTree(id);

    const dniHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(String(dni)));
    const leaf = ethers.utils.solidityKeccak256(["bytes32","bytes32","uint256"], [rec.salt, dniHash, id]);

    const proof = tree.getHexProof(Buffer.from(leaf.slice(2), "hex"));
    if (!proof.length) return res.status(400).json({ error: "leaf-no-en-padron" });

    // sin salt, sin dni
    res.json({ electionId: id, root, leaf, proof });
  } catch (e) {
    console.error("/proof error:", e);
    res.status(500).json({ error: "proof-failed", detail: String(e) });
  }
});

// elimina o no expongas /leaves en prod

const PORT = 4000;
app.listen(PORT, () => console.log(`RNP http://127.0.0.1:${PORT}`));
