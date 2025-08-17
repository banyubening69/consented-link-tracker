const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

// Pool koneksi ke PostgreSQL Railway (gunakan variabel env DATABASE_URL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Buat tabel jika belum ada
(async () => {
  const client = await pool.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS clicks (
      id SERIAL PRIMARY KEY,
      link VARCHAR(255) NOT NULL,
      total INT DEFAULT 0
    )
  `);
  client.release();
})();

// Serve file HTML
app.use(express.static(path.join(__dirname, "views")));

// Endpoint API tracking
app.get("/track/:link", async (req, res) => {
  const link = req.params.link;
  const client = await pool.connect();
  try {
    let result = await client.query("SELECT * FROM clicks WHERE link = $1", [link]);
    if (result.rows.length === 0) {
      await client.query("INSERT INTO clicks (link, total) VALUES ($1, 1)", [link]);
      res.json({ message: `Link ${link} diklik!`, totalClicks: 1 });
    } else {
      let total = result.rows[0].total + 1;
      await client.query("UPDATE clicks SET total = $1 WHERE link = $2", [total, link]);
      res.json({ message: `Link ${link} diklik!`, totalClicks: total });
    }
  } finally {
    client.release();
  }
});

// Endpoint lihat statistik semua
app.get("/stats", async (req, res) => {
  const client = await pool.connect();
  try {
    let result = await client.query("SELECT link, total FROM clicks");
    res.json(result.rows);
  } finally {
    client.release();
  }
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
