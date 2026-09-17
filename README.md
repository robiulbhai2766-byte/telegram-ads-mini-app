# Telegram Ad-Earning Mini App — Secure Starter

A production-lean starter for a Telegram Mini App that rewards users for
watching ads, with server-side anti-fraud controls baked into the core flow
rather than bolted on.

## What's actually enforced, and what isn't

Read this before you launch:

- **Ad timer**: fully server-authoritative. The client can't fake elapsed
  time because verification re-reads the session's `started_at` from the
  database and compares it to the server's own clock. ✅ Strong.
- **Heartbeat check**: catches bots that instantly call `/verify` without
  ever loading the page. It does **not** stop a script that fakes heartbeat
  calls too — it raises the bar, it doesn't make cheating impossible. ⚠️ Partial.
- **Device fingerprint**: a hashed combination of browser/device signals.
  Determined attackers can spoof this. Treat it as a fraud *signal*, combined
  with IP tracking, not an absolute identity. ⚠️ Partial.
- **Referral anti-fraud**: rewards only pay out after the referred user
  completes a genuinely verified ad view, and same-device/same-IP referrals
  are rejected outright. This stops the "instant self-referral" pattern but
  won't stop patient farms using different real devices/SIMs. ⚠️ Partial.

For a real-money product, plan on **manual review of your highest earners**
before large payouts, regardless of the automation above.

## Project structure

```
telegram-ad-bot/
├── server/
│   ├── index.js       # Express app + API routes
│   ├── db.js          # SQLite schema + connection
│   ├── auth.js        # Telegram initData HMAC verification
│   ├── fraud.js        # Device/IP dedup, strikes, auto-ban
│   ├── adTimer.js      # Server-side ad session + verification
│   ├── referral.js     # Referral creation + fraud-guarded payout
│   ├── payout.js       # Withdrawal request / admin approve-reject
│   └── bot.js          # Telegram bot (/start referral capture)
├── public/
│   ├── index.html      # Mini App UI
│   └── app.js          # Fingerprinting, ad flow, heartbeat loop
├── package.json
└── .env.example
```

## Database schema (SQLite, see `server/db.js` for full DDL)

| Table | Purpose |
|---|---|
| `users` | Balance, ban status, strike count, last known device/IP |
| `device_fingerprints` | Every device/IP ever linked to a telegram_id — used to spot duplicate accounts |
| `banned_fingerprints` | Blacklisted device/IP combos so a ban survives a new account |
| `ad_sessions` | One row per ad-watch attempt; `started_at` is server time, never trusted from client |
| `referrals` | Pending → completed/rejected; pays out only after genuine activity |
| `transactions` | Full ledger of every balance change (ad rewards, referral bonuses, withdrawals) |
| `withdrawals` | Payout requests + admin workflow status |
| `pending_referrals` | Holds `/start ref_xxx` payloads until the Mini App registers the user |

To move to **PostgreSQL** later: keep the same table shapes, swap
`better-sqlite3` calls in `db.js` for `pg` queries (the rest of the app only
calls the exported functions/`db.prepare`, so isolate that file).

## How each anti-fraud requirement is met

1. **Multi-account prevention** (`fraud.js`) — a device fingerprint hash
   (canvas + browser signals, computed client-side in `app.js`) plus IP are
   recorded per account. A new registration is blocked if the same device
   hash is already tied to a different Telegram ID, or if a banned
   fingerprint/IP tries again.

2. **Anti-fake referral** (`referral.js`) — referrals start `pending` and
   only convert to a paid bonus once the referred account has a genuinely
   **verified** ad session (not just an app open). Same-device/IP referrals
   are rejected at creation time.

3. **Server-side ad timer** (`adTimer.js`) — `started_at` is set by the DB's
   own clock. `/api/ad/verify` recomputes elapsed time server-side; if it's
   less than the required duration, the session is rejected **and** a fraud
   strike is recorded, auto-banning the account (and blacklisting its
   device/IP) after `SUSPICION_STRIKES_BEFORE_BAN` violations.

4. **Automated payouts** (`payout.js`) — withdrawal debits the balance and
   creates the withdrawal row inside one atomic transaction, so there's no
   window where a crash could double-spend or lose the debit. Approve/reject
   are separate functions meant to be called only from an admin-only surface
   (see "Admin panel" below — not included, by design, so you don't ship a
   public endpoint that moves money).

## Step-by-step setup

### 1. Create your bot
1. Message **@BotFather** on Telegram → `/newbot` → follow prompts → copy the token.
2. `/setmenubutton` or send `/mybots` → your bot → **Bot Settings → Menu Button** → set it to a Web App pointing at your deployed URL (step 3).

### 2. Install & configure
```bash
git clone <this project>
cd telegram-ad-bot
npm install
cp .env.example .env
# edit .env: paste BOT_TOKEN, set WEBAPP_URL to your HTTPS domain
```

### 3. Run locally with a tunnel (Telegram requires HTTPS)
```bash
npm start
# in a second terminal:
npx ngrok http 3000
```
Put the `https://xxxx.ngrok.io` URL into `.env` as `WEBAPP_URL` and restart.

### 4. Deploy for real
- Any Node host works (Railway, Render, a VPS with PM2 + nginx + Let's Encrypt).
- Minimum: Node 18+, persistent disk for `data.sqlite` (or migrate to managed Postgres for multi-instance scaling — SQLite is single-writer and fine for moderate traffic but won't horizontally scale).
- Put the app behind HTTPS (required by Telegram Web Apps) and set `WEBAPP_URL` to that HTTPS URL.
- If you run behind a reverse proxy, make sure it forwards `X-Forwarded-For` correctly (`fraud.getClientIp` trusts this header — lock it down to only accept it from your proxy).

### 5. Referral links
Share links in the form:
```
https://t.me/YourBotUsername?start=ref_<referrer_telegram_id>
```
The bot captures this in `bot.js`, and `/api/register` finalizes the referral once the referred user opens the Mini App.

### 6. Wire up a real ad network
`public/app.js` has a countdown as a placeholder for the actual ad. Replace that section with your ad network SDK's rewarded-ad call (e.g. Adsgram, Monetag, or another Telegram-ad network), and only start your **existing** `/api/ad/start` → heartbeat → `/api/ad/verify` flow around it — don't remove the server-side timer just because the SDK has its own "ad finished" callback; treat that callback as the trigger for `/api/ad/verify`, not as the source of truth for how long it played.

### 7. Admin operations
`payout.js` exports `approveWithdrawal`, `markPaid`, `rejectWithdrawal` but
intentionally has **no HTTP route** — wire these into a private admin
CLI/script or an internal dashboard gated by your own auth, never a public
endpoint.

## Environment variables (`.env`)
See `.env.example` — key ones:
- `BOT_TOKEN` — from BotFather
- `WEBAPP_URL` — your deployed HTTPS URL
- `REWARD_PER_AD`, `REFERRAL_BONUS`, `MIN_WITHDRAWAL` — economy tuning
- `AD_REQUIRED_SECONDS`, `HEARTBEAT_INTERVAL_SECONDS` — must match between `.env` and the interval hardcoded in `public/app.js` (`HEARTBEAT_INTERVAL_MS`)
- `MAX_ACCOUNTS_PER_IP_PER_DAY`, `SUSPICION_STRIKES_BEFORE_BAN` — anti-fraud thresholds

## Suggested next steps
- Add rate limiting (e.g. `express-rate-limit`) on all `/api/*` routes.
- Add structured logging + alerting on every `markSuspicious` call so you can watch fraud patterns in real time instead of only after auto-ban.
- Move to PostgreSQL once you need multiple app instances.
- Consider a CAPTCHA-style human check (Telegram's own or a third party) before a user's *first* ad, to filter bot signups before they ever reach the ad-timer logic.
