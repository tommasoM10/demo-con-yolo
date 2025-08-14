import {bearingToText, clamp, center} from './utils.js';
import {YOLODetector} from './detector.js';

const video=document.getElementById('video');
const canvas=document.getElementById('overlay'); const ctx=canvas.getContext('2d');
const menuToggle=document.getElementById('menuToggle'); const dropdown=document.getElementById('dropdown');
const fsBtns=document.querySelectorAll('#fsBtn'); fsBtns.forEach(b=> b.onclick=toggleFS);
const guide=document.getElementById('guide'); const guideTitle=document.getElementById('guideTitle'); const guideMeta=document.getElementById('guideMeta'); const gpsMeta=document.getElementById('gpsMeta'); const guideClose=document.getElementById('guideClose'); const arrow=document.getElementById('arrow');
const hud=document.getElementById('hud');
const mapCanvas=document.getElementById('mapCanvas'); const mctx=mapCanvas.getContext('2d');
const mapToggle=document.getElementById('mapToggle');

const sourceSelect=document.getElementById('sourceSelect'); const cameraSelect=document.getElementById('cameraSelect'); const fovDeg=document.getElementById('fovDeg');
const startBtn=document.getElementById('startBtn'); const stopBtn=document.getElementById('stopBtn'); const simulateBtn=document.getElementById('simulateBtn');
const horizonPct=document.getElementById('horizonPct'); const minConf=document.getElementById('minConf'); const minAreaPct=document.getElementById('minAreaPct'); const hitK=document.getElementById('hitK'); const missM=document.getElementById('missM'); const cooldownSec=document.getElementById('cooldownSec');
const roiBtn=document.getElementById('roiBtn'); const clearRoiBtn=document.getElementById('clearRoiBtn');
const modelUrl=document.getElementById('modelUrl'); const modelStatus=document.getElementById('modelStatus');

const meteoInfo=document.getElementById('meteoInfo'); const refreshMeteoBtn=document.getElementById('refreshMeteoBtn');
const gpsStatus=document.getElementById('gpsStatus'); const compStatus=document.getElementById('compStatus');

menuToggle.onclick=()=> dropdown.classList.toggle('open');
function toggleFS(){ try{ if(document.fullscreenElement){ document.exitFullscreen(); } else { document.documentElement.requestFullscreen(); } }catch{} }
function fit(){ canvas.width=canvas.clientWidth; canvas.height=canvas.clientHeight; } addEventListener('resize', fit); fit();

// Sensors
let currentGPS={lat:null,lon:null,accuracy:null}; let compassDeg=null;
function startGPS(){ if(!navigator.geolocation){ gpsStatus.textContent='GPS non disponibile'; return; } navigator.geolocation.watchPosition(p=>{ currentGPS.lat=p.coords.latitude; currentGPS.lon=p.coords.longitude; currentGPS.accuracy=p.coords.accuracy; gpsStatus.textContent=`GPS: ${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)} (±${Math.round(p.coords.accuracy)} m)`; },()=>{ gpsStatus.textContent='GPS negato o non disponibile'; }, {enableHighAccuracy:true}); }
function startCompass(){ const handler=(e)=>{ compassDeg = e.webkitCompassHeading ?? (360-(e.alpha||0)); compStatus.textContent = 'Bussola: '+(compassDeg!=null?`${Math.round(compassDeg)}°`:'—'); };
  if(window.DeviceOrientationEvent?.requestPermission){ DeviceOrientationEvent.requestPermission().then(s=>{ if(s==='granted') addEventListener('deviceorientation', handler); else compStatus.textContent='Bussola: negata'; }).catch(()=>{ compStatus.textContent='Bussola: non disponibile'; }); } else { addEventListener('deviceorientation', handler); } }

// Meteo corrente
let meteo=null;
async function refreshMeteo(){ if(!currentGPS.lat){ meteoInfo.textContent='Concedi posizione e riprova.'; return; }
  const url = new URL('https://marine-api.open-meteo.com/v1/marine');
  url.searchParams.set('latitude', currentGPS.lat.toFixed(5)); url.searchParams.set('longitude', currentGPS.lon.toFixed(5));
  url.searchParams.set('timezone','auto'); url.searchParams.set('hourly','ocean_current_velocity,ocean_current_direction');
  try{ const r=await fetch(url); const d=await r.json(); const i=d.hourly.time.findIndex(t=>t.startsWith(new Date().toISOString().slice(0,13))); const k=i>=0?i:0;
    meteo={v:d.hourly.ocean_current_velocity?.[k]||0, dir:d.hourly.ocean_current_direction?.[k]||0};
    meteoInfo.textContent=`Corrente ${meteo.v?.toFixed?.(2)||'?'} km/h → ${Math.round(meteo.dir||0)}°`;
  }catch{ meteoInfo.textContent='Meteo non disponibile'; meteo=null; }
}
refreshMeteoBtn.onclick=refreshMeteo;

// ROI mandatory
let roi=null; let drawing=false; let points=[];
roiBtn.onclick=()=>{ drawing=true; points=[]; roi=null; hudMsg('Disegna poligono area acqua (tap multipli). Doppio tap per chiudere.'); };
clearRoiBtn.onclick=()=>{ drawing=false; points=[]; roi=null; hudMsg('ROI cancellata'); };
canvas.addEventListener('click',(e)=>{ if(!drawing) return; const r=canvas.getBoundingClientRect(); points.push({x:(e.clientX-r.left)/r.width, y:(e.clientY-r.top)/r.height}); drawOverlay([]); });
canvas.addEventListener('dblclick',()=>{ if(points.length>=3){ roi=points.slice(); drawing=false; hudMsg('ROI impostata ✓'); } });

function pointInROI(px,py){ if(!roi) return false; let inside=false; for(let i=0,j=roi.length-1;i<roi.length;j=i++){ const xi=roi[i].x, yi=roi[i].y, xj=roi[j].x, yj=roi[j].y; const intersect=((yi>py)!=(yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi); if(intersect) inside=!inside; } return inside; }

// Detector
const det=new YOLODetector();
async function ensureModel(){ if(det.session) return; await det.load(modelUrl.value, modelStatus); }

// Camera or demo
let stream=null, running=false;
async function startCamera(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } const val=cameraSelect.value; const cons={audio:false, video:{facingMode:(val==='env'?'environment':'user'), width:{ideal:1280}, height:{ideal:720}}}; stream=await navigator.mediaDevices.getUserMedia(cons); video.srcObject=stream; await video.play(); }
function startDemo(){ const c=document.createElement('canvas'); c.width=1280; c.height=720; const g=c.getContext('2d'); let t=0, hide=false, hideStart=0;
  function step(){ if(!running) return; t+=1/30; g.fillStyle='#00304d'; g.fillRect(0,0,c.width,c.height); for(let i=0;i<50;i++){ const y=(i*16+Math.sin((t+i)*0.8)*12)%c.height; g.fillStyle='rgba(255,255,255,0.02)'; g.fillRect(0,y,c.width,2); }
    const bob=Math.sin(t*2)*6; if(!hide){ g.fillStyle='#ffeeaa'; g.beginPath(); g.arc(640,420+bob-26,10,0,Math.PI*2); g.fill(); g.fillStyle='#c0d8ff'; g.fillRect(640-13,420+bob-26+12,26,40); }
    if(Math.floor(t)%12===0 && !hide){ hide=true; hideStart=t; } if(hide && t-hideStart>8){ hide=false; }
    requestAnimationFrame(step);} video.srcObject=c.captureStream(30); video.play(); step(); }

// Tracking with IDs
let tracks=[]; let nextId=1; const colors={};
function colorFor(id){ if(colors[id]) return colors[id]; const h=(id*57)%360; colors[id]=`hsl(${h}deg 90% 55%)`; return colors[id]; }
function iou(a,b){ const x1=Math.max(a.x,b.x), y1=Math.max(a.y,b.y), x2=Math.min(a.x+a.w,b.x+b.w), y2=Math.min(a.y+a.h,b.y+b.h); const inter=Math.max(0,x2-x1)*Math.max(0,y2-y1); const ua=a.w*a.h+b.w*b.h-inter; return ua>0?inter/ua:0; }
function assignIDs(dets){ const assigned=new Set();
  for(const tr of tracks){ tr.matched=false; let best=0, bi=-1; for(let j=0;j<dets.length;j++){ if(assigned.has(j)) continue; const ov=iou(tr.bbox, dets[j]); if(ov>best){ best=ov; bi=j; } } if(best>0.3){ tr.bbox=dets[bi]; tr.lastT=performance.now()/1000; tr.hits=(tr.hits||0)+1; tr.misses=0; tr.matched=true; assigned.add(bi); } else { tr.misses=(tr.misses||0)+1; } }
  for(let j=0;j<dets.length;j++){ if(!assigned.has(j)){ tracks.push({id: nextId++, bbox:dets[j], lastT:performance.now()/1000, hits:1, misses:0, state:'VISIBLE'}); } }
  tracks = tracks.filter(tr=> tr.misses<60);
}

// Alarm logic
let cooldownUntil=0; let alerting=null;
function openGuide(target){ alerting={target, t:performance.now()/1000}; document.getElementById('stage').classList.add('flash'); guide.style.display='flex'; startAlarm(); vibrate(); mapCanvas.style.display='block'; }
function closeGuide(){ guide.style.display='none'; document.getElementById('stage').classList.remove('flash'); stopAlarm(); alerting=null; cooldownUntil=performance.now()/1000 + parseFloat(cooldownSec.value); }
guideClose.onclick=closeGuide; mapToggle.onclick=()=>{ mapCanvas.style.display = (mapCanvas.style.display==='none'||!mapCanvas.style.display) ? 'block':'none'; };

// Alarm audio/vibra
let audioCtx=null, osc=null, gain=null;
function startAlarm(){ try{ if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)(); if(osc) return; osc=audioCtx.createOscillator(); gain=audioCtx.createGain(); osc.connect(gain); gain.connect(audioCtx.destination); osc.type='square'; osc.frequency.value=880; gain.gain.value=0.15; osc.start(); }catch{} }
function stopAlarm(){ if(osc){ try{osc.stop();}catch{} osc.disconnect(); gain.disconnect(); osc=null; gain=null; } }
function vibrate(){ if(navigator.vibrate) navigator.vibrate([200,100,200,400,200,100,200]); }
function hudMsg(msg,bg){ hud.textContent=msg; hud.style.display='flex'; hud.style.background=bg||'#0b3357'; clearTimeout(hud._t); hud._t=setTimeout(()=>hud.style.display='none',3500); }

// Pixel->bearing & map update
function pixelBearing(cxNorm){ const fov=parseFloat(fovDeg.value)*(Math.PI/180); const off=(cxNorm-0.5)*fov; const bearing = ((compassDeg??0) + off*180/Math.PI); return (bearing%360+360)%360; }
function updateMapAndArrow(last){ const mx=mapCanvas.clientWidth||240, my=mapCanvas.clientHeight||160; mapCanvas.width=mx; mapCanvas.height=my; mctx.fillStyle='#02253b'; mctx.fillRect(0,0,mx,my);
  if(!last) return; const x=clamp(last.cx,0,canvas.width)/canvas.width*mx; const y=clamp(last.cy,0,canvas.height)/canvas.height*my;
  mctx.fillStyle='#fff'; mctx.beginPath(); mctx.arc(x,y,4,0,Math.PI*2); mctx.fill();
  let ang=(meteo?.dir|| (compassDeg??0)) * Math.PI/180; const ex=x+Math.cos(ang)*28, ey=y+Math.sin(ang)*28;
  mctx.fillStyle='#ff4757'; mctx.beginPath(); mctx.arc(ex,ey,4,0,Math.PI*2); mctx.fill();
  mctx.strokeStyle='rgba(255,255,255,0.6)'; mctx.beginPath(); mctx.moveTo(x,y); mctx.lineTo(ex,ey); mctx.stroke();
  arrow.setAttribute('transform', `rotate(${(ang*180/Math.PI)},100,100)`);
}

// Draw overlay
function drawOverlay(){
  fit(); ctx.clearRect(0,0,canvas.width,canvas.height);
  const hy = canvas.height * (parseFloat(horizonPct.value)/100); ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(0,hy); ctx.lineTo(canvas.width,hy); ctx.stroke();
  if(roi){ ctx.save(); ctx.beginPath(); ctx.moveTo(roi[0].x*canvas.width, roi[0].y*canvas.height); for(let i=1;i<roi.length;i++){ ctx.lineTo(roi[i].x*canvas.width, roi[i].y*canvas.height);} ctx.closePath(); ctx.fillStyle='rgba(30,144,255,0.15)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='rgba(30,144,255,0.9)'; ctx.stroke(); ctx.restore(); }
  for(const tr of tracks){ const bb=tr.bbox; if(!bb) continue; const x=bb.x/(video.videoWidth||1280)*canvas.width, y=bb.y/(video.videoHeight||720)*canvas.height; const wd=bb.w/(video.videoWidth||1280)*canvas.width, ht=bb.h/(video.videoHeight||720)*canvas.height; ctx.lineWidth=3; ctx.strokeStyle=colorFor(tr.id); ctx.strokeRect(x,y,wd,ht);
    const cx=x+wd/2, cy=y+ht/2; const tag=document.createElement('div'); tag.className='idtag'; tag.textContent='#'+tr.id; tag.style.left=cx+'px'; tag.style.top=cy+'px'; tag.style.background=colorFor(tr.id); tag.style.borderColor='#fff'; tag.style.color='#001221'; canvas.parentElement.appendChild(tag); setTimeout(()=>tag.remove(),0); }
}

let lastDetT=0; let lastSeenById=new Map();
async function loop(){ if(!running) return; const t=performance.now()/1000; if(t-lastDetT<0.2){ drawOverlay(); requestAnimationFrame(loop); return; } lastDetT=t;
  if(!roi){ hudMsg('Disegna la ROI acqua prima di avviare'); drawOverlay(); requestAnimationFrame(loop); return; }
  await ensureModel();
  const conf=parseFloat(minConf.value); const {boxes, vw, vh}=await det.detect(video, conf);
  const hPct=parseFloat(horizonPct.value)/100; const horizonY=vh*hPct; const minArea=parseFloat(minAreaPct.value)*1280*720;
  const dets=boxes.filter(b=> (b.y+b.h/2)>=horizonY && b.w*b.h>=minArea && (b.h/(b.w+1e-3))>0.5 && (b.h/(b.w+1e-3))<5 && pointInROI((b.x+b.w/2)/vw,(b.y+b.h/2)/vh));
  assignIDs(dets);
  // Hysteresis per‑ID
  const K=parseInt(hitK.value,10), M=parseInt(missM.value,10), cd=parseFloat(cooldownSec.value);
  for(const tr of tracks){ if(tr.matched){ tr.hit=(tr.hit||0)+1; tr.miss=0; lastSeenById.set(tr.id,{t, c:{cx: tr.bbox.x+tr.bbox.w/2, cy: tr.bbox.y+tr.bbox.h/2}}); } else { tr.miss=(tr.miss||0)+1; } }
  for(const tr of tracks){ if((tr.hit||0)>=K && (tr.miss||0)>=M && !alerting && t>cooldownUntil){ const last=lastSeenById.get(tr.id) || {t, c:{cx:vw*0.5, cy:vh*0.6}};
      const cxNorm = clamp(last.c.cx/vw, 0, 1); const brg=pixelBearing(cxNorm);
      guideTitle.textContent = `ALLERTA — Persona #${tr.id}`; guideMeta.textContent = `Ultimo visto: ${Math.round((t-last.t))} s · Bearing: ${Math.round(brg)}°`;
      const compText=compassDeg==null?'--':bearingToText(compassDeg); gpsMeta.textContent=currentGPS.lat?`GPS bagnino: ${currentGPS.lat.toFixed(5)}, ${currentGPS.lon.toFixed(5)} (±${currentGPS.accuracy?Math.round(currentGPS.accuracy):'--'} m) · Bussola: ${compText}`:'GPS: --';
      updateMapAndArrow({cx: last.c.cx*(canvas.width/vw), cy: last.c.cy*(canvas.height/vh)}); openGuide({id: tr.id, last}); } }
  drawOverlay();
  requestAnimationFrame(loop);
}

simulateBtn.onclick=()=>{ if(!alerting){ guideTitle.textContent='ALLERTA (manuale)'; guideMeta.textContent='Test in corso'; gpsMeta.textContent=currentGPS.lat?`GPS: ${currentGPS.lat.toFixed(5)}, ${currentGPS.lon.toFixed(5)}`:'GPS: --'; mapCanvas.style.display='block'; guide.style.display='flex'; startAlarm(); vibrate(); } };
startBtn.onclick=async ()=>{ try{ dropdown.classList.remove('open'); running=true; fit(); startGPS(); startCompass(); if(sourceSelect.value==='camera'){ await startCamera(); } else { startDemo(); } hudMsg('Sessione avviata','#0b3357'); loop(); }catch(e){ alert('Errore: '+e.message); running=false; } };
stopBtn.onclick=()=>{ running=false; if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } guide.style.display='none'; hudMsg('Sessione terminata','#0b3357'); };
