let ws;
let me = "";
let current = "";
let users = [];
const historyCache = new Map();

const $ = id => document.getElementById(id);
const loginView = $("loginView");
const appView = $("appView");

function initials(n="J3B"){
  return n.replace(/^@/,"").slice(0,2).toUpperCase();
}
function toast(t){
  $("toast").textContent=t; $("toast").classList.remove("hidden");
  clearTimeout(toast.t); toast.t=setTimeout(()=>$("toast").classList.add("hidden"),2200);
}
function send(o){ if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(o)); }

function start(){
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => $("connectionLabel").textContent="conectado";
  ws.onclose = () => {
    $("connectionLabel").textContent="desconectado";
    toast("Conexão encerrada.");
  };
  ws.onerror = () => toast("Não foi possível conectar.");

  ws.onmessage = e => {
    let d; try{ d=JSON.parse(e.data) } catch{return}
    if(d.type==="login_ok"){
      me=d.username;
      loginView.classList.add("hidden");
      appView.classList.remove("hidden");
      $("myUsername").textContent="@"+me;
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
