const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");

/*
  J3B Chat — modo temporário
  - Não usa banco de dados.
  - Usuários, conversas e mensagens existem só na RAM.
  - Reiniciar o servidor apaga tudo.
  - Cada username só pode estar ocupado por uma sessão por vez.
  - Senhas NÃO são disponibilizadas ao administrador.
*/

const sessions = new Map(); // sessionId -> { username, ws, createdAt }
const usernames = new Map(); // username -> sessionId
const messages = new Map(); // conversationKey -> [message]

function safeJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function conversationKey(a, b) {
  return [a, b].sort().join("::");
}

function broadcastUsers() {
  const users = [...sessions.values()].map(s => ({
    username: s.username,
    online: true
  }));
  for (const s of sessions.values()) {
    safeJson(s.ws, { type: "users", users });
  }
}

function deleteSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;

  usernames.delete(s.username);
  sessions.delete(sessionId);

  // Apaga conversas envolvendo essa sessão/username.
  for (const key of [...messages.keys()]) {
    if (key.split("::").includes(s.username)) messages.delete(key);
  }

  broadcastUsers();
}

function sendConversationTo(ws, a, b) {
  const list = messages.get(conversationKey(a, b)) || [];
  safeJson(ws, { type: "history", withUser: b, messages: list });
}

function sendError(ws, text) {
  safeJson(ws, { type: "error", message: text });
}

function handle(ws, raw) {
  let data;
  try { data = JSON.parse(raw); } catch {
    return sendError(ws, "Pedido inválido.");
  }

  if (data.action === "login") {
    const username = String(data.username || "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return sendError(ws, "Username: 3–24 caracteres, apenas letras, números e _.");
    }
    if (usernames.has(username)) {
      return sendError(ws, "Esse username já está em uso.");
    }

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { username, ws, createdAt: Date.now() });
    usernames.set(username, sessionId);
    ws.sessionId = sessionId;
    ws.username = username;

    safeJson(ws, { type: "login_ok", username });
    broadcastUsers();
    return;
  }

  if (!ws.sessionId || !sessions.has(ws.sessionId)) {
    return sendError(ws, "Entre primeiro.");
  }

  if (data.action === "history") {
    const other = String(data.withUser || "").trim().toLowerCase();
    if (!usernames.has(other) && other !== ws.username) {
      return sendError(ws, "Usuário não está online.");
    }
    sendConversationTo(ws, ws.username, other);
    return;
  }

  if (data.action === "message") {
    const to = String(data.to || "").trim().toLowerCase();
    const body = String(data.body || "").trim();

    if (!to || !body) return;
    if (body.length > 4000) return sendError(ws, "Mensagem muito grande.");
    if (to === ws.username) return sendError(ws, "Escolha outro usuário.");
    const targetId = usernames.get(to);
    if (!targetId) return sendError(ws, "Esse usuário não está online.");

    const now = new Date().toISOString();
    const key = conversationKey(ws.username, to);
    const msg = {
      id: crypto.randomUUID(),
      from: ws.username,
      to,
      type: "text",
      body,
      at: now
    };

    if (!messages.has(key)) messages.set(key, []);
    messages.get(key).push(msg);

    const target = sessions.get(targetId);
    safeJson(ws, { type: "message", message: msg });
    safeJson(target.ws, { type: "message", message: msg });
    return;
  }

  if (data.action === "photo") {
    const to = String(data.to || "").trim().toLowerCase();
    const dataUrl = String(data.dataUrl || "");

    if (!to || !dataUrl) return;
    if (dataUrl.length > 7 * 1024 * 1024) {
      return sendError(ws, "Foto muito grande para este modo temporário.");
    }

    const targetId = usernames.get(to);
    if (!targetId) return sendError(ws, "Esse usuário não está online.");

    const allowed = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(dataUrl);
    if (!allowed) return sendError(ws, "Formato de foto não permitido.");

    const now = new Date().toISOString();
    const msg = {
      id: crypto.randomUUID(),
      from: ws.username,
      to,
      type: "image",
      dataUrl,
      at: now
    };

    const key = conversationKey(ws.username, to);
    if (!messages.has(key)) messages.set(key, []);
    messages.get(key).push(msg);

    const target = sessions.get(targetId);
    safeJson(ws, { type: "message", message: msg });
    safeJson(target.ws, { type: "message", message: msg });
    return;
  }

  if (data.action === "admin_snapshot") {
    // O único administrador do demo é o username lanzoh21.
    // Ele vê apenas usuários e mensagens temporárias.
    if (ws.username !== "lanzoh21") {
      return sendError(ws, "Acesso negado.");
    }

    const allMessages = [];
    for (const list of messages.values()) allMessages.push(...list);

    safeJson(ws, {
      type: "admin_snapshot",
      users: [...sessions.values()].map(s => s.username),
      messages: allMessages
    });
    return;
  }

  if (data.action === "typing") {
    const to = String(data.to || "").trim().toLowerCase();
    const targetId = usernames.get(to);
    if (!targetId) return;
    safeJson(sessions.get(targetId).ws, {
      type: "typing",
      from: ws.username,
      active: !!data.active
    });
  }
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.normalize(path.join(publicDir, urlPath));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }

    const ext = path.extname(filePath);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8"
    };

    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

wss.on("connection", ws => {
  ws.on("message", raw => handle(ws, raw.toString()));
  ws.on("close", () => {
    if (ws.sessionId) deleteSession(ws.sessionId);
  });
  ws.on("error", () => {
    if (ws.sessionId) deleteSession(ws.sessionId);
  });
});

server.listen(PORT, () => {
  console.log(`J3B Chat em http://localhost:${PORT}`);
});
