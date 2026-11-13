"use strict";
const $=s=>document.querySelector(s),safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const model={cameras:[],incidents:[],events:[],mode:""};
const stage={new:"Новая",in_progress:"На проверке",resolved:"Решена"},level={low:"Низкий",medium:"Средний",high:"Высокий",critical:"Критичный"};
async function call(path,method="GET",data){
 const res=await fetch(path,{method,headers:{"Content-Type":"application/json"},body:data===undefined?undefined:JSON.stringify(data)});
 const json=await res.json();if(!res.ok)throw Error(json.error||"Ошибка API");return json;
}
function alertBox(text,err=false){const node=$("#flash");node.textContent=text;node.style.background=err?"#ad5949":"#24473d";node.style.display="block";clearTimeout(window.alertTimer);window.alertTimer=setTimeout(()=>node.style.display="none",3000);}
function tickets(){
 for(const status of ["new","in_progress","resolved"]){
  const items=model.incidents.filter(x=>x.status===status);
  $("#n"+(status==="new"?"New":status==="in_progress"?"Progress":"Resolved")).textContent=items.length;
  $("#"+status).innerHTML=items.map(x=>{
   let action=status==="new"?'<button data-move="'+x.id+'" data-status="in_progress">Начать проверку →</button>':status==="in_progress"?'<button data-move="'+x.id+'" data-status="resolved">Отметить решённым ✓</button>':'<span class="empty">Завершено</span>';
   return '<article class="ticket"><div class="ticketmeta"><span>№ '+x.id+' / '+safe(x.cameraId)+'</span><span class="prio '+safe(x.severity)+'">'+safe(level[x.severity])+'</span></div><h3>'+safe(x.title)+'</h3><p>'+safe(x.description||"Без примечания")+'</p><p>Исполнитель: '+safe(x.assignee||"не указан")+'</p>'+action+'</article>';
  }).join("")||'<p class="empty">Карточек пока нет</p>';
 }
}
function cameras(){
 $("#cameraCards").innerHTML=model.cameras.map(x=>'<article class="camera"><div class="camera-visual"><span>'+safe(x.id)+'</span></div><div class="camera-info"><small><span class="indicator '+safe(x.status)+'"></span>'+safe(x.status==="online"?"В СЕТИ":"НЕТ СВЯЗИ")+'</small><h3>'+safe(x.name)+'</h3><p>'+safe(x.location)+'</p><button type="button" class="minor" data-camera="'+safe(x.id)+'" data-status="'+(x.status==="online"?"offline":"online")+'">Сменить статус</button></div></article>').join("");
}
function events(){
 const severity=$("#severity").value;
 $("#events").innerHTML=model.events.filter(x=>!severity||x.severity===severity).map(x=>'<article class="event"><time>'+safe(new Date(x.createdAt).toLocaleString("ru-RU"))+'</time><span class="prio '+safe(x.severity)+'">'+safe(level[x.severity])+'</span><div><b>'+safe(x.cameraId)+' · '+safe(x.type)+'</b><p>'+safe(x.message)+'</p></div></article>').join("")||'<p class="empty">Событий по заданному фильтру нет</p>';
}
async function refresh(){
 const [m,c,i,e]=await Promise.all([call("/api/metrics"),call("/api/cameras"),call("/api/incidents"),call("/api/events")]);
 model.cameras=c;model.incidents=i;model.events=e;
 $("#total").textContent=m.total;$("#offline").textContent=m.offline;$("#active").textContent=m.active;$("#critical").textContent=m.critical;
 $("#server").textContent="● API ДОСТУПЕН";tickets();cameras();events();
}
function element(name,label,kind="text",options=""){
 return '<div class="field"><label for="f_'+name+'">'+label+'</label>'+(kind==="select"?'<select required id="f_'+name+'" name="'+name+'">'+options+'</select>':kind==="textarea"?'<textarea id="f_'+name+'" name="'+name+'"></textarea>':'<input required id="f_'+name+'" name="'+name+'" maxlength="140">')+'</div>';
}
function open(mode){
 model.mode=mode;$("#formTitle").textContent=mode==="incident"?"Зарегистрировать инцидент":"Записать событие IoT";
 const cams=model.cameras.map(x=>'<option value="'+safe(x.id)+'">'+safe(x.name)+'</option>').join("");
 const severity='<option value="low">Низкий</option><option value="medium">Средний</option><option value="high">Высокий</option><option value="critical">Критичный</option>';
 $("#formFields").innerHTML=mode==="incident"?element("title","Название ситуации")+element("cameraId","Видеоточка","select",cams)+element("severity","Приоритет","select",severity)+element("description","Примечание","textarea"):element("cameraId","Связанная камера","select",cams)+element("type","Тип события","select",'<option value="motion">Движение</option><option value="door_open">Открыта дверь</option><option value="smoke">Дым</option><option value="camera_offline">Потеря камеры</option>')+element("severity","Важность","select",severity)+element("message","Описание");
 $("#drawer").showModal();
}
$("#date").textContent=new Date().toLocaleDateString("ru-RU");
$("#addIncident").onclick=()=>open("incident");$("#addEvent").onclick=()=>open("event");
$("#close").onclick=()=>$("#drawer").close();$("#cancel").onclick=()=>$("#drawer").close();
$("#reload").onclick=()=>refresh().then(()=>alertBox("Информация обновлена")).catch(e=>alertBox(e.message,true));
$("#severity").onchange=events;
$("#form").onsubmit=async ev=>{
 ev.preventDefault();const payload=Object.fromEntries(new FormData(ev.target));
 try{await call(model.mode==="incident"?"/api/incidents":"/api/events","POST",payload);$("#drawer").close();$("#form").reset();await refresh();alertBox("Запись добавлена");}catch(e){alertBox(e.message,true);}
};
document.onclick=async ev=>{
 const b=ev.target.closest("[data-move],[data-camera]");if(!b)return;
 b.disabled=true;
 try{if(b.dataset.move)await call("/api/incidents/"+encodeURIComponent(b.dataset.move),"PATCH",{status:b.dataset.status,assignee:"Дежурная смена"});else await call("/api/cameras/"+encodeURIComponent(b.dataset.camera),"PATCH",{status:b.dataset.status});await refresh();alertBox("Изменения сохранены");}catch(e){alertBox(e.message,true);}finally{b.disabled=false;}
};
refresh().catch(e=>{$("#server").textContent="● НЕТ СОЕДИНЕНИЯ";alertBox(e.message,true);});
