const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const words = ["Pizza", "Elephant", "Tower", "Laptop", "Mountain", "Guitar", "Sunshine", "Submarine", "Lotus", "Tree", "Mobile", "Coffee", "Rocket", "Anchor"];
let roomData = {}; 
let roomTimers = {}; 

app.use(express.static(path.join(__dirname, "../public")));

// --- GAME LOGIC FUNCTIONS ---

function startTimer(room) {
    if (roomTimers[room]) clearInterval(roomTimers[room].interval);

    roomTimers[room] = {
        timeLeft: 60,
        interval: setInterval(() => {
            if (!roomData[room]) {
                clearInterval(roomTimers[room].interval);
                return;
            }
            
            roomTimers[room].timeLeft--;
            io.to(room).emit('timerUpdate', roomTimers[room].timeLeft);

            if (roomTimers[room].timeLeft <= 0) {
                clearInterval(roomTimers[room].interval);
                io.to(room).emit('message', { user: "System", text: `⏰ Time's up! The word was: ${roomData[room].word}` });
                startNewRound(room);
            }
        }, 1000)
    };
}

function startNewRound(room) {
    const r = roomData[room];
    if (!r || r.players.length === 0) return;

    // 1. Rotate Drawer
    if (r.drawerIndex === undefined || r.drawerIndex >= r.players.length - 1) {
        r.drawerIndex = 0;
    } else {
        r.drawerIndex++;
    }

    const drawer = r.players[r.drawerIndex];

    // 2. Setup Round
    r.word = words[Math.floor(Math.random() * words.length)];
    r.players.forEach(p => p.hasGuessed = false);

    // 3. Notify Clients
    io.to(room).emit('clear'); // Clear board for everyone
    io.to(room).emit('newRound', { 
        drawerId: drawer.id, 
        drawerName: drawer.name 
    });

    // 4. Send word only to drawer
    io.to(drawer.id).emit('secretWord', r.word);

    startTimer(room);
}

// --- SOCKET CONNECTION ---

io.on("connection", (socket) => {

    socket.on("joinGame", (data) => {
        const { name, room, mode } = data;
        socket.join(room);
        socket.room = room;
        socket.username = name;

        if (!roomData[room]) {
            roomData[room] = {
                players: [],
                word: words[Math.floor(Math.random() * words.length)],
                mode: mode,
                drawerIndex: 0
            };
            // The first person to join is the first drawer
        }

        const newPlayer = { id: socket.id, name: name, score: 0, hasGuessed: false };
        roomData[room].players.push(newPlayer);

        io.to(room).emit("message", { user: "System", text: `${name} joined the game!` });
        io.to(room).emit("updatePlayerList", roomData[room].players);

        // If it's the very first player, start the game
        if (roomData[room].players.length === 1) {
            startNewRound(room);
        } else {
            // New players need to know who is currently drawing
            const currentDrawer = roomData[room].players[roomData[room].drawerIndex];
            socket.emit('newRound', { 
                drawerId: currentDrawer.id, 
                drawerName: currentDrawer.name 
            });
        }
    });

    socket.on("chatMessage", (data) => {
        const room = roomData[data.room];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        const drawer = room.players[room.drawerIndex];

        if (!player || !drawer) return;

        // Prevent drawer from typing the answer
        const guess = data.text.trim().toLowerCase();
        const actualWord = room.word.toLowerCase();

        if (socket.id === drawer.id) {
            // Drawer chatting (prevent them from typing the word)
            if (guess.includes(actualWord)) {
                socket.emit('message', { user: "System", text: "❌ Don't spoil the word!" });
            } else {
                io.to(data.room).emit("message", data);
            }
            return;
        }

        // Guessing Logic
        if (guess === actualWord && !player.hasGuessed) {
            player.score += 50;
            player.hasGuessed = true;

            socket.emit("guessCorrect");
            io.to(data.room).emit("message", { user: "🎉 System", text: `${player.name} guessed the word!` });
            io.to(data.room).emit("updatePlayerList", room.players);

            // If everyone except drawer guessed correctly, end round early
            const guessers = room.players.filter(p => p.id !== drawer.id);
            if (guessers.every(p => p.hasGuessed)) {
                clearInterval(roomTimers[data.room].interval);
                io.to(data.room).emit('message', { user: "System", text: "Everyone got it! Next round..." });
                setTimeout(() => startNewRound(data.room), 2000);
            }
        } else {
            // Normal message
            io.to(data.room).emit("message", data);
        }
    });

    socket.on("draw", (data) => {
        const room = roomData[data.room];
        if (!room) return;
        const drawer = room.players[room.drawerIndex];
        
        // Security: Only broadcast if the sender is actually the drawer
        if (drawer && socket.id === drawer.id) {
            socket.to(data.room).emit("draw", data);
        }
    });

    socket.on("stopPath", (data) => {
        socket.to(data.room).emit("stopPath");
    });

    socket.on("clear", (data) => {
        const room = roomData[data.room];
        if (!room) return;
        const drawer = room.players[room.drawerIndex];
        
        if (drawer && socket.id === drawer.id) {
            io.to(data.room).emit("clear");
        }
    });

    socket.on("disconnect", () => {
        const r = socket.room;
        if (r && roomData[r]) {
            roomData[r].players = roomData[r].players.filter(p => p.id !== socket.id);
            io.to(r).emit("message", { user: "System", text: `${socket.username} left.` });
            io.to(r).emit("updatePlayerList", roomData[r].players);

            if (roomData[r].players.length === 0) {
                if (roomTimers[r]) clearInterval(roomTimers[r].interval);
                delete roomData[r];
                delete roomTimers[r];
            } else {
                // If the drawer left, start a new round immediately
                startNewRound(r);
            }
        }
    });
});

server.listen(3000, () => console.log("Server running at: http://localhost:3000"));