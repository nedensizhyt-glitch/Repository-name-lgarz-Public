const c=document.getElementById("game");
const x=c.getContext("2d");
const login=document.getElementById("login");
const nameEl=document.getElementById("name");

let W,H,token,name;
let ws;
let cells=[];
let world=[];
let foods=[];
let mouse={x:innerWidth/2,y:innerHeight/2};

function resize(){
  W=c.width=innerWidth;
  H=c.height=innerHeight;
}
addEventListener("resize",resize);
resize();

addEventListener("mousemove",e=>{
  mouse.x=e.clientX;
  mouse.y=e.clientY;
});

addEventListener("keydown",e=>{
  if(e.code==="Space"&&token){
    e.preventDefault();
    split();
  }
});

function R(m){
  return Math.sqrt(m)*3.2;
}

async function play(){
  name=nameEl.value.trim()||"Ganiko47";

  const r=await fetch("/api/login",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({name})
  });

  const j=await r.json();

  if(!r.ok)return alert(j.error);

  token=j.token;
  ws=new WebSocket(
  location.protocol==="https:"
    ?"wss://"+location.host+"/ws?token="+token
    :"ws://"+location.host+"/ws?token="+token
);

ws.onmessage=e=>{
  const j=JSON.parse(e.data);

  if(j.type==="state"){
    world=j.players||[];
    foods=j.foods||[];
    cells=world.filter(p=>p.owner===name);

    document.getElementById("board").innerHTML=
      (j.leaderboard||[]).map((p,i)=>
        `<div class="row"><span>${i+1}. ${p.id}</span><b>${Math.floor(p.m)}</b></div>`
      ).join("");
  }
};
  login.style.display="none";

  await get();

  requestAnimationFrame(loop);
  setInterval(send,120);
  setInterval(get,300);
}
  function send(){
  if(!ws||ws.readyState!==WebSocket.OPEN||!cells.length)return;

  for(const cell of cells){
    const dx=mouse.x-W/2;
    const dy=mouse.y-H/2;
    const d=Math.hypot(dx,dy)||1;

    const speed=Math.max(1.5,7/Math.sqrt(cell.m/12));

    cell.x+=(dx/d)*speed;
    cell.y+=(dy/d)*speed;
  }

  ws.send(JSON.stringify({
    type:"move",
    cells
  }));
}
function split(){
  if(!ws||ws.readyState!==WebSocket.OPEN||!cells.length)return;

  const dx=mouse.x-W/2;
  const dy=mouse.y-H/2;

  ws.send(JSON.stringify({
    type:"split",
    x:cells[0].x+dx,
    y:cells[0].y+dy
  }));
}
async function get(){
  const r=await fetch("/api/state",{
    headers:{
      "Authorization":"Bearer "+token
    }
  });

  if(!r.ok)return;

  const j=await r.json();

  world=j.players||[];
  foods=j.foods||[];

  cells=world.filter(p=>p.owner===name);

  document.getElementById("board").innerHTML=
    (j.leaderboard||[]).map((p,i)=>
      `<div class="row"><span>${i+1}. ${p.id}</span><b>${Math.floor(p.m)}</b></div>`
    ).join("");
}

function loop(){
  x.clearRect(0,0,W,H);

  x.fillStyle="#0b1720";
  x.fillRect(0,0,W,H);

  let cx=0,cy=0,total=0;

  for(const c of cells){
    cx+=c.x*c.m;
    cy+=c.y*c.m;
    total+=c.m;
  }

  if(total){
    cx/=total;
    cy/=total;
  }

  let ox=((W/2-cx)%80+80)%80;
  let oy=((H/2-cy)%80+80)%80;

  x.strokeStyle="#ffffff0b";

  for(let a=ox;a<W;a+=80){
    x.beginPath();
    x.moveTo(a,0);
    x.lineTo(a,H);
    x.stroke();
  }

  for(let a=oy;a<H;a+=80){
    x.beginPath();
    x.moveTo(0,a);
    x.lineTo(W,a);
    x.stroke();
  }
for(const food of foods){
  const fx=food.x-cx+W/2;
  const fy=food.y-cy+H/2;

  if(fx<-20||fy<-20||fx>W+20||fy>H+20)continue;

  x.beginPath();
  x.arc(fx,fy,5,0,Math.PI*2);
  x.fillStyle=food.color||"#ffd34d";
  x.fill();
}
  for(const p of world){
    const sx=p.x-cx+W/2;
    const sy=p.y-cy+H/2;

    if(sx<-100||sy<-100||sx>W+100||sy>H+100)continue;

    x.beginPath();
    x.arc(sx,sy,R(p.m),0,Math.PI*2);

    x.fillStyle=p.color||"#4ad";
    x.fill();

    x.fillStyle="#fff";
    x.textAlign="center";
    x.font="bold 14px Arial";
    x.fillText(p.owner||"",sx,sy);
  }

  requestAnimationFrame(loop);
}
