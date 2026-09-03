/**
 * ChallengeMate backend — Cloudflare Worker.
 *
 * Talks to Google Sheets via the Sheets REST API using a service account.
 * Auth is done manually with the Web Crypto API (built into Workers),
 * because the Node.js `googleapis` / `google-auth-library` packages do
 * NOT run in Cloudflare Workers.
 *
 * Setup:
 *   1. Fill in serviceAccountKey (paste the downloaded key JSON values).
 *   2. Fill in SPREADSHEET_ID (the long id in your Sheet's URL).
 *   3. Share the Sheet with the service account's client_email (Editor).
 *   4. npm install wrangler && wrangler deploy
 *      (or paste into the Workers dashboard).
 */

// ---------- Configuration ----------
const serviceAccountKey = {
  // TODO: paste the values from your downloaded service account JSON key
  private_key: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  client_email: "your-service-account@your-project.iam.gserviceaccount.com",
  token_uri: "https://oauth2.googleapis.com/token",
};

const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

// ---------- Auth (Web Crypto, no external libs) ----------

function base64UrlEncode(input) {
  let b64;
  if (typeof input === "string") {
    b64 = btoa(unescape(encodeURIComponent(input)));
  } else {
    b64 = btoa(String.fromCharCode.apply(null, input));
  }
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getPrivateKey() {
  const pem = serviceAccountKey.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "")
    .trim();
  const binary = atob(pem);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccountKey.client_email,
    scope: SCOPES,
    aud: serviceAccountKey.token_uri,
    exp: now + 3600,
    iat: now,
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload)
  )}`;

  const key = await getPrivateKey();
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const res = await fetch(serviceAccountKey.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

// ---------- Sheets helpers ----------

async function getSheetData(range) {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Sheets read failed: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  return data.values || [];
}

async function appendRow(range, values) {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [values] }),
  });

  if (!response.ok) {
    throw new Error(`Sheets append failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function updateCell(range, value) {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [[value]] }),
  });

  if (!response.ok) {
    throw new Error(`Sheets update failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

// ---------- Business logic ----------

async function updatePenaltyBalances(userId, amountChange) {
  const balances = await getSheetData("Penalties!A:B");

  for (let i = 1; i < balances.length; i++) {
    const row = balances[i];
    if (row[0] === userId) {
      const currentBalance = parseFloat(row[1]) || 0;
      const newBalance = currentBalance + amountChange;
      await updateCell(`Penalties!B${i + 1}`, newBalance);
      break;
    }
  }
}

function calculateStats(transactions) {
  const stats = {};

  for (let i = 1; i < transactions.length; i++) {
    const row = transactions[i];
    const eventType = row[1];
    const userId = row[2];

    if (!stats[userId]) {
      stats[userId] = { total_penalties: 0, total_paid: 0 };
    }

    if (eventType === "penalty_paid") {
      stats[userId].total_paid += parseFloat(row[4]) || 0;
    } else if (eventType === "penalty_added") {
      stats[userId].total_penalties += parseFloat(row[4]) || 0;
    }
  }

  return stats;
}

// ---------- Worker entrypoint ----------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight for browser calls
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    };

    try {
      if (path === "/webhook" && request.method === "POST") {
        const payload = await request.json();
        const { event_type, user_id, friend_id, amount, timestamp } = payload;

        await appendRow("Transactions!A:F", [
          new Date().toISOString(),
          event_type,
          user_id,
          friend_id || "",
          amount || "",
          timestamp || new Date().toISOString(),
        ]);

        if (event_type === "penalty_paid") {
          await updatePenaltyBalances(user_id, -amount);
        }

        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      if (path.startsWith("/stats") && request.method === "GET") {
        const transactions = await getSheetData("Transactions!A:F");
        const stats = calculateStats(transactions);
        return new Response(JSON.stringify(stats), { headers: cors });
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: cors,
      });
    }
  },
};
