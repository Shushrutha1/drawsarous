const socket = io();
const myName = sessionStorage.getItem('drawName') || "Guest";
const myRoom = sessionStorage.getItem('drawRoom') || "0000";

// DOM Elements
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const colorPicker = document.getElementById("colorPicker");
const brushSize = document.getElementById("brushSize");
const chatInput = document.getElementById('chatInput');
const chatWindow = document.getElementById('chat');
const playerModal = document.getElementById("playerModal");
const playerListBtn = document.getElementById("playerListBtn");
const userListUI = document.getElementById("userList");
const playerCountUI = document.getElementById("playerCount");
const roomDisplay = document.getElementById("roomDisplay");
const wordDisplay = document.getElementById("wordDisplay");
const timerUI = document.getElementById("timer");
const toolbar = document.querySelector(".toolbar");

// Setup
roomDisplay.innerText = `| Room: ${myRoom}`;
let drawing = false;
let isMyTurn = false; // Tracks if this player is currently drawing

// 1. Join Room Immediately
socket.emit('joinGame', { name: myName, room: myRoom });

// --- ROLE HANDLING ---

socket.on('newRound', (data) => {
    // Check if I am the drawer
    isMyTurn = (socket.id === data.drawerId);

    // Reset Canvas and UI
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('chatTitle').innerText = "Chat";
    
    // UI Logic for Drawer vs. Guesser
    if (isMyTurn) {
        document.getElementById('drawerNotification').innerText = "✏️ It's YOUR turn to draw!";
        chatInput.disabled = true;
        chatInput.placeholder = "You are drawing, don't spoil it!";
        toolbar.style.pointerEvents = "auto";
        toolbar.style.opacity = "1";
    } else {
        document.getElementById('drawerNotification').innerText = `🖌️ ${data.drawerName} is drawing...`;
        chatInput.disabled = false;
        chatInput.placeholder = "Type your guess here...";
        chatInput.style.background = ""; // Reset color
        toolbar.style.pointerEvents = "none"; // Disable drawing tools for guessers
        toolbar.style.opacity = "0.5";
        wordDisplay.style.display = "none"; // Hide previous word
    }
});

socket.on('secretWord', (word) => {
    wordDisplay.style.display = "block";
    wordDisplay.innerHTML = `DRAW THIS: <span style="color:#ff9f43">${word}</span>`;
});

socket.on('timerUpdate', (timeLeft) => {
    timerUI.innerText = timeLeft;
    // Turn timer red in the last 10 seconds
    if (timeLeft <= 10) {
        timerUI.parentElement.style.background = "#e94560";
    } else {
        timerUI.parentElement.style.background = "";
    }
});

socket.on('guessCorrect', () => {
    chatInput.disabled = true;
    chatInput.placeholder = "Correct! You are now spectating...";
    chatInput.style.background = "#4ecca3"; // Green highlight
    document.getElementById('chatTitle').innerText = "Chat (Locked)";
});

// --- DRAWING LOGIC ---

canvas.addEventListener("mousedown", () => {
    if (!isMyTurn) return; // Prevent guessers from starting a path
    drawing = true;
    ctx.beginPath();
    socket.emit("stopPath", { room: myRoom }); 
});

canvas.addEventListener("mouseup", () => {
    drawing = false;
    ctx.beginPath();
    socket.emit("stopPath", { room: myRoom });
});

canvas.addEventListener("mousemove", (e) => {
    if (!drawing || !isMyTurn) return; // STRICT CHECK: Only drawer can draw
    const data = {
        x: e.offsetX,
        y: e.offsetY,
        color: colorPicker.value,
        size: brushSize.value,
        room: myRoom
    };
    draw(data);
    socket.emit("draw", data);
});

socket.on("draw", draw);
socket.on("stopPath", () => ctx.beginPath());

function draw(data) {
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineTo(data.x, data.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(data.x, data.y);
}

// Toolbar Functions
document.getElementById("eraser").onclick = () => colorPicker.value = "#ffffff";
document.getElementById("clear").onclick = () => {
    if (!isMyTurn) return; // Only drawer can clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit("clear", { room: myRoom });
};
socket.on("clear", () => ctx.clearRect(0, 0, canvas.width, canvas.height));

// --- CHAT LOGIC ---

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim() !== "") {
        socket.emit('chatMessage', { user: myName, text: chatInput.value, room: myRoom });
        chatInput.value = "";
    }
});

socket.on('message', (data) => {
    const msgDiv = document.createElement('div');
    const isMe = data.user === myName;
    const isSystem = data.user === "System" || data.user.includes("🎉");

    msgDiv.classList.add('message-wrapper');
    
    if (isSystem) {
        msgDiv.innerHTML = `<div class="system-msg" style="text-align:center; color:#4ecca3; font-style:italic;">${data.text}</div>`;
    } else {
        msgDiv.innerHTML = `
            <div class="msg-bubble ${isMe ? 'me' : 'others'}">
                <span class="user-tag">${data.user}</span>
                <p>${data.text}</p>
            </div>`;
    }
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
});

// --- UI LOGIC ---

playerListBtn.onclick = () => playerModal.style.display = "block";
document.querySelector(".close").onclick = () => playerModal.style.display = "none";

// Handle Live Scoreboard (Beside Canvas)
socket.on('updatePlayerList', (players) => {
    const list = document.getElementById('liveScoreboard');
    // Sort so highest score is at the top
    const sorted = [...players].sort((a, b) => b.score - a.score);
    
    list.innerHTML = sorted.map(p => `
        <li>
            <span>${p.name}</span>
            <span style="color:#4ecca3">${p.score}</span>
        </li>
    `).join("");
});

// Handle Game End
socket.on('gameFinished', (winners) => {
    const overlay = document.getElementById('winnerOverlay');
    const nameDisplay = document.getElementById('winnerName');
    
    overlay.style.display = 'flex';
    nameDisplay.innerText = winners[0].name; // The player with highest score
    
    // Optionally list top 3 in the winnerScore P tag
    document.getElementById('winnerScore').innerHTML = `
        1st: ${winners[0].name} (${winners[0].score})<br>
        2nd: ${winners[1] ? winners[1].name : '-'} (${winners[1] ? winners[1].score : '0'})
    `;
});
document.getElementById("quitBtn").onclick = () => {
    if (confirm("Quit game?")) {
        socket.disconnect();
        sessionStorage.clear();
        window.location.href = "index.html";
    }
};

socket.on('wordChoices', (choices) => {
    const picker = document.getElementById('wordPicker');
    const options = document.getElementById('wordOptions');
    options.innerHTML = '';
    picker.style.display = 'block';

    choices.forEach(word => {
        const btn = document.createElement('button');
        btn.innerText = word;
        btn.style.margin = "10px";
        btn.onclick = () => {
            socket.emit('wordSelected', word);
            picker.style.display = 'none';
        };
        options.appendChild(btn);
    });
});

socket.on('drawerChoosing', (data) => {
    document.getElementById('drawerNotification').innerText = `${data.drawerName} is choosing a word...`;
});