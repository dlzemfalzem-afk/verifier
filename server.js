const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

const pending = {};

function randomAmount() {
  return Math.floor(Math.random() * 9000) + 1000;
}

async function getBalance(ign) {
  const url = `https://www.donutstats.net/player-stats-leaderboard/${encodeURIComponent(ign)}`;
  const res = await axios.get(url);
  const $ = cheerio.load(res.data);
  const text = $("body").text();

  const match = text.match(/Money\s+\$?([0-9.,KMB]+)/i);
  if (!match) return null;

  let val = match[1].replace(/,/g, "").toUpperCase();
  let num = parseFloat(val);

  if (val.includes("K")) num *= 1_000;
  if (val.includes("M")) num *= 1_000_000;
  if (val.includes("B")) num *= 1_000_000_000;

  return Math.floor(num);
}

app.get("/", (req, res) => {
  res.send("Verifier is online");
});

app.get("/verify", async (req, res) => {
  try {
    const ign = req.query.ign;
    if (!ign) return res.send("Missing IGN");

    const balance = await getBalance(ign);
    if (!balance) return res.send("Failed to read balance");

    const amount = randomAmount();

    pending[ign.toLowerCase()] = {
      start: balance,
      amount
    };

    res.send(`
      <h1>Verification started</h1>
      <p>IGN: ${ign}</p>
      <p>Pay this amount in-game: <b>${amount}</b></p>
      <p>After paying, open:</p>
      <p><a href="/check?ign=${encodeURIComponent(ign)}">Check verification</a></p>
    `);
  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});

app.get("/check", async (req, res) => {
  try {
    const ign = req.query.ign;
    if (!ign) return res.send("Missing IGN");

    const data = pending[ign.toLowerCase()];
    if (!data) return res.send("No active verification");

    const current = await getBalance(ign);
    if (current == null) return res.send("Failed to read current balance");

    const diff = data.start - current;

    if (diff === data.amount) {
      delete pending[ign.toLowerCase()];
      return res.send("✅ VERIFIED");
    }

    res.send(`❌ Not verified yet. Expected drop: ${data.amount}, current drop: ${diff}`);
  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});