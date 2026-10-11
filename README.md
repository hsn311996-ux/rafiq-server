# Rafiq LiveKit server starter

Deploy with Node.js 20+: install dependencies (`npm install`) and start (`npm start`).

Set these in the host's secret environment settings: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `ADMIN_API_TOKEN`. Never commit real secrets or place them in HTML.

Endpoints:
- `GET /health`
- `POST /api/room-token` with JSON `{ "identity":"student_123", "name":"Student", "room":"class_3m" }`
- `POST /api/admin/mute` with `Authorization: Bearer ADMIN_API_TOKEN` and JSON `{ "room":"class_3m", "identity":"student_123", "muted":true }`
- `POST /api/admin/remove-participant` with the same admin authorization and JSON `{ "room":"class_3m", "identity":"student_123" }`

IMPORTANT SECURITY LIMITATION:
`/api/room-token` is a starter/demo endpoint and does NOT authenticate a student account. Do not expose it to real users until it is connected to a real login/session system and checks room membership and roles. Admin endpoints must only be called from a trusted backend/admin session; never embed the admin token in public HTML. Server-side mute controls a currently published track, but a full production setup must also enforce publish permissions and moderation policy.

Set `APP_ORIGIN` to your exact frontend origin if needed. CORS is not authentication.
