# Rogue Deck — Real-Time Multiplayer Card Game

A fast, real-time multiplayer UNO-style card game with elemental powers, team battles, a ranked ladder, anime-style effects, and its own sound design. Built as a single-file React app on Firebase, playable on any device — designed mobile-first for iPhone (portrait **and** landscape).

**Live:** `https://zerophite.github.io/RogueDeck/`

## Features

- **Real-time multiplayer** over Firebase Realtime Database — create a room, share the code, play instantly.
- **Elemental theming** by card color: Fire (red), Water/Ice (blue), Wind (green), Lightning (yellow) — each with its own effects and SFX.
- **Custom action cards** on top of the classics: Shadow (deflect a draw stack), Snatch (steal a card), Discard All.
- **Team mode — Chaos 🔥 vs Order ❄️**: 2v2 with auto-shuffle or manual teams, team-colored rings, shared win, and team scoring.
- **Ranked ladder**: 10 tiers (Bronze → Monarch) with 5 stars each, ELO-style scoring, and a **10-game placement** before you're ranked.
- **Rank crowns** rendered on the top players' avatars, in the lobby and in-match.
- **Throwable items** — tap an opponent to fling a splat (egg, pie, water balloon, bomb, …).
- **Cosmetics**: avatars, photo avatars, country flags, a coin economy, and a store.
- **Friends & invites**, emotes, and per-room chat cues.
- **Turn-direction indicator**: a chevron flow ring that chases in the direction of play and flips on a Reverse card, tinted to the current color.
- **Full audio**: file-based SFX + procedural synth fallback, plus background music.
- **PWA**: "Add to Home Screen" installs as **Rogue Deck**, fullscreen.
- **Challenge system** for Wild Draw Four, and configurable card stacking.

## Project Layout

Single-file game logic lives in `src/UnoGame.jsx`. Static assets (sounds, team logos, throwables, crowns, UI images) are under `public/`.

## Setup

### 1. Firebase project + database

1. [console.firebase.google.com](https://console.firebase.google.com/) → **Add project**.
2. **Build → Realtime Database → Create Database** → pick a region → Enable.
3. **Realtime Database → Rules** → paste the rules below → **Publish**. (Test mode expires after 30 days and would break the game — these permanent rules keep it working while scoping writes to the paths the app uses.)

```json
{
  "rules": {
    "rooms":       { ".read": true, ".write": true },
    "leaderboard": { ".read": true, ".write": true, ".indexOn": ["totalPoints"] },
    "names":       { ".read": true, ".write": true },
    "friends":     { ".read": true, ".write": true },
    "freq":        { ".read": true, ".write": true },
    "ginv":        { ".read": true, ".write": true }
  }
}
```

> These rules are open within those paths (the app has no login system). Fine for a small game; for real protection, add Firebase Auth + server-side scoring later.

### 2. App config

Copy your web-app `firebaseConfig` into `src/firebase.js`, replacing the placeholder values (the `databaseURL` is the important one).

### 3. Run locally

```bash
npm install
npm run dev
```

### 4. Deploy (GitHub Pages)

Pushing to `main` triggers the Actions workflow in `.github/workflows/deploy.yml`, which builds and publishes to Pages.

- The repo is named **RogueDeck**, so `vite.config.js` uses `base: '/RogueDeck/'`. **If you fork/rename, this must match your repo name** or every asset 404s.
- On GitHub: **Settings → Pages → Source → GitHub Actions** (once).

```bash
git add .
git commit -m "Update"
git push
```

> New image/audio assets land in `public/` as untracked files — remember to `git add` them, or they'll 404 (show blank) on the live site.

## How to Play

1. Enter your name → **Create Room** (or **Team Mode** / **Free For All**).
2. Share the 4-letter room code; friends enter it → **Join** (or add bots).
3. Host taps **Start Game**.
4. Match the top card by color or number; use action cards strategically.
5. Tap **UNO** when you're down to one card — or opponents can catch you and penalize.

## Special Cards

| Card | Effect |
|------|--------|
| Skip | Skip the next player's turn |
| Reverse | Reverse play direction (acts as Skip in 2-player) |
| Draw Two (+2) | Next player draws 2 (stackable if enabled) |
| Wild | Change the current color |
| Wild Draw Four (+4) | Change color + next player draws 4 (challengeable) |
| Discard All | Discard all cards of that color, draw 1 |
| Shadow | Deflect a pending draw stack to the next player |
| Snatch | Steal a card from the next player (blind pick), then give one back |

## Game Settings

The host can configure before starting: turn time, round time, starting hand size, card stacking (+2 on +2, +4 on +4), and draw-until-playable.
