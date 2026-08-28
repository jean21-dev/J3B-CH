let ws;
let me = "";
let current = "";
let users = [];
const historyCache = new Map();

const SERVER_URL = "wss://j3b-ch.onrender.com";

const $ = (id) => document.getElementById(id);

const loginView = $("loginView");
const appView = $("appView");

function initials(name = "J3B") {
    return name.replace(/^@/, "").slice(0, 2).toUpperCase();
}

function toast(text) {
    const element = $("toast");

    element.textContent = text;
    element.classList.remove("hidden");

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
        element.classList.add("hidden");
    }, 2200);
}

function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function start() {

    ws = new WebSocket(SERVER_URL);

    ws.onopen = () => {

        $("connectionLabel").textContent = "conectado";

        console.log("Conectado ao servidor J3B");

    };

    ws.onclose = () => {

        $("connectionLabel").textContent = "desconectado";

        toast("Conexão encerrada.");

    };

    ws.onerror = () => {

        toast("Não foi possível conectar ao servidor.");

    };

    ws.onmessage = (event) => {

        let data;

        try {
            data = JSON.parse(event.data);
        } catch {
            return;
        }

        /*
        ==========================
        LOGIN
        ==========================
        */

        if (data.type === "login_ok") {

            me = data.username;

            loginView.classList.add("hidden");

            appView.classList.remove("hidden");

            $("myUsername").textContent = "@" + me;

            $("myAvatar").textContent = initials(me);

            /*
            O usuário lanzoh21 recebe
            acesso ao painel administrativo.
            */

            if (me === "lanzoh21") {

                $("adminOpen").classList.remove("hidden");

            }

            return;
        }

        /*
        ==========================
        LISTA DE USUÁRIOS
        ==========================
        */

        if (data.type === "users") {

            users = data.users || [];

            renderUsers();

            if (current) {

                const online = users.some(
                    user => user.username === current
                );

                $("chatStatus").textContent =
                    online ? "online" : "offline";

            }

            return;
        }

        /*
        ==========================
        HISTÓRICO TEMPORÁRIO
        ==========================
        */

        if (data.type === "history") {

            historyCache.set(
                data.withUser,
                data.messages || []
            );

            if (current === data.withUser) {

                renderMessages(
                    data.messages || []
                );

            }

            return;
        }

        /*
        ==========================
        NOVA MENSAGEM
        ==========================
        */

        if (data.type === "message") {

            const message = data.message;

            const other =
                message.from === me
                    ? message.to
                    : message.from;

            let conversation =
                historyCache.get(other) || [];

            /*
            Evita mensagens duplicadas.
            */

            if (
                !conversation.some(
                    item => item.id === message.id
                )
            ) {

                conversation.push(message);

            }

            historyCache.set(
                other,
                conversation
            );

            if (current === other) {

                renderMessages(conversation);

            } else {

                toast(
                    "Nova mensagem de @" +
                    message.from
                );

            }

            return;
        }

        /*
        ==========================
        DIGITANDO
        ==========================
        */

        if (data.type === "typing") {

            if (current === data.from) {

                if (data.active) {

                    $("typing").textContent =
                        "@" +
                        data.from +
                        " está digitando...";

                    $("typing")
                        .classList
                        .remove("hidden");

                } else {

                    $("typing").textContent = "";

                    $("typing")
                        .classList
                        .add("hidden");

                }

            }

            return;
        }

        /*
        ==========================
        ADMIN
        ==========================
        */

        if (data.type === "admin_snapshot") {

            renderAdmin(data);

            return;
        }

        /*
        ==========================
        ERRO
        ==========================
        */

        if (data.type === "error") {

            toast(data.message);

            return;
        }

    };
}

/*
====================================
MOSTRAR USUÁRIOS
====================================
*/

function renderUsers() {

    const container = $("users");

    container.innerHTML = "";

    const otherUsers =
        users.filter(
            user => user.username !== me
        );

    if (otherUsers.length === 0) {

        container.innerHTML =
            '<div style="padding:18px;color:#555;font-size:11px">' +
            "Ninguém mais está online." +
            "</div>";

        return;
    }

    otherUsers.forEach(user => {

        const element =
            document.createElement("div");

        element.className =
            "user" +
            (
                user.username === current
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

            openUser(user.username);

        };

        container.appendChild(element);

    });
}

/*
====================================
ABRIR CONVERSA
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

    send({
        action: "history",
        withUser: username
    });

}

/*
====================================
MOSTRAR MENSAGENS
====================================
*/

function renderMessages(list) {

    const box = $("messages");

    box.innerHTML = "";

    list.forEach(message => {

        const bubble =
            document.createElement("div");

        bubble.className =
            "bubble " +
            (
                message.from === me
                    ? "mine"
                    : "theirs"
            );

        /*
        FOTO
        */

        if (message.type === "image") {

            const image =
                document.createElement("img");

            image.src =
                message.dataUrl;

            image.alt = "Foto";

            image.onclick = () => {

                window.open(
                    message.dataUrl,
                    "_blank"
                );

            };

            bubble.appendChild(image);

            if (message.body) {

                const text =
                    document.createElement("div");

                text.innerHTML =
                    escapeHtml(
                        message.body
                    ).replace(
                        /\n/g,
                        "<br>"
                    );

                bubble.appendChild(text);

            }

        }

        /*
        TEXTO
        */

        else {

            bubble.innerHTML =
                escapeHtml(
                    message.body
                ).replace(
                    /\n/g,
                    "<br>"
                );

        }

        /*
        HORÁRIO
        */

        const time =
            document.createElement("span");

        time.className = "time";

        time.textContent =
            formatTime(message.at);

        bubble.appendChild(time);

        box.appendChild(bubble);

    });

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

        return new Date(date)
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

/*
====================================
ESCAPAR HTML
====================================
*/

function escapeHtml(text) {

    return String(text ?? "")
        .replace(
            /[&<>"']/g,
            character => {

                const characters = {

                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#039;"

                };

                return characters[character];

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
        !/^[a-z0-9_]{3,24}$/.test(username)
    ) {

        $("loginError").textContent =
            "Use 3–24 caracteres: letras, números ou _.";

        return;

    }

    $("loginError").textContent = "";

    if (
        !ws ||
        ws.readyState !== WebSocket.OPEN
    ) {

        toast(
            "Conectando ao servidor..."
        );

        return;

    }

    send({
        action: "login",
        username: username
    });

};

/*
====================================
ENTER NO CAMPO
====================================
*/

$("usernameInput")
    .addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {

                $("enterBtn").click();

            }

        }
    );

/*
====================================
ENVIAR MENSAGEM
====================================
*/

$("composer").onsubmit = event => {

    event.preventDefault();

    const input =
        $("message");

    const body =
        input.value.trim();

    if (!body) return;

    if (!current) {

        toast(
            "Escolha alguém primeiro."
        );

        return;

    }

    send({

        action: "message",

        to: current,

        body: body

    });

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

            if (!current) return;

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
ENVIAR FOTO
====================================
*/

$("photo").onchange = () => {

    const file =
        $("photo").files[0];

    $("photo").value = "";

    if (!file) return;

    if (!current) {

        toast(
            "Escolha alguém primeiro."
        );

        return;

    }

    /*
    Limite aproximado de 4,5 MB.
    */

    if (
        file.size >
        4.5 * 1024 * 1024
    ) {

        toast(
            "Foto grande demais."
        );

        return;

    }

    /*
    Aceita somente imagens.
    */

    if (
        !file.type.startsWith("image/")
    ) {

        toast(
            "Escolha uma imagem."
        );

        return;

    }

    const reader =
        new FileReader();

    reader.onload = () => {

        send({

            action: "photo",

            to: current,

            dataUrl:
                reader.result

        });

    };

    reader.onerror = () => {

        toast(
            "Não foi possível carregar a foto."
        );

    };

    reader.readAsDataURL(file);

};

/*
====================================
MENU MOBILE
====================================
*/

$("openSide").onclick = () => {

    $("sidebar")
        .classList
        .add("open");

};

$("closeSide").onclick = () => {

    $("sidebar")
        .classList
        .remove("open");

};

/*
====================================
LIMPAR TELA
====================================
*/

$("clearLocal").onclick = () => {

    if (!current) return;

    $("messages").innerHTML = "";

    historyCache.delete(
        current
    );

};

/*
====================================
PAINEL ADMIN
====================================
*/

$("adminOpen").onclick = () => {

    $("adminPanel")
        .classList
        .remove("hidden");

    send({
        action: "admin_snapshot"
    });

};

$("adminClose").onclick = () => {

    $("adminPanel")
        .classList
        .add("hidden");

};

/*
====================================
MOSTRAR ADMIN
====================================
*/

function renderAdmin(data) {

    const usersBox =
        $("adminUsers");

    const messagesBox =
        $("adminMessages");

    usersBox.innerHTML = "";

    messagesBox.innerHTML = "";

    /*
    USUÁRIOS
    */

    data.users.forEach(username => {

        const element =
            document.createElement("div");

        element.className =
            "admin-item";

        element.textContent =
            "@" + username;

        usersBox.appendChild(
            element
        );

    });

    /*
    MENSAGENS
    */

    data.messages.forEach(message => {

        const element =
            document.createElement("div");

        element.className =
            "admin-item";

        const header =
            document.createElement("strong");

        header.textContent =
            "@" +
            message.from +
            " → @" +
            message.to;

        element.appendChild(
            header
        );

        if (
            message.type === "image"
        ) {

            const label =
                document.createElement("span");

            label.textContent =
                "[foto temporária]";

            element.appendChild(
                label
            );

            const image =
                document.createElement("img");

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
                document.createElement("span");

            text.textContent =
                message.body;

            element.appendChild(
                text
            );

        }

        messagesBox.appendChild(
            element
        );

    });

}

/*
====================================
INICIAR
====================================
*/

start();      $("myUsername").textContent="@"+me;
      $("myAvatar").textContent=initials(me);
      if(me==="lanzoh21") $("adminOpen").classList.remove("hidden");
    }
    if(d.type==="users"){
      users=d.users;
      renderUsers();
      $("chatStatus").textContent = current && users.some(u=>u.username===current) ? "online" : "offline";
    }
    if(d.type==="history"){
      historyCache.set(d.withUser,d.messages || []);
      if(current===d.withUser) renderMessages(d.messages || []);
    }
    if(d.type==="message"){
      const other=d.message.from===me?d.message.to:d.message.from;
      const arr=historyCache.get(other)||[];
      if(!arr.some(x=>x.id===d.message.id)) arr.push(d.message);
      historyCache.set(other,arr);
      if(current===other) renderMessages(arr);
      else toast("Nova mensagem de @"+d.message.from);
    }
    if(d.type==="typing"){
      if(current===d.from){
        $("typing").textContent=d.active ? "@"+d.from+" está digitando..." : "";
        $("typing").classList.toggle("hidden",!d.active);
      }
    }
    if(d.type==="admin_snapshot") renderAdmin(d);
    if(d.type==="error") toast(d.message);
  };
}

function renderUsers(){
  $("users").innerHTML="";
  users.filter(u=>u.username!==me).forEach(u=>{
    const el=document.createElement("div");
    el.className="user"+(u.username===current?" active":"");
    el.innerHTML=`<div class="avatar">${initials(u.username)}</div>
      <div class="uinfo"><strong>@${u.username}</strong><small>online</small></div><span class="dot"></span>`;
    el.onclick=()=>openUser(u.username);
    $("users").appendChild(el);
  });
  if(users.length<=1){
    $("users").innerHTML='<div style="padding:18px;color:#555;font-size:11px">Ninguém mais está online.</div>';
  }
}

function openUser(username){
  current=username;
  $("chatUser").textContent="@"+username;
  $("chatStatus").textContent="online";
  $("chatAvatar").textContent=initials(username);
  $("empty").classList.add("hidden");
  $("messages").classList.remove("hidden");
  $("composer").classList.remove("hidden");
  $("sidebar").classList.remove("open");
  send({action:"history",withUser:username});
}

function renderMessages(list){
  const box=$("messages");
  box.innerHTML="";
  for(const m of list){
    const el=document.createElement("div");
    el.className="bubble "+(m.from===me?"mine":"theirs");
    let content="";
    if(m.type==="image"){
      const img=document.createElement("img");
      img.src=m.dataUrl; img.alt="foto";
      img.onclick=()=>window.open(m.dataUrl,"_blank");
      el.appendChild(img);
      if(m.body) content += escapeHtml(m.body);
    } else {
      content=escapeHtml(m.body).replace(/\n/g,"<br>");
      el.innerHTML += content;
    }
    if(m.type==="image" && content){
      const p=document.createElement("div"); p.innerHTML=content; el.appendChild(p);
    }
    const time=document.createElement("span");
    time.className="time";
    time.textContent=new Date(m.at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    el.appendChild(time);
    box.appendChild(el);
  }
  box.scrollTop=box.scrollHeight;
}

function escapeHtml(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

$("enterBtn").onclick=()=>{
  const u=$("usernameInput").value.trim().toLowerCase();
  if(!/^[a-z0-9_]{3,24}$/.test(u)){
    $("loginError").textContent="Use 3–24 caracteres: letras, números ou _.";
    return;
  }
  $("loginError").textContent="";
  send({action:"login",username:u});
};
$("usernameInput").addEventListener("keydown",e=>{if(e.key==="Enter")$("enterBtn").click()});

$("composer").onsubmit=e=>{
  e.preventDefault();
  const input=$("message"), body=input.value.trim();
  if(!body||!current)return;
  send({action:"message",to:current,body});
  input.value="";
};

$("message").addEventListener("input",()=>{
  if(!current)return;
  send({action:"typing",to:current,active:$("message").value.length>0});
});

$("photo").onchange=async()=>{
  const file=$("photo").files[0]; $("photo").value="";
  if(!file||!current)return;
  if(file.size>4.5*1024*1024){toast("Foto grande demais.");return;}
  const reader=new FileReader();
  reader.onload=()=>send({action:"photo",to:current,dataUrl:reader.result});
  reader.readAsDataURL(file);
};

$("openSide").onclick=()=>$("sidebar").classList.add("open");
$("closeSide").onclick=()=>$("sidebar").classList.remove("open");
$("clearLocal").onclick=()=>{ $("messages").innerHTML=""; historyCache.delete(current); };
$("adminOpen").onclick=()=>{ $("adminPanel").classList.remove("hidden"); send({action:"admin_snapshot"}); };
$("adminClose").onclick=()=>$("adminPanel").classList.add("hidden");

function renderAdmin(d){
  $("adminUsers").innerHTML="";
  for(const u of d.users){
    const x=document.createElement("div");x.className="admin-item";x.textContent="@"+u;$("adminUsers").appendChild(x);
  }
  $("adminMessages").innerHTML="";
  for(const m of d.messages){
    const x=document.createElement("div");x.className="admin-item";
    if(m.type==="image"){
      x.innerHTML=`<strong>@${escapeHtml(m.from)} → @${escapeHtml(m.to)}</strong><span>[foto temporária]</span>`;
      const img=document.createElement("img");img.src=m.dataUrl;img.style.maxWidth="180px";img.style.marginTop="6px";img.style.borderRadius="8px";x.appendChild(img);
    }else{
      x.innerHTML=`<strong>@${escapeHtml(m.from)} → @${escapeHtml(m.to)}</strong><span>${escapeHtml(m.body)}</span>`;
    }
    $("adminMessages").appendChild(x);
  }
}

start();
