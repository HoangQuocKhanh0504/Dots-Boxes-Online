const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.static("public"));

const server = http.createServer(app);
const io = new Server(server);

let rooms = {};

function makeSafeRoom(room) {
  return {
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      color: p.color,
      symbol: p.symbol
    })),
    edges: room.edges,
    boxes: room.boxes,
    turn: room.turn,
    width: room.width,
    height: room.height,
    started: room.started,
    host: room.host
  };
}

function startTurn(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.timeLeft = 30;
  clearInterval(room.timer);

  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(roomId).emit("timerUpdate", room.timeLeft);

    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      room.turn = (room.turn + 1) % room.players.length;
      io.to(roomId).emit("update", makeSafeRoom(room));
      startTurn(roomId);
    }
  }, 1000);
}

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("createRoom", ({ roomId, width, height, playerName, color, symbol }) => {
    if (rooms[roomId]) {
      socket.emit("status", "Phòng đã tồn tại!");
      return;
    }

    rooms[roomId] = {
      players: [{ id: socket.id, name: playerName, color, symbol, score: 0 }],
      host: socket.id,
      edges: {},
      boxes: {},
      turn: 0,
      started: false,
      width,
      height,
      timer: null,
      timeLeft: 30
    };

    socket.join(roomId);
    socket.emit("roomCreated", roomId);
    io.to(roomId).emit("update", makeSafeRoom(rooms[roomId]));
  });

  socket.on("joinRoom", ({ roomId, playerName, color, symbol }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("status", "Phòng không tồn tại!");
      return;
    }
    if (room.started) {
      socket.emit("status", "Trò chơi đã bắt đầu!");
      return;
    }

    room.players.push({ id: socket.id, name: playerName, color, symbol, score: 0 });
    socket.join(roomId);

    io.to(roomId).emit("update", makeSafeRoom(room));
  });

  socket.on("startGame", (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.host !== socket.id) return;

    if (room.players.length < 2) {
      io.to(socket.id).emit("status", "Cần ít nhất 2 người để bắt đầu!");
      return;
    }

    room.started = true;
    room.turn = 0;
    io.to(roomId).emit("gameStarted", makeSafeRoom(room));
    startTurn(roomId);
  });

  socket.on("drawEdge", ({ roomId, edge }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;
    const currentPlayer = room.players[room.turn];
    if (socket.id !== currentPlayer.id) return;

    if (room.edges[edge]) return;

    if (edge === "skip") {
      room.turn = (room.turn + 1) % room.players.length;
      io.to(roomId).emit("update", makeSafeRoom(room));
      startTurn(roomId);
      return;
    }

    room.edges[edge] = currentPlayer.id;

    let completedBox = false;
    const [xStr, yStr, dir] = edge.split(",");
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);
    const boxesToCheck = [];

    if (dir === "H") {
      if (y > 0) boxesToCheck.push([x, y - 1]);
      if (y < room.height) boxesToCheck.push([x, y]);
    } else {
      if (x > 0) boxesToCheck.push([x - 1, y]);
      if (x < room.width) boxesToCheck.push([x, y]);
    }

    boxesToCheck.forEach(([bx, by]) => {
      const top = `${bx},${by},H`;
      const bottom = `${bx},${by + 1},H`;
      const left = `${bx},${by},V`;
      const right = `${bx + 1},${by},V`;

      if (room.edges[top] && room.edges[bottom] && room.edges[left] && room.edges[right]) {
        if (!room.boxes[`${bx},${by}`]) {
          room.boxes[`${bx},${by}`] = { owner: currentPlayer.id, x: bx, y: by };
          currentPlayer.score++;
          completedBox = true;
        }
      }
    });

    if (!completedBox) {
      room.turn = (room.turn + 1) % room.players.length;
      startTurn(roomId);
    }

    io.to(roomId).emit("update", makeSafeRoom(room));
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        clearInterval(room.timer);
        delete rooms[roomId];
      } else {
        io.to(roomId).emit("update", makeSafeRoom(room));
      }
    }
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
