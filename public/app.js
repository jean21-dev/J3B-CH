let ws = null;
let me = "";
let current = "";
let users = [];
let reconnectTimer = null;
let reconnectAttempt = 0;
let manuallyClosed = false;

const historyCache = new Map();

const SERVER_URL = "wss://j3b-ch.onrender.com";

const $ = (id) => document.getElementById(id);

const loginView = $("loginView");
const appView = $("appView");

function setConnectionStatus(status, message) {
    const label = $("connectionLabel");

    if (status === "connecting") {
        label.textContent = "conectando...";
        label.style.color = "#e5b84b";
    }

    if (status === "connected") {
        label.textContent = "conectado";
        label.style.color = "#4fd995";
    }

    if (status === "error") {
        label.textContent = "erro de conexão";
        label.style.color = "#ff7070";
    }

    if (status === "offline") {
        label.textContent = "desconectado";
        label.style.color = "#777";
    }

    if (message) {
        toast(message);
    }
}

function initials(name = "J3B") {
    return name
        .replace(/^@/, "")
        .slice(0, 2)
        .toUpperCase();
}

function toast(text) {
    const element = $("toast");

    if (!element) return;

    element.textContent = text;
    element.classList.remove("hidden");

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
        element.classList.add("hidden");
    }, 2500);
}

function send(data) {
    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {
        ws.send(JSON.stringify(data));
        return true;
    }

    return false;
}

/*
====================================
CONEXÃO
====================================
*/

function connect() {

    if (manuallyClosed) return;

    if (
        ws &&
        (
            ws.readyState === WebSocket.OPEN ||
            ws.readyState === WebSocket.CONNECTING
        )
    ) {
        return;
    }

    setConnectionStatus(
        "connecting"
    );

    try {

        ws = new WebSocket(
            SERVER_URL
        );

    } catch (error) {

        setConnectionStatus(
            "error",
            "Erro ao criar conexão."
        );

        scheduleReconnect();

        return;
    }

    ws.onopen = () => {

        reconnectAttempt = 0;

        setConnectionStatus(
            "connected"
        );

        /*
        Se o usuário já tinha entrado,
        tenta entrar novamente após
        uma reconexão.
        */

        if (me) {

            send({
                action: "login",
                username: me
            });

        }

    };

    ws.onclose = () => {

        ws = null;

        setConnectionStatus(
            "offline"
        );

        if (!manuallyClosed) {

            scheduleReconnect();

        }

    };

    ws.onerror = () => {

        setConnectionStatus(
            "error"
        );

        /*
        O onclose normalmente será
        chamado logo depois e fará
        a reconexão.
        */

    };

    ws.onmessage = (event) => {

        let data;

        try {

            data = JSON.parse(
                event.data
            );

        } catch {

            return;

        }

        handleServerMessage(data);

    };
}

/*
====================================
RECONEXÃO AUTOMÁTICA
====================================
*/

function scheduleReconnect() {

    if (manuallyClosed) return;

    if (reconnectTimer) return;

    reconnectAttempt++;

    /*
    1s → 2s → 4s → 8s → 16s...
    máximo de 30 segundos.
    */

    const delay =
        Math.min(
            30000,
            1000 *
            Math.pow(
                2,
                reconnectAttempt - 1
            )
        );

    toast(
        "Reconectando em " +
        Math.ceil(delay / 1000) +
        "s..."
    );

    reconnectTimer = setTimeout(
        () => {

            reconnectTimer = null;

            connect();

        },
        delay
    );
}

/*
====================================
MENSAGENS DO SERVIDOR
====================================
*/

function handleServerMessage(data) {

    /*
    LOGIN
    */

    if (data.type === "login_ok") {

        me = data.username;

        loginView.classList.add(
            "hidden"
        );

        appView.classList.remove(
            "hidden"
        );

        $("myUsername").textContent =
            "@" + me;

        $("myAvatar").textContent =
            initials(me);

        if (me === "lanzoh21") {

            $("adminOpen")
                .classList
                .remove("hidden");

        }

        return;
    }

    /*
    USUÁRIOS
    */

    if (data.type === "users") {

        users =
            data.users || [];

        renderUsers();

        if (current) {

            const online =
                users.some(
                    user =>
                        user.username ===
                        current
                );

            $("chatStatus").textContent =
                online
                    ? "online"
                    : "offline";

        }

        return;
    }

    /*
    HISTÓRICO
    */

    if (data.type === "history") {

        historyCache.set(
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

    /*
    NOVA MENSAGEM
    */

    if (data.type === "message") {

        const message =
            data.message;

        const other =
            message.from === me
                ? message.to
                : message.from;

        let conversation =
            historyCache.get(
                other
            ) || [];

        if (
            !conversation.some(
                item =>
                    item.id ===
                    message.id
            )
        ) {

            conversation.push(
                message
            );

        }

        historyCache.set(
            other,
            conversation
        );

        if (
            current === other
        ) {

            renderMessages(
                conversation
            );

        } else {

            toast(
                "Nova mensagem de @" +
                message.from
            );

        }

        return;
    }

    /*
    DIGITANDO
    */

    if (data.type === "typing") {

        if (
            current ===
            data.from
        ) {

            if (data.active) {

                $("typing")
                    .textContent =
                    "@" +
                    data.from +
                    " está digitando...";

                $("typing")
                    .classList
                    .remove(
                        "hidden"
                    );

            } else {

                $("typing")
                    .textContent =
                    "";

                $("typing")
                    .classList
                    .add(
                        "hidden"
                    );

            }

        }

        return;
    }

    /*
    ADMIN
    */

    if (
        data.type ===
        "admin_snapshot"
    ) {

        renderAdmin(
            data
        );

        return;
    }

    /*
    ERRO
    */

    if (data.type === "error") {

        toast(
            data.message
        );

        return;
    }
}

/*
====================================
USUÁRIOS
====================================
*/

function renderUsers() {

    const container =
        $("users");

    container.innerHTML = "";

    const otherUsers =
        users.filter(
            user =>
                user.username !== me
        );

    if (
        otherUsers.length === 0
    ) {

        container.innerHTML =
            '<div style="padding:18px;color:#555;font-size:11px">' +
            "Ninguém mais está online." +
            "</div>";

        return;
    }

    otherUsers.forEach(
        user => {

            const element =
                document.createElement(
                    "div"
                );

            element.className =
                "user" +
                (
                    user.username ===
                    current
                        ? " active"
                        : ""
                );

            element.innerHTML = `
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

            element.onclick = () => {

                openUser(
                    user.username
                );

            };

            container.appendChild(
                element
            );

        }
    );
}

/*
====================================
ABRIR USUÁRIO
====================================
*/

function openUser(username) {

    current = username;

    $("chatUser").textContent =
        "@" + username;

    $("chatStatus").textContent =
        "online";

    $("chatAvatar").textContent =
        initials(username);

    $("empty")
        .classList
        .add("hidden");

    $("messages")
        .classList
        .remove("hidden");

    $("composer")
        .classList
        .remove("hidden");

    $("sidebar")
        .classList
        .remove("open");

    $("typing")
        .classList
        .add("hidden");

    if (
        !send({
            action: "history",
            withUser: username
        })
    ) {

        toast(
            "Aguardando conexão..."
        );

    }
}

/*
====================================
MENSAGENS
====================================
*/

function renderMessages(list) {

    const box =
        $("messages");

    box.innerHTML = "";

    list.forEach(
        message => {

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

                image.onclick = () => {

                    window.open(
                        message.dataUrl,
                        "_blank"
                    );

                };

                bubble.appendChild(
                    image
                );

                if (
                    message.body
                ) {

                    const text =
                        document.createElement(
                            "div"
                        );

                    text.innerHTML =
                        escapeHtml(
                            message.body
                        ).replace(
                            /\n/g,
                            "<br>"
                        );

                    bubble.appendChild(
                        text
                    );

                }

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

        }
    );

    box.scrollTop =
        box.scrollHeight;
}

/*
====================================
HORÁRIO
====================================
*/

function formatTime(date) {

    try {

        return new Date(
            date
        ).toLocaleTimeString(
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

/*
====================================
ESCAPAR HTML
====================================
*/

function escapeHtml(text) {

    return String(
        text ?? ""
    ).replace(
        /[&<>"']/g,
        character => {

            const characters = {

                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"

            };

            return characters[
                character
            ];

        }
    );
}

/*
====================================
ENTRAR
====================================
*/

$("enterBtn").onclick = () => {

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

    /*
    Guarda o username localmente
    somente durante a execução da página.
    */

    me = username;

    if (
        !ws ||
        ws.readyState !==
        WebSocket.OPEN
    ) {

        toast(
            "Conectando ao servidor..."
        );

        connect();

        return;
    }

    send({
        action: "login",
        username: username
    });
};

/*
====================================
ENTER NO INPUT
====================================
*/

$("usernameInput")
    .addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                $("enterBtn")
                    .click();

            }

        }
    );

/*
====================================
ENVIAR TEXTO
====================================
*/

$("composer").onsubmit =
    event => {

        event.preventDefault();

        const input =
            $("message");

        const body =
            input.value.trim();

        if (!body)
            return;

        if (!current) {

            toast(
                "Escolha alguém primeiro."
            );

            return;
        }

        if (
            !send({
                action: "message",
                to: current,
                body: body
            })
        ) {

            toast(
                "Sem conexão com o servidor."
            );

            return;
        }

        input.value = "";

        send({
            action: "typing",
            to: current,
            active: false
        });
    };

/*
====================================
DIGITANDO
====================================
*/

$("message")
    .addEventListener(
        "input",
        () => {

            if (!current)
                return;

            send({

                action: "typing",

                to: current,

                active:
                    $("message")
                        .value
                        .length > 0

            });

        }
    );

/*
====================================
FOTO
====================================
*/

$("photo").onchange =
    () => {

        const file =
            $("photo").files[0];

        $("photo").value = "";

        if (!file)
            return;

        if (!current) {

            toast(
                "Escolha alguém primeiro."
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

        const reader =
            new FileReader();

        reader.onload = () => {

            if (
                !send({
                    action: "photo",
                    to: current,
                    dataUrl:
                        reader.result
                })
            ) {

                toast(
                    "Sem conexão com o servidor."
                );

            }

        };

        reader.onerror = () => {

            toast(
                "Não foi possível carregar a foto."
            );

        };

        reader.readAsDataURL(
            file
        );
    };

/*
====================================
MENU MOBILE
====================================
*/

$("openSide").onclick =
    () => {

        $("sidebar")
            .classList
            .add("open");

    };

$("closeSide").onclick =
    () => {

        $("sidebar")
            .classList
            .remove("open");

    };

/*
====================================
LIMPAR TELA
====================================
*/

$("clearLocal").onclick =
    () => {

        if (!current)
            return;

        $("messages")
            .innerHTML = "";

        historyCache.delete(
            current
        );
    };

/*
====================================
ADMIN
====================================
*/

$("adminOpen").onclick =
    () => {

        $("adminPanel")
            .classList
            .remove("hidden");

        send({
            action:
                "admin_snapshot"
        });

    };

$("adminClose").onclick =
    () => {

        $("adminPanel")
            .classList
            .add("hidden");

    };

/*
====================================
ADMIN — MOSTRAR DADOS
====================================
*/

function renderAdmin(data) {

    const usersBox =
        $("adminUsers");

    const messagesBox =
        $("adminMessages");

    usersBox.innerHTML = "";

    messagesBox.innerHTML = "";

    data.users.forEach(
        username => {

            const element =
                document.createElement(
                    "div"
                );

            element.className =
                "admin-item";

            element.textContent =
                "@" + username;

            usersBox.appendChild(
                element
            );

        }
    );

    data.messages.forEach(
        message => {

            const element =
                document.createElement(
                    "div"
                );

            element.className =
                "admin-item";

            const header =
                document.createElement(
                    "strong"
                );

            header.textContent =
                "@" +
                message.from +
                " → @" +
                message.to;

            element.appendChild(
                header
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
                    "[foto temporária]";

                element.appendChild(
                    label
                );

                const image =
                    document.createElement(
                        "img"
                    );

                image.src =
                    message.dataUrl;

                image.style.maxWidth =
                    "180px";

                image.style.marginTop =
                    "6px";

                image.style.borderRadius =
                    "8px";

                element.appendChild(
                    image
                );

            } else {

                const text =
                    document.createElement(
                        "span"
                    );

                text.textContent =
                    message.body;

                element.appendChild(
                    text
                );
            }

            messagesBox.appendChild(
                element
            );

        }
    );
}

/*
====================================
INICIAR
====================================
*/

connect();
