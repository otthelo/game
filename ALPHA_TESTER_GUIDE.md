# Panduan Pengujian Alpha (Alpha Tester Guide)
**Izud Pixel Realm MMORPG — Alpha Release**

Selamat datang di pengujian Alpha **Izud Pixel Realm MMORPG**! Dokumen ini dirancang sebagai panduan komprehensif bagi penguji (tester) internal maupun komunitas untuk menguji stabilitas, fitur, keamanan, dan performa game.

---

## 1. Persiapan & Menjalankan Game

### Prasyarat
- **Node.js**: Versi 20 atau lebih baru (disarankan v22/v24).
- **Web Browser**: Google Chrome, Microsoft Edge, atau Mozilla Firefox versi modern.

### Menjalankan Server & Client
1. **Jalankan Game Server**:
   ```bash
   cd server
   npm install       # jika pertama kali
   npm run build     # kompilasi TypeScript
   npm start         # atau npm run dev
   ```
   *Server akan berjalan di `http://localhost:2567` (WebSocket + HTTP API).*

2. **Jalankan Web Client**:
   Buka terminal terpisah:
   ```bash
   cd client
   npm install       # jika pertama kali
   npm run dev
   ```
   *Buka URL yang ditampilkan (biasanya `http://localhost:5173`) di browser Anda.*

---

## 2. Akun & Akses Game Master (Admin)

### Akun Khusus Testing
- **Mode In-Memory (Default tanpa DB)**:
  - Daftar akun dengan username berawalan `admin` (misal: `admin`, `admin1`) untuk otomatis mendapatkan hak akses **Admin (GM Level 2)**.
  - Daftar akun dengan username `gm` untuk hak akses **Game Master (GM Level 1)**.
- **Pemain Biasa**:
  - Gunakan username apa saja (3–16 karakter alfanumerik).

---

## 3. Fitur Utama & Skenario Pengujian

Gunakan checklist ini saat melakukan pengetesan Alpha:

| No | Modul / Fitur | Skenario Pengujian | Hasil yang Diharapkan |
|:---|:---|:---|:---|
| **1** | **Autentikasi & Karakter** | Daftar akun baru, login, buat hingga 3 karakter, hapus karakter. | Berhasil membuat karakter, validasi nama 3-16 karakter, tidak bisa duplikat nama. |
| **2** | **Pergerakan & Kolisi** | Gerakkan karakter dengan tombol `W`, `A`, `S`, `D` atau tombol Panah. | Gerakan mulus (client prediction), berhenti saat menabrak dinding/pohon/pagar (server-authoritative). |
| **3** | **Combat & Cooldown** | Tekan tombol `Spasi` atau klik monster untuk menyerang. | Serangan dibatasi oleh kecepatan serang (ASPD cooldown), tidak dapat menyerang menembus dinding tebal (Line-of-Sight). |
| **4** | **Leveling & Stat Points** | Naikkan level dengan membunuh monster atau perintah `@level 50`. | Setiap kenaikan level memberikan **+3 Stat Points** yang terakumulasi. Tekan `C` untuk membuka status window dan alokasikan ke STR/AGI/VIT/INT/DEX/LUK. |
| **5** | **Ganti Job & Skill** | Capai Base Lv.10 & Job Lv.10, buka panel Job (`J`) untuk berganti ke **Swordsman**. | Karakter berganti outfit/sprite Swordsman, stat dasar meningkat, skill **Magnum Break** terbuka (Shortcut `1`). |
| **6** | **Inventory & Equipment** | Ambil drop dari monster, tekan `I` (Tas) dan `E` (Equip). Klik kanan potion untuk minum atau klik item senjata/armor/sayap untuk memasang. | Potion memulihkan HP dengan cooldown 0.5s. Gear terpasang di slot yang sesuai dan meningkatkan Attack/MaxHP/MaxSP secara real-time. |
| **7** | **Sistem Barter / Trade** | Dekati pemain lain, klik kanan atau tekan Trade. Masukkan item/gold, tekan Kunci Offer, lalu tekan Konfirmasi Trade. | Pertukaran berlangsung atomik (dua belah pihak harus setuju), dicek jarak dan kapasitas tas sebelum berpindah tangan. |
| **8** | **Orc Castle Dungeon & Boss** | Kumpulkan kunci dari monster elit untuk membuka gerbang Orc Castle. Lawan Boss **Black Ashura**. | Pintu gerbang terbuka dengan kunci. Boss memiliki fase Asura Strike dan menyalakan portal warp saat kalah. |
| **9** | **Error Handling & Reconnect** | Matikan sementara koneksi internet atau restart server saat bermain. | Muncul popup *"Koneksi Terputus"*, client tidak membeku (*freeze*), dan mencoba menghubungkan ulang secara otomatis atau menyediakan tombol *Hubungkan Ulang*. |
| **10**| **Perintah Debug & GM** | Buka chat (`Enter`), ketik `@help` untuk melihat daftar perintah GM. | GM Lv.2 dapat menggunakan `@spawn slime 5`, `@heal`, `@warp <x> <y>`, `@status`, `@speed 2`, `@anomalies`. |

---

## 4. Perintah Debug & GM untuk Pengujian Cepat

Berikut beberapa perintah praktis untuk mempercepat testing:

| Perintah | Level | Fungsi |
|:---|:---|:---|
| `@status` | GM Lv.1 | Cek performa server, uptime, online count, dan RAM. |
| `@heal` | GM Lv.2 | Memulihkan HP dan SP penuh seketika. |
| `@level <baseLv> [jobLv]` | GM Lv.2 | Mengubah level karakter dan mengakumulasikan stat points secara otomatis (contoh: `@level 50 20`). |
| `@statpoint <jumlah>` | GM Lv.2 | Menambahkan stat point secara langsung (contoh: `@statpoint 30`). |
| `@item <itemId> [qty]` | GM Lv.2 | Memberikan item ke inventory (contoh: `@item health-potion 10` atau `@item broadsword 1`). |
| `@gold <jumlah>` | GM Lv.2 | Menambahkan mata uang Gold (contoh: `@gold 50000`). |
| `@speed <1-3>` | GM Lv.2 | Mengatur kecepatan gerak tester (1x hingga 3x) untuk menjelajahi map lebih cepat. |
| `@clearbag` | GM Lv.2 | Mengosongkan tas inventory untuk reset pengujian loot. |
| `@anomalies` | GM Lv.2 | Memeriksa log anti-cheat server (melihat pelanggaran cooldown, wall hack, dsb). |
| `@go <mapId>` | GM Lv.2 | Pindah langsung ke map (contoh: `@go verdant_hollow` atau `@go orc_castle`). |

---

## 5. Uji Beban Ringan (Load Testing)

Untuk menguji performa server saat menangani banyak koneksi bersamaan:
```bash
cd server
npm run test:load -- --bots 20 --duration 20
```
Skrip ini akan menyimulasikan 20 bot pemain secara bersamaan yang melakukan login, pergerakan acak, serangan, dan chat, lalu mengukur latensi dan stabilitas memori.

---

## 6. Cara Melaporkan Bug

Jika Anda menemukan bug, keanehan animasi, celah keamanan (exploit), atau server crash:
1. Catat langkah-langkah terjadinya bug (*steps to reproduce*).
2. Ambil screenshot / rekaman layar jika berupa kendala visual.
3. Buka Console browser (`F12` -> Console) untuk melihat error merah pada client.
4. Gunakan format pada file [BUG_REPORT_TEMPLATE.md](file:///d:/Izud-Pixel-Realm-MMORPG/BUG_REPORT_TEMPLATE.md).
