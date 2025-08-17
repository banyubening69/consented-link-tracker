/**
 * Consented Link Tracker (with Admin Login)
 * -----------------------------------------
 * - Admin dashboard protected by HTTP Basic Auth (username/password via .env)
 * - Create short links, view visits; landing page asks for geolocation consent
 * - Legal & privacy-respecting: collects location only if user consents
 *
 * Public endpoints:
 *   GET /l/:slug      → landing that asks for location permission then redirects
 *   POST /api/visit   → update visit with (consent, lat, lng, accuracy)
 *   GET /health       → health check
 *
 * Admin endpoints (auth required):
 *   GET /             → dashboard
 *   POST /create      → create new link
 *   GET /links/:slug  → link details + visit logs
 */
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");
const { customAlphabet } = require("nanoid");
const basicAuth = require("express-basic-auth");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "data.sqlite");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 7);

app.use(bodyParser.json({ limit: "1mb" }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/static", express.static(path.join(__dirname, "public")));

// --- Security headers (basic) ---
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=()"); // overridden inline when needed
  next();
});

// --- Utility helpers ---
function getClientIP(req) {
  const xf = req.headers["x-forwarded-for"]; // if behind proxy
  const ip = (xf ? xf.split(",")[0] : req.socket.remoteAddress || "").trim();
  return ip.replace("::ffff:", "");
}

function maskIP(ip) {
  if (!ip) return "";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const parts = ip.split(".");
    parts[3] = "0";
    return parts.join(".") + " (masked)";
  }
  if (ip.includes(":")) {
    const segs = ip.split(":");
    return segs.slice(0, 4).join(":") + ":**** (masked)";
  }
  return ip;
}

function nowISO() {
  return new Date().toISOString();
}

// --- DB init ---
let db; (async () => {
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      target_url TEXT NOT NULL,
      title TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      referer TEXT,
      consented INTEGER DEFAULT 0,
      latitude REAL,
      longitude REAL,
      accuracy REAL,
      FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
    );
  `);
})();

// --- HTML templates ---
function layout({ title = "Consented Link Tracker", body = "", extraHead = "" }) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root { --bg:#0b1020; --card:#121a33; --muted:#8da2c6; --text:#e7ecf8; --accent:#4f7cff; --good:#1bbb70; }
    html,body { margin:0; padding:0; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background: var(--bg); color: var(--text); }
    .container { max-width: 980px; margin: 32px auto; padding: 0 16px; }
    .card { background: var(--card); border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,.25); padding: 18px; }
    h1 { font-size: 26px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin: 16px 0 8px; color: var(--muted); }
    a { color: var(--accent); text-decoration: none; }
    .muted { color: var(--muted); }
    .btn { background: var(--accent); color: white; border:0; padding: 10px 14px; border-radius: 10px; font-weight: 600; cursor: pointer; }
    .btn.secondary { background: #1f2a4d; }
    input, textarea { width: 100%; background: #0c142b; color: var(--text); border: 1px solid #1c2a52; border-radius: 10px; padding: 10px 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #1c2a52; vertical-align: top; }
    .pill { display:inline-block; padding: 4px 8px; border-radius: 999px; font-size: 12px; background:#10204a; color:#9eb7ff; }
    .success { color: var(--good); }
    .code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background:#0b1533; padding:6px 8px; border-radius:6px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
  </style>
  ${extraHead}
</head>
<body>
  <div class="container">
    ${body}
  </div>
</body>
</html>`;
}

// --- Admin auth middleware ---
const adminAuth = basicAuth({
  users: { [ADMIN_USER]: ADMIN_PASS },
  challenge: true,
  realm: "ConsentedLinkTracker",
  unauthorizedResponse: { error: "Unauthorized" }
});

// --- Admin: Dashboard
app.get("/", adminAuth, async (req, res) => {
  const links = await db.all("SELECT * FROM links ORDER BY id DESC LIMIT 50");
  const body = `
    <div class="grid">
      <div class="card">
        <h1>Consented Link Tracker</h1>
        <p class="muted">Dashboard admin (terlindungi). Pengunjung publik hanya mengakses link /l/:slug.</p>
        <h2>Buat Link Baru</h2>
        <form method="POST" action="/create">
          <label>Judul (opsional)</label>
          <input name="title" placeholder="Contoh: Promo Agustus"/>
          <div style="height:8px"></div>
          <label>Target URL</label>
          <input name="target_url" required placeholder="https://contoh.com/halaman" />
          <div style="height:8px"></div>
          <button class="btn" type="submit">Buat Link</button>
        </form>
        <p class="muted" style="margin-top:8px">Pastikan Anda telah mengatur ADMIN_USER & ADMIN_PASS di environment.</p>
      </div>
      <div class="card">
        <h2>Link Terbaru</h2>
        ${links.length === 0 ? `<p class="muted">Belum ada link.</p>` : `
          <table>
            <thead>
              <tr><th>Judul</th><th>Slug</th><th>Dibuat</th><th></th></tr>
            </thead>
            <tbody>
              ${links.map(l => `
                <tr>
                  <td>${l.title || "-"}</td>
                  <td><span class="code">${l.slug}</span></td>
                  <td>${new Date(l.created_at).toLocaleString()}</td>
                  <td><a class="pill" href="/links/${l.slug}">Lihat</a></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        `}
      </div>
    </div>
  `;
  res.send(layout({ body }));
});

// --- Admin: Create new link
app.post("/create", adminAuth, async (req, res) => {
  try {
    const { target_url, title } = req.body;
    if (!target_url || !/^https?:\/\//i.test(target_url)) {
      return res.status(400).send("Target URL wajib diawali http(s)://");
    }
    const slug = nanoid();
    await db.run(
      "INSERT INTO links (slug, target_url, title, created_at) VALUES (?,?,?,?)",
      slug, target_url, title || null, nowISO()
    );
    res.redirect(`/links/${slug}`);
  } catch (e) {
    console.error(e);
    res.status(500).send("Gagal membuat link");
  }
});

// --- Admin: Link detail page (stats)
app.get("/links/:slug", adminAuth, async (req, res) => {
  const { slug } = req.params;
  const link = await db.get("SELECT * FROM links WHERE slug = ?", slug);
  if (!link) return res.status(404).send("Link tidak ditemukan");
  const visits = await db.all("SELECT * FROM visits WHERE link_id = ? ORDER BY id DESC LIMIT 200", link.id);
  const trackURL = `${req.protocol}://${req.get("host")}/l/${link.slug}`;

  const body = `
    <div class="card">
      <h1>Detail Link</h1>
      <p><strong>Judul:</strong> ${link.title || "-"}</p>
      <p><strong>Target:</strong> <a href="${link.target_url}" target="_blank">${link.target_url}</a></p>
      <p><strong>Tracking URL:</strong> <span class="code">${trackURL}</span></p>
      <p class="muted">Bagikan URL di atas. Pengunjung akan melihat halaman izin lokasi, lalu diarahkan ke target.</p>
    </div>
    <div class="card">
      <h2>Riwayat Kunjungan</h2>
      ${visits.length === 0 ? `<p class="muted">Belum ada kunjungan.</p>` : `
        <table>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>IP</th>
              <th>User Agent</th>
              <th>Referrer</th>
              <th>Lokasi</th>
              <th>Izin</th>
            </tr>
          </thead>
          <tbody>
            ${visits.map(v => `
              <tr>
                <td>${new Date(v.created_at).toLocaleString()}</td>
                <td>${maskIP(v.ip)}</td>
                <td>${(v.user_agent || "").slice(0,140)}</td>
                <td>${v.referer || "-"}</td>
                <td>${(v.latitude && v.longitude) ? `${v.latitude.toFixed(5)}, ${v.longitude.toFixed(5)} (±${v.accuracy || "?"}m)` : "-"}</td>
                <td>${v.consented ? "<span class=success>Ya</span>" : "Tidak / N/A"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `}
    </div>
    <div class="card">
      <h2>Kebijakan Privasi (Contoh)</h2>
      <p class="muted">Sesuaikan dengan kebutuhan dan hukum setempat. Jelaskan apa yang Anda kumpulkan (IP, UA, waktu, referrer, koordinat jika setuju) dan untuk tujuan apa.</p>
    </div>
  `;
  res.send(layout({ title: `Link ${slug}`, body }));
});

// --- Public: Visitor landing (asks consent)
app.get("/l/:slug", async (req, res) => {
  const { slug } = req.params;
  const link = await db.get("SELECT * FROM links WHERE slug = ?", slug);
  if (!link) return res.status(404).send("Link tidak ditemukan");

  const clientIP = getClientIP(req);
  const ua = req.headers["user-agent"] || "";
  const referer = req.headers["referer"] || req.headers["referrer"] || "";

  // Create a preliminary visit row (without location). We return its id to the client via JS.
  const result = await db.run(
    "INSERT INTO visits (link_id, created_at, ip, user_agent, referer) VALUES (?,?,?,?,?)",
    link.id, nowISO(), clientIP, ua, referer
  );
  const visitId = result.lastID;

  const page = layout({
    title: "Izin Lokasi",
    extraHead: `
      <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
      <meta http-equiv="Pragma" content="no-cache" />
      <meta http-equiv="Expires" content="0" />
      <script>
        const visitId = ${JSON.stringify(visitId)};
        const slug = ${JSON.stringify(slug)};
        const targetURL = ${JSON.stringify(link.target_url)};

        async function sendVisit(payload) {
          try {
            await fetch('/api/visit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          } catch (e) { /* ignore */ }
        }

        function go() { window.location.href = targetURL; }

        async function requestLocation() {
          if (!('geolocation' in navigator)) {
            await sendVisit({ visitId, slug, consented: false, reason: 'not_supported' });
            return go();
          }
          navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude, accuracy } = pos.coords || {};
            await sendVisit({ visitId, slug, consented: true, latitude, longitude, accuracy });
            go();
          }, async (err) => {
            await sendVisit({ visitId, slug, consented: false, reason: err && err.code });
            go();
          }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
        }

        window.addEventListener('DOMContentLoaded', () => {
          const btn = document.getElementById('allowBtn');
          btn.addEventListener('click', () => {
            btn.disabled = true; btn.textContent = 'Meminta izin...';
            requestLocation();
          });
          document.getElementById('skipBtn').addEventListener('click', async () => {
            await sendVisit({ visitId, slug, consented: false, reason: 'skipped' });
            go();
          });
        });
      </script>
    `,
    body: `
      <div class="card">
        <h1>Meminta Izin Lokasi</h1>
        <p>Agar kami bisa menampilkan konten yang relevan, kami meminta <strong>izin lokasi</strong> Anda. 
        Menekan tombol di bawah akan memunculkan pop-up izin dari browser. Anda bisa <em>izinkan</em> atau <em>tolak</em>. Apapun pilihan Anda, Anda tetap akan diarahkan ke halaman tujuan.</p>
        <ul class="muted">
          <li>Data yang dikumpulkan: waktu akses, IP (dimasking), browser, referrer, dan <strong>koordinat</strong> jika Anda setuju.</li>
          <li>Tujuan: analitik kunjungan & personalisasi konten.</li>
          <li>Anda bisa menolak dan tetap melanjutkan.</li>
        </ul>
        <div style="display:flex; gap:10px; margin-top:10px;">
          <button id="allowBtn" class="btn">Izinkan & Lanjutkan</button>
          <button id="skipBtn" class="btn secondary">Lanjutkan tanpa lokasi</button>
        </div>
      </div>
    `
  });

  res.setHeader("Cache-Control", "no-store");
  res.send(page);
});

// --- Public: API to update visit with consent/location
app.post("/api/visit", async (req, res) => {
  try {
    const { visitId, consented, latitude, longitude, accuracy } = req.body || {};
    if (!visitId) return res.status(400).json({ ok: false });
    await db.run(
      "UPDATE visits SET consented = ?, latitude = ?, longitude = ?, accuracy = ? WHERE id = ?",
      consented ? 1 : 0,
      typeof latitude === "number" ? latitude : null,
      typeof longitude === "number" ? longitude : null,
      typeof accuracy === "number" ? accuracy : null,
      visitId
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});

// --- Health
app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ Consented Link Tracker (admin) running at http://localhost:${PORT}`);
  console.log(`🔐 Admin user: ${ADMIN_USER}`);
});
