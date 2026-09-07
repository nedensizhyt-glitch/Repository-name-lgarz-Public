const express=require("express"),fs=require("fs"),path=require("path"),crypto=require("crypto"),multer=require("multer");
const app=express(),PORT=process.env.PORT||3000;
const DATA=path.join(__dirname,"data"),SKINS=path.join(__dirname,"public","skins");
fs.mkdirSync(DATA,{recursive:true});fs.mkdirSync(SKINS,{recursive:true});
const dbFile=path.join(DATA,"players.json");
let players={}; try{players=JSON.parse(fs.readFileSync(dbFile,"utf8"))}catch{}
const sessions=new Map(), state=new Map(), bans=new Set(), admins=new Set(["admin"]);
const upload=multer({dest:SKINS,limits:{fileSize:2*1024*1024},fileFilter:(r,f,cb)=>cb(null,/^image\/(png|jpeg|webp)$/.test(f.mimetype))});
app.use(express.json()); app.use(express.static(path.join(__dirname,"public")));
const save=()=>fs.writeFileSync(dbFile,JSON.stringify(players,null,2));
function auth(req,res,next){const t=(req.headers.authorization||"").replace("Bearer ",""); if(!sessions.has(t))return res.status(401).json({error:"Giriş gerekli"});req.user=sessions.get(t);next()}
function admin(req,res,next){if(req.user!=="admin")return res.status(403).json({error:"Admin gerekli"});next()}
app.post("/api/login",(req,res)=>{let {name,password}=req.body||{};name=String(name||"").trim().slice(0,16);password=String(password||"");if(name==="admin"&&password==="admin123"){let t=crypto.randomUUID();sessions.set(t,"admin");return res.json({token:t,admin:true})} if(!name||bans.has(name))return res.status(403).json({error:"Oyuncu adı uygun değil"});let t=crypto.randomUUID();sessions.set(t,name);state.set(name,{id:name,x:Math.random()*5000-2500,y:Math.random()*5000-2500,m:12,color:"#39d98a",score:12,last:Date.now(),skin:""});players[name]=(players[name]||0);save();res.json({token:t,admin:false,name})});
app.post("/api/logout",auth,(req,res)=>{sessions.delete((req.headers.authorization||"").replace("Bearer ",""));res.json({ok:true})});
app.get("/api/state",auth,(req,res)=>{const arr=[...state.values()].filter(p=>Date.now()-p.last<8000).map(p=>({id:p.id,x:p.x,y:p.y,m:p.m,color:p.color,skin:p.skin}));res.json({players:arr,leaderboard:arr.sort((a,b)=>b.m-a.m).slice(0,10)});});
app.post("/api/move",auth,(req,res)=>{if(req.user==="admin")return res.status(400).json({error:"Admin oyuncu değil"});let p=state.get(req.user);if(!p)return res.status(404).json({error:"Oyuncu bulunamadı"});let b=req.body||{};p.x=Math.max(-5000,Math.min(5000,Number(b.x)||0));p.y=Math.max(-5000,Math.min(5000,Number(b.y)||0));p.last=Date.now();p.m=Math.max(1,Number(b.m)||p.m);p.color=String(b.color||p.color);p.skin=String(b.skin||p.skin);res.json({ok:true});});
app.get("/api/admin/players",auth,admin,(req,res)=>res.json({players:[...state.values()],bans:[...bans]}));
app.post("/api/admin/kick",auth,admin,(req,res)=>{state.delete(String(req.body.name||""));res.json({ok:true})});
app.post("/api/admin/ban",auth,admin,(req,res)=>{let n=String(req.body.name||"");if(n){bans.add(n);state.delete(n)}res.json({ok:true})});
app.post("/api/admin/unban",auth,admin,(req,res)=>{bans.delete(String(req.body.name||""));res.json({ok:true})});
app.post("/api/admin/clear",auth,admin,(req,res)=>{state.clear();res.json({ok:true})});
app.get("/api/skins",auth,(req,res)=>{fs.readdir(SKINS,(e,a)=>res.json({skins:(a||[]).filter(x=>/\.(png|jpg|jpeg|webp)$/i.test(x)).map(x=>"/skins/"+x)}))});
app.post("/api/skins",auth,admin,upload.single("skin"),(req,res)=>res.json({ok:true,file:req.file?"/skins/"+req.file.filename:null}));
app.listen(PORT,()=>console.log("Cell Arena http://localhost:"+PORT));
