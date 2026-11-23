# Izud-Pixel-Realm-MMORPG

A feature-rich **2D pixel MMORPG**: a Phaser 3 TypeScript client communicating with an authoritative Node.js Colyseus 0.18 server, featuring Ragnarok Online-inspired job progression, primary attributes, multi-character accounts, player-to-player trading, animated world boss encounters, Game Master (GM) management tools, and optional PostgreSQL + Redis persistence.

The client features high-refresh display sub-tick extrapolation for 60/120/144+ Hz displays, draggable pixel-art UI panels, and authentic spritesheets alongside procedural fallbacks.

```
┌───────────────────────────────────────┐         WebSocket         ┌───────────────────────────────────────┐
│     Phaser 3 + TypeScript + Vite      │  ───────────────────────▶ │       Node.js + Colyseus 0.18         │
│  prediction + sub-tick extrapolation  │  ◀─────────────────────── │       authoritative 30 Hz sim         │
│  (smooth 60/120/144+ Hz display)      │   schema patches + msgs   └───────────────────┬───────────────────┘
└───────────────────────────────────────┘                                               │ optional
                                                                    ┌───────────────────┴───────────────────┐
                                                                    │ PostgreSQL: accounts, characters, GM  │
                                                                    │ Redis: session position cache         │
                                                                    └───────────────────────────────────────┘
```

---

## Daftar Isi / Table of Contents

- [Highlight Fitur Utama / Core Features](#highlight-fitur-utama--core-features)
- [Quick Start](#quick-start)
- [Database Editor](#database-editor)
- [Controls & Shortcuts](#controls--shortcuts)
- [Sistem Gameplay](#sistem-gameplay)
  - [1. Multi-Character System](#1-multi-character-system)
  - [2. Ragnarok-Style Job & Class System](#2-ragnarok-style-job--class-system)
  - [3. Primary Attributes & Derived Stats](#3-primary-attributes--derived-stats)
  - [4. Player-to-Player Trading](#4-player-to-player-trading)
  - [5. Monster & World Boss (Black Ashura)](#5-monster--world-boss-black-ashura)
  - [6. Game Master (GM) & Moderation](#6-game-master-gm--moderation)
  - [7. Display & Netcode (Fixed-Tick Judder Solution)](#7-display--netcode-fixed-tick-judder-solution)
- [Accounts, Items & Loot](#accounts-items-and-loot)
- [Network Protocol](#network-protocol)
- [Persistence & Database Migrations](#persistence--database-migrations)
- [Production Deploy (Docker)](#production-style-deploy-docker)
- [Panduan Pengembang / Developer Guide (Menambah Konten)](#panduan-pengembang--developer-guide)

---

## Highlight Fitur Utama / Core Features

- **Multi-Character Accounts**: Pemain dapat membuat hingga 3 karakter per akun dengan pemilihan slot, visualisasi outfit/job, dan level preview.
- **Ragnarok-Style Job System**: Pemisahan Base Level dan Job Level. Jalur job dari Novice menuju job lanjutan (Swordsman, Archer, Mage, Knight) dengan syarat level dan pertumbuhan stat unik.
- **Classic Primary Attributes**: Sistem stat klasik (STR, AGI, VIT, INT, DEX, LUK) dengan alokasi Stat Point bebas yang langsung mempengaruhi ATK, MATK, DEF, MDEF, HIT, FLEE, CRIT, Perfect Dodge, dan ASPD.
- **Authoritative Combat & Movement**: Server mensimulasikan pergerakan dan kalkulasi damage secara penuh pada 30 Hz, dilengkapi client prediction dan smoothing.
- **Sub-Tick Extrapolation (Judder-Free Display)**: Interpolasi halus antara tick 30 Hz untuk layar 60 Hz, 120 Hz, maupun 144 Hz+ tanpa efek patah-patah/judder.
- **Player-to-Player Trading**: Sistem barter langsung antar pemain dengan modal interaksi klik kanan, penawaran multi-item dan gold, serta konfirmasi dua tahap (Lock & Confirm).
- **World Boss & Skill Telegraph**: Boss Black Ashura dengan dialog, warning circle (AoE ground telegraph), ledakan skill AoE, dan guncangan layar (screen shake).
- **Monster Roster Lengkap**: Moss Slime, Dusk Bat, Marin, Magmaring, Poporing, Forest Stalker, Venom Poring, Shadow Ashura, Mad Bunny, Pochi, Plant 1/2, serta Orc, Orc Hero, dan Orc Lord. Monster mendukung spritesheet animasi 4 arah (Idle, Walk, Attack, Hurt, Death).
- **Sayap & Perlengkapan (Wings Slot)**: Slot equipment khusus sayap (`wing_id`) dengan rendering sprite sayap dinamis mengikuti arah karakter.
- **Game Master (GM) System**: Hirarki role Player (0), GM (1), dan Admin (2). Fitur badge chat/karakter khusus, broadcast global (`📢 [PENGUMUMAN]`), God Mode, Mute penalty, dan database audit log.
- **Draggable UI Panels**: Seluruh jendela UI (Status, Equipment, Skill, Job, Inventory, Trade, Setting) dapat digeser bebas (draggable) dengan header pixel-art.

---

## Quick Start

Kebutuhan minimum: **Node.js 20.19+** (direkomendasikan Node 22/24) dan npm.

### Menjalankan Client & Server Secara Lokal

Buka dua terminal terpisah:

**Terminal 1 — Server (Colyseus):**
```bash
cd server
npm install
npm run dev
```

**Terminal 2 — Client (Vite + Phaser 3):**
```bash
cd client
npm install
npm run dev
```

| Layanan | URL | Keterangan |
| --- | --- | --- |
| **Game Client (Vite)** | http://localhost:5173 | Antarmuka game Phaser |
| **Server (Colyseus)** | http://localhost:2567 | WebSocket & HTTP API |
| **Health Check** | http://localhost:2567/health | Status memori / DB / Redis |
| **Database Editor** | http://localhost:4545 | Editor monster, item, dan spawn |

> [!NOTE]
> Secara default server dapat berjalan murni **in-memory** tanpa PostgreSQL & Redis. Data akun dan karakter tetap hidup selama proses server berjalan.

### Mengaktifkan Persistence (PostgreSQL + Redis)

Untuk menyimpan akun, karakter, dan posisi secara permanen:

1. **Jalankan container Docker PostgreSQL 16 & Redis 7:**
   ```bash
   docker compose up -d postgres redis
   ```
   PostgreSQL berjalan di host port **5433** (agar tidak bentrok dengan PostgreSQL lokal) dan Redis di port **6379**.

2. **Salin file env server:**
   ```powershell
   Copy-Item server/.env.example server/.env
   ```
   Pastikan konfigurasi koneksi sesuai:
   ```dotenv
   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pixel_realms
   REDIS_URL=redis://localhost:6379
   AUTH_SECRET=ganti-dengan-string-rahasia-panjang
   ```

3. **Jalankan migrasi database:**
   ```bash
   cd server
   npm run db:migrate
   ```

Cek kembali `http://localhost:2567/health` — akan menampilkan:
`persistence: { postgres: true, redis: true }` dan `accounts: "postgres"`.

---

## Database Editor

Database Editor adalah aplikasi lokal berbasis Node.js untuk mengubah konfigurasi game tanpa mengedit TypeScript secara manual.

```bash
cd server
npm run db:editor
```

Buka http://localhost:4545.

Fitur yang tersedia:

- **Monster**: Mengubah nama, level, elemen, HP, damage, defense, speed, EXP, Gold, radius, dan loot table.
- **Item**: Mengubah nama, kategori, icon, warna, stack limit, harga jual, serta bonus stat item.
- **Sprite Preview**: Memilih aksi dan arah untuk melihat PNG sprite monster yang tersedia.
- **Spawn Editor**: Memilih monster beserta koordinat tile untuk setiap map.
- **Import / Export**: Mengunduh atau memuat satu file JSON berisi monster, item, dan spawn.
- Setiap penyimpanan atau import membangun ulang server TypeScript secara otomatis.

```json
{
  "monsters": {},
  "items": {},
  "spawns": {
    "verdant_hollow": [
      { "kind": 0, "tx": 5, "ty": 4 }
    ]
  }
}
```

Database Editor hanya mendengarkan `127.0.0.1` dan sebaiknya digunakan secara lokal.

---

## Controls & Shortcuts

| Tombol / Aksi | Fungsi |
| --- | --- |
| `W A S D` / Tombol Panah | Bergerak (Client Prediction & Server Authoritative) |
| `Space` | Menyerang monster terdekat dalam jangkauan |
| **Klik Kiri Monster** | Memilih target & menyerang monster tersebut |
| **Klik Kanan Player Lain** | Mengirim permintaan Trade (Barter) langsung |
| **Klik NPC** | Berbicara / melihat dialog berurutan |
| `Enter` atau `/` | Membuka kotak obrolan (Chat) |
| `Esc` | Menutup panel aktif / membatalkan trade / keluar dari chat |
| `I` | Buka / tutup panel **Inventory (Satchel)** |
| `E` | Buka / tutup panel **Equipment (Weapon, Armor, Wing)** |
| `C` | Buka / tutup panel **Status (Atribut STR/AGI/VIT/INT/DEX/LUK)** |
| `K` | Buka / tutup panel **Skill** |
| `J` | Buka / tutup panel **Job (Progression & Job Change)** |
| **Bottom HUD Menu** | Tombol navigasi cepat di sudut kanan bawah untuk membuka panel |
| **Drag Header Panel** | Klik dan tahan bar atas jendela UI untuk memindahkannya |

---

## Sistem Gameplay

### 1. Multi-Character System

Setiap akun dapat memiliki hingga **3 karakter**.
- **Login / Register Scene**: Validasi akun via scrypt hash.
- **Character Select & Create Scene**:
  - Daftar slot karakter dengan job class, base level, job level, dan pratinjau avatar visual.
  - Modal pembuatan karakter: pemilihan nama unik dan opsi outfit awal.
  - Keamanan hapus karakter dan pencegahan nama duplikat per akun (`006_multi_character.sql`).

### 2. Ragnarok-Style Job & Class System

Sistem level mengadopsi gaya klasik Ragnarok Online dengan pemisahan **Base Level** dan **Job Level**:

```
           ┌──────────────┐
           │    Novice    │ (Max Job Lv 10)
           └──────┬───────┘
     ┌────────────┼────────────┐
     ▼            ▼            ▼
┌───────────┐ ┌────────┐ ┌──────────┐
│ Swordsman │ │ Archer │ │   Mage   │ (Tier 1 First Jobs)
└─────┬─────┘ └────────┘ └──────────┘
      ▼
┌───────────┐
│  Knight   │ (Tier 2 Second Job)
└───────────┘
```

- **Job Panel (`J`)**: Memperlihatkan rincian job aktif, bar Job XP, syarat level untuk advance, serta tombol ganti job jika syarat terpenuhi.
- **Pertumbuhan Stat Unik**: Tiap job memiliki pertumbuhan HP/SP dan atribut otomatis per kenaikan Job Level.
- **Render Sprite Sesuai Job**: Karakter akan otomatis menggunakan spritesheet animasi sesuai class yang aktif (misal Novice atau Swordsman dengan animasi 4 arah).

### 3. Primary Attributes & Derived Stats

Pemain mendapatkan Stat Points setiap kali naik Base Level. Stat dapat dialokasikan melalui **Status Panel (`C`)**:

| Atribut | Pengaruh Utama |
| --- | --- |
| **STR** (Strength) | Meningkatkan Physical Attack (ATK) dan kapasitas damage dasar |
| **AGI** (Agility) | Meningkatkan Flee Rate (menghindar) dan Attack Speed (ASPD) |
| **VIT** (Vitality) | Meningkatkan Max HP, regenerasi HP, dan Physical Defense (DEF) |
| **INT** (Intelligence) | Meningkatkan Magic Attack (MATK), Max SP, dan Magic Defense (MDEF) |
| **DEX** (Dexterity) | Meningkatkan Hit Rate (akurasi), minimum damage, dan ASPD |
| **LUK** (Luck) | Meningkatkan Critical Rate (CRIT) dan Perfect Dodge |

### 4. Player-to-Player Trading

Berdagang secara aman antar pemain tanpa perantara:
1. **Inisiasi**: Klik kanan pada karakter pemain lain untuk mengirim ajakan barter.
2. **Trade Window**: Menampilkan dua sisi (penawaran sendiri dan penawaran rekan).
3. **Offer Items & Gold**: Masukkan item dari satchel dan tentukan nominal Gold yang ditawarkan.
4. **Dua Tahap Pengamanan**:
   - Klik **Lock Offer** untuk mengunci penawaran (perubahan apa pun akan mereset status kunci).
   - Setelah kedua pihak terkunci, tombol **Confirm** akan aktif.
   - Server mengeksekusi penukaran secara atomik dengan validasi kapasitas inventory.

### 5. Monster & World Boss (Black Ashura)

Dunia dihuni oleh berbagai jenis monster dengan AI tingkah laku (Idle, Chase, Attack, Cast, Dead):

- **Monster Biasa**:
  - `Moss Slime` & `Dusk Bat`: Monster pemula di sekitar area spawn.
  - `Marin`, `Magmaring`, `Poporing`: Monster bertipe elemen dengan animasi lengkap 4 arah dan loot berharga.
- **World Boss: Black Ashura**:
  - Muncul di area khusus dengan notifikasi spawn ke seluruh map.
  - **Boss Speech**: Menampilkan bubble chat dialog di atas monster (`monster:speak`).
  - **Skill Telegraphing**: Lingkaran merah peringatan di tanah sebelum skill AoE meledak (`boss:skill:cast`).
  - **AoE Blast & Hit Impact**: Ledakan area besar (`ashura_skill_aoe`), efek hit pada target, dan getaran kamera.

### 6. Game Master (GM) & Moderation

Tersedia sistem tingkatan akun untuk pengawasan dan moderasi in-game (`008_gm_level.sql`):

| Tingkat | Role | Fitur & Tampilan |
| --- | --- | --- |
| `0` | **Player** | Pemain reguler |
| `1` | **Game Master (GM)** | Tag hijau `[GM]`, akses perintah moderasi |
| `2` | **Admin / Developer** | Tag emas `[Admin]`, God Mode (kebal serangan), broadcast global |

- **Global Broadcast**: Menampilkan pesan mencolok `📢 [PENGUMUMAN]` di chat semua pemain.
- **God Mode**: Mencegah seluruh damage monster maupun lingkungan kepada Admin.
- **Sistem Mute**: Membungkam chat pemain toxic untuk durasi tertentu dengan hitung mundur detik.
- **GM Audit Log**: Setiap perintah yang dijalankan dicatat ke tabel `gm_audit_logs`.

Contoh perintah Level 2:

| Perintah | Fungsi |
| --- | --- |
| `@god` | Mengaktifkan atau menonaktifkan God Mode |
| `@heal [nama]` | Memulihkan HP/SP pemain |
| `@spawn <monster> [jumlah]` | Spawn monster di posisi GM |
| `@go <mapId>` | Pindah ke titik spawn map berdasarkan ID |
| `@killall` | Menghapus semua monster aktif |
| `@item <itemId> [jumlah]` | Menambahkan item ke inventory |
| `@gold <jumlah>` | Menambah atau mengurangi Gold |
| `@level <baseLv> [jobLv]` | Mengubah Base Level dan Job Level |

ID map yang tersedia antara lain: `verdant_hollow`, `hollowed_forest`, `adventure_guild_forest`, dan `adventure_guild`.

### 7. Display & Netcode (Fixed-Tick Judder Solution)

- **Fixed 30 Hz Physics**: Simulasi gerakan di server dan client tetap sinkron pada interval 33.33 ms untuk kestabilan kalkulasi collision dan otoritas server.
- **Sub-Tick Extrapolation**: Client Phaser 3 mengakumulasikan sisa waktu frame (`inputAccumulator`) untuk menginterpolasikan posisi visual secara halus mengikuti refresh rate monitor monitor lokal (60 Hz, 120 Hz, 144 Hz+).
- Hasilnya: Pergerakan karakter terlihat sangat mulus di monitor gaming modern tanpa mengorbankan authoritas server 30 Hz.

---

## Accounts, Items and Loot

### Autentikasi & Karakter (REST API)

| Endpoint | Method | Body / Header | Keterangan |
| --- | --- | --- | --- |
| `/auth/register` | `POST` | `{ username, password }` | Mendaftarkan akun baru |
| `/auth/login` | `POST` | `{ username, password }` | Login, mengembalikan JWT session token |
| `/auth/me` | `GET` | `Authorization: Bearer <token>` | Info akun aktif & gm_level |
| `/auth/characters` | `GET` | `Authorization: Bearer <token>` | Mendapatkan daftar karakter akun (maks. 3) |
| `/auth/characters` | `POST` | `{ name, outfit }` | Membuat karakter baru |
| `/auth/characters/:id` | `DELETE` | `Authorization: Bearer <token>` | Menghapus karakter dari slot |

### Items & Equipment Slots

Katalog item didefinisikan pada `server/src/config/items.ts` dan disinkronkan saat handshake `welcome`:
- **Consumables**: Red potion, Apple, dll. Memulihkan HP/SP dengan cooldown penggunaan.
- **Weapons**: Memberikan bonus Physical Attack (`attack`).
- **Armors**: Memberikan bonus Max HP (`maxHp`) dan Defense.
- **Wings**: Memberikan bonus status dan visual sayap di punggung karakter (`wingId`).
- **Materials**: Bahan monster yang dapat ditumpuk hingga 99 buah (misal `moss-jelly`, `dusk-wing`).

---

## Network Protocol

Komunikasi real-time dijalankan di atas Colyseus Room (`game_room`):

### Client → Server (`ClientMessage`)
- `input`: `{ seq, up, down, left, right }` — Input pergerakan 30 Hz.
- `chat`: `{ text }` — Kirim obrolan atau perintah GM (`@command` / `/command`).
- `attack`: `{ targetId? }` — Menyerang target monster terdekat atau terseleksi.
- `interact`: `{ targetId }` — Berbicara dengan NPC terdekat.
- `item:use`: `{ slot }` — Mengonsumsi potion/makanan.
- `item:equip`: `{ slot }` — Memasang senjata, armor, atau sayap.
- `item:unequip`: `{ slot: "weapon" | "armor" | "wing" }` — Melepas item ke inventory.
- `stat:allocate`: `{ stat: "str" | "agi" | "vit" | "int" | "dex" | "luk", amount }` — Menambah poin status.
- `trade:request`: `{ targetSessionId }` — Mengundang trade pemain lain.
- `trade:respond`: `{ tradeId, accept: boolean }` — Menerima / menolak ajakan trade.
- `trade:update`: `{ items, gold }` — Memperbarui tawaran trade.
- `trade:confirm`: `{ tradeId }` — Mengunci atau menyetujui transaksi.
- `trade:cancel`: Membatalkan transaksi barter.
- `job:change`: `{ jobId }` — Mengubah job class setelah memenuhi syarat level.

### Server → Client (`ServerMessage`)
- `welcome`: Info room, session id, tick rate, dan seluruh katalog item.
- `chat`: Pesan chat pemain, info sistem, atau announcement broadcast.
- `combat:hit` / `combat:miss`: Hasil serangan, damage, critical hit, dan animasi miss.
- `player:levelup` / `player:joblevelup`: Kenaikan Base Level / Job Level beserta bonus stat.
- `player:died` / `player:respawned`: Status kematian dan hitung mundur respawn.
- `trade:invite` / `trade:state` / `trade:closed`: Status aliran negosiasi barter.
- `boss:spawn` / `boss:skill:cast` / `boss:skill:execute` / `monster:speak`: Event boss mekanik.

---

## Persistence & Database Migrations

Sistem migrasi database berada pada folder `server/migrations/` dan dijalankan dengan perintah `npm run db:migrate`:

| File Migrasi | Penjelasan Perubahan |
| --- | --- |
| `001_init.sql` | Tabel dasar `characters` (level, xp, hp, max_hp, posisi, gold) |
| `002_accounts.sql` | Tabel `accounts` untuk autentikasi user dan password hash scrypt |
| `003_items.sql` | Kolom `inventory` JSONB, `weapon_id`, dan `armor_id` |
| `004_stats.sql` | Atribut dasar: `str`, `agi`, `vit`, `int`, `dex`, `luk`, `stat_points`, `sp`, `max_sp` |
| `005_wings.sql` | Kolom `wing_id` untuk perlengkapan slot sayap |
| `006_multi_character.sql` | Menghapus batas 1 akun 1 karakter, mendukung hingga 3 karakter per akun |
| `007_jobs.sql` | Kolom `job_id`, `job_level`, dan `job_xp` untuk sistem job Ragnarok |
| `008_gm_level.sql` | Kolom `gm_level` dan tabel `gm_audit_logs` untuk fitur Game Master |

---

## Production-Style Deploy (Docker)

File `docker-compose.prod.yml` mengompilasi client statis di balik reverse proxy **nginx** dan menghubungkannya dengan server Colyseus, PostgreSQL, serta Redis:

```bash
# 1. Salin konfigurasi environment produksi
Copy-Item .env.example .env

# 2. Build dan jalankan seluruh stack
docker compose -f docker-compose.prod.yml up -d --build

# 3. Pantau log
docker compose -f docker-compose.prod.yml logs -f

# 4. Berbagi akses dengan teman (Cloudflare Tunnel otomatis)
docker compose -f docker-compose.prod.yml --profile tunnel up -d
docker compose -f docker-compose.prod.yml logs -f tunnel
```

Akses produksi:
- **Game Client**: `http://localhost:8080`
- **Health Check**: `http://localhost:8080/health`
- **Cloudflare Quick Tunnel**: Menghasilkan tautan HTTPS publik instan yang dapat dimainkan langsung dari browser.

---

## Panduan Pengembang / Developer Guide

### Menambah Job Baru

1. Daftarkan ID job baru pada tipe `JobId` di `client/src/config/jobs.ts` dan `server/dist/config/jobs.js`.
2. Tentukan persyaratan `parentJobId`, `requiredBaseLevel`, `requiredJobLevel`, dan `statGrowthPerLevel`.
3. Tambahkan spritesheet animasi di `client/public/assets/sprites/` dan load di `PreloadScene.ts`.
4. Petakan tekstur karakter baru di `client/src/entities/Player.ts`.

### Menambah Monster Baru

1. Tambahkan ID monster pada `MonsterKind` di `server/dist/types/protocol.js` dan `client/src/types/index.ts`.
2. Sinkronkan ID yang sama pada `server/src/types/protocol.ts` dan tambahkan alias GM bila diperlukan.
3. Atur status monster (HP, damage, kecepatan, range, loot table, XP) pada `MONSTER_TYPES` di `server/src/config/gameplay.ts`.
4. Gunakan Database Editor untuk mengubah monster dan spawn, atau tentukan titik spawn manual pada `MONSTER_SPAWNS` dan `MONSTER_SPAWN_OVERRIDES` di `server/src/config/map.ts`.
5. Siapkan tekstur/spritesheet di `PreloadScene.ts` dan arahkan rendering di `client/src/entities/Monster.ts`.
6. Jalankan `npm --prefix server run build` untuk membentuk ulang `server/dist`.

### Menambah Item & Equipment

1. Tambahkan item di `server/src/config/items.ts` dengan `id`, `name`, `kind` (`Weapon` / `Armor` / `Wing` / `Consumable`), `description`, dan efek statnya.
2. Tambahkan gambar ikon 16x16 px di `generateItemIcons()` (`client/src/scenes/PreloadScene.ts`).
3. Item baru langsung tersedia di server, siap dimasukkan ke drop table monster atau starter kit.

---

## Struktur Folder Proyek

```
Izud-Pixel-Realm-MMORPG/
├── client/                     # Frontend Phaser 3 + TypeScript + Vite
│   ├── public/assets/          # Spritesheets karakter, monster, maps, UI icons
│   ├── src/
│   │   ├── config/             # Konfigurasi game, jobs, keybinds
│   │   ├── entities/           # Entity, Player, Monster, NPC
│   │   ├── items/              # Katalog item & tooltip helper
│   │   ├── network/            # Colyseus network wrapper & event emitter
│   │   ├── scenes/             # Boot, Preload, MainMenu, CharacterSelect, Game, UI
│   │   ├── types/              # Type definitions & protocol mirror
│   │   └── ui/                 # Panel: Status, Equipment, Skill, Job, Inventory, Trade, Chat
│   └── package.json
├── server/                     # Backend Colyseus + Node.js
│   ├── dist/                   # File server executable terkompilasi
│   ├── migrations/             # SQL Migrations (001 s/d 008)
│   ├── src/                    # Source code server TypeScript
│   │   ├── auth/               # Sistem registrasi, login, token, & multi-character
│   │   ├── config/             # Config gameplay, map, items, env
│   │   ├── database/           # Postgres & Redis connector
│   │   ├── entities/           # Monster AI & Combat Calculator
│   │   ├── items/              # Inventory, equipment, & trade logic
│   │   ├── rooms/              # GameRoom (authoritative 30 Hz loop)
│   │   └── schemas/            # Colyseus state schemas
│   └── package.json
├── deploy/                     # Konfigurasi reverse proxy nginx
├── tools/
│   └── db-editor.mjs           # Database Editor lokal (monster, item, spawn, import/export)
├── docker-compose.yml          # Container dev (PostgreSQL 16 + Redis 7)
├── docker-compose.prod.yml     # Container produksi lengkap (Web + Server + DB + Tunnel)
├── Dockerfile.client           # Build container client
├── Dockerfile.server           # Build container server
└── README.md
```

---

## Rencana Pengembangan Selanjutnya (Roadmap)

- [ ] NPC Merchant & toko jual/beli item dengan Gold.
- [ ] Safe Zone & area PvP antar pemain.
- [ ] Sistem Quest dan alur cerita petualangan.
- [ ] Peningkatan skill aktif khusus untuk setiap Job Class.
- [ ] Kontrol sentuh (Touch controls) untuk perangkat mobile.
