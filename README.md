# Consented Link Tracker (Railway Ready)

## 🚀 Cara Deploy ke Railway

1. Fork atau upload repo ini ke GitHub.
2. Buka [Railway](https://railway.app).
3. Buat **New Project** → Deploy from GitHub.
4. Tambahkan **Environment Variables** di Railway:
   - `ADMIN_USER` → admin
   - `ADMIN_PASS` → Rahasia2025!
   - (opsional) `PORT` → 3000
5. Railway otomatis build dan jalanin app.
6. Akses URL Railway → login pakai user & pass di atas.

## 🔑 Login
- Username: dari `ADMIN_USER`
- Password: dari `ADMIN_PASS`

## 📌 Endpoint
- `/` → dashboard
- `/create` → buat link (POST, body: `{ "slug": "nama" }`)
- `/l/:slug` → link tracking publik
- `/logs` → lihat semua log
