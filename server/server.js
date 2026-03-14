const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const words = ["Pizza", "Elephant", "Tower", "Laptop", "Mountain", "Guitar", "Sunshine", "Submarine", "Lotus", "Tree", "Mobile", "Coffee", "Rocket", "Anchor", "Castle", "Dragon", "Bicycle"];
let roomData = {}; 
let roomTimers = {}; 

app.use(express.static(path.join(__dirname, "../public")));

// --- GAME LOGIC FUNCTIONS ---

function startTimer(room) {
    if (roomTimers[room]) clearInterval(roomTimers[room].interval);

    roomTimers[room] = {
        timeLeft: 60,
        interval: setInterval(() => {
            if (!roomData[room] || roomData[room].players.length < 2) {
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
    // FEATURE: Stop the game/timer if we aren't playing (less than 2 players)
    if (!r || r.players.length < 2) {
        if (roomTimers[room]) clearInterval(roomTimers[room].interval);
        io.to(room).emit('timerUpdate', 0);
        io.to(room).emit('message', { user: "System", text: "Waiting for more players to start..." });
        return;
    }

    // 1. Rotate Drawer
    r.drawerIndex = (r.drawerIndex === undefined || r.drawerIndex >= r.players.length - 1) ? 0 : r.drawerIndex + 1;
    const drawer = r.players[r.drawerIndex];

    // 2. FEATURE: Choose 3 random words for selection
    let shuffled = [...words].sort(() => 0.5 - Math.random());
    let choices = shuffled.slice(0, 3);

    r.players.forEach(p => p.hasGuessed = false);
    r.isChoosing = true; // State: Player is currently picking a word

    // 3. Notify Clients
    io.to(room).emit('clear');
    io.to(room).emit('drawerChoosing', { drawerName: drawer.name });
    
    // Send the 3 choices ONLY to the drawer
    io.to(drawer.id).emit('wordChoices', choices);
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
                word: "",
                mode: mode,
                drawerIndex: -1,
                isChoosing: false
            };
        }

        const newPlayer = { id: socket.id, name: name, score: 0, hasGuessed: false };
        roomData[room].players.push(newPlayer);

        io.to(room).emit("message", { user: "System", text: `${name} joined!` });
        io.to(room).emit("updatePlayerList", roomData[room].players);

        // Auto-start if it's the 2nd player
        if (roomData[room].players.length === 2) {
            startNewRound(room);
        }
    });

    // FEATURE: Handler for when drawer picks 1 of the 3 words
    socket.on("wordSelected", (selectedWord) => {
        const r = roomData[socket.room];
        if (!r) return;
        
        r.word = selectedWord;
        r.isChoosing = false;
        const drawer = r.players[r.drawerIndex];

        io.to(socket.room).emit('newRound', { 
            drawerId: drawer.id, 
            drawerName: drawer.name 
        });

        io.to(drawer.id).emit('secretWord', r.word);
        startTimer(socket.room); // Start timer ONLY after word is chosen
    });

    socket.on("chatMessage", (data) => {
        const room = roomData[data.room];
        if (!room || room.isChoosing) return;

        const player = room.players.find(p => p.id === socket.id);
        const drawer = room.players[room.drawerIndex];

        if (!player || !drawer) return;

        const guess = data.text.trim().toLowerCase();
        const actualWord = room.word.toLowerCase();

        if (socket.id === drawer.id) {
            if (guess.includes(actualWord) && actualWord !== "") {
                socket.emit('message', { user: "System", text: "❌ Don't spoil the word!" });
            } else {
                io.to(data.room).emit("message", data);
            }
            return;
        }

        if (guess === actualWord && !player.hasGuessed && actualWord !== "") {
            player.score += 50;
            player.hasGuessed = true;
            socket.emit("guessCorrect");
            io.to(data.room).emit("message", { user: "🎉 System", text: `${player.name} guessed it!` });
            io.to(data.room).emit("updatePlayerList", room.players);

            const guessers = room.players.filter(p => p.id !== drawer.id);
            if (guessers.every(p => p.hasGuessed)) {
                clearInterval(roomTimers[data.room].interval);
                setTimeout(() => startNewRound(data.room), 2000);
            }
        } else {
            io.to(data.room).emit("message", data);
        }
    });

    socket.on("draw", (data) => {
        const room = roomData[data.room];
        if (!room || room.isChoosing) return;
        const drawer = room.players[room.drawerIndex];
        if (drawer && socket.id === drawer.id) {
            socket.to(data.room).emit("draw", data);
        }
    });

    socket.on("stopPath", (data) => socket.to(data.room).emit("stopPath"));
    socket.on("clear", (data) => {
        const room = roomData[data.room];
        if (room && room.players[room.drawerIndex]?.id === socket.id) {
            io.to(data.room).emit("clear");
        }
    });

    socket.on("disconnect", () => {
        const r = socket.room;
        if (r && roomData[r]) {
            roomData[r].players = roomData[r].players.filter(p => p.id !== socket.id);
            io.to(r).emit("updatePlayerList", roomData[r].players);

            if (roomData[r].players.length < 2) {
                if (roomTimers[r]) clearInterval(roomTimers[r].interval);
                if (roomData[r].players.length === 0) {
                    delete roomData[r];
                    delete roomTimers[r];
                }
            } else {
                // If drawer leaves, skip to next round
                startNewRound(r);
            }
        }
    });
});

server.listen(3000, () => console.log("Server running at: http://localhost:3000"));