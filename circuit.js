'use strict';

// ── Component definitions ──────────────────────────────────────────────────────
const COMP_DEFS = {
  VCC:  {w:54, h:36, label:'VCC',  ins:0, outs:1, clr:'#150f20', tc:'#b080e0', logic:()=>true},
  GND:  {w:54, h:36, label:'GND',  ins:0, outs:1, clr:'#150f20', tc:'#8080b0', logic:()=>false},
  SW:   {w:70, h:40, label:'SW',   ins:0, outs:1, clr:'#0a1515', tc:'#60b8b8', logic:null},
  BTN:  {w:62, h:40, label:'BTN',  ins:0, outs:1, clr:'#0a1515', tc:'#60b8b8', logic:null},
  CLK:  {w:62, h:40, label:'CLK',  ins:0, outs:1, clr:'#0a1515', tc:'#60a880', logic:null},
  AND:  {w:70, h:50, label:'AND',  ins:2, outs:1, clr:'#0f1520', tc:'#7090c0', logic:i=>i[0]&&i[1]},
  OR:   {w:70, h:50, label:'OR',   ins:2, outs:1, clr:'#0f1520', tc:'#7090c0', logic:i=>i[0]||i[1]},
  NOT:  {w:62, h:40, label:'NOT',  ins:1, outs:1, clr:'#0f1520', tc:'#7090c0', logic:i=>!i[0]},
  NAND: {w:70, h:50, label:'NAND', ins:2, outs:1, clr:'#0f1520', tc:'#7090c0', logic:i=>!(i[0]&&i[1])},
  NOR:  {w:70, h:50, label:'NOR',  ins:2, outs:1, clr:'#0f1520', tc:'#7090c0', logic:i=>!(i[0]||i[1])},
  XOR:  {w:70, h:50, label:'XOR',  ins:2, outs:1, clr:'#0f1520', tc:'#7090c0', logic:i=>i[0]!==i[1]},
  XNOR: {w:70, h:50, label:'XNOR', ins:2, outs:1, clr:'#0f1520', tc:'#7090c0', logic:i=>i[0]===i[1]},
  LED:  {w:48, h:48, label:'LED',  ins:1, outs:0, clr:'#1a0808', tc:'#cc4444', logic:null},
};

// ── State ──────────────────────────────────────────────────────────────────────
let components = [], wires = [], nextId = 1;
let running = false, simTick = 0, simInterval = null;
let tool = 'select', placeType = null, selectedId = null;
let wireStart = null;         // {compId, type:'out'|'in', idx}
let mouseW = {x:0, y:0}, mouseSc = {x:0, y:0};
let panX = -60, panY = -60, zoom = 1;
let dragComp = null;          // {id, offX, offY}
let isPanning = false, panStart = null;
let btnHeld = null;
const CLK_HALF = 6;           // sim-ticks per half-period

// ── Canvas ─────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('sim-canvas');
const ctx    = canvas.getContext('2d');
const wrap   = document.getElementById('canvas-wrap');
function resize() { canvas.width = wrap.clientWidth; canvas.height = wrap.clientHeight; }
window.addEventListener('resize', () => { resize(); render(); });
resize();

// ── Coords ────────────────────────────────────────────────────────────────────
const w2s = (wx, wy) => ({x:(wx-panX)*zoom, y:(wy-panY)*zoom});
const s2w = (sx, sy) => ({x:sx/zoom+panX,   y:sy/zoom+panY});

// ── Pin positions (world) ─────────────────────────────────────────────────────
function inPinPos(c, i) {
  const d = COMP_DEFS[c.type];
  return {x: c.x, y: c.y + d.h / (d.ins + 1) * (i + 1)};
}
function outPinPos(c) {
  const d = COMP_DEFS[c.type];
  return {x: c.x + d.w, y: c.y + d.h / 2};
}

// ── Hit testing ───────────────────────────────────────────────────────────────
const PIN_HIT = 10;
function compAt(wx, wy) {
  for (let i = components.length - 1; i >= 0; i--) {
    const c = components[i], d = COMP_DEFS[c.type];
    if (wx >= c.x && wx <= c.x + d.w && wy >= c.y && wy <= c.y + d.h) return c;
  }
  return null;
}
function pinAt(sx, sy) {
  for (const c of components) {
    const d = COMP_DEFS[c.type];
    if (d.outs > 0) {
      const p = w2s(outPinPos(c).x, outPinPos(c).y);
      if (Math.hypot(sx-p.x, sy-p.y) < PIN_HIT) return {compId:c.id, type:'out', idx:0};
    }
    for (let i = 0; i < d.ins; i++) {
      const p = w2s(inPinPos(c,i).x, inPinPos(c,i).y);
      if (Math.hypot(sx-p.x, sy-p.y) < PIN_HIT) return {compId:c.id, type:'in', idx:i};
    }
  }
  return null;
}
function wireAt(sx, sy) {
  for (const w of wires) {
    const fc = byId(w.fromComp), tc = byId(w.toComp);
    if (!fc || !tc) continue;
    const fp = w2s(outPinPos(fc).x, outPinPos(fc).y);
    const tp = w2s(inPinPos(tc, w.toPin).x, inPinPos(tc, w.toPin).y);
    if (ptOnSeg(sx, sy, fp.x, fp.y, tp.x, tp.y, 7)) return w;
  }
  return null;
}
function ptOnSeg(px,py, ax,ay, bx,by, tol) {
  const dx=bx-ax, dy=by-ay, l2=dx*dx+dy*dy;
  if (l2 < 1) return false;
  const t = Math.max(0, Math.min(1, ((px-ax)*dx+(py-ay)*dy)/l2));
  return Math.hypot(px-(ax+t*dx), py-(ay+t*dy)) < tol;
}

// ── Simulation ────────────────────────────────────────────────────────────────
const byId = id => components.find(c => c.id === id);
function simulate() {
  simTick++;
  for (const c of components) {
    if (c.type==='VCC') c.state=true;
    else if (c.type==='GND') c.state=false;
    else if (c.type==='CLK') c.state=Math.floor(simTick/CLK_HALF)%2===0;
    else if (c.type==='BTN') c.state=btnHeld===c.id;
  }
  for (let pass = 0; pass < 10; pass++) {
    for (const w of wires) {
      const src=byId(w.fromComp); if (!src) continue;
      w.state = src.state;
      const dst=byId(w.toComp); if (dst) dst.inputs[w.toPin]=w.state;
    }
    let changed = false;
    for (const c of components) {
      const d = COMP_DEFS[c.type]; if (!d.logic) continue;
      const prev = c.state; c.state = !!d.logic(c.inputs);
      if (c.state !== prev) changed = true;
    }
    if (!changed) break;
  }
  render();
}

// ── Rendering ─────────────────────────────────────────────────────────────────
const sigClr = s => s ? '#72c472' : '#2a3a2a';

function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

function drawGrid() {
  const step = 20*zoom;
  const ox=((-panX*zoom)%step+step)%step, oy=((-panY*zoom)%step+step)%step;
  ctx.strokeStyle='#0f1a0f'; ctx.lineWidth=0.5;
  for (let x=ox; x<canvas.width;  x+=step) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
  for (let y=oy; y<canvas.height; y+=step) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
}

function drawComp(c) {
  const d=COMP_DEFS[c.type], s=w2s(c.x,c.y), sw=d.w*zoom, sh=d.h*zoom;
  const sel=c.id===selectedId;
  ctx.fillStyle=d.clr; ctx.strokeStyle=sel?'#80cc80':'#3a4a3a'; ctx.lineWidth=sel?2:1;
  rrect(s.x,s.y,sw,sh,4*zoom); ctx.fill(); ctx.stroke();

  ctx.fillStyle=d.tc;
  ctx.font=`bold ${Math.max(9,11*zoom)}px 'Courier New',monospace`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(d.label, s.x+sw/2, s.y+sh/2);

  if (c.type==='SW') {
    ctx.fillStyle=c.state?'#72c472':'#3a5a3a';
    ctx.beginPath(); ctx.arc(s.x+sw*0.78, s.y+sh/2, 5*zoom, 0, Math.PI*2); ctx.fill();
  }
  if (c.type==='CLK') {
    const mx=s.x+sw*0.78, my=s.y+sh/2, r=5*zoom;
    ctx.strokeStyle=c.state?'#72c472':'#3a5a3a'; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(mx-r,my); ctx.lineTo(mx-r,my-r); ctx.lineTo(mx,my-r);
    ctx.lineTo(mx,my+r); ctx.lineTo(mx+r,my+r); ctx.lineTo(mx+r,my); ctx.stroke();
  }
  if (c.type==='VCC'||c.type==='GND') {
    const cx=s.x+sw*0.3, cy=s.y+sh/2, r=5*zoom;
    ctx.strokeStyle=d.tc; ctx.lineWidth=1.5;
    if (c.type==='VCC') {
      ctx.beginPath(); ctx.moveTo(cx,cy-r); ctx.lineTo(cx-r,cy+r); ctx.lineTo(cx+r,cy+r); ctx.closePath(); ctx.stroke();
    } else {
      [[1,0],[0.7,0.5],[0.35,1]].forEach(([f,o]) => {
        ctx.beginPath(); ctx.moveTo(cx-r*f,cy+r*o); ctx.lineTo(cx+r*f,cy+r*o); ctx.stroke();
      });
    }
  }
  if (c.type==='LED') {
    const on=c.inputs[0];
    if (on) { ctx.shadowColor='#ff5533'; ctx.shadowBlur=14*zoom; }
    ctx.fillStyle=on?'#ff3322':'#3a0f0f';
    ctx.beginPath(); ctx.arc(s.x+sw*0.65, s.y+sh/2, 10*zoom, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
  }

  // Input pins
  for (let i=0; i<d.ins; i++) {
    const p=inPinPos(c,i), sp=w2s(p.x,p.y);
    ctx.fillStyle=sigClr(c.inputs[i]); ctx.strokeStyle='#111'; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.arc(sp.x,sp.y,4*zoom,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle=sigClr(c.inputs[i]); ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(sp.x,sp.y); ctx.lineTo(sp.x-8*zoom,sp.y); ctx.stroke();
  }
  // Output pin
  if (d.outs>0) {
    const p=outPinPos(c), sp=w2s(p.x,p.y);
    ctx.fillStyle=sigClr(c.state); ctx.strokeStyle='#111'; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.arc(sp.x,sp.y,4*zoom,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle=sigClr(c.state); ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(sp.x,sp.y); ctx.lineTo(sp.x+8*zoom,sp.y); ctx.stroke();
  }
}

function drawWire(w) {
  const fc=byId(w.fromComp), tc=byId(w.toComp); if (!fc||!tc) return;
  const fp=w2s(outPinPos(fc).x,outPinPos(fc).y);
  const tp=w2s(inPinPos(tc,w.toPin).x,inPinPos(tc,w.toPin).y);
  const dx=Math.max(35, Math.abs(tp.x-fp.x)*0.45);
  ctx.strokeStyle=w.state?'#58aa58':'#253025'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(fp.x,fp.y);
  ctx.bezierCurveTo(fp.x+dx,fp.y, tp.x-dx,tp.y, tp.x,tp.y); ctx.stroke();
}

function render() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#060e06'; ctx.fillRect(0,0,canvas.width,canvas.height);
  drawGrid();
  for (const w of wires) drawWire(w);
  for (const c of components) drawComp(c);

  // Wire in progress
  if (wireStart) {
    const sc=byId(wireStart.compId);
    if (sc) {
      const pp = wireStart.type==='out' ? outPinPos(sc) : inPinPos(sc,wireStart.idx);
      const sp=w2s(pp.x,pp.y);
      ctx.strokeStyle='#cc8030'; ctx.lineWidth=1.5; ctx.setLineDash([5,4]);
      ctx.beginPath(); ctx.moveTo(sp.x,sp.y); ctx.lineTo(mouseSc.x,mouseSc.y); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Ghost placement
  if (tool==='place' && placeType) {
    const d=COMP_DEFS[placeType];
    const gx=mouseW.x-d.w/2, gy=mouseW.y-d.h/2, gs=w2s(gx,gy);
    ctx.globalAlpha=0.4;
    ctx.fillStyle=d.clr; ctx.strokeStyle='#80cc80'; ctx.lineWidth=1;
    rrect(gs.x,gs.y,d.w*zoom,d.h*zoom,4*zoom); ctx.fill(); ctx.stroke();
    ctx.fillStyle=d.tc;
    ctx.font=`bold ${Math.max(9,11*zoom)}px 'Courier New',monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(d.label, gs.x+d.w*zoom/2, gs.y+d.h*zoom/2);
    ctx.globalAlpha=1;
  }
}

// ── Mouse ─────────────────────────────────────────────────────────────────────
function mpos(e) {
  const r=canvas.getBoundingClientRect();
  const sx=e.clientX-r.left, sy=e.clientY-r.top;
  return {sx, sy, ...s2w(sx,sy)};
}
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousedown', e => {
  const {sx,sy,x:wx,y:wy}=mpos(e);
  mouseSc={x:sx,y:sy}; mouseW={x:wx,y:wy};

  if (e.button===1||(e.button===0&&e.altKey)||e.button===2) {
    isPanning=true; panStart={sx,sy,panX,panY}; return;
  }

  if (tool==='place'&&placeType) {
    const d=COMP_DEFS[placeType];
    placeComp(placeType, snap(wx-d.w/2), snap(wy-d.h/2)); return;
  }

  const pin=pinAt(sx,sy);

  if (tool==='wire') {
    if (!pin) { wireStart=null; setStatus('Cliquer sur une broche.'); return; }
    if (!wireStart) { wireStart=pin; setStatus('Cliquer sur la broche de destination.'); }
    else finishWire(pin);
    return;
  }

  if (tool==='delete') {
    const c=compAt(wx,wy);
    if (c) { deleteComp(c.id); return; }
    const w=wireAt(sx,sy);
    if (w) { wires=wires.filter(x=>x!==w); simulate(); }
    return;
  }

  // select tool
  const c=compAt(wx,wy);
  if (c) {
    selectedId=c.id;
    if (c.type==='SW') { c.state=!c.state; simulate(); return; }
    if (c.type==='BTN') { btnHeld=c.id; simulate(); }
    dragComp={id:c.id, offX:wx-c.x, offY:wy-c.y};
  } else {
    selectedId=null; isPanning=true; panStart={sx,sy,panX,panY};
  }
  render();
});

canvas.addEventListener('mousemove', e => {
  const {sx,sy,x:wx,y:wy}=mpos(e);
  mouseSc={x:sx,y:sy}; mouseW={x:wx,y:wy};
  if (isPanning&&panStart) {
    panX=panStart.panX-(sx-panStart.sx)/zoom;
    panY=panStart.panY-(sy-panStart.sy)/zoom;
  } else if (dragComp) {
    const c=byId(dragComp.id);
    if (c) { c.x=snap(wx-dragComp.offX); c.y=snap(wy-dragComp.offY); }
  }
  render();
});

canvas.addEventListener('mouseup', e => {
  isPanning=false; panStart=null; dragComp=null;
  if (btnHeld!==null) { btnHeld=null; simulate(); }
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const {sx,sy,x:wx,y:wy}=mpos(e);
  const factor=e.deltaY<0?1.13:1/1.13;
  zoom=Math.min(4,Math.max(0.2,zoom*factor));
  panX=wx-sx/zoom; panY=wy-sy/zoom;
  render();
},{passive:false});

// ── Wire logic ────────────────────────────────────────────────────────────────
function finishWire(pin) {
  let fp=wireStart, tp=pin;
  if (fp.type==='in'&&tp.type==='out') [fp,tp]=[tp,fp];
  if (fp.type!=='out'||tp.type!=='in') { wireStart=null; setStatus('Connecter une sortie vers une entrée.'); return; }
  if (fp.compId===tp.compId) { wireStart=null; return; }
  if (wires.some(w=>w.toComp===tp.compId&&w.toPin===tp.idx)) { wireStart=null; setStatus('Entrée déjà connectée.'); return; }
  wires.push({id:nextId++, fromComp:fp.compId, toComp:tp.compId, toPin:tp.idx, state:false});
  wireStart=null; setStatus('Fil connecté.'); simulate();
}

// ── Component management ──────────────────────────────────────────────────────
const snap = v => Math.round(v/10)*10;
function placeComp(type, x, y) {
  const d=COMP_DEFS[type];
  components.push({id:nextId++, type, x, y, state:false, inputs:new Array(d.ins).fill(false)});
  simulate();
}
function deleteComp(id) {
  components=components.filter(c=>c.id!==id);
  wires=wires.filter(w=>w.fromComp!==id&&w.toComp!==id);
  if (selectedId===id) selectedId=null;
  simulate();
}

// ── UI controls ───────────────────────────────────────────────────────────────
function setTool(t) {
  tool=t; wireStart=null; placeType=null;
  document.querySelectorAll('.pal-btn').forEach(b=>b.classList.remove('sel'));
  document.querySelectorAll('.tool-btn').forEach(b=>b.classList.remove('t-sel','t-wire','t-del'));
  const btn=document.getElementById('tool-'+t);
  if (btn) btn.classList.add(t==='wire'?'t-wire':t==='delete'?'t-del':'t-sel');
  canvas.style.cursor=t==='delete'?'not-allowed':t==='wire'?'crosshair':'default';
  const msgs={select:'Glisser pour déplacer les composants. Clic sur un interrupteur pour le basculer.',
              wire:'Cliquer sur une broche de sortie, puis sur une entrée pour tracer un fil.',
              delete:'Cliquer sur un composant ou un fil pour le supprimer.'};
  setStatus(msgs[t]||'');
}
function setPlaceType(type) {
  placeType=type; tool='place'; wireStart=null;
  document.querySelectorAll('.pal-btn').forEach(b=>b.classList.remove('sel'));
  document.querySelectorAll('.tool-btn').forEach(b=>b.classList.remove('t-sel','t-wire','t-del'));
  const btn=document.querySelector(`.pal-btn[data-type="${type}"]`);
  if (btn) btn.classList.add('sel');
  canvas.style.cursor='crosshair';
  setStatus(`Cliquer sur le canvas pour placer : ${COMP_DEFS[type].label}. Échap pour annuler.`);
}
function togglePlay() {
  running=!running;
  const btn=document.getElementById('btn-play');
  if (running) {
    btn.textContent='⏸ Pause'; btn.classList.remove('paused');
    simInterval=setInterval(simulate,100);
  } else {
    btn.textContent='▶ Démarrer'; btn.classList.add('paused');
    clearInterval(simInterval);
  }
}
function stepOnce() { if (!running) simulate(); }
function clearCircuit() {
  if (!components.length&&!wires.length) return;
  if (!confirm('Effacer tout le circuit ?')) return;
  components=[]; wires=[]; selectedId=null; wireStart=null; simTick=0; render();
}
function setStatus(msg) { document.getElementById('status-bar').textContent=msg; }

// ── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key==='Escape') {
    if (wireStart) { wireStart=null; render(); }
    else if (tool==='place') setTool('select');
    else { selectedId=null; render(); }
  }
  if ((e.key==='Delete'||e.key==='Backspace')&&selectedId&&!e.target.matches('input,textarea')) {
    deleteComp(selectedId);
  }
  if (e.key===' '&&!e.target.matches('input,textarea')) { e.preventDefault(); togglePlay(); }
});

// ── Init ──────────────────────────────────────────────────────────────────────
setTool('select');
render();
