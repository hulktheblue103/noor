const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const https = require("https");

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

setGlobalOptions({ region: "asia-southeast2", maxInstances: 1 });

const HIJRI_MONTHS = [
  'Muharram','Safar','Rabi al-Awwal','Rabi al-Thani',
  'Jumada al-Awwal','Jumada al-Thani','Rajab','Shaban',
  'Ramadan','Shawwal','Dhu al-Qida','Dhu al-Hijja'
];

const EMAILJS_SERVICE_ID = "service_ys14bnd";
const EMAILJS_TEMPLATE_ID = "template_npvb9gg";
const EMAILJS_PRIVATE_KEY = "YOUR_EMAILJS_PRIVATE_KEY"; // Add this from EmailJS dashboard → Account → API Keys

// Convert Gregorian date to Hijri date (using the Umm al-Qura approximation)
function gregorianToHijri(date) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const jd = Math.floor((14 - m) / 12);
  const yy = y + 4800 - jd;
  const mm = m + 12 * jd - 3;
  let jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy +
    Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  const l = jdn - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const ll = l - 10631 * n + 354;
  const j = Math.floor((10985 - ll) / 5316) * Math.floor((50 * ll) / 17719) +
    Math.floor(ll / 5670) * Math.floor((43 * ll) / 15238);
  const ll2 = ll - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * ll2) / 709);
  const day = ll2 - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { year, month, day };
}

function formatGregDate(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// Get next 3 white days from a given date
function getNextWhiteDays(fromDate) {
  const days = [];
  const h = gregorianToHijri(fromDate);
  let hy = h.year, hm = h.month;
  for (let m = 0; m < 3 && days.length < 3; m++) {
    for (const d of [13, 14, 15]) {
      // Approximate greg date for this hijri day
      const approxMs = fromDate.getTime() + ((d - h.day) + m * 29.5) * 86400000;
      const approxDate = new Date(approxMs);
      const diff = Math.round((approxDate - fromDate) / 86400000);
      if (diff >= 0) days.push(formatGregDate(approxDate));
    }
    hm++; if (hm > 12) { hm = 1; hy++; }
  }
  return days.slice(0, 3);
}

async function deactivateBadTokens(tokens, batchResponse) {
  const toDeactivate = [];
  batchResponse.responses.forEach((resp, i) => {
    if (!resp.success) {
      console.log(`Token failed [${resp.error?.code}]: ...${tokens[i].slice(-12)}`);
      const code = resp.error?.code;
      if (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token') {
        toDeactivate.push(tokens[i]);
      }
    }
  });
  if (toDeactivate.length === 0) return;
  const snap = await db.collection("subscribers").where("token", "in", toDeactivate).get();
  const batch = db.batch();
  snap.forEach(doc => batch.update(doc.ref, { active: false }));
  await batch.commit();
  console.log(`Deactivated ${toDeactivate.length} stale token(s)`);
}

// Send email via EmailJS REST API (server-side)
function sendEmailJS(toEmail, toName, templateParams) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: "_O38eWXHJdrijknHT",
      accessToken: EMAILJS_PRIVATE_KEY,
      template_params: templateParams
    });
    const req = https.request({
      hostname: "api.emailjs.com",
      path: "/api/v1.0/email/send",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => res.statusCode === 200 ? resolve(data) : reject(new Error(`EmailJS error ${res.statusCode}: ${data}`)));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function sendReminders({ forceAll = false } = {}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowH = gregorianToHijri(tomorrow);
  const today = new Date();
  const todayH = gregorianToHijri(today);

  const tomorrowIsWhiteDay = [13, 14, 15].includes(tomorrowH.day);
  const todayIsWhiteDay = [13, 14, 15].includes(todayH.day);

  if (!forceAll && !tomorrowIsWhiteDay && !todayIsWhiteDay) {
    return { sent: 0, message: "No reminders needed today." };
  }

  // ── Push notifications ────────────────────────────────────────────────────
  const pushSnap = await db.collection("subscribers").where("active", "==", true).get();
  const eveningPushTokens = [], morningPushTokens = [];
  pushSnap.forEach(doc => {
    const { token, timing } = doc.data();
    if (!token) return;
    if (forceAll || (tomorrowIsWhiteDay && (timing === "evening" || timing === "both"))) eveningPushTokens.push(token);
    if (forceAll || (todayIsWhiteDay && (timing === "morning" || timing === "both"))) morningPushTokens.push(token);
  });

  const pushSends = [];
  if (forceAll) {
    const all = [...new Set([...eveningPushTokens, ...morningPushTokens])];
    if (all.length > 0) {
      const result = await messaging.sendEachForMulticast({
        tokens: all,
        notification: { title: "Noor ✦ Test Reminder", body: "This is a test. Your fasting reminders are working! 🌙" },
        webpush: { notification: { icon: "https://aiyam.blue-prophecy.com/icon-192.png" }, fcmOptions: { link: "https://aiyam.blue-prophecy.com" } }
      });
      pushSends.push(result);
      await deactivateBadTokens(all, result);
    }
  } else {
    if (eveningPushTokens.length > 0) {
      const result = await messaging.sendEachForMulticast({
        tokens: eveningPushTokens,
        notification: { title: "Noor ✦ Fasting Tomorrow", body: `Tomorrow (${formatGregDate(tomorrow)}) is an Ayyam al-Bid fasting day. Make your intention tonight.` },
        webpush: { notification: { icon: "https://aiyam.blue-prophecy.com/icon-192.png" }, fcmOptions: { link: "https://aiyam.blue-prophecy.com" } }
      });
      pushSends.push(result);
      await deactivateBadTokens(eveningPushTokens, result);
    }
    if (morningPushTokens.length > 0) {
      const result = await messaging.sendEachForMulticast({
        tokens: morningPushTokens,
        notification: { title: "Noor ✦ Fasting Day", body: `Today (${formatGregDate(today)}) is an Ayyam al-Bid fasting day. May Allah accept your fast. 🌙` },
        webpush: { notification: { icon: "https://aiyam.blue-prophecy.com/icon-192.png" }, fcmOptions: { link: "https://aiyam.blue-prophecy.com" } }
      });
      pushSends.push(result);
      await deactivateBadTokens(morningPushTokens, result);
    }
  }

  // ── Email notifications ───────────────────────────────────────────────────
  const emailSnap = await db.collection("emailSubscribers").where("active", "==", true).get();
  const emailSends = [];
  const nextDays = getNextWhiteDays(today);

  emailSnap.forEach(doc => {
    const { email, timing } = doc.data();
    if (!email) return;
    const shouldSend = forceAll
      || (tomorrowIsWhiteDay && (timing === "evening" || timing === "both"))
      || (todayIsWhiteDay && (timing === "morning" || timing === "both"));
    if (!shouldSend) return;

    const subject = forceAll ? "Noor ✦ Test Email"
      : tomorrowIsWhiteDay ? "Noor ✦ Fasting Tomorrow"
      : "Noor ✦ Fasting Day";

    emailSends.push(
      sendEmailJS(email, email.split("@")[0], {
        to_email: email,
        to_name: email.split("@")[0],
        subject,
        timing_label: timing === "evening" ? "the evening before" : timing === "morning" ? "the morning of" : "the evening before and morning of",
        next_fast_1: nextDays[0] || "",
        next_fast_2: nextDays[1] || "",
        next_fast_3: nextDays[2] || "",
        reply_to: "noreply@aiyam.blue-prophecy.com"
      }).catch(err => console.error("Email failed for", email, err.message))
    );
  });

  const [pushResults] = await Promise.all([
    Promise.all(pushSends),
    Promise.all(emailSends)
  ]);

  const pushSuccess = pushResults.reduce((s, r) => s + (r?.successCount || 0), 0);
  const emailSuccess = emailSends.length;
  return { pushSent: pushSuccess, emailSent: emailSuccess, message: `Push: ${pushSuccess}, Email: ${emailSuccess}` };
}

// ─── Scheduled: daily 8PM UTC ─────────────────────────────────────────────────
exports.sendFastingReminders = onSchedule("0 20 * * *", async () => {
  const result = await sendReminders({ forceAll: false });
  console.log(result.message);
});

// ─── Manual test trigger ──────────────────────────────────────────────────────
exports.testRemindersNow = onRequest(async (req, res) => {
  const secret = req.query.secret || req.body?.secret;
  if (secret !== "noor-test-2024") return res.status(403).json({ error: "Unauthorized" });
  try {
    const result = await sendReminders({ forceAll: true });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Cleanup: weekly, remove inactive records older than 7 days ───────────────
exports.cleanupStaleTokens = onSchedule("0 0 * * 0", async () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffISO = cutoff.toISOString();

  const collections = ["subscribers", "emailSubscribers"];
  for (const col of collections) {
    const snap = await db.collection(col)
      .where("active", "==", false)
      .where("createdAt", "<", cutoffISO)
      .get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`Deleted ${snap.size} stale records from ${col}`);
  }
});
