const socket = io();
let tool = "pen";
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

canvas.width = 800;
canvas.height = 500;

let drawing = false;

let color = document.getElementById("colorPicker").value;
let size = document.getElementById("brushSize").value;

// canvas.style.cursor = "url('/assets/pencil.png'), auto";

canvas.style.cursor = "crosshair";

document.getElementById("colorPicker").onchange = (e)=>{

color = e.target.value;
tool = "pen";

canvas.style.cursor = "crosshair";

};

document.getElementById("brushSize").onchange = (e)=>{
size = e.target.value;
tool = "pen";
}

canvas.addEventListener("mousedown", ()=>{
drawing = true;
ctx.beginPath();
});

canvas.addEventListener("mouseup", ()=>{
drawing = false;
});

canvas.addEventListener("mousemove",(e)=>{

if(!drawing) return;

const data = {
x:e.offsetX,
y:e.offsetY,
color:color,
size:size
};

draw(data);
socket.emit("draw",data);

});

socket.on("draw",draw);

function draw(data){

ctx.strokeStyle = data.color;
ctx.lineWidth = data.size;

ctx.lineTo(data.x,data.y);
ctx.stroke();
ctx.beginPath();
ctx.moveTo(data.x,data.y);

}

// ERASER
document.getElementById("eraser").onclick = () => {

color = "#ffffff";
tool = "eraser";

canvas.style.cursor = "cell";  // eraser-like cursor

};

// CLEAR BOARD
document.getElementById("clear").onclick=()=>{
ctx.clearRect(0,0,canvas.width,canvas.height);
socket.emit("clear");
}

socket.on("clear",()=>{
ctx.clearRect(0,0,canvas.width,canvas.height);
});


// CHAT
const input = document.getElementById("chatInput");

input.addEventListener("keypress",(e)=>{

if(e.key==="Enter"){

socket.emit("chat",input.value);
input.value="";

}

});

socket.on("chat",(msg)=>{

const div=document.getElementById("chat");

div.innerHTML += "<p>"+msg+"</p>";

div.scrollTop = div.scrollHeight;

});