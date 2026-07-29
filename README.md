# UNO Online — Multiplayer Card Game

Play UNO with friends from your phones. One person creates a room, shares the 4-letter code, others join.

## Quick Setup (15 minutes)

### 1. Create a Free Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com/)
2. Click **Add project** → name it anything (e.g. "uno-game") → Continue
3. Disable Google Analytics (optional) → **Create project**

### 2. Create the Database

1. In Firebase Console, click **Build → Realtime Database**
2. Click **Create Database**
3. Choose your region → click **Next**
4. Select **Start in test mode** → click **Enable**

> ⚠️ Test mode is open for 30 days. To keep it working after that, go to **Realtime Database → Rules** and set:
> ```json
> {
>   "rules": {
>     ".read": true,
>     ".write": true
>   }
> }
> ```
> This is fine for a private friends-only game.

### 3. Get Your Config

1. In Firebase Console, click the **⚙️ gear** → **Project settings**
2. Scroll down → click **</>** (Web app) → name it "uno" → **Register app**
3. Copy the `firebaseConfig` object
4. Paste it into `src/firebase.js`, replacing the placeholder values

### 4. Run Locally

```bash
npm install
npm run dev
```

Open the URL on your phone or browser to test.

### 5. Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "UNO multiplayer"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/uno-game.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Source → GitHub Actions**

Your game will be live at: `https://YOUR-USERNAME.github.io/uno-game/`

> If your repo name isn't `uno-game`, update the `base` in `vite.config.js`.

---

## How to Play

1. Open the game → enter your name → **Create Room**
2. Share the 4-letter code with friends
3. Friends open the same link → enter code → **Join**
4. Host clicks **Start Game** when everyone's in
5. Play UNO! Match by color or number, use Wild cards, call UNO when you're at 1 card

## Admin Cheat Mode 👑

On the menu screen, tap **Admin Login** and enter: `admin123`

| Power | What it does |
|-------|-------------|
| 👁 Peek | See all opponents' cards |
| 🎯 Pick Draw | Choose which card you draw from the deck |
| 🔀 Swap | Swap any card in your hand with any card in the deck |

Friends won't know you have these powers — there's no visible indicator on their screens.

---

## Changing the Admin Password

Edit `ADMIN_PASS` at the top of `src/UnoGame.jsx`.
