# GrabFood Menu Scraper

Scraper untuk mengambil data menu dari halaman restoran GrabFood menggunakan Puppeteer.

---

## Pendekatan

Pendekatan utama yang digunakan adalah **Network Interception**, bukan DOM scraping biasa.

GrabFood adalah dynamic website (Next.js + React) yang merender konten via JavaScript. Jika HTML-nya di-scrape langsung, data menu tidak akan ditemukan karena belum ter-render saat halaman pertama kali dimuat.

Solusinya: Puppeteer digunakan untuk membuka halaman seperti browser sungguhan, lalu **mengintersep API call** yang dibuat halaman tersebut ke server GrabFood secara otomatis.

```
Browser buka halaman
    → GrabFood frontend request data ke:
      portal.grab.com/foodweb/guest/v2/merchants/{id}
    → Response JSON ditangkap
    → Di-parse dan disimpan ke CSV / JSON
```

Pendekatan ini lebih reliable dibanding DOM scraping karena tidak bergantung pada class name HTML yang bisa berubah setiap deploy, dan data yang didapat langsung dari sumbernya (API).

---

## Tools & Teknologi

| Tool | Fungsi |
|---|---|
| **Node.js** | Runtime utama |
| **Puppeteer** | Headless browser — buka halaman & intercept network |
| **csv-writer** | Export hasil ke format CSV (siap import Google Sheet) |

---

## Data yang Diambil

Untuk setiap menu, scraper mengambil informasi berikut:

| Kolom | Keterangan |
|---|---|
| Nama outlet | Nama restoran |
| Nama kategori | Kategori menu (misal: Signature Katsu, Extra Sauce) |
| Nama menu | Nama item menu |
| Deskripsi menu | Deskripsi singkat item |
| Harga sebelum promo | Harga normal |
| Harga setelah promo | Harga setelah diskon (jika ada) |
| Nominal atau persentase promo | Besar diskon dalam persen (jika ada) |
| Ketersediaan menu | Tersedia / Tidak tersedia |

---

## Instalasi

```bash
npm install
```

---

## Cara Pakai

### Default URL (sudah dikonfigurasi)
```bash
node scraper.js
```

### URL custom
```bash
node scraper.js "https://food.grab.com/id/id/restaurant/<nama-restoran>/<id>"
```

### Via environment variable
```bash
GRAB_URL="https://food.grab.com/id/id/restaurant/..." node scraper.js
```

---

## Output

Setelah scraper selesai, dua file akan dibuat:

- `menu_data.csv` — siap di-import ke Google Sheet
- `menu_data.json` — data mentah berformat JSON

### Contoh output terminal
```
Scraping: https://food.grab.com/id/id/restaurant/...

Captured API: https://portal.grab.com/foodweb/guest/v2/merchants/6-C7EYGBJDME3JRN
Outlet  : Ayam Katsu Katsunami, Lokarasa - Citraland
Kategori: 12  |  Menu: 43

=================================================================
Outlet    : Ayam Katsu Katsunami, Lokarasa - Citraland
Kategori  : 12  |  Total menu: 43
=================================================================

▶ Signature Katsu
  • Golden Crispy Katsu
    Harga : Rp 37.000
    Status: Tersedia
    Desc  : Tanpa Nasi + Chicken Katsu Renyah + Sayur Segar...
```

---

## Tantangan yang Ditemui

**1. Class name tidak bisa dipakai sebagai selector**
GrabFood menggunakan CSS Modules dengan hash unik (contoh: `menuItem___3pj3B`) yang bisa berubah setiap deploy. DOM scraping murni tidak akan stabil.

→ Solusi: Beralih ke network interception untuk mendapat data langsung dari API.

**2. Halaman butuh waktu load**
GrabFood memuat data secara async setelah halaman terbuka.

→ Solusi: Menggunakan `Promise` yang resolve otomatis saat response API tertangkap, dengan timeout 10 detik sebagai fallback.

**3. Restaurant ID di URL**
Format URL GrabFood menyertakan restaurant ID di akhir path yang menjadi key untuk API call-nya.

→ Solusi: Puppeteer mengintersep URL API secara otomatis sehingga ID tidak perlu di-extract manual.

---

## Pertanyaan Tambahan — Data Eksklusif Mobile App (ShopeeFood)

Jika data hanya tersedia di dalam mobile app, pendekatan yang digunakan:

**1. HTTP Traffic Interception (Utama)**
Install Charles Proxy / mitmproxy di laptop, set proxy di HP, lalu buka app. Semua API call akan tertangkap termasuk endpoint, headers, dan auth token. Setelah endpoint diketahui, request bisa di-replay via script.

**2. Android APK Reverse Engineering**
Jika API ter-obfuscate, APK bisa di-decompile menggunakan `apktool` / `jadx` untuk menemukan endpoint dan logic signature request-nya.

**3. Appium Automation**
Jika dua pendekatan di atas tidak memungkinkan, gunakan Appium untuk mengotomasi interaksi di emulator Android — mirip seperti Puppeteer tapi untuk mobile app.

Rekomendasi: mulai dari traffic interception karena paling cepat dan biasanya sudah cukup.
