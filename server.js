"use strict";
const express=require("express");
const {readFileSync,writeFileSync,renameSync}=require("node:fs");
const {join}=require("node:path");
const api=express(),port=Number(process.env.PORT||3102);
const file=process.env.DATA_FILE||join(__dirname,"data","db.json");
const severity=new Set(["low","medium","high","critical"]),types=new Set(["motion","door_open","smoke","camera_offline"]),stages=["new","in_progress","resolved"];
api.disable("x-powered-by");api.use(express.json({limit:"32kb"}));api.use(express.static(join(__dirname,"public")));
function db(){return JSON.parse(readFileSync(file,"utf8"));}
function commit(s){const temp=file+".tmp";writeFileSync(temp,JSON.stringify(s,null,2));renameSync(temp,file);}
function modify(fn){const s=db(),r=fn(s);if(r.error)return r;commit(s);return r;}
function error(message,status=400){return {error:message,status};}
function reply(res,x,code=200){return x.error?res.status(x.status).json({error:x.error}):res.status(code).json(x);}
function valid(t,min=1,max=200){return typeof t==="string"&&t.trim().length>=min&&t.trim().length<=max;}
function camera(s,id){return s.cameras.find(x=>x.id===id);}
function next(items){return Math.max(0,...items.map(x=>Number(x.id)||0))+1;}
const stamp=()=>new Date().toISOString();
api.get("/api/health",(_,r)=>r.json({status:"ok",service:"signal-room",version:"1.0.0"}));
api.get("/api/metrics",(_,r)=>{const s=db(),active=s.incidents.filter(i=>i.status!=="resolved");r.json({total:s.cameras.length,offline:s.cameras.filter(c=>c.status==="offline").length,active:active.length,critical:active.filter(i=>i.severity==="critical").length,recent:s.events.slice(-4)});});
api.get("/api/cameras",(q,r)=>{let items=db().cameras;if(q.query.status)items=items.filter(x=>x.status===q.query.status);r.json(items);});
api.patch("/api/cameras/:id",(q,r)=>reply(r,modify(s=>{const c=camera(s,q.params.id);if(!c)return error("Камера не найдена",404);if(!["online","offline"].includes(q.body.status))return error("Неверный статус камеры");c.status=q.body.status;c.updatedAt=stamp();return c;})));
api.get("/api/events",(q,r)=>{let x=db().events;if(q.query.severity)x=x.filter(v=>v.severity===q.query.severity);if(q.query.cameraId)x=x.filter(v=>v.cameraId===q.query.cameraId);r.json([...x].reverse());});
api.post("/api/events",(q,r)=>reply(r,modify(s=>{const x=q.body;if(!types.has(x.type)||!camera(s,x.cameraId)||!severity.has(x.severity)||!valid(x.message,1,300))return error("Проверьте сведения о событии");const e={id:next(s.events),type:x.type,cameraId:x.cameraId,severity:x.severity,message:x.message.trim(),createdAt:stamp()};s.events.push(e);return e;}),201));
api.get("/api/incidents",(q,r)=>{let x=db().incidents;if(q.query.status)x=x.filter(v=>v.status===q.query.status);if(q.query.severity)x=x.filter(v=>v.severity===q.query.severity);r.json([...x].reverse());});
api.post("/api/incidents",(q,r)=>reply(r,modify(s=>{const x=q.body;if(!valid(x.title,3,140)||!camera(s,x.cameraId)||!severity.has(x.severity)|| (x.description!==undefined&&typeof x.description!=="string"))return error("Карточка заполнена неверно");const t=stamp(),inc={id:next(s.incidents),title:x.title.trim(),cameraId:x.cameraId,severity:x.severity,description:(x.description||"").slice(0,500),status:"new",assignee:"",createdAt:t,updatedAt:t};s.incidents.push(inc);return inc;}),201));
api.patch("/api/incidents/:id",(q,r)=>reply(r,modify(s=>{const inc=s.incidents.find(x=>String(x.id)===q.params.id);if(!inc)return error("Инцидент отсутствует",404);const keys=Object.keys(q.body);if(!keys.length||keys.some(k=>!["status","assignee"].includes(k)))return error("Неизвестные поля");if(q.body.status!==undefined){const a=stages.indexOf(inc.status),b=stages.indexOf(q.body.status);if(b<0)return error("Неизвестный статус");if(b<a||b>a+1)return error("Переход невозможен",409);inc.status=q.body.status;}if(q.body.assignee!==undefined){if(typeof q.body.assignee!=="string"||q.body.assignee.length>100)return error("Некорректный исполнитель");inc.assignee=q.body.assignee.trim();}inc.updatedAt=stamp();return inc;})));
api.use("/api",(_q,r)=>r.status(404).json({error:"Маршрут отсутствует"}));
api.use((e,q,r,n)=>r.status(e instanceof SyntaxError?400:500).json({error:e instanceof SyntaxError?"Невалидный JSON":"Ошибка обработки"}));
api.listen(port,"127.0.0.1",()=>console.log("Signal Room: http://127.0.0.1:"+port));
