const express = require("express");
const app = express();

// Railway kasih PORT lewat env
const PORT = process.env.PORT || 3000;

// Route utama (buat tes)
app.get("/", (req, res) => {
  res.send("✅ Aplikasi sudah jalan di Railway!");
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
