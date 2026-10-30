# Shorty Recommendation System (Gorse + PM2)

This directory contains the production-ready Gorse recommendation system configuration connected directly to Shorty's **Supabase PostgreSQL** database (`zdutzfrojytvjxpdffsv`).

---

## 1. Setup Password in `config.toml`

Open `config.toml` and replace `[YOUR_SUPABASE_DB_PASSWORD]` with your actual Supabase database password:
```toml
data_store = "postgres://postgres:YOUR_PASSWORD@db.zdutzfrojytvjxpdffsv.supabase.co:5432/postgres?sslmode=require"
cache_store = "postgres://postgres:YOUR_PASSWORD@db.zdutzfrojytvjxpdffsv.supabase.co:5432/postgres?sslmode=require"
```

*(Where to find password: In your Supabase Dashboard -> Project Settings -> Database).*

---

## 2. Download the `gorse-in-one` binary into this folder

### On Linux (VPS / Ubuntu / Debian):
```bash
cd gorse
wget https://github.com/gorse-io/gorse/releases/latest/download/gorse-in-one_linux_amd64.tar.gz
tar -xzf gorse-in-one_linux_amd64.tar.gz
chmod +x gorse-in-one
```

### On Windows:
Download `gorse-in-one_windows_amd64.zip` from [Gorse GitHub Releases](https://github.com/gorse-io/gorse/releases) and place `gorse-in-one.exe` inside this `gorse/` folder.

---

## 3. Start with PM2

```bash
# Start Gorse process
pm2 start ecosystem.config.js

# Check status
pm2 status

# View real-time logs
pm2 logs shorty-gorse-recsys

# Save for auto-restart on system reboots
pm2 startup
pm2 save
```

---

## 4. Endpoints & Dashboard

* **Web Admin Dashboard**: `http://localhost:8088` (or `http://YOUR-SERVER-IP:8088`)
  - View items, users, incoming play/like/skip feedbacks, and model accuracy charts.
* **REST API**:
  - `POST /api/feedback` — Send user interactions (plays, likes, skips).
  - `GET /api/recommend/{user_id}?n=20` — Fetch personalized recommendations.
  - `GET /api/item/{song_id}/neighbors?n=10` — Start Song Radio / similar tracks.

