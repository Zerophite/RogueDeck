# UNONG BITAW — Multiplayer UNO Card Game

A real-time multiplayer UNO card game with elemental powers, anime-style effects, and synthesized sound. Play with friends on any device.

## Features

- Real-time multiplayer via Firebase
- Elemental system: Fire, Water, Wind, Lightning
- Custom action cards: Shadow, Snatch, Discard All
- Anime-style visual effects and synthesized SFX
- Ranked leaderboard with ELO scoring
- Mobile-first landscape design
- Challenge system for Wild Draw Four
- Card stacking (configurable)

## Quick Setup

### 1. Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com/)
2. Click **Add project** → name it anything → Continue
3. Disable Google Analytics (optional) → **Create project**

### 2. Create the Database

1. In Firebase Console, click **Build → Realtime Database**
2. Click **Create Database** → choose your region → **Next**
3. Select **Start in test mode** → **Enable**

> To keep it working after 30 days, go to **Realtime Database → Rules** and set:
> ```json
> {
>   "rules": {
>     ".read": true,
>     ".write": true
>   }
> }
> ```

### 3. Get Your Config

1. Click **gear icon → Project settings**
2. Scroll down → click **</>** (Web app) → name it "uno" → **Register app**
3. Copy the `firebaseConfig` object
4. Paste it into `src/firebase.js`, replacing the placeholder values

### 4. Run Locally

```bash
npm install
npm run dev
```

### 5. Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/uno-game.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Source → GitHub Actions**

Your game will be live at: `https://YOUR-USERNAME.github.io/uno-game/`

> If your repo name isn't `uno-game`, update the `base` in `vite.config.js`.

## How to Play

1. Open the game → enter your name → **Create Room**
2. Share the 4-letter code with friends
3. Friends open the same link → enter code → **Join**
4. Host clicks **Start Game** when everyone's in
5. Match cards by color or number, use action cards strategically
6. Call **UNO** when you're down to 1 card — or get penalized!

## Special Cards

| Card | Effect |
|------|--------|
| Skip | Skip the next player's turn |
| Reverse | Reverse play direction (acts as skip in 2-player) |
| Draw Two (+2) | Next player draws 2 (stackable if enabled) |
| Wild | Change the current color |
| Wild Draw Four (+4) | Change color + next player draws 4 (challengeable) |
| Discard All | Discard all cards of that color, draw 1 |
| Shadow | Deflect a pending draw stack to the next player |
| Snatch | Steal a card from the next player (blind pick), then give one back |

## Game Settings

The host can configure before starting:
- Turn time and round time
- Card stacking (allow +2 on +2, +4 on +4)
- Draw until playable
- Starting hand size
