# Consented Link Tracker — Admin Login (Railway Ready)

Aplikasi pelacak link yang meminta **izin lokasi** (legal & privasi). Admin dashboard dilindungi **username/password**.

## Jalankan Lokal
```bash
cp .env.example .env   # ubah ADMIN_USER & ADMIN_PASS
npm install
npm start
# buka http://localhost:3000 (browser akan minta username/password)
```

## Deploy ke Railway (langkah ringkas)
1. Buat repo GitHub baru, upload isi folder proyek ini.
2. Buka https://railway.app → New Project → Deploy from GitHub → pilih repo.
3. Setelah dibuat, buka tab **Variables** lalu tambahkan:
   - `ADMIN_USER` = (username admin kamu)
   - `ADMIN_PASS` = (password kuat)
   - (opsional) `PORT` = 3000
4. Railway otomatis `npm install` dan `npm start`.
5. Buka domain publik dari Railway → login pakai kredensial admin.

## Cara Pakai
- Dashboard admin (/) → buat link baru → dapat **Tracking URL** `/l/:slug`.
- Bagikan Tracking URL itu ke pengunjung.
- Pengunjung melihat halaman izin lokasi; apapun pilihannya, tetap diarahkan ke target.
- Izin diberikan → koordinat (lat, lng, akurasi) tersimpan.
- Riwayat kunjungan terlihat di halaman detail link.

## Keamanan & Privasi
- Gunakan HTTPS (Railway menyediakan otomatis).
- Ganti `ADMIN_PASS` dengan password kuat (panjang, unik).
- Tambahkan halaman Kebijakan Privasi sesuai regulasi (UU PDP/ITE).

— Dibuat: 2025-08-17T15:59:39.064682Z