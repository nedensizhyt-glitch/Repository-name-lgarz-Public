const express=require("express");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const multer=require("multer");

const app=express();
const PORT=process.env.PORT||3000;

const DATA=path.join(__dirname,"data");
const SKINS=path.join(__dirname,"public","skins");

fs.mkdirSync(DATA,{recursive:true});
fs.mkdirSync(SKINS,{recursive:true});

const dbFile=path.join(DATA,"players.json");
let players={};
try{players=JSON.parse(fs.readFileSync(dbFile,"utf8"))}catch{}

const sessions=new Map();
const state=new Map();
const bans=new Set();
const admins=new Set(["admin"]);

const upload=multer({
  dest:SKINS,
  limits:{fileSize:2*1024*1024},
  fileFilter:(r,f,cb)=>cb(null,/image\/(png|jpeg|webp)/.test(f.mimetype))
});

app.use(express.json());
app.use(express.static(path.join(__dirname,"public")));

function save(){
  fs.writeFileSync(dbFile,JSON.stringify(players,null,2));
}

function auth(req,res,next){
  const t=(req.headers.authorization||"").replace("Bearer ","");
  if(!sessions.has(t))
    return res.status(401).json({error:"Giriş gerekli"});
  req.user=sessions.get(t);
  next();
}

function admin(req,res,next){
  if(req.user!=="admin")
    return res.status(403).json({error:"Admin gerekli"});
  next();
}

function newCell(owner,x,y,m,color="#39d98a",skin=""){
  return {
    id:crypto.randomUUID(),
    owner,
    x,
    y,
    m,
    color,
    skin
  };
}

app.post("/api/login",(req,res)=>{
  let {name,password}=req.body||{};

  name=String(name||"").trim().slice(0,16);
  password=String(password||"");

  if(name==="admin"&&password==="admin123"){
    const t=crypto.randomUUID();
    sessions.set(t,"admin");
    return res.json({token:t,admin:true});
  }

  if(!name||bans.has(name))
    return res.status(403).json({error:"Oyuncu adı uygun değil"});

  const t=crypto.randomUUID();
  sessions.set(t,name);

  state.set(name,{
    cells:[
      newCell(
        name,
        Math.random()*5000-2500,
        Math.random()*5000-2500,
        12,
        "#39d98a",
        ""
      )
    ]
  });

  players[name]=(players[name]||0);
  save();

  res.json({token:t,admin:false,name});
});

app.get("/api/state",auth,(req,res)=>{
  const now=Date.now();
  const arr=[];

  for(const [owner,data] of state){
    if(!data.cells.length)continue;

    for(const c of data.cells){
      arr.push({
        id:c.id,
        owner:c.owner,
        x:c.x,
        y:c.y,
        m:c.m,
        color:c.color,
        skin:c.skin
      });
    }
  }

  const totals={};

  for(const c of arr){
    totals[c.owner]=(totals[c.owner]||0)+c.m;
  }

  const leaderboard=Object.entries(totals)
    .map(([id,m])=>({id,m}))
    .sort((a,b)=>b.m-a.m)
    .slice(0,10);

  res.json({
    players:arr,
    leaderboard
  });
});

app.post("/api/move",auth,(req,res)=>{
  if(req.user==="admin")
    return res.status(400).json({error:"Admin oyuncu değil"});

  const data=state.get(req.user);
  if(!data)
    return res.status(404).json({error:"Oyuncu bulunamadı"});

  const incoming=Array.isArray(req.body.cells)
    ?req.body.cells
    :[];

  for(const cell of data.cells){
    const b=incoming.find(x=>x.id===cell.id);
    if(!b)continue;

    cell.x=Math.max(-5000,Math.min(5000,Number(b.x)||0));
    cell.y=Math.max(-5000,Math.min(5000,Number(b.y)||0));

    cell.m=Math.max(1,Number(b.m)||cell.m);
    cell.color=String(b.color||cell.color);
    cell.skin=String(b.skin||cell.skin);
  }

  res.json({ok:true});
});

app.post("/api/split",auth,(req,res)=>{
  if(req.user==="admin")
    return res.status(400).json({error:"Admin oyuncu değil"});

  const data=state.get(req.user);
  if(!data)
    return res.status(404).json({error:"Oyuncu bulunamadı"});

  const mx=Number(req.body.x)||0;
  const my=Number(req.body.y)||0;

  if(data.cells.length>=16)
    return res.json({ok:false,cells:data.cells});

  const created=[];

  for(const cell of [...data.cells]){
    if(data.cells.length+created.length>=16)break;

    if(cell.m<10)continue;

    const dx=mx-cell.x;
    const dy=my-cell.y;
    const dist=Math.hypot(dx,dy)||1;

    const half=cell.m/2;
    cell.m=half;

    const speed=180;
    const nx=cell.x+(dx/dist)*speed;
    const ny=cell.y+(dy/dist)*speed;

    created.push(
      newCell(
        req.user,
        Math.max(-5000,Math.min(5000,nx)),
        Math.max(-5000,Math.min(5000,ny)),
        half,
        cell.color,
        cell.skin
      )
    );
  }

  data.cells.push(...created);

  res.json({
    ok:true,
    cells:data.cells
  });
});

app.get("/api/admin/players",auth,admin,(req,res)=>{
  const list=[];

  for(const [name,data] of state){
    const mass=data.cells.reduce((s,c)=>s+c.m,0);

    list.push({
      name,
      m:mass,
      cells:data.cells.length
    });
  }

  res.json({
    players:list,
    bans:[...bans]
  });
});

app.post("/api/admin/kick",auth,admin,(req,res)=>{
  const n=String(req.body.name||"");
  state.delete(n);

  for(const [token,user] of sessions){
    if(user===n)sessions.delete(token);
  }

  res.json({ok:true});
});

app.post("/api/admin/ban",auth,admin,(req,res)=>{
  const n=String(req.body.name||"");

  if(n){
    bans.add(n);
    state.delete(n);

    for(const [token,user] of sessions){
      if(user===n)sessions.delete(token);
    }
  }

  res.json({ok:true});
});

app.post("/api/admin/unban",auth,admin,(req,res)=>{
  bans.delete(String(req.body.name||""));
  res.json({ok:true});
});

app.post("/api/admin/clear",auth,admin,(req,res)=>{
  state.clear();
  res.json({ok:true});
});

app.get("/api/skins",auth,(req,res)=>{
  res.json(
    fs.readdirSync(SKINS)
      .filter(x=>/\.png|\.jpg|\.jpeg|\.webp$/i.test(x))
      .map(x=>"/skins/"+x)
  );
});

app.post("/api/skins",auth,upload.single("skin"),(req,res)=>{
  res.json({
    ok:true,
    file:req.file?"/skins/"+req.file.filename:null
  });
});

app.listen(PORT,()=>{
  console.log("LGARZ http://localhost:"+PORT);
});
