const socket = io();

const $ = id => document.getElementById(id);
const views = ["homeView","lobbyView","gameView","finishView"];

let setupMode = "create";
let difficulty = "easy";
let room = null;
let timerInterval = null;
let timerEndsAt = 0;
let timerDuration = 90;
let soundOn = true;

function showView(id){
  views.forEach(v => $(v).classList.toggle("hidden", v !== id));
  window.scrollTo({top:0,behavior:"smooth"});
}

function toast(msg){
  const t=$("toast"); t.textContent=msg; t.classList.remove("hidden");
  clearTimeout(t._tm); t._tm=setTimeout(()=>t.classList.add("hidden"),2400);
}

function beep(freq=520,duration=.08,type="sine"){
  if(!soundOn) return;
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type; o.frequency.value=freq; g.gain.value=.05;
    o.connect(g); g.connect(ctx.destination); o.start();
    g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);
    o.stop(ctx.currentTime+duration);
  }catch{}
}

function playerName(){
  const n=$("playerName").value.trim();
  if(!n){ $("setupError").textContent="Ismingizni kiriting."; $("setupError").classList.remove("hidden"); return null; }
  localStorage.setItem("geomulti:name",n); return n;
}
$("playerName").value=localStorage.getItem("geomulti:name")||"";

socket.on("connect",()=>{
  $("connectionBadge").textContent="● Onlayn";
  $("connectionBadge").className="badge badge-ok";
});
socket.on("disconnect",()=>{
  $("connectionBadge").textContent="● Uzildi";
  $("connectionBadge").className="badge badge-warn";
});

$("soundBtn").onclick=()=>{
  soundOn=!soundOn; $("soundBtn").textContent=soundOn?"🔊":"🔇"; beep();
};

$("createTabBtn").onclick=()=>openSetup("create");
$("joinTabBtn").onclick=()=>openSetup("join");
$("closeSetup").onclick=()=>$("setupPanel").classList.add("hidden");

function openSetup(mode){
  setupMode=mode;
  $("setupPanel").classList.remove("hidden");
  $("setupError").classList.add("hidden");
  const join=mode==="join";
  $("setupTitle").textContent=join?"Xonaga kirish":"Xona ochish";
  $("setupSubtitle").textContent=join?"Do‘stingiz yuborgan 6 belgili kodni kiriting.":"Rejim va raundlar sonini tanlang.";
  $("roomCodeField").classList.toggle("hidden",!join);
  $("hostSettings").classList.toggle("hidden",join);
  $("setupAction").textContent=join?"Xonaga kirish":"Xonani yaratish";
  $("setupPanel").scrollIntoView({behavior:"smooth",block:"center"});
}

document.querySelectorAll(".difficulty").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll(".difficulty").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active"); difficulty=btn.dataset.difficulty;
});

$("setupAction").onclick=()=>{
  const name=playerName(); if(!name)return;
  $("setupError").classList.add("hidden");
  if(setupMode==="create"){
    socket.emit("room:create",{name,difficulty,totalRounds:Number($("roundCount").value)},res=>{
      if(!res.ok)return setupError(res.message);
      room=res.room; enterLobby();
    });
  }else{
    const code=$("roomCodeInput").value.trim().toUpperCase();
    if(code.length!==6)return setupError("6 belgili xona kodini kiriting.");
    socket.emit("room:join",{name,code},res=>{
      if(!res.ok)return setupError(res.message);
      room=res.room; enterLobby();
    });
  }
};

function setupError(msg){$("setupError").textContent=msg;$("setupError").classList.remove("hidden")}

function enterLobby(){
  showView("lobbyView");
  renderRoom(room);
}

$("copyCodeBtn").onclick=async()=>{
  try{await navigator.clipboard.writeText(room?.code||"");toast("Xona kodi nusxalandi ✅")}catch{toast(room?.code||"")}
};

$("startGameBtn").onclick=()=>{
  socket.emit("game:start",{},res=>{if(!res?.ok)toast(res?.message||"Boshlanmadi")});
};

socket.on("room:update",r=>{
  room=r;
  if(r.status==="lobby") renderRoom(r);
  if(r.status==="playing") renderLiveLeaderboard(r.players);
});

function renderRoom(r){
  $("roomCodeDisplay").textContent=r.code;
  $("lobbyDifficulty").textContent=r.difficulty==="easy"?"Oson":"Qiyin";
  $("lobbyRounds").textContent=r.totalRounds;
  $("lobbyPlayersCount").textContent=r.players.length;
  $("playerCapacity").textContent=`${r.players.length}/20`;
  $("lobbyPlayers").innerHTML=r.players.map(p=>`
    <div class="player-row">
      <div class="player-avatar">${escapeHtml(p.name[0]?.toUpperCase()||"?")}</div>
      <div class="player-main">
        <div class="player-name">${escapeHtml(p.name)} ${p.id===r.hostId?'<span class="text-amber-300 text-xs">HOST</span>':''}</div>
        <div class="player-sub">Tayyor</div>
      </div>
    </div>`).join("");
  const meHost=socket.id===r.hostId;
  $("startGameBtn").classList.toggle("hidden",!meHost);
  $("waitingHost").classList.toggle("hidden",meHost);
}

socket.on("round:start",data=>{
  showView("gameView");
  $("revealCard").classList.add("hidden");
  $("answerForm").classList.remove("hidden");
  $("answerInput").disabled=false;
  $("answerInput").value="";
  $("answerInput").focus();
  $("answerFeedback").classList.add("hidden");
  $("roundLabel").textContent=`RAUND ${data.round}/${data.totalRounds}`;
  $("gameTitle").textContent=data.difficulty==="easy"?"Ishoralar asosida davlatni toping":"Bitta ishora. Diqqat!";
  $("hints").innerHTML=data.hints.map((h,i)=>`<div class="hint-card"><span class="text-cyan-300 font-black mr-2">${i+1}</span>${escapeHtml(h)}</div>`).join("");
  timerDuration=data.duration; timerEndsAt=data.endsAt; startTimer();
  beep(650,.1);
});

function startTimer(){
  clearInterval(timerInterval);
  const tick=()=>{
    const remain=Math.max(0,Math.ceil((timerEndsAt-Date.now())/1000));
    $("timerText").textContent=remain;
    const pct=Math.max(0,Math.min(100,remain/timerDuration*100));
    $("timerRing").style.background=`conic-gradient(var(--cyan) ${pct}%, rgba(255,255,255,.08) 0)`;
    if(remain<=0)clearInterval(timerInterval);
  };
  tick(); timerInterval=setInterval(tick,250);
}

$("answerForm").onsubmit=e=>{
  e.preventDefault();
  const answer=$("answerInput").value.trim(); if(!answer)return;
  socket.emit("answer:submit",{answer},res=>{
    if(!res?.ok){toast(res?.message||"Javob yuborilmadi");return}
    if(res.correct){
      feedback(`✅ To‘g‘ri! +${res.gained} ball`,"good");
      $("answerInput").disabled=true;
      beep(820,.16,"triangle");
    }else{
      feedback(res.penalty?`❌ Noto‘g‘ri. -${res.penalty} ball`:"❌ Noto‘g‘ri. Yana urinib ko‘ring.","wrong");
      $("answerInput").select(); beep(180,.12,"sawtooth");
    }
  });
};

socket.on("answer:wrong",({penalty})=>{
  if(penalty) toast(`Jarima: -${penalty} ball`);
});

function feedback(text,type){
  const f=$("answerFeedback");f.textContent=text;f.className=`feedback mt-3 ${type}`;
}

socket.on("round:reveal",async data=>{
  clearInterval(timerInterval);
  $("answerForm").classList.add("hidden");
  $("revealCard").classList.remove("hidden");
  $("revealKicker").textContent=data.reason==="correct"
    ? (data.winner?`🎉 ${data.winner} BIRINCHI TOPDI!`:"TO‘G‘RI JAVOB!")
    : "⏰ VAQT TUGADI";
  $("countryName").textContent=data.country.nameUz;
  $("flagImage").src=data.country.flagUrl;
  $("revealCapital").textContent=`Poytaxt: ${data.country.capital}`;
  $("revealContinent").textContent=`Hudud: ${data.country.continent}`;

  const coat=$("coatImage");
  coat.src=data.country.flagUrl;
  try{
    const r=await fetch(data.country.coatApi);
    const arr=await r.json();
    const obj=Array.isArray(arr)?arr[0]:arr;
    const url=obj?.coatOfArms?.svg||obj?.coatOfArms?.png;
    if(url) coat.src=url;
  }catch{}
  coat.onerror=()=>{coat.onerror=null;coat.src=data.country.flagUrl};

  if(data.reason==="correct" && window.confetti){
    const end=Date.now()+1500;
    (function frame(){
      confetti({particleCount:4,angle:60,spread:65,origin:{x:0}});
      confetti({particleCount:4,angle:120,spread:65,origin:{x:1}});
      if(Date.now()<end)requestAnimationFrame(frame);
    })();
  }
  beep(data.reason==="correct"?900:220,.2,data.reason==="correct"?"triangle":"sawtooth");
  $("revealCard").scrollIntoView({behavior:"smooth",block:"center"});
});

function renderLiveLeaderboard(players=[]){
  $("liveCount").textContent=players.length;
  $("liveLeaderboard").innerHTML=players.map((p,i)=>leaderRow(p,i)).join("")||'<div class="empty">O‘yinchilar yo‘q</div>';
}
function leaderRow(p,i){
  const medal=["🥇","🥈","🥉"][i]||`#${i+1}`;
  return `<div class="leader-row ${i<3?`podium-${i+1}`:""}">
    <div class="player-avatar">${medal}</div>
    <div class="player-main"><div class="player-name">${escapeHtml(p.name)}</div><div class="player-sub">${p.solved?"Topdi ✅":"Izlanmoqda…"}</div></div>
    <div class="score">${Number(p.score).toLocaleString("uz-UZ")}</div>
  </div>`;
}

socket.on("game:finished",data=>{
  clearInterval(timerInterval);
  showView("finishView");
  $("finalLeaderboard").innerHTML=data.leaderboard.map((p,i)=>leaderRow(p,i)).join("");
  renderGlobal(data.globalLeaderboard);
  if(window.confetti) confetti({particleCount:180,spread:100,origin:{y:.6}});
});

socket.on("global:leaderboard",renderGlobal);
function renderGlobal(list=[]){
  $("globalLeaderboard").innerHTML=list.length?list.map((p,i)=>`
    <div class="leader-row ${i<3?`podium-${i+1}`:""}">
      <div class="player-avatar">${["🥇","🥈","🥉"][i]||`#${i+1}`}</div>
      <div class="player-main"><div class="player-name">${escapeHtml(p.name)}</div></div>
      <div class="score">${Number(p.score).toLocaleString("uz-UZ")}</div>
    </div>`).join(""):'<div class="empty">Hali natijalar yo‘q.</div>';
}

$("homeBtn").onclick=()=>location.reload();

function escapeHtml(s=""){
  return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
