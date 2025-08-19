import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";
import bodyParser from "body-parser";
import mime from "mime";   // 👈 add mime

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

// ✅ Ensure .wasm gets correct MIME type
mime.define({ "application/wasm": ["wasm"] }, true);

// Room registry
const rooms = new Map();

wss.on("connection", (ws) => {
  let roomId = null;

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.type === "join") {
        roomId = data.roomId;

        // Always ensure room exists
        if (!rooms.has(roomId)) rooms.set(roomId, new Set());

        // Remove stale sockets
        for (const client of rooms.get(roomId)) {
          if (client.readyState !== 1) {
            rooms.get(roomId).delete(client);
            try { client.terminate(); } catch {}
          }
        }

        rooms.get(roomId).add(ws);
        ws.send(JSON.stringify({ type: "joined", roomId }));
        return;
      }

      // forward messages
      if (roomId && rooms.has(roomId)) {
        for (const client of rooms.get(roomId)) {
          if (client !== ws && client.readyState === 1) {
            client.send(JSON.stringify(data));
          }
        }
      }
    } catch (err) {
      console.error("[ws error]", err);
    }
  });

  ws.on("close", () => {
    if (roomId && rooms.has(roomId)) {
      rooms.get(roomId).delete(ws);
      if (rooms.get(roomId).size === 0) rooms.delete(roomId);
    }
  });

  ws.on("error", () => {
    try { ws.close(); } catch {}
  });
});

// ✅ Metrics with history
app.post("/metrics", (req, res) => {
  const p = path.join(__dirname, "..", "metrics.json");

  let existing = [];
  if (fs.existsSync(p)) {
    try {
      existing = JSON.parse(fs.readFileSync(p));
      if (!Array.isArray(existing)) existing = [existing];
    } catch {
      existing = [];
    }
  }

  const entry = { ...req.body, timestamp: new Date().toISOString() };
  existing.push(entry);

  fs.writeFileSync(p, JSON.stringify(existing, null, 2));
  console.log("[metrics] Appended metrics:", entry);

  res.json({ ok: true });
});

app.get("/metrics.json", (req, res) => {
  const p = path.join(__dirname, "..", "metrics.json");
  res.sendFile(p);
});

// Serve frontend (includes WASM in public/)
const staticDir = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(staticDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".wasm")) {
      res.setHeader("Content-Type", "application/wasm");
    }
  },
}));

app.get("*", (_, res) =>
  res.sendFile(path.join(staticDir, "index.html"))
);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`[server] running on http://localhost:${PORT}`)
);
