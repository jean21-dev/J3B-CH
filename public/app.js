let ws = null;

let me = "";
let current = "";

let users = [];
let searchTimer = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let shouldReconnect = true;

const histories = new Map();

const SERVER_URL = "wss://j3b-ch.onrender.com";

const $ = id => document.getElementById(id);

function setHidden(id, hidden) {
  $(id).classList.toggle("hidden", hidden);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function initials(text = "J3B") {
  return text.replace(/^@/, "").slice(0, 2).toUpperCase();
}

function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.remove("hidden");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.classList.add("hidden");
  }, 2500);
}

function connectionStatus(mode, text) {
  const el = $("connectionLabel");
  if (!el) return;

  el.textContent = text;

  if (mode === "ok") {
    el.style.color = "#4fd995";
  } else if (mode === "loading") {
    el.style.color = "#e5b84b";
  } else {
    el.style.color = "#ff7777";
  }
}

function send(data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  ws.send(JSON.stringify(data));
  return true;
}

/* =========================
   USERNAME LOCAL
========================= */

function getSavedUsername() {
  try {
    return localStorage.getItem("j3b_username") || "";
  } catch {
    return "";
  }
}

function saveUsername(username) {
  try {
    localStorage.setItem(
      "j3b_username",
      username
    );
  } catch {}
}

function removeSavedUsername() {
  try {
    localStorage.removeItem(
      "j3b_username"
    );
  } catch {}
}

/* =========================
   CONEXÃO
========================= */

function connect() {
  if (!shouldReconnect) return;

  if (
    ws &&
    (
      ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING
    )
  ) {
    return;
  }

  connectionStatus(
    "loading",
    "conectando..."
  );

  try {
    ws = new WebSocket(
      SERVER_URL
    );
  } catch {
    connectionStatus(
      "error",
      "erro"
    );
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectAttempt = 0;

    connectionStatus(
      "ok",
      "conectado"
    );

    const saved = getSavedUsername();

    if (saved) {
      loginWithUsername(saved);
    }
  };

  ws.onmessage = event => {
    let data;

    try {
      data = JSON.parse(
        event.data
      );
    } catch {
      return;
    }

    handleServer(data);
  };

  ws.onerror = () => {
    connectionStatus(
      "error",
      "erro"
    );
  };

  ws.onclose = () => {
    ws = null;

    connectionStatus(
      "error",
      "desconectado"
    );

    if (shouldReconnect) {
      scheduleReconnect();
    }
  };
}

function scheduleReconnect() {
  if (!shouldReconnect) return;
  if (reconnectTimer) return;

  reconnectAttempt++;

  const delay = Math.min(
    30000,
    1000 *
      Math.pow(
        2,
        reconnectAttempt - 1
      )
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);

  toast(
    "Reconectando em " +
    Math.ceil(delay / 1000) +
    "s..."
  );
}

/* =========================
   LOGIN
========================= */

function loginWithUsername(username) {
  username = String(username)
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return;
  }

  send({
    action: "login",
    username
  });
}

function enterApp(username, isAdmin) {
  me = username;

  saveUsername(username);

  setHidden("loginView", true);
  setHidden("appView", false);

  $("myUsername").textContent =
    "@" + username;

  $("myAvatar").textContent =
    initials(username);

  if (
    isAdmin &&
    username === "lanzoh21"
  ) {
    setHidden(
      "adminOpen",
      false
    );
  } else {
    setHidden(
      "adminOpen",
      true
    );
  }

  $("searchInput").focus();
}

function showLogin() {
  setHidden("appView", true);
  setHidden("loginView", false);

  $("usernameInput").value =
    getSavedUsername();
}

/* =========================
   SERVIDOR
========================= */

function handleServer(data) {

  if (data.type === "login_ok") {

    enterApp(
      data.username,
      data.isAdmin
    );

    return;
  }

  if (data.type === "login_taken") {

    /*
      Não apagamos o username salvo.
      Só permitimos escolher outro.
    */

    toast(data.message);

    setHidden(
      "loginView",
      false
    );

    setHidden(
      "appView",
      true
    );

    $("loginError").textContent =
      data.message;

    return;
  }

  if (data.type === "users") {

    users =
      data.users || [];

    renderUsers();

    if (current) {
      const online =
        users.some(
          u =>
            u.username ===
            current
        );

      $("chatStatus").textContent =
        online
          ? "online"
          : "offline";
    }

    return;
  }

  if (
    data.type ===
    "search_results"
  ) {

    renderSearchResults(
      data.users || []
    );

    return;
  }

  if (
    data.type ===
    "history"
  ) {

    histories.set(
      data.withUser,
      data.messages || []
    );

    if (
      current ===
      data.withUser
    ) {
      renderMessages(
        data.messages || []
      );
    }

    return;
  }

  if (
    data.type ===
    "message"
  ) {

    const message =
      data.message;

    const other =
      message.from === me
        ? message.to
        : message.from;

    let history =
      histories.get(
        other
      ) || [];

    if (
      !history.some(
        m =>
          m.id ===
          message.id
      )
    ) {
      history.push(message);
    }

    histories.set(
      other,
      history
    );

    if (
      current === other
    ) {
      renderMessages(history);
    } else {
      toast(
        "Nova mensagem de @" +
        message.from
      );
    }

    return;
  }

  if (
    data.type === "typing"
  ) {

    if (
      current === data.from
    ) {

      $("typing").textContent =
        data.active
          ? "@" +
            data.from +
            " está digitando..."
          : "";

      setHidden(
        "typing",
        !data.active
      );
    }

    return;
  }

  if (
    data.type ===
    "admin_snapshot"
  ) {

    renderAdmin(data);

    return;
  }

  if (data.type === "error") {

    toast(data.message);

    return;
  }
}

/* =========================
   LISTA DE ONLINE
========================= */

function renderUsers() {

  const box = $("users");

  box.innerHTML = "";

  const list =
    users.filter(
      user =>
        user.username !== me
    );

  if (!list.length) {

    box.innerHTML =
      '<div class="empty-users">Ninguém mais está online.</div>';

    return;
  }

  list.forEach(user => {

    const item =
      document.createElement(
        "div"
      );

    item.className =
      "user" +
      (
        user.username === current
          ? " active"
          : ""
      );

    item.innerHTML = `
      <div class="avatar">
        ${initials(user.username)}
      </div>

      <div class="uinfo">
        <strong>
          @${escapeHtml(user.username)}
        </strong>

        <small>
          online
        </small>
      </div>

      <span class="dot"></span>
    `;

    item.onclick = () => {
      openUser(
        user.username
      );
    };

    box.appendChild(item);
  });
}

/* =========================
   PESQUISA
========================= */

function searchUsers() {

  clearTimeout(
    searchTimer
  );

  const query =
    $("searchInput")
      .value
      .trim();

  if (!query) {
    $("searchResults").innerHTML = "";
    return;
  }

  searchTimer =
    setTimeout(() => {

      if (
        !send({
          action:
            "search_users",
          query
        })
      ) {
        toast(
          "Sem conexão."
        );
      }

    }, 250);
}

function renderSearchResults(list) {

  const box =
    $("searchResults");

  box.innerHTML = "";

  if (!list.length) {

    box.innerHTML =
      '<div class="search-empty">Nenhum usuário encontrado.</div>';

    return;
  }

  list.forEach(user => {

    const item =
      document.createElement(
        "div"
      );

    item.className =
      "search-result";

    item.innerHTML = `
      <div class="avatar">
        ${initials(user.username)}
      </div>

      <div class="result-info">
        <strong>
          @${escapeHtml(user.username)}
        </strong>
        <small>online</small>
      </div>

      <button>
        Chat
      </button>
    `;

    item
      .querySelector("button")
      .onclick = () => {
        openUser(
          user.username
        );
      };

    box.appendChild(item);
  });
}

$("searchInput")
  .addEventListener(
    "input",
    searchUsers
  );

/* =========================
   CHAT
========================= */

function openUser(username) {

  current =
    username;

  $("chatUser")
    .textContent =
    "@" + username;

  $("chatStatus")
    .textContent =
    "online";

  $("chatAvatar")
    .textContent =
    initials(username);

  setHidden(
    "empty",
    true
  );

  setHidden(
    "messages",
    false
  );

  setHidden(
    "composer",
    false
  );

  setHidden(
    "typing",
    true
  );

  $("searchResults")
    .innerHTML = "";

  $("searchInput")
    .value = "";

  $("sidebar")
    .classList
    .remove("open");

  if (
    !send({
      action:
        "history",
      withUser:
        username
    })
  ) {
    toast(
      "Aguardando conexão..."
    );
  }
}

function renderMessages(list) {

  const box =
    $("messages");

  box.innerHTML = "";

  list.forEach(message => {

    const bubble =
      document.createElement(
        "div"
      );

    bubble.className =
      "bubble " +
      (
        message.from === me
          ? "mine"
          : "theirs"
      );

    if (
      message.type ===
      "image"
    ) {

      const image =
        document.createElement(
          "img"
        );

      image.src =
        message.dataUrl;

      image.alt =
        "Foto";

      image.onclick = () =>
        window.open(
          message.dataUrl,
          "_blank"
        );

      bubble.appendChild(
        image
      );

    } else {

      bubble.innerHTML =
        escapeHtml(
          message.body
        ).replace(
          /\n/g,
          "<br>"
        );
    }

    const time =
      document.createElement(
        "span"
      );

    time.className =
      "time";

    time.textContent =
      formatTime(
        message.at
      );

    bubble.appendChild(
      time
    );

    box.appendChild(
      bubble
    );
  });

  box.scrollTop =
    box.scrollHeight;
}

function formatTime(value) {

  try {
    return new Date(value)
      .toLocaleTimeString(
        "pt-BR",
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      );
  } catch {
    return "";
  }
}

/* =========================
   ENVIAR TEXTO
========================= */

$("composer").onsubmit =
  event => {

    event.preventDefault();

    const body =
      $("message")
        .value
        .trim();

    if (!body)
      return;

    if (!current) {
      toast(
        "Escolha alguém."
      );
      return;
    }

    if (
      !send({
        action:
          "message",
        to:
          current,
        body
      })
    ) {

      toast(
        "Sem conexão."
      );

      return;
    }

    $("message").value = "";

    send({
      action:
        "typing",
      to:
        current,
      active: false
    });
  };

/* =========================
   DIGITANDO
========================= */

$("message")
  .addEventListener(
    "input",
    () => {

      if (!current)
        return;

      send({
        action:
          "typing",
        to:
          current,
        active:
          $("message")
            .value
            .length > 0
      });
    }
  );

/* =========================
   FOTO
========================= */

$("photo")
  .addEventListener(
    "change",
    () => {

      const file =
        $("photo").files[0];

      $("photo").value = "";

      if (!file)
        return;

      if (!current) {
        toast(
          "Escolha alguém."
        );
        return;
      }

      if (
        !file.type.startsWith(
          "image/"
        )
      ) {
        toast(
          "Escolha uma imagem."
        );
        return;
      }

      if (
        file.size >
        4.5 * 1024 * 1024
      ) {
        toast(
          "Foto grande demais."
        );
        return;
      }

      const reader =
        new FileReader();

      reader.onload = () => {

        if (
          !send({
            action:
              "photo",
            to:
              current,
            dataUrl:
              reader.result
          })
        ) {
          toast(
            "Sem conexão."
          );
        }
      };

      reader.onerror = () =>
        toast(
          "Não foi possível carregar a foto."
        );

      reader.readAsDataURL(
        file
      );
    }
  );

/* =========================
   LOGIN MANUAL
========================= */

$("enterBtn").onclick =
  () => {

    const username =
      $("usernameInput")
        .value
        .trim()
        .toLowerCase();

    if (
      !/^[a-z0-9_]{3,24}$/
        .test(username)
    ) {

      $("loginError")
        .textContent =
        "Use 3–24 caracteres: letras, números ou _.";

      return;
    }

    $("loginError")
      .textContent = "";

    if (
      !ws ||
      ws.readyState !==
      WebSocket.OPEN
    ) {

      toast(
        "Conectando..."
      );

      return;
    }

    saveUsername(username);

    loginWithUsername(
      username
    );
  };

$("usernameInput")
  .addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
        "Enter"
      ) {
        $("enterBtn").click();
      }

    }
  );

/* =========================
   NOVO USERNAME
========================= */

$("changeUsername")
  .onclick = () => {

    removeSavedUsername();

    me = "";
    current = "";

    histories.clear();

    $("usernameInput")
      .value = "";

    $("loginError")
      .textContent = "";

    showLogin();
  };

/* =========================
   MOBILE
========================= */

$("openSide")
  .onclick = () =>
    $("sidebar")
      .classList
      .add("open");

$("closeSide")
  .onclick = () =>
    $("sidebar")
      .classList
      .remove("open");

/* =========================
   LIMPAR TELA
========================= */

$("clearLocal")
  .onclick = () => {

    if (!current)
      return;

    histories.delete(
      current
    );

    $("messages")
      .innerHTML = "";
  };

/* =========================
   ADMIN
========================= */

$("adminOpen")
  .onclick = () => {

    $("adminPanel")
      .classList
      .remove("hidden");

    send({
      action:
        "admin_snapshot"
    });
  };

$("adminClose")
  .onclick = () =>
    $("adminPanel")
      .classList
      .add("hidden");

function renderAdmin(data) {

  $("adminUsers")
    .innerHTML = "";

  $("adminMessages")
    .innerHTML = "";

  data.users.forEach(user => {

    const item =
      document.createElement(
        "div"
      );

    item.className =
      "admin-item";

    item.textContent =
      "@" + user.username;

    $("adminUsers")
      .appendChild(item);
  });

  data.messages.forEach(message => {

    const item =
      document.createElement(
        "div"
      );

    item.className =
      "admin-item";

    const title =
      document.createElement(
        "strong"
      );

    title.textContent =
      "@" +
      message.from +
      " → @" +
      message.to;

    item.appendChild(
      title
    );

    if (
      message.type ===
      "image"
    ) {

      const label =
        document.createElement(
          "span"
        );

      label.textContent =
        "[foto]";

      item.appendChild(
        label
      );

      const image =
        document.createElement(
          "img"
        );

      image.src =
        message.dataUrl;

      image.style.width =
        "160px";

      image.style.display =
        "block";

      image.style.marginTop =
        "6px";

      image.style.borderRadius =
        "8px";

      item.appendChild(
        image
      );

    } else {

      const text =
        document.createElement(
          "span"
        );

      text.textContent =
        message.body;

      item.appendChild(
        text
      );
    }

    $("adminMessages")
      .appendChild(item);
  });
}

/* =========================
   INICIALIZAÇÃO
========================= */

(function init() {

  $("usernameInput")
    .value =
    getSavedUsername();

  connect();

})();
