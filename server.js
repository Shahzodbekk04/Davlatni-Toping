const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
const countries = JSON.parse(
  fs.readFileSync(path.join(__dirname, "countries.json"), "utf8")
);

app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/app.js", (_, res) => res.sendFile(path.join(__dirname, "app.js")));
app.get("/styles.css", (_, res) => res.sendFile(path.join(__dirname, "styles.css")));
app.get("/api/countries/count", (_, res) => res.json({ count: countries.length }));

const rooms = new Map();
const globalScores = new Map();

const SETTINGS = {
  easy: { duration: 90, points: 1000, wrongPenalty: 0 },
  hard: { duration: 50, points: 1500, wrongPenalty: 100 }
};

function normalize(text = "") {
  return text
    .toString()
    .toLocaleLowerCase("uz")
    .replace(/[ʻ’‘`´']/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function answerMatches(country, answer) {
  const a = normalize(answer);
  if (!a) return false;
  return country.aliases.some(x => normalize(x) === a);
}

function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    difficulty: room.difficulty,
    status: room.status,
    round: room.round,
    totalRounds: room.totalRounds,
    players: [...room.players.values()]
      .map(p => ({ id: p.id, name: p.name, score: p.score, solved: p.solved }))
      .sort((a,b) => b.score - a.score)
  };
}

function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}

function getHints(country, difficulty) {
  const borderText = country.borders?.length
    ? `${country.borders.length} ta davlat bilan quruqlik chegarasiga ega.`
    : "Quruqlik chegarasi yo‘q yoki orol davlat.";
  const areaText = country.area
    ? `Maydoni taxminan ${Math.round(country.area).toLocaleString("uz-UZ")} km².`
    : "Hududi haqida ma’lumot sir saqlanmoqda.";
  const languageText = country.languages?.length
    ? `Mamlakatda ${country.languages.slice(0,2).join(", ")} tillari uchraydi.`
    : "Til haqidagi ishora berilmaydi.";

  if (difficulty === "easy") {
    return [
      `Poytaxti: ${country.capital}.`,
      `Qit'a/hudud: ${country.continent}.`,
      borderText,
      areaText,
      languageText
    ];
  }
  const pool = [
    borderText,
    country.area ? `Maydoni ${Math.round(country.area).toLocaleString("uz-UZ")} km² atrofida.` : null,
    country.capital && country.capital !== "Ma’lumot mavjud emas"
      ? `Poytaxt nomining birinchi harfi: ${country.capital[0].toUpperCase()}.`
      : null,
    country.continent ? `Joylashuvi: ${country.continent}.` : null
  ].filter(Boolean);
  // Hard: only 1 concise clue
  return [pool[Math.floor(Math.random() * pool.length)]];
}

function pickCountry(room) {
  const remaining = countries.filter(c => !room.used.has(c.code));
  const source = remaining.length ? remaining : countries;
  const country = source[Math.floor(Math.random() * source.length)];
  room.used.add(country.code);
  return country;
}

function startRound(room) {
  clearTimeout(room.timer);
  room.round += 1;
  if (room.round > room.totalRounds) return finishGame(room);

  room.current = pickCountry(room);
  room.roundStartedAt = Date.now();
  room.roundEndsAt = Date.now() + SETTINGS[room.difficulty].duration * 1000;
  for (const p of room.players.values()) p.solved = false;

  io.to(room.code).emit("round:start", {
    round: room.round,
    totalRounds: room.totalRounds,
    duration: SETTINGS[room.difficulty].duration,
    endsAt: room.roundEndsAt,
    difficulty: room.difficulty,
    hints: getHints(room.current, room.difficulty)
  });
  emitRoom(room);

  room.timer = setTimeout(() => {
    reveal(room, null, "timeout");
  }, SETTINGS[room.difficulty].duration * 1000);
}

function reveal(room, winnerId = null, reason = "correct") {
  if (!room.current || room.revealing) return;
  room.revealing = true;
  clearTimeout(room.timer);

  const winner = winnerId ? room.players.get(winnerId) : null;
  io.to(room.code).emit("round:reveal", {
    reason,
    winner: winner ? winner.name : null,
    country: {
      code: room.current.code,
      nameUz: room.current.nameUz,
      capital: room.current.capital,
      continent: room.current.continent,
      flagUrl: room.current.flagUrl,
      coatApi: room.current.coatApi
    },
    nextIn: 5000
  });

  setTimeout(() => {
    room.current = null;
    room.revealing = false;
    startRound(room);
  }, 5000);
}

function finishGame(room) {
  clearTimeout(room.timer);
  room.status = "finished";
  room.current = null;

  for (const p of room.players.values()) {
    const old = globalScores.get(p.name) || 0;
    globalScores.set(p.name, old + p.score);
  }

  io.to(room.code).emit("game:finished", {
    leaderboard: publicRoom(room).players,
    globalLeaderboard: getGlobalLeaderboard()
  });
  emitRoom(room);
}

function getGlobalLeaderboard() {
  return [...globalScores.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a,b) => b.score - a.score)
    .slice(0, 20);
}

io.on("connection", (socket) => {
  socket.emit("global:leaderboard", getGlobalLeaderboard());

  socket.on("room:create", ({ name, difficulty = "easy", totalRounds = 10 }, cb = () => {}) => {
    name = (name || "O‘yinchi").trim().slice(0, 24);
    difficulty = SETTINGS[difficulty] ? difficulty : "easy";
    totalRounds = Math.max(3, Math.min(30, Number(totalRounds) || 10));

    const code = roomCode();
    const room = {
      code,
      hostId: socket.id,
      difficulty,
      totalRounds,
      round: 0,
      status: "lobby",
      current: null,
      revealing: false,
      timer: null,
      used: new Set(),
      players: new Map()
    };

    room.players.set(socket.id, { id: socket.id, name, score: 0, solved: false });
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;

    cb({ ok: true, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("room:join", ({ code, name }, cb = () => {}) => {
    code = (code || "").trim().toUpperCase();
    name = (name || "O‘yinchi").trim().slice(0, 24);
    const room = rooms.get(code);

    if (!room) return cb({ ok: false, message: "Bunday xona topilmadi." });
    if (room.status !== "lobby") return cb({ ok: false, message: "O‘yin allaqachon boshlangan." });
    if (room.players.size >= 20) return cb({ ok: false, message: "Xona to‘lib qolgan (20/20)." });

    room.players.set(socket.id, { id: socket.id, name, score: 0, solved: false });
    socket.join(code);
    socket.data.roomCode = code;
    cb({ ok: true, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("game:start", (_, cb = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return cb({ ok:false, message:"Xona topilmadi." });
    if (room.hostId !== socket.id) return cb({ ok:false, message:"Faqat host boshlashi mumkin." });
    if (room.players.size < 1) return cb({ ok:false, message:"O‘yinchi yo‘q." });

    room.status = "playing";
    room.round = 0;
    room.used.clear();
    for (const p of room.players.values()) { p.score = 0; p.solved = false; }
    emitRoom(room);
    startRound(room);
    cb({ ok:true });
  });

  socket.on("answer:submit", ({ answer }, cb = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== "playing" || !room.current || room.revealing) {
      return cb({ ok:false, message:"Hozir javob qabul qilinmaydi." });
    }
    const player = room.players.get(socket.id);
    if (!player) return cb({ ok:false, message:"O‘yinchi topilmadi." });
    if (player.solved) return cb({ ok:false, message:"Siz bu raundni topdingiz." });

    if (answerMatches(room.current, answer)) {
      const max = SETTINGS[room.difficulty].points;
      const duration = SETTINGS[room.difficulty].duration * 1000;
      const elapsed = Math.max(0, Date.now() - room.roundStartedAt);
      const speedBonus = Math.max(0, Math.floor((1 - elapsed / duration) * max * 0.5));
      const gained = max + speedBonus;
      player.score += gained;
      player.solved = true;
      cb({ ok:true, correct:true, gained });
      emitRoom(room);
      reveal(room, socket.id, "correct");
    } else {
      const penalty = SETTINGS[room.difficulty].wrongPenalty;
      player.score = Math.max(0, player.score - penalty);
      cb({ ok:true, correct:false, penalty });
      socket.emit("answer:wrong", { penalty });
      emitRoom(room);
    }
  });

  socket.on("room:leave", () => leaveRoom(socket));

  socket.on("disconnect", () => leaveRoom(socket));
});

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.data.roomCode = null;
  if (!room) return;

  room.players.delete(socket.id);
  socket.leave(code);

  if (room.players.size === 0) {
    clearTimeout(room.timer);
    rooms.delete(code);
    return;
  }

  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
  }
  emitRoom(room);
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌍 Davlatni Toping serveri: http://localhost:${PORT}`);
  console.log(`📚 Davlatlar soni: ${countries.length}`);
});
