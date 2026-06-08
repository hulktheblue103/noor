# Noor — Hijri Calendar & Ayyam al-Bid Reminder

A free PWA for Muslims to track the Hijri calendar and get reminded before Ayyam al-Bid fasting days.

🌐 **Live:** https://noor.blue-prophecy.com

## Structure

```
/                          # Site files (served by GitHub Pages)
├── index.html             # Main app
├── firebase-messaging-sw.js  # Service worker (push + offline)
├── sw.js                  # Fallback service worker
├── manifest.json          # PWA manifest
├── icon-192.png           # App icon
├── icon-512.png           # App icon
└── functions/             # Firebase Cloud Functions
    ├── index.js           # Scheduled reminders + test trigger
    └── package.json
```

## Deployments

| What | How | Trigger |
|---|---|---|
| Site (GitHub Pages) | GitHub Actions | Push to `main` touching site files |
| Firebase Functions | GitHub Actions | Push to `main` touching `functions/` |

## Secrets required (GitHub → Settings → Secrets)

| Secret | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase service account JSON (see below) |

### Getting the Firebase service account
1. Firebase Console → Project Settings → Service Accounts
2. Click **Generate new private key**
3. Copy the entire JSON content
4. Add as GitHub secret named `FIREBASE_SERVICE_ACCOUNT`

## Local development

```bash
# Install Firebase CLI
npm install -g firebase-tools
firebase login

# Deploy functions manually
cd functions && npm install
firebase deploy --only functions --project noor-6efb3

# Test reminder trigger
curl "https://asia-southeast2-noor-6efb3.cloudfunctions.net/testRemindersNow?secret=noor-test-2024"
```
