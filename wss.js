require("dotenv").config();
const WebSocket = require("ws");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ============================================
// SECRET KEY MANAGEMENT
// ============================================
const SECRET_FILE = path.join(__dirname, ".ws-secret");

function getOrCreateSecret() {
  try {
    if (fs.existsSync(SECRET_FILE)) {
      return fs.readFileSync(SECRET_FILE, "utf8").trim();
    }
  } catch (e) {}
  
  // Generate new secret
  const secret = "WSS_" + crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  console.log("✓ New WebSocket secret generated");
  return secret;
}

const WS_SECRET = getOrCreateSecret();

// ============================================
// HTTP SERVER (for internal broadcast API)
// ============================================
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-WS-Secret");
  
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  
  // Health check
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ 
      status: "ok", 
      service: "znap-wss",
      clients: wss.clients.size 
    }));
  }
  
  // Internal broadcast endpoint (only api.js can call this)
  if (req.method === "POST" && req.url === "/broadcast") {
    const secret = req.headers["x-ws-secret"];
    
    if (secret !== WS_SECRET) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }
    
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        broadcast(data);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, clients: wss.clients.size }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }
  
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// ============================================
// WEBSOCKET SERVER
// ============================================
const wss = new WebSocket.Server({ server });

// Connected clients
const clients = new Set();

wss.on("connection", (ws, req) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  console.log(`+ Client connected (${wss.clients.size} total)`);
  
  clients.add(ws);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: "connected",
    message: "Connected to ZNAP WebSocket",
    timestamp: new Date().toISOString()
  }));
  
  // Handle incoming messages (clients can send ping)
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      
      // Only handle ping
      if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
      }
    } catch (e) {
      // Ignore invalid messages
    }
  });
  
  ws.on("close", () => {
    clients.delete(ws);
    console.log(`- Client disconnected (${wss.clients.size} total)`);
  });
  
  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
    clients.delete(ws);
  });
});

// Broadcast to all connected clients
function broadcast(data) {
  const message = JSON.stringify({
    ...data,
    timestamp: new Date().toISOString()
  });
  
  let sent = 0;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      sent++;
    }
  }
  
  console.log(`→ Broadcast "${data.type}" to ${sent} clients`);
}

// Heartbeat to keep connections alive
setInterval(() => {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.ping();
    }
  }
}, 30000);

// ============================================
// START
// ============================================
const PORT = process.env.WS_PORT || 3002;

server.listen(PORT, () => {
  console.log(`✓ ZNAP WebSocket @ ws://localhost:${PORT}`);
  console.log(`  Secret: ${WS_SECRET.slice(0, 10)}...`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down WebSocket server...");
  wss.close();
  server.close();
  process.exit(0);
});
