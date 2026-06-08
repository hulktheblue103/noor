# Noor — Project Context for Claude Code

## What is Noor?
A free Islamic PWA (Progressive Web App) that shows a Hijri calendar and sends push + email reminders before Ayyam al-Bid (white days) fasting days — the 13th, 14th, and 15th of every Hijri month.

Live at: https://noor.blue-prophecy.com (also aiyam.blue-prophecy.com)
Hosted on: GitHub Pages
Repo: github.com/[USERNAME]/noor

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Single-file HTML/CSS/JS PWA — no framework |
| Fonts | Cormorant Garamond, Scheherazade New, DM Sans (Google Fonts) |
| Hijri conversion | `Intl.DateTimeFormat` with `islamic-umalqura` calendar (browser-native, accurate) |
| Push notifications | Firebase Cloud Messaging (FCM) |
| Email reminders | EmailJS (browser-side subscription) + EmailJS REST API (server-side sending) |
| Backend | Firebase Cloud Functions v2 (Gen2) |
| Database | Firestore (region: asia-southeast2) |
| Service worker | `firebase-messaging-sw.js` — handles both FCM push AND offline caching |
| PWA manifest | `manifest.json` |
| Icons | `icon-192.png`, `icon-512.png` |

---

## Repository Structure

```
noor-repo/
├── index.html                  # Entire frontend app (single file)
├── firebase-messaging-sw.js    # Service worker: FCM push + offline cache
├── sw.js                       # Fallback service worker
├── manifest.json               # PWA manifest
├── icon-192.png                # App icon
├── icon-512.png                # App icon
├── firebase.json               # Firebase config (hosting + functions)
├── .firebaserc                 # Firebase project binding
├── CLAUDE.md                   # This file
├── README.md                   # Setup instructions
├── .gitignore
├── functions/
│   ├── index.js                # Cloud Functions: reminders + cleanup
│   └── package.json
└── .github/
    └── workflows/
        ├── deploy-pages.yml    # Auto-deploy site to GitHub Pages on push
        └── deploy-functions.yml # Auto-deploy functions to Firebase on push
```

---

## Firebase Project

- **Project ID:** `noor-6efb3`
- **Messaging Sender ID:** `881911652427`
- **App ID:** `1:881911652427:web:ecd82b9fe0040bbebcedce`
- **Firestore region:** `asia-southeast2` (Jakarta)
- **Functions region:** `asia-southeast2`
- **VAPID key:** `BCs7Eigskpkln7zsemKPa1TRt0jqvtYDeBDJfhls4W4iFTaH2Q0KWIFnvz2pjZFUeBqXBliddXVs2sHYMCV4-Hk`

### Firestore Collections

| Collection | Purpose | Key fields |
|---|---|---|
| `subscribers` | Push notification subscribers | `token`, `timing`, `createdAt`, `active` |
| `emailSubscribers` | Email reminder subscribers | `email`, `timing`, `createdAt`, `active` |

`timing` field values: `"evening"` \| `"morning"` \| `"both"`

---

## EmailJS

- **Service ID:** `service_ys14bnd`
- **Template ID:** `template_npvb9gg`
- **Public key:** `_O38eWXHJdrijknHT`
- **Private key:** stored as GitHub secret `EMAILJS_PRIVATE_KEY`

Template variables used:
`{{to_email}}`, `{{to_name}}`, `{{timing_label}}`,
`{{next_fast_1}}`, `{{next_fast_2}}`, `{{next_fast_3}}`

---

## GitHub Secrets (Settings → Secrets → Actions)

| Secret | Used in |
|---|---|
| `FIREBASE_API_KEY` | Injected into `index.html` + `firebase-messaging-sw.js` at deploy |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase CLI auth for functions deploy |
| `EMAILJS_PRIVATE_KEY` | Injected into `functions/index.js` at deploy |

**Important:** `index.html` and `firebase-messaging-sw.js` contain the placeholder `YOUR_FIREBASE_API_KEY` in the repo. It gets replaced with the real key by the GitHub Actions workflow at deploy time. Never hardcode the real key.

---

## Cloud Functions

| Function | Schedule | Purpose |
|---|---|---|
| `sendFastingReminders` | Daily 8PM UTC | Sends push + email to all active subscribers when tomorrow or today is a white day |
| `testRemindersNow` | HTTP trigger | Sends test notification to all subscribers immediately |
| `cleanupStaleTokens` | Every Sunday midnight | Deletes inactive records older than 7 days from both collections |

### Test trigger URL
```
https://asia-southeast2-noor-6efb3.cloudfunctions.net/testRemindersNow?secret=noor-test-2024
```

---

## Key Design Decisions

### Hijri date conversion
- Use `Intl.DateTimeFormat` with `islamic-umalqura` — do NOT use custom math approximations, they drift
- `gregorianToHijri(year, month, day)` → `{ year, month, day }` (month is 1-based)
- `hijriToGregorian(hYear, hMonth, hDay)` → `Date` object (uses binary search ±15 days around JD estimate)
- Today highlighting: compare Hijri coordinates directly, never round-trip through both conversions

### Service worker
- Only ONE service worker: `firebase-messaging-sw.js` — it handles both FCM and offline caching
- Registered explicitly in `enablePushNotifications()` via `waitForServiceWorker()` before calling `messaging.getToken()`
- Notifications use `swReg.showNotification()` NOT `new Notification()` (blocked when SW is active)

### Monetisation (planned/in progress)
- PayPal sadaqah donation button (button ID: `YOUR_PAYPAL_BUTTON_ID` — needs replacing)
- Muslim Ad Network (apply once traffic grows)
- Amazon Associates affiliate links
- Premium sunnah fasting features (future)

---

## Local Development

```bash
# Install Firebase CLI (one time)
npm install -g firebase-tools
firebase login

# Deploy functions manually
cd functions
npm install
firebase deploy --only functions --project noor-6efb3

# Test locally — open index.html in browser
# Note: push notifications require HTTPS, so test on deployed site

# Trigger test reminder manually
curl "https://asia-southeast2-noor-6efb3.cloudfunctions.net/testRemindersNow?secret=noor-test-2024"
```

---

## Things NOT to do

- Don't add a build step or bundler — the app is intentionally a single HTML file, no npm for the frontend
- Don't switch Hijri conversion back to math-based — it was broken and caused wrong dates
- Don't use `new Notification()` — use `swReg.showNotification()` instead
- Don't register `sw.js` as the main service worker — Firebase needs `firebase-messaging-sw.js`
- Don't store the real Firebase API key in the repo — use the `YOUR_FIREBASE_API_KEY` placeholder
- Don't use Gen1 Firebase Functions — always use Gen2 (`firebase-functions/v2`)
- Don't change Firestore region — it's `asia-southeast2`, changing it breaks the connection

---

## Upcoming Features (ideas)

- Monday/Thursday sunnah fasting reminders (premium)
- Ashura, Arafah, 6 days of Shawwal reminders (premium)
- Prayer time integration via Aladhan API
- Multiple language support (Arabic, Malay, Urdu)
- Muslim Ad Network ad integration
- Analytics dashboard (how many users, active subscribers)