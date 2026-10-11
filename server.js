const express = require("express");
const helmet = require("helmet");
const crypto = require("crypto");
const { AccessToken, RoomServiceClient } = require("@livekit/server-sdk");

const app = express();
app.use(helmet());
app.use(express.json({ limit: "20kb" }));

const {
  PORT = 3000,
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  ADMIN_API_TOKEN,
  APP_ORIGIN = ""
} = process.env;

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !ADMIN_API_TOKEN) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

if (APP_ORIGIN) {
  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (origin && origin !== APP_ORIGIN) return res.status(403).json({ error: "Origin not allowed" });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", APP_ORIGIN);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
}

const roomService = new RoomServiceClient(
  LIVEKIT_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:"),
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);

const clean = (v, max = 80) => String(v || "").trim().replace(/[\\u0000-\\u001f]/g, "").slice(0, max);
const validRoom = v => /^[a-zA-Z0-9_-]{3,64}$/.test(v);

function requireAdmin(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token), b = Buffer.from(ADMIN_API_TOKEN);
  if (!token || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "rafiq-livekit-server" }));

// DEMO ONLY: connect this endpoint to real student login/session authorization before public launch.
app.post("/api/room-token", async (req, res) => {
  try {
    const identity = clean(req.body?.identity, 64);
    const name = clean(req.body?.name, 80);
    const room = clean(req.body?.room, 64);
    if (!/^[a-zA-Z0-9_-]{3,64}$/.test(identity) || !name || !validRoom(room)) {
      return res.status(400).json({ error: "Provide a valid identity, name, and room." });
    }
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name, ttl: "15m" });
    token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
    res.json({ token: await token.toJwt(), serverUrl: LIVEKIT_URL, room, expiresIn: 900 });
  } catch (e) {
    console.error("Token creation failed:", e.message);
    res.status(500).json({ error: "Could not create room token." });
  }
});

// Call admin endpoints only from a trusted backend. Never put ADMIN_API_TOKEN in public HTML.
app.post("/api/admin/mute", requireAdmin, async (req, res) => {
  try {
    const room = clean(req.body?.room, 64);
    const identity = clean(req.body?.identity, 64);
    const muted = req.body?.muted;
    if (!validRoom(room) || !identity || typeof muted !== "boolean") {
      return res.status(400).json({ error: "Provide room, identity, and muted boolean." });
    }
    const participants = await roomService.listParticipants(room);
    const participant = participants.find(p => p.identity === identity);
    if (!participant) return res.status(404).json({ error: "Participant not found." });
    const tracks = (participant.tracks || []).filter(t => String(t.type).toLowerCase().includes("audio") || t.type === 0);
    const audio = tracks.find(t => String(t.source).toLowerCase().includes("microphone") || t.source === 2);
    if (!audio) return res.status(409).json({ error: "No published microphone track found." });
    await roomService.mutePublishedTrack(room, identity, audio.sid, muted);
    res.json({ ok: true, room, identity, muted });
  } catch (e) {
    console.error("Mute failed:", e.message);
    res.status(500).json({ error: "Could not change microphone state." });
  }
});

app.post("/api/admin/remove-participant", requireAdmin, async (req, res) => {
  try {
    const room = clean(req.body?.room, 64);
    const identity = clean(req.body?.identity, 64);
    if (!validRoom(room) || !identity) return res.status(400).json({ error: "Provide room and identity." });
    await roomService.removeParticipant(room, identity);
    res.json({ ok: true, room, identity });
  } catch (e) {
    console.error("Remove participant failed:", e.message);
    res.status(500).json({ error: "Could not remove participant." });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Rafiq server listening on ${PORT}`));
