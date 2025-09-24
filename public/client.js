const socket = io();

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let roomId, name, color, symbol;
let edges = {}, boxes = {};
let players = [];
let currentTurn = 0;
let roomWidth = 5, roomHeight = 5;
let hostId = null;
let meId = null;
let started = false;

let cellSize = 60;
let offsetX = 50, offsetY = 50;

function createRoom() {
  roomId = document.getElementById("roomInput").value || "room1";
  name = document.getElementById("nameInput").value || "Người chơi";
  color = document.getElementById("colorInput").value || "#000";
  symbol = document.getElementById("symbolInput").value || "?";
  roomWidth = parseInt(document.getElementById("widthInput").value);
  roomHeight = parseInt(document.getElementById("heightInput").value);

  socket.emit("createRoom", { roomId, name, color, symbol, width: roomWidth, height: roomHeight, playerName: name });
}

function joinRoom() {
  roomId = document.getElementById("roomInput").value || "room1";
  name = document.getElementById("nameInput").value || "Người chơi";
  color = document.getElementById("colorInput").value || "#000";
  symbol = document.getElementById("symbolInput").value || "?";

  socket.emit("joinRoom", { roomId, name, color, symbol, playerName: name });
}

function startGame() {
  socket.emit("startGame", roomId);
}

socket.on("status", (msg) => {
  document.getElementById("status").innerText = msg;
});

socket.on("update", (room) => {
  edges = room.edges;
  boxes = room.boxes;
  players = room.players;
  currentTurn = room.turn;
  roomWidth = room.width;
  roomHeight = room.height;
  hostId = room.host;
  started = room.started;
  meId = socket.id;

  document.getElementById("startBtn").classList.toggle("hidden", meId !== hostId);
  updateScoreboard();
  drawBoard();
  updateTurnInfo();
});

socket.on("gameStarted", (room) => {
  edges = room.edges;
  boxes = room.boxes;
  players = room.players;
  currentTurn = room.turn;
  roomWidth = room.width;
  roomHeight = room.height;
  started = room.started;
  hostId = room.host;
  meId = socket.id;

  updateScoreboard();
  drawBoard();
  updateTurnInfo();
});

socket.on("timerUpdate", (timeLeft) => {
  document.getElementById("timer").innerText = `⏳ ${timeLeft}s`;
});

function updateScoreboard() {
  const tbody = document.querySelector("#scoreboard tbody");
  tbody.innerHTML = "";
  players.forEach((p, idx) => {
    const isTurn = idx === currentTurn;
    const row = `<tr class="${isTurn ? 'bg-yellow-200 font-bold' : ''}">
      <td style="color:${p.color}">${p.name}</td><td>${p.symbol}</td><td>${p.score}</td></tr>`;
    tbody.innerHTML += row;
  });
}

function updateTurnInfo() {
  if (!started) return;
  const current = players[currentTurn];
  document.getElementById("turnInfo").innerText = `Lượt: ${current.name}`;
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawEdges();
  drawBoxes();
}

function drawGrid() {
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;
  for (let x = 0; x < roomWidth; x++) {
    for (let y = 0; y < roomHeight; y++) {
      ctx.strokeRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
    }
  }
  for (let x = 0; x <= roomWidth; x++) {
    for (let y = 0; y <= roomHeight; y++) {
      ctx.beginPath();
      ctx.arc(offsetX + x * cellSize, offsetY + y * cellSize, 4, 0, Math.PI * 2);
      ctx.fillStyle = "black";
      ctx.fill();
    }
  }
}

function drawEdges() {
  ctx.lineWidth = 4;
  for (let key in edges) {
    let owner = players.find(p => p.id === edges[key]);
    if (!owner) continue;
    const [xStr, yStr, dir] = key.split(",");
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);
    let sx, sy, ex, ey;
    if (dir === "H") {
      sx = offsetX + x * cellSize;
      sy = offsetY + y * cellSize;
      ex = offsetX + (x + 1) * cellSize;
      ey = sy;
    } else {
      sx = offsetX + x * cellSize;
      sy = offsetY + y * cellSize;
      ex = sx;
      ey = offsetY + (y + 1) * cellSize;
    }
    ctx.strokeStyle = owner.color;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
}

function drawBoxes() {
  for (let key in boxes) {
    let b = boxes[key];
    let owner = players.find(p => p.id === b.owner);
    if (!owner) continue;
    let x = offsetX + b.x * cellSize + cellSize / 2;
    let y = offsetY + b.y * cellSize + cellSize / 2;
    ctx.fillStyle = owner.color;
    ctx.font = "24px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(owner.symbol, x, y);
  }
}

function getEdgeFromPointer(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const lx = clientX - rect.left - offsetX;
  const ly = clientY - rect.top - offsetY;

  const maxX = roomWidth * cellSize;
  const maxY = roomHeight * cellSize;

  const OUT_MARGIN = 10;
  if (lx < -OUT_MARGIN || ly < -OUT_MARGIN || lx > maxX + OUT_MARGIN || ly > maxY + OUT_MARGIN) return null;

  const EDGE_TOLERANCE = Math.min(12, cellSize * 0.35);

  const vx = Math.round(lx / cellSize);
  const dxToV = Math.abs(lx - vx * cellSize);
  let vertEdge = null;
  if (dxToV <= EDGE_TOLERANCE) {
    const gy = Math.floor(ly / cellSize);
    if (vx >= 0 && vx <= roomWidth && gy >= 0 && gy <= roomHeight - 1) {
      vertEdge = `${vx},${gy},V`;
    }
  }

  const hy = Math.round(ly / cellSize);
  const dyToH = Math.abs(ly - hy * cellSize);
  let horizEdge = null;
  if (dyToH <= EDGE_TOLERANCE) {
    const gx = Math.floor(lx / cellSize);
    if (gx >= 0 && gx <= roomWidth - 1 && hy >= 0 && hy <= roomHeight) {
      horizEdge = `${gx},${hy},H`;
    }
  }

  if (!vertEdge && !horizEdge) return null;
  if (vertEdge && !horizEdge) return vertEdge;
  if (!vertEdge && horizEdge) return horizEdge;
  return dxToV < dyToH ? vertEdge : horizEdge;
}

canvas.addEventListener("mousemove", (e) => {
  if (!started) return;
  drawBoard();
  const edge = getEdgeFromPointer(e.clientX, e.clientY);
  if (edge && !edges[edge]) {
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    const [exStr, eyStr, dir] = edge.split(",");
    const ex = parseInt(exStr, 10);
    const ey = parseInt(eyStr, 10);
    ctx.beginPath();
    if (dir === "H") {
      ctx.moveTo(offsetX + ex * cellSize, offsetY + ey * cellSize);
      ctx.lineTo(offsetX + (ex + 1) * cellSize, offsetY + ey * cellSize);
    } else {
      ctx.moveTo(offsetX + ex * cellSize, offsetY + ey * cellSize);
      ctx.lineTo(offsetX + ex * cellSize, offsetY + (ey + 1) * cellSize);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
});

canvas.addEventListener("click", (e) => {
  if (!started) return;
  const current = players[currentTurn];
  if (!current) return;
  if (meId !== current.id) return;

  const edge = getEdgeFromPointer(e.clientX, e.clientY);
  if (edge && !edges[edge]) {
    socket.emit("drawEdge", { roomId, edge });
  }
});
