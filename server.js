const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

const pending = {};

function randomAmount() {
  return Math.floor(Math.random() * 9000) + 1000;
}

function parseMoneyValue(raw) {
  if (!raw) return null;

  let val = raw.replace(/\$/g, "").replace(/,/g, "").trim().toUpperCase();

  const match = val.match(/^([0-9]+(?:\.[0-9]+)?)([KMB]?)$/);
  if (!match) return null;

  let num = parseFloat(match[1]);
  const suffix = match[2];

  if (suffix === "K") num *= 1_000;
  if (suffix === "M") num *= 1_000_000;
  if (suffix === "B") num *= 1_000_000_000;

  return Math.floor(num);
}

async function getBalance(ign) {
  const url = `https://www.donutstats.net/player-stats-leaderboard/${encodeURIComponent(ign)}`;

  const response = await axios.get(url, {
    timeout: 15000,
    maxRedirects: 5,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Referer": "https://www.donutstats.net/",
      "Upgrade-Insecure-Requests": "1"
    },
    validateStatus: (status) => status >= 200 && status < 500
  });

  if (response.status === 403) {
    throw new Error("Donut Stats blocked this host with a 403.");
  }

  if (response.status !== 200) {
    throw new Error(`Donut Stats returned status ${response.status}.`);
  }

  const $ = cheerio.load(response.data);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();

  // Try to match common patterns
  const patterns = [
    /Money\s+\$?([0-9]+(?:\.[0-9]+)?[KMB]?)/i,
    /\$([0-9]+(?:\.[0-9]+)?[KMB]?)\s+Money/i
  ];

  let moneyRaw = null;

  for (const pattern of patterns) {
    const match = bodyText.match(pattern);
    if (match && match[1]) {
      moneyRaw = match[1];
      break;
    }
  }

  if (!moneyRaw) {
    throw new Error("Could not find Money on the page.");
  }

  const parsed = parseMoneyValue(moneyRaw);
  if (parsed === null) {
    throw new Error(`Could not parse Money value: ${moneyRaw}`);
  }

  return parsed;
}

app.get("/", (req, res) => {
  res.send("Verifier is online");
});

app.get("/healthz", (req, res) => {
  res.status(200).send("ok");
});

app.get("/verify", async (req, res) => {
  try {
    const ign = (req.query.ign || "").trim();

    if (!ign) {
      return res.status(400).send("Missing IGN");
    }

    const balance = await getBalance(ign);
    const amount = randomAmount();

    pending[ign.toLowerCase()] = {
      start: balance,
      amount,
      createdAt: Date.now()
    };

    res.send(`
      <html>
        <head>
          <title>Verification Started</title>
        </head>
        <body style="font-family: Arial, sans-serif; padding: 30px;">
          <h1>Verification started</h1>
          <p><b>IGN:</b> ${ign}</p>
          <p><b>Starting balance:</b> $${balance.toLocaleString()}</p>
          <p><b>Pay this amount in-game:</b> $${amount.toLocaleString()}</p>
          <p>After paying, open this link:</p>
          <p>
            <a href="/check?ign=${encodeURIComponent(ign)}">
              Check verification
            </a>
          </p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("/verify error:", err.message);
    res.status(500).send(`Error: ${err.message}`);
  }
});

app.get("/check", async (req, res) => {
  try {
    const ign = (req.query.ign || "").trim();

    if (!ign) {
      return res.status(400).send("Missing IGN");
    }

    const key = ign.toLowerCase();
    const data = pending[key];

    if (!data) {
      return res.status(404).send("No active verification for this IGN");
    }

    const currentBalance = await getBalance(ign);
    const diff = data.start - currentBalance;

    if (diff === data.amount) {
      delete pending[key];

      return res.send(`
        <html>
          <head>
            <title>Verified</title>
          </head>
          <body style="font-family: Arial, sans-serif; padding: 30px;">
            <h1>✅ VERIFIED</h1>
            <p><b>IGN:</b> ${ign}</p>
            <p><b>Detected payment:</b> $${data.amount.toLocaleString()}</p>
          </body>
        </html>
      `);
    }

    res.send(`
      <html>
        <head>
          <title>Not Verified Yet</title>
        </head>
        <body style="font-family: Arial, sans-serif; padding: 30px;">
          <h1>❌ Not verified yet</h1>
          <p><b>IGN:</b> ${ign}</p>
          <p><b>Expected drop:</b> $${data.amount.toLocaleString()}</p>
          <p><b>Current drop:</b> $${diff.toLocaleString()}</p>
          <p><b>Current balance:</b> $${currentBalance.toLocaleString()}</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("/check error:", err.message);
    res.status(500).send(`Error: ${err.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});