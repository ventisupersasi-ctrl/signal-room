"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawn}=require("node:child_process");
const PORT=43092,CAM="SR-11";
const BASE="http://127.0.0.1:"+PORT;
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"trpp-api-"));
const database=path.join(directory,"db.json");
fs.copyFileSync(path.join(__dirname,"..","data","db.json"),database);
const child=spawn(process.execPath,["server.js"],{cwd:path.join(__dirname,".."),env:{...process.env,PORT:String(PORT),DATA_FILE:database},stdio:"ignore"});
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(BASE+"/api/health");if(r.ok)return;}catch(e){}await new Promise(r=>setTimeout(r,100));}throw Error("Server did not start");}
async function api(method,url,body){const r=await fetch(BASE+url,{method,headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,json:await r.json()};}
let created=0;
test("01 Server health",async()=>{await ready();const r=await api("GET","/api/health");assert.equal(r.status,200);assert.equal(r.json.status,"ok");});
test("02 Cameras list",async()=>{const r=await api("GET","/api/cameras");assert.equal(r.status,200);assert.ok(r.json.length>=2);});
test("03 Camera wrong state returns 400",async()=>{const r=await api("PATCH","/api/cameras/"+CAM,{status:"broken"});assert.equal(r.status,400);});
test("04 Missing camera returns 404",async()=>{const r=await api("PATCH","/api/cameras/MISSING",{status:"offline"});assert.equal(r.status,404);});
test("05 Event requires cameraId",async()=>{const r=await api("POST","/api/events",{type:"motion",severity:"high",message:"test"});assert.equal(r.status,400);});
test("06 Valid IoT event creates 201",async()=>{const r=await api("POST","/api/events",{cameraId:CAM,type:"motion",severity:"high",message:"Проверочное событие"});assert.equal(r.status,201);assert.equal(r.json.cameraId,CAM);});
test("07 Incident cannot omit title",async()=>{const r=await api("POST","/api/incidents",{cameraId:CAM,severity:"low"});assert.equal(r.status,400);});
test("08 Incident creation 201 and status new",async()=>{const r=await api("POST","/api/incidents",{title:"Проверка проходной",cameraId:CAM,severity:"medium"});assert.equal(r.status,201);assert.equal(r.json.status,"new");created=r.json.id;});
test("09 Invalid closed status returns 400",async()=>{const r=await api("PATCH","/api/incidents/"+created,{status:"closed"});assert.equal(r.status,400);});
test("10 In progress status works",async()=>{const r=await api("PATCH","/api/incidents/"+created,{status:"in_progress",assignee:"Test operator"});assert.equal(r.status,200);assert.equal(r.json.status,"in_progress");});
test("11 Filter returns only active status",async()=>{const r=await api("GET","/api/incidents?status=in_progress");assert.equal(r.status,200);assert.ok(r.json.every(x=>x.status==="in_progress"));});
test("12 Resolve incident",async()=>{const r=await api("PATCH","/api/incidents/"+created,{status:"resolved"});assert.equal(r.status,200);});
test("13 Backward transition rejected",async()=>{const r=await api("PATCH","/api/incidents/"+created,{status:"new"});assert.equal(r.status,409);});
test("14 Unknown incident returns 404",async()=>{const r=await api("PATCH","/api/incidents/999999",{status:"resolved"});assert.equal(r.status,404);});
test.after(()=>{child.kill();fs.rmSync(directory,{recursive:true,force:true});});

test("15 Camera status filter",async()=>{const r=await api("GET","/api/cameras?status=offline");assert.equal(r.status,200);assert.ok(r.json.every(x=>x.status==="offline"));});
test("16 Reject overlong incident description",async()=>{const r=await api("POST","/api/incidents",{title:"Valid incident",cameraId:CAM,severity:"low",description:"X".repeat(501)});assert.equal(r.status,400);});
