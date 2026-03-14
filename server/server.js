const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// serve frontend files
app.use(express.static(path.join(__dirname, "../public")));

io.on("connection", (socket) => {
    console.log("User connected");

    socket.on("draw", (data) => {
        socket.broadcast.emit("draw", data);
    });

    socket.on("chat", (msg) => {
        io.emit("chat", msg);
    });

    socket.on("clear", ()=>{
    io.emit("clear");
});
});

server.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});