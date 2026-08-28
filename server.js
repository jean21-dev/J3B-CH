const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");

const sessions = new Map();      // sessionId -> { username, ws }
const usernameToSession = new Map();
const conversations = new Map(); // "a::b" -> message[]
const userProfiles = new Map();  // online-only profile info

const ADMIN_USERNAME = "lanzoh21";

function cleanUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function validUsername(username) {
  return /^[a-z0-9_]{3,24}$/.test(username);
}

function convoKey(a, b) {
  return [a, b].sort().join("::");
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function publicUsers() {
  return [...sessions.values()].map(s => ({
    username: s.username,
    displayName: s.username,
    online: true
  }));
}

function broadcastUsers() {
  const payload = { type: "users", users: publicUsers() };
  for (const s of sessions.values()) send(s.ws, payload);
}

function isAdmin(username) {
  return cleanUsername(username) === ADMIN_USERNAME;
}

function deleteUserData(username) {
  for (const key of [...conversations.keys()]) {
    if (key.split("::").includes(username)) conversations.delete(key);
  }
  userProfiles.delete(username);
}

function disconnectSession(ws) {
  if (!ws.sessionId) return;
  const session = sessions.get(ws.sessionId);
  if (!session) return;

  const username = session.username;
  sessions.delete(ws.sessionId);
  usernameToSession.delete(username);

  /*
    O usuário e as conversas dele são apagados da RAM
    quando ele sai do servidor.
  */
  deleteUserData(username);
  broadcastUsers();
}

function searchUsers(ws, rawQuery) {
  const query = cleanUsername(rawQuery).replace(/^@/, "");

  if (!query) {
    return send(ws, { type: "search_results", users: [] });
  }

  const results = publicUsers()
    .filter(u => u.username !== ws.username)
    .filter(u => u.username.includes(query))
    .slice(0, 30);

  send(ws, {
    type: "search_results",
    users: results
  });
}

function sendHistory(ws, other) {
  const key = convoKey(ws.username, other);
  send(ws, {
    type: "history",
    withUser: other,
    messages: conversations.get(key) || []
  });
}

function handleMessage(ws, raw) {
  let data;
  try {
    data = JSON.parse(raw.toString());
  } catch {
    return send(ws, { type: "error", message: "Pedido inválido." });
  }

  if (data.action === "login") {
    const username = cleanUsername(data.username);

    if (!validUsername(username)) {
      return send(ws, {
        type: "error",
        message: "Username inválido. Use 3–24 caracteres, letras, números ou _."
      });
    }

    if (usernameToSession.has(username)) {
      return send(ws, {
        type: "login_taken",
        message: "Esse username já está em uso."
      });
    }

    const sessionId = crypto.randomUUID();

    sessions.set(sessionId, {
      username,
      ws
    });

    usernameToSession.set(username, sessionId);

    userProfiles.set(username, {
      username,
      createdAt: Date.now()
    });

    ws.sessionId = sessionId;
    ws.username = username;

    send(ws, {
      type: "login_ok",
      username,
      isAdmin: isAdmin(username)
    });

    broadcastUsers();
    return;
  }

  if (!ws.sessionId || !sessions.has(ws.sessionId)) {
    return send(ws, {
      type: "error",
      message: "Entre primeiro."
    });
  }

  if (data.action === "search_users") {
    return searchUsers(ws, data.query);
  }

  if (data.action === "history") {
    const other = cleanUsername(data.withUser);

    if (!usernameToSession.has(other)) {
      return send(ws, {
        type: "error",
        message: "Esse usuário não está online."
      });
    }

    return sendHistory(ws, other);
  }

  if (data.action === "message") {
    const to = cleanUsername(data.to);
    const body = String(data.body || "").trim();

    if (!validUsername(to) || !body) return;

    if (to === ws.username) {
      return send(ws, {
        type: "error",
        message: "Você não pode conversar consigo mesmo."
      });
    }

    const targetSessionId = usernameToSession.get(to);
    if (!targetSessionId) {
      return send(ws, {
        type: "error",
        message: "Esse usuário não está online."
      });
    }

    if (body.length > 4000) {
      return send(ws, {
        type: "error",
        message: "Mensagem muito grande."
      });
    }

    const message = {
      id: crypto.randomUUID(),
      from: ws.username,
      to,
      type: "text",
      body,
      at: new Date().toISOString()
    };

    const key = convoKey(ws.username, to);

    if (!conversations.has(key)) conversations.set(key, []);
    conversations.get(key).push(message);

    send(ws, { type: "message", message });

    const target = sessions.get(targetSessionId);
    if (target) send(target.ws, { type: "message", message });

    return;
  }

  if (data.action === "photo") {
    const to = cleanUsername(data.to);
    const dataUrl = String(data.dataUrl || "");

    if (!validUsername(to) || !dataUrl) return;

    const targetSessionId = usernameToSession.get(to);

    if (!targetSessionId) {
      return send(ws, {
        type: "error",
        message: "Esse usuário não está online."
      });
    }

    /*
      Só aceitamos imagens base64 e mantemos tudo em RAM.
    */
    if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(dataUrl)) {
      return send(ws, {
        type: "error",
        message: "Arquivo de imagem inválido."
      });
    }

    if (dataUrl.length > 6 * 1024 * 1024) {
      return send(ws, {
        type: "error",
        message: "A foto é grande demais."
      });
    }

    const message = {
      id: crypto.randomUUID(),
      from: ws.username,
      to,
      type: "image",
      dataUrl,
      at: new Date().toISOString()
    };

    const key = convoKey(ws.username, to);

    if (!conversations.has(key)) conversations.set(key, []);
    conversations.get(key).push(message);

    send(ws, { type: "message", message });

    const target = sessions.get(targetSessionId);
    if (target) send(target.ws, { type: "message", message });

    return;
  }

  if (data.action === "typing") {
    const to = cleanUsername(data.to);
    const targetSessionId = usernameToSession.get(to);

    if (!targetSessionId) return;

    const target = sessions.get(targetSessionId);
    if (!target) return;

    send(target.ws, {
      type: "typing",
      from: ws.username,
      active: !!data.active
    });

    return;
  }

  /*
    Painel administrativo temporário.
    Só @lanzoh21 pode usar.
    Nunca retorna senha.
  */
  if (data.action === "admin_snapshot") {
    if (!isAdmin(ws.username)) {
      return send(ws, {
        type: "error",
        message: "Acesso negado."
      });
    }

    const allMessages = [];

    for (const list of conversations.values()) {
      allMessages.push(...list);
    }

    allMessages.sort(
      (a, b) => new Date(a.at) - new Date(b.at)
    );

    send(ws, {
      type: "admin_snapshot",
      users: [...sessions.values()].map(s => ({
        username: s.username,
        online: true
      })),
      messages: allMessages
    });

    return;
  }
}

/* Servidor HTTP */
const server = http.createServer((req, res) => {
  let requestPath = decodeURIComponent(
    (req.url || "/").split("?")[0]
  );

  if (requestPath === "/") {
    requestPath = "/index.html";
  }

  const filePath = path.normalize(
    path.join(PUBLIC, requestPath)
  );

  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }

    const ext = path.extname(filePath).toLowerCase();

    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8"
    };

    res.writeHead(200, {
      "Content-Type":
        types[ext] || "application/octet-stream"
    });

    res.end(content);
  });
});

const wss = new WebSocket.Server({
  server
});

wss.on("connection", ws => {

  ws.on("message", raw => {
    handleMessage(ws, raw);
  });

  ws.on("close", () => {
    disconnectSession(ws);
  });

  ws.on("error", () => {
    disconnectSession(ws);
  });
});

server.listen(PORT, () => {
  console.log(`J3B Chat online na porta ${PORT}`);
});
