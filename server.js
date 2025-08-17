const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Auth
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

// Basic auth middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/l/')) return next(); // skip tracking links

  const auth = req.headers['authorization'];
  if (!auth) {
    res.set('WWW-Authenticate', 'Basic realm="Dashboard"');
    return res.status(401).send('Authentication required.');
  }

  const b64auth = auth.split(' ')[1] || '';
  const [user, pass] = Buffer.from(b64auth, 'base64').toString().split(':');
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Dashboard"');
  return res.status(401).send('Authentication failed.');
});

// In-memory storage
let links = [];
let logs = [];

// Dashboard
app.get('/', (req, res) => {
  res.send('<h2>Consented Link Tracker</h2><p>Gunakan endpoint /create untuk buat link</p>');
});

// Create link
app.post('/create', (req, res) => {
  const { slug } = req.body;
  if (!slug) return res.status(400).send("Slug diperlukan");

  const newLink = { slug, url: `/l/${slug}` };
  links.push(newLink);
  res.json(newLink);
});

// Tracking endpoint
app.get('/l/:slug', (req, res) => {
  const { slug } = req.params;
  const log = {
    slug,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    time: new Date().toISOString(),
  };
  logs.push(log);

  res.send(`<h3>Halo! Anda membuka link: ${slug}</h3><p>Lokasi hanya bisa dicatat jika diizinkan browser.</p>`);
});

// Logs endpoint
app.get('/logs', (req, res) => {
  res.json(logs);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
