// Simulation loi 39 : à charger avec type="module", après d3 (global).
const ROOT = document.querySelector(".loi39");
const DATA = window.LOI39_DATA ?? await (await fetch(ROOT.dataset.src || "data.json")).json();

const P = ["PQ","PLQ","CAQ","PCQ","QS"];
const PNAME = {PQ:"Parti québécois",PLQ:"Parti libéral du Québec",CAQ:"Coalition avenir Québec",PCQ:"Parti conservateur du Québec",QS:"Québec solidaire"};
const PV = {PQ:"var(--pq)",PLQ:"var(--plq)",CAQ:"var(--caq)",PCQ:"var(--pcq)",QS:"var(--qs)"};
const SEAT_ORDER = ["QS","PQ","PLQ","CAQ","PCQ"];   // ordre de départage à égalité de sièges
const GASPESIE = "11", NORD = "10";
const REG = Object.fromEntries(DATA.regions.map(r => [r.code, r]));
const fmt = (x, d=1) => x.toLocaleString("fr-CA",{minimumFractionDigits:d,maximumFractionDigits:d});
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* Base : moyenne des circonscriptions actuelles, pondérée par leurs électeurs */
const BASE = (() => {
  const t = [0,0,0,0,0]; let T = 0;
  for (const r of DATA.ridings){ const S = r.s.reduce((a,b)=>a+b,0); r.s.forEach((v,i) => { t[i] += r.e*v/S; }); T += r.e; }
  return t.map(v => 100*v/T);
})();

const state = { target: BASE.slice(), thr: 10, mode: "lead", party: "ALL", lastParty: "CAQ", view: "reg", sel: {type:"all"} };
let RES;

/* --- Loi 39, art. 14.2 et 14.3 : diviseurs 1, 2, 3… sur les électeurs inscrits --- */
function highestQuotients(n){
  const q = [];
  for (const r of DATA.regions) for (let d = 1; d <= n; d++) q.push([r.electors/d, r.code]);
  q.sort((a,b) => b[0]-a[0] || (b[1] > a[1] ? 1 : -1));
  const c = {}; for (const [,code] of q.slice(0,n)) c[code] = (c[code]||0)+1;
  return c;
}
const EXTRA_D = highestQuotients(62), EXTRA_L = highestQuotients(29);
const DIST = {}, LIST = {};
for (const r of DATA.regions){
  DIST[r.code] = 1 + (r.code===GASPESIE?1:0) + (EXTRA_D[r.code]||0);
  LIST[r.code] = (r.code===NORD?0:1) + (EXTRA_L[r.code]||0);
}

function simulate(){
  const k = state.target.map((t,i) => t / BASE[i]);
  const zero = () => Object.fromEntries(P.map(p=>[p,0]));
  const votes = {}, fptpReg = {}, dReg = {}, fptp = zero();
  for (const r of DATA.regions){ votes[r.code] = [0,0,0,0,0]; fptpReg[r.code] = zero(); dReg[r.code] = zero(); }
  const nat = [0,0,0,0,0];
  // Les 127 circonscriptions actuelles (projection Qc125) : mode actuel et votes régionaux
  const ridings = DATA.ridings.map(rd => {
    const S = rd.s.reduce((a,b)=>a+b,0);
    const v = rd.s.map((x,i) => x/S*k[i]);
    v.forEach((x,i) => { votes[rd.r][i] += rd.e*x; nat[i] += rd.e*x; });
    let w = rd.o[0];                              // ordre d'origine qc125 pour départager
    for (const i of rd.o) if (v[i] > v[w]) w = i;
    fptp[P[w]]++; fptpReg[rd.r][P[w]]++;
    const t = v.reduce((a,b)=>a+b,0);
    return {...rd, v, sh: v.map(x=>100*x/t), w: P[w]};
  });
  // Les 80 circonscriptions hypothétiques : votes = somme des sections de vote qui les composent
  const districts = DATA.districts.map(di => {
    const v = [0,0,0,0,0];
    for (const [ri,e] of di.comp) ridings[ri].v.forEach((x,i) => { v[i] += e*x; });
    let w = 0; for (let i = 1; i < 5; i++) if (v[i] > v[w]) w = i;
    dReg[di.r][P[w]]++;
    const t = v.reduce((a,b)=>a+b,0);
    const sh = v.map(x=>100*x/t), sorted = sh.slice().sort((a,b)=>b-a);
    return {...di, sh, w: P[w], margin: sorted[0]-sorted[1]};
  });
  const NT = nat.reduce((a,b)=>a+b,0);
  const natShare = Object.fromEntries(P.map((p,i)=>[p,100*nat[i]/NT]));
  const eligible = P.filter(p => natShare[p] >= state.thr - 1e-9);

  const regions = {}, totD = zero(), totL = zero();
  for (const r of DATA.regions){
    const v = votes[r.code], vt = v.reduce((a,b)=>a+b,0);
    const share = Object.fromEntries(P.map((p,i)=>[p,100*v[i]/vt]));
    const d = dReg[r.code];
    const l = zero();
    const steps = [];
    for (let s = 0; s < LIST[r.code]; s++){
      let best = null, bq = -1, bdiv = 0;
      const cands = {};
      for (const p of eligible){
        const div = 1 + Math.ceil(d[p]/2) + l[p];
        const q = share[p]/div;
        cands[p] = {div, q};
        if (q > bq){ bq = q; best = p; bdiv = div; }
      }
      if (!best) break;
      l[best]++; steps.push({p:best, q:bq, div:bdiv, share:share[best], cands});
    }
    P.forEach(p => { totD[p]+=d[p]; totL[p]+=l[p]; });
    regions[r.code] = {share, d, l, steps, fptp: fptpReg[r.code],
                       ridings: ridings.filter(x=>x.r===r.code), districts: districts.filter(x=>x.r===r.code)};
  }
  const total = Object.fromEntries(P.map(p=>[p, totD[p]+totL[p]]));
  const byId = Object.fromEntries(districts.map(x => [x.id, x]));
  return {natShare, eligible, fptp, totD, totL, total, regions, byId, ridings};
}

/* --- Plan de l'Assemblée --- */
/* Plan de l'Assemblée nationale : banquettes face à face (gouvernement en bas, opposition en haut),
   présidence au bout gauche, banquettes perpendiculaires au bout droit pour le surplus.
   ringBy : sièges de région (loi 39), dessinés en contour. */
function chamber(svg, seatsBy, n, ringBy){
  const S = 10, G = 2.6, STEP = S + G, AISLE = 7, C = 15, ROWS = 3, MID = 24;   // taille, pas, allée, colonnes par côté
  // côté gouvernement : exactement la majorité (64 ou 63), présidence comprise ; côté opposition : le reste
  const maj = Math.floor(n/2) + 1, govCap = maj - 1, oppCap = n - maj, K = 4;
  const RH = Math.max(ROWS, Math.ceil((govCap - ROWS*C)/K), Math.ceil((oppCap - ROWS*C)/K));
  const x0 = 50, colX = j => x0 + j*STEP + Math.floor(j/3)*AISLE;
  const xR = colX(C-1) + S + 16, rightX = k => xR + k*STEP;
  const H = 2*(MID + RH*STEP) + 8, cy = H/2, W = rightX(K-1) + S + 8;
  const yTop = r => cy - MID - S - r*STEP, yBot = r => cy + MID + r*STEP;   // r = 0 : première rangée
  // plan pivoté de 90° (sens horaire) : présidence en haut, gouvernement à gauche, opposition à droite
  svg.setAttribute("viewBox", `0 0 ${H} ${W}`);
  const RX = (x, y) => H - y, RY = (x, y) => x;   // (x, y) du plan couché → position affichée

  // places : côté gouvernement (bancs puis bout droit bas), côté opposition (bancs puis bout droit haut)
  const bench = y => { const out = []; for (let j = 0; j < C; j++) for (let r = 0; r < ROWS; r++) out.push({x:colX(j), y:y(r), j, r}); return out; };
  // bout : rempli par colonnes, pour que chaque parti forme un bloc
  const end = y => { const out = []; for (let k = 0; k < K; k++) for (let r = 0; r < RH; r++) out.push({x:rightX(k), y:y(r), j:C+k, r}); return out; };
  const govSlots = [...bench(yBot), ...end(yBot)].slice(0, govCap), oppSlots = [...bench(yTop), ...end(yTop)].slice(0, oppCap);

  const order = P.filter(p => seatsBy[p] > 0).sort((a,b) => seatsBy[b]-seatsBy[a] || SEAT_ORDER.indexOf(a)-SEAT_ORDER.indexOf(b));
  const gov = order[0], opp = order.slice(1);
  const seatsOf = p => { const ring = ringBy ? ringBy[p] : 0; return d3.range(seatsBy[p]).map(i => ({p, ring: i >= seatsBy[p]-ring})); };
  const placed = [];
  // la présidence est un député du parti au pouvoir (siège de circonscription) : il quitte les bancs
  let gs = seatsOf(gov);
  const presIdx = gs.findIndex(x => !x.ring), pres = presIdx >= 0 ? gs.splice(presIdx, 1)[0] : null;
  // gouvernement : son côté ; s'il a plus que la majorité, son surplus passe au bout du côté opposé
  gs.slice(0, govSlots.length).forEach((s,i) => placed.push({...s, ...govSlots[i]}));
  const govExtra = gs.slice(govSlots.length);
  govExtra.forEach((s,i) => placed.push({...s, ...oppSlots[oppSlots.length-1-i]}));
  // opposition : l'opposition officielle d'abord, près de la présidence. Gouvernement minoritaire : les places
  // libres du côté gouvernement reçoivent le débordement (dernier parti d'opposition), à la suite du gouvernement
  const oppFree = oppSlots.slice(0, oppSlots.length - govExtra.length), spare = govSlots.slice(Math.min(gs.length, govSlots.length));
  let oi = 0, si = 0;
  for (const p of opp) for (const s of seatsOf(p)) { const slot = oi < oppFree.length ? oppFree[oi++] : spare[si++]; if (slot) placed.push({...s, ...slot}); }

  const g = d3.select(svg); g.selectAll("*").remove();
  // rectangle du plan couché → rectangle affiché (largeur et hauteur échangées)
  const rect = (x, y, w, h) => g.append("rect").attr("x", RX(x, y) - h).attr("y", RY(x, y)).attr("width", h).attr("height", w);
  const txt = (x, y, t, o = {}) => g.append("text").attr("x",x).attr("y",y).attr("text-anchor",o.anchor||"middle")
    .attr("transform", o.rot ? `rotate(-90 ${x} ${y})` : null).style("fill", o.fill||"var(--muted)")
    .style("font", `${o.w||600} ${o.size||7.5}px var(--sans)`).style("letter-spacing", o.ls||".04em").text(t);
  // allée centrale (verticale) et présidence (en haut)
  rect(x0-4, cy-MID+6, colX(C-1)+S-x0+8, 2*MID-12).attr("rx",4).style("fill","var(--soft)");
  const chair = rect(22, cy-9, 18, 18).attr("rx",3);
  if (pres) chair.style("fill", PV[pres.p]);
  else chair.style("fill","none").style("stroke","var(--muted)").attr("stroke-width",1.4);
  chair.append("title").text(pres ? `Présidence : député du ${pres.p}, compté dans ses ${seatsBy[pres.p]} sièges. Il ne vote qu'en cas d'égalité.` : "Présidence");
  txt(RX(0, cy), RY(22, cy) - 4, "Présidence", {size:6.5});
  txt(RX(0, cy + MID + ROWS*STEP/2), RY(x0, 0) - 6, "Gouvernement", {size:7});
  txt(RX(0, cy - MID - ROWS*STEP/2), RY(x0, 0) - 6, "Opposition", {size:7});
  txt(RX(0, cy) + 2.6, RY((x0 + colX(C-1)+S)/2, 0), `majorité : ${Math.floor(n/2)+1} sièges`, {size:7.5, rot:true});
  // sièges
  for (const s of placed){
    const r = s.ring ? rect(s.x+1, s.y+1, S-2, S-2) : rect(s.x, s.y, S, S);
    r.attr("rx", 2.2);
    if (s.ring) r.style("fill","var(--surface)").style("stroke", PV[s.p]).attr("stroke-width", 1.8);
    else r.style("fill", PV[s.p]);
    r.append("title").text(`${s.p}${s.ring ? " · siège de région" : ""}`);
  }
  // premier ministre et chef de l'opposition : première rangée, au milieu des bancs
  const front = (p, side) => placed.filter(s => s.p === p && s.r === 0 && s.j < C && (side === "gov" ? s.y > cy : s.y < cy))
    .sort((a,b) => Math.abs(a.j-7) - Math.abs(b.j-7))[0];
  const mark = (s, t) => { if (s) txt(RX(s.x, s.y + S/2), RY(s.x + S/2, 0) + 2.6, t, {size: t.length > 1 ? 5.2 : 6.5, w:800, fill:"var(--surface)", ls:"0"}); };
  mark(front(gov, "gov"), "PM");
  if (opp[0]) mark(front(opp[0], "opp"), "C");
}

/* --- Carte --- */
const RGEO = DATA.districtGeo, GGEO = DATA.regionGeo;   // 80 circonscriptions hypothétiques et 17 régions
// d3 attend des anneaux extérieurs en sens horaire ; on corrige au besoin
for (const g of [RGEO, GGEO]) for (const f of g.features){
  if (d3.geoArea(f) > 2*Math.PI){
    const rev = poly => poly.map(r => r.slice().reverse());
    f.geometry.coordinates = f.geometry.type==="Polygon" ? rev(f.geometry.coordinates) : f.geometry.coordinates.map(rev);
  }
}
const MW = 600, MH = 704;   // bande du bas réservée aux étiquettes du sud
const projection = d3.geoConicConformal().rotate([71.6,0]).parallels([46,60]).fitExtent([[12,12],[MW-12,648]], GGEO);
const path = d3.geoPath(projection);
const REGFEAT = Object.fromEntries(GGEO.features.map(f => [f.properties.REG, f]));
const RIDFEAT = Object.fromEntries(RGEO.features.map(f => [f.properties.DID, f]));
// carte actuelle : 127 circonscriptions réelles (RID = rang dans DATA.ridings)
const CGEO = DATA.ridingGeo;
for (const f of CGEO.features){
  if (d3.geoArea(f) > 2*Math.PI){
    const rev = poly => poly.map(r => r.slice().reverse());
    f.geometry.coordinates = f.geometry.type==="Polygon" ? rev(f.geometry.coordinates) : f.geometry.coordinates.map(rev);
  }
}
const CURFEAT = Object.fromEntries(CGEO.features.map(f => [f.properties.RID, f]));
const featOf = sel => sel.type==="reg" ? REGFEAT[sel.code] : sel.type==="circ" ? RIDFEAT[sel.id] : sel.type==="cur" ? CURFEAT[sel.idx] : null;
const padOf = sel => sel.type==="reg" ? 0.85 : 0.5;
const DNAME = Object.fromEntries(DATA.districts.map(d => [d.id, d.name]));
const box = (a,b) => ({type:"Feature",geometry:{type:"MultiPoint",coordinates:[a,b]}});
const PRESETS = {
  mtl: box([-74.05,45.36],[-73.35,45.78]),
  qc:  box([-71.55,46.68],[-71.0,46.98]),
  sud: box([-75.6,45.0],[-70.0,47.3]),
};
// Position des étiquettes (coordonnées de la carte), à l'intérieur de la région. Les autres régions
// utilisent le centre de leur plus grand morceau. Une étiquette n'est affichée que si sa région est assez
// grande à l'écran pour la contenir : Montréal, Laval, etc. apparaissent en zoomant.
// Une étiquette est au « pôle d'inaccessibilité » de la région (point le plus loin des bords, algorithme polylabel)
// et n'est affichée que si le cercle libre autour de ce point est assez grand à l'écran : LBL_MIN px de rayon pour
// le nombre, LBL_NAME px pour ajouter le nom (seulement quand on est vraiment zoomé).
const LBL_MIN = 19, LBL_NAME = 70, NAME_ZOOM = 5;   // noms à partir d'un zoom × 5

const mapSvg = d3.select("#l39-map");
const gZoom = mapSvg.append("g");
const gCur = gZoom.append("g"), gRid = gZoom.append("g"), gRegFill = gZoom.append("g"), gReg = gZoom.append("g"), gSel = gZoom.append("g"), gLbl = gZoom.append("g");
let curK = 1, curT = d3.zoomIdentity;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const zoom = d3.zoom().scaleExtent([1, 60]).translateExtent([[-40,-40],[MW+40,MH+40]])
  .on("zoom", e => {
    gZoom.attr("transform", e.transform); curK = e.transform.k; curT = e.transform;
    placeLabels();
  });

function zoomToFeature(f, pad = 0.85){
  const [[x0,y0],[x1,y1]] = path.bounds(f);
  const k = Math.min(60, pad / Math.max((x1-x0)/MW, (y1-y0)/MH));
  const t = d3.zoomIdentity.translate(MW/2, MH/2).scale(k).translate(-(x0+x1)/2, -(y0+y1)/2);
  mapSvg.transition().duration(reduceMotion ? 0 : 700).call(zoom.transform, t);
}

function drawBase(){
  mapSvg.call(zoom).on("dblclick.zoom", null);
  // un clic sur l'eau / hors du territoire revient à tout le Québec
  mapSvg.on("click", e => { if (e.target === mapSvg.node()) select({type:"all"}); });
  gCur.selectAll("path").data(CGEO.features).join("path")
    .attr("class","rid").attr("d",path).attr("tabindex",0).attr("role","button")
    .attr("aria-label", f => DATA.ridings[f.properties.RID].n)
    .on("click", (e,f) => pick(f))
    .on("keydown", (e,f) => { if (e.key==="Enter"||e.key===" "){ e.preventDefault(); pick(f); } })
    .on("mousemove", (e,f) => showTip(e,f))
    .on("mouseleave", () => { tip.hidden = true; });
  gRid.selectAll("path").data(RGEO.features).join("path")
    .attr("class","rid").attr("d",path).attr("tabindex",0).attr("role","button")
    .attr("aria-label", f => DNAME[f.properties.DID])
    .on("click", (e,f) => pick(f))
    .on("keydown", (e,f) => { if (e.key==="Enter"||e.key===" "){ e.preventDefault(); pick(f); } })
    .on("mousemove", (e,f) => showTip(e,f))
    .on("mouseleave", () => { tip.hidden = true; });
  // Vue par région : on dessine les 17 régions pleines, sans les circonscriptions actuelles
  gRegFill.selectAll("path").data(GGEO.features).join("path")
    .attr("class","regfill").attr("d",path).attr("tabindex",0).attr("role","button")
    .attr("aria-label", f => REG[f.properties.REG].name)
    .on("click", (e,f) => select({type:"reg", code:f.properties.REG}))
    .on("keydown", (e,f) => { if (e.key==="Enter"||e.key===" "){ e.preventDefault(); select({type:"reg", code:f.properties.REG}); } })
    .on("mousemove", (e,f) => showTip(e,f))
    .on("mouseleave", () => { tip.hidden = true; });
  gReg.selectAll("path").data(GGEO.features).join("path").attr("class","regline").attr("d",path);

  ROOT.querySelector(".zoombar").addEventListener("click", e => {
    const z = e.target.closest("button[data-z]")?.dataset.z; if (!z) return;
    if (z==="fs") toggleFullscreen();
    else if (z==="panel") showFloat("show-panel", !mapGrid.classList.contains("show-panel"));
    else if (z==="scen") showFloat("show-scen", !mapGrid.classList.contains("show-scen"));
    else if (z==="all") selectAll();
    else if (z==="in") mapSvg.transition().duration(reduceMotion?0:250).call(zoom.scaleBy, 1.8);
    else if (z==="out") mapSvg.transition().duration(reduceMotion?0:250).call(zoom.scaleBy, 1/1.8);
    else zoomToFeature(PRESETS[z], 0.95);
  });
}
const mapGrid = ROOT.querySelector(".mapgrid"), fsBtn = document.getElementById("l39-fsBtn");
const isFs = () => document.fullscreenElement === mapGrid || mapGrid.classList.contains("fs");
const panelBtn = document.getElementById("l39-panelBtn"), scenBtn = document.getElementById("l39-scenBtn");
// En plein écran, le détail et le scénario flottent sur la carte ; on les affiche ou les masque
// hauteurs réelles des barres du haut, pour empiler les éléments flottants sans chevauchement
function placeFloats(){
  if (!isFs()) return;
  const zb = mapGrid.querySelector(".zoombar"), tb = mapGrid.querySelector(".toolbar");
  mapGrid.style.setProperty("--zbh", zb.offsetHeight + "px");
  mapGrid.style.setProperty("--tbh", tb.offsetHeight + "px");
  const sc = mapGrid.querySelector(".scale");
  mapGrid.style.setProperty("--sch", (sc.offsetHeight || 0) + "px");
}
window.addEventListener("resize", placeFloats);
function showFloat(cls, on){
  mapGrid.classList.toggle(cls, on);
  requestAnimationFrame(placeFloats);
  if (cls === "show-panel") panelBtn.setAttribute("aria-pressed", on);
  if (cls === "show-scen") scenBtn.setAttribute("aria-pressed", on);
  // sur téléphone, un seul élément flottant à la fois
  if (on && window.innerWidth <= 700) showFloat(cls === "show-panel" ? "show-scen" : "show-panel", false);
}
let wasFs = false;
const scenEl = document.getElementById("l39-scen"), scenHome = scenEl.parentNode, scenNext = scenEl.nextSibling;
function syncFsButton(){
  const on = isFs();
  if (on && scenEl.parentNode !== mapGrid) mapGrid.appendChild(scenEl);
  if (!on && scenEl.parentNode === mapGrid) scenHome.insertBefore(scenEl, scenNext);
  if (on && !wasFs) { showFloat("show-panel", window.innerWidth > 900); showFloat("show-scen", false); }
  wasFs = on;
  requestAnimationFrame(placeFloats);
  fsBtn.setAttribute("aria-pressed", on);
  fsBtn.textContent = on ? "✕ Quitter le plein écran" : "⛶ Plein écran";
  document.body.style.overflow = mapGrid.classList.contains("fs") ? "hidden" : "";
}
async function toggleFullscreen(){
  if (document.fullscreenElement === mapGrid){ await document.exitFullscreen().catch(()=>{}); return; }
  if (mapGrid.classList.contains("fs")){ mapGrid.classList.remove("fs"); syncFsButton(); return; }
  try { await mapGrid.requestFullscreen(); }
  catch { mapGrid.classList.add("fs"); syncFsButton(); }   // repli : superposition fixe
}
document.addEventListener("fullscreenchange", syncFsButton);
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && mapGrid.classList.contains("fs")){ mapGrid.classList.remove("fs"); syncFsButton(); }
});

function pick(f){
  if (state.view==="cur") select({type:"cur", idx:f.properties.RID});
  else if (state.view==="reg") select({type:"reg", code:f.properties.REG});
  else select({type:"circ", id:f.properties.DID});
}

const tip = document.getElementById("l39-tip"), stage = document.getElementById("l39-stage");
function showTip(e, f){
  if (state.view==="cur"){
    const x = RES.ridings[f.properties.RID];
    const top = P.map((p,i)=>[p,x.sh[i]]).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([p,v])=>`${p} ${fmt(v,0)} %`).join(" · ");
    tip.innerHTML = `<b>${esc(x.n)}</b>${esc(REG[x.r].name)} · ${x.e.toLocaleString("fr-CA")} électeurs<br>${top}`;
  } else if (state.view==="reg"){
    const code = f.properties.REG, R = RES.regions[code];
    const parts = P.filter(p => R.d[p]+R.l[p] > 0).sort((a,b)=>(R.d[b]+R.l[b])-(R.d[a]+R.l[a]))
      .map(p => `${p} ${R.d[p]+R.l[p]}`).join(" · ");
    tip.innerHTML = `<b>${esc(REG[code].name)}</b>${DIST[code]} circ. + ${LIST[code]} rég.<br>${parts}`;
  } else {
    const x = RES.byId[f.properties.DID];
    const top = P.map((p,i)=>[p,x.sh[i]]).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([p,v])=>`${p} ${fmt(v,0)} %`).join(" · ");
    tip.innerHTML = `<b>${esc(x.name)}</b>${esc(REG[x.r].name)} · ${x.e.toLocaleString("fr-CA")} électeurs<br>${top}`;
  }
  tip.hidden = false;
  const b = stage.getBoundingClientRect();
  let px = e.clientX - b.left + 14, py = e.clientY - b.top + 14;
  if (px > b.width - 220) px -= 240;
  tip.style.left = px+"px"; tip.style.top = py+"px";
}

function regionLead(R){
  let best = null;
  for (const p of P){
    if (!best) { best = p; continue; }
    const a = R.d[p]+R.l[p], b = R.d[best]+R.l[best];
    if (a > b || (a===b && R.share[p] > R.share[best])) best = p;
  }
  return best;
}
const ALLC = "var(--ink)";
const MAXSEATS = () => Math.max(...Object.keys(RES.regions).map(c => DIST[c]+LIST[c]));
const MAXLIST = () => Math.max(...Object.keys(RES.regions).map(c => LIST[c]));
function fillRegion(code){
  const R = RES.regions[code], seats = DIST[code]+LIST[code];
  if (state.mode==="lead"){ const p = regionLead(R); return [PV[p], 0.35 + 0.65*(R.d[p]+R.l[p])/seats]; }
  const p = state.party;
  if (p==="ALL"){   // tous les partis : le nombre de sièges de la région, en teinte neutre
    if (state.mode==="seat") return [ALLC, 0.1 + 0.5*seats/MAXSEATS()];
    return [ALLC, 0.1 + 0.5*LIST[code]/MAXLIST()];
  }
  if (state.mode==="vote") return [PV[p], Math.max(0.06, Math.min(1, R.share[p]/50))];
  if (state.mode==="seat") return [PV[p], Math.max(0.06, (R.d[p]+R.l[p])/seats)];
  return [PV[p], R.l[p] ? Math.min(1, 0.25 + 0.25*R.l[p]) : 0.06];
}
function fillCur(idx){
  const x = RES.ridings[idx];
  if (state.mode==="vote"){ const i = P.indexOf(state.party); return [PV[state.party], Math.max(0.06, Math.min(1, x.sh[i]/50))]; }
  const i = P.indexOf(x.w);
  return [PV[x.w], Math.max(0.3, Math.min(1, (x.sh[i]-15)/35))];
}
function fillRiding(id){
  const x = RES.byId[id];
  if (state.mode==="vote"){ const i = P.indexOf(state.party); return [PV[state.party], Math.max(0.06, Math.min(1, x.sh[i]/50))]; }
  const i = P.indexOf(x.w);
  return [PV[x.w], Math.max(0.3, Math.min(1, (x.sh[i]-15)/35))];
}
function labelLines(code){
  if (state.mode==="lead") return [`${LIST[code]} rég.`, `(${DIST[code]} circ.)`];
  return [labelFor(code)];
}
// Pôle d'inaccessibilité (d'après polylabel, Mapbox) d'un polygone en coordonnées de la carte : [x, y, rayon]
function polylabel(rings, precision = 0.5){
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of rings[0]){ minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const segDist2 = (px, py, a, b) => { let x = a[0], y = a[1], dx = b[0]-x, dy = b[1]-y;
    if (dx || dy){ const t = ((px-x)*dx + (py-y)*dy) / (dx*dx + dy*dy); if (t > 1){ x = b[0]; y = b[1]; } else if (t > 0){ x += dx*t; y += dy*t; } }
    dx = px-x; dy = py-y; return dx*dx + dy*dy; };
  const dist = (x, y) => { let inside = false, m = Infinity;       // distance signée au contour (positive dedans)
    for (const ring of rings) for (let i = 0, j = ring.length-1; i < ring.length; j = i++){
      const a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1]) + a[0]) inside = !inside;
      m = Math.min(m, segDist2(x, y, a, b)); }
    return (inside ? 1 : -1) * Math.sqrt(m); };
  const cell = (x, y, h) => { const d = dist(x, y); return {x, y, h, d, max: d + h*Math.SQRT2}; };
  const size = Math.min(maxX-minX, maxY-minY); if (!size) return [minX, minY, 0];
  let h = size/2, q = [];
  for (let x = minX; x < maxX; x += size) for (let y = minY; y < maxY; y += size) q.push(cell(x+h, y+h, h));
  let best = cell((minX+maxX)/2, (minY+maxY)/2, 0);
  while (q.length){
    q.sort((a, b) => b.max - a.max); const c = q.shift();
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    h = c.h/2; q.push(cell(c.x-h, c.y-h, h), cell(c.x+h, c.y-h, h), cell(c.x-h, c.y+h, h), cell(c.x+h, c.y+h, h));
  }
  return [best.x, best.y, best.d];
}
// point d'ancrage de chaque région : pôle de son plus grand morceau (calculé une fois, en coordonnées de la carte)
const ANCHOR = {};
function anchorOf(f){
  const code = f.properties.REG;
  if (ANCHOR[code]) return ANCHOR[code];
  const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
  let best = [0, 0, -1];
  for (const poly of polys){
    const rings = poly.map(r => r.map(c => projection(c)));
    const cand = polylabel(rings);
    if (cand[2] > best[2]) best = cand;
  }
  return ANCHOR[code] = best;
}
function placeLabels(){
  const k = curK, t = curT, svgEl = mapSvg.node();
  // pixels écran par unité de carte (viewBox 600 × 704, conservé)
  const px = Math.min(svgEl.clientWidth / MW, svgEl.clientHeight / MH) * k;
  // demi-largeur et demi-hauteur de la fenêtre en unités de viewBox (centrée, « meet » : peut dépasser 600 × 704)
  const hx = svgEl.clientWidth / 2 / (px / k), hy = svgEl.clientHeight / 2 / (px / k);
  gLbl.selectAll("g.lab").each(function(f){
    // le chiffre reste au milieu de la région ; il disparaît simplement quand ce milieu sort de la fenêtre
    const [x, y, rad] = anchorOf(f), room = rad * px;   // rayon libre autour de l'étiquette, en px écran
    const sx = t.applyX(x), sy = t.applyY(y);           // position dans la vue (unités de viewBox)
    const show = Math.abs(sx - MW/2) <= hx && Math.abs(sy - MH/2) <= hy && room >= LBL_MIN;
    const g = d3.select(this).style("display", show ? null : "none");
    if (!show) return;
    g.select("text.nmtxt").style("display", k >= NAME_ZOOM && room >= LBL_NAME ? null : "none");   // noms : seulement très zoomé
    g.selectAll("text").attr("transform", `translate(${x},${y})`)
      .style("font-size", (10.5/k)+"px").style("stroke-width", (3/k)+"px");
  });
}
new ResizeObserver(() => placeLabels()).observe(document.getElementById("l39-map"));
function labelFor(code){
  const R = RES.regions[code];
  if (state.mode==="lead") return String(DIST[code]+LIST[code]);
  const p = state.party;
  if (p==="ALL") return String(state.mode==="seat" ? DIST[code]+LIST[code] : LIST[code]);
  if (state.mode==="vote") return fmt(R.share[p],0)+" %";
  if (state.mode==="seat") return String(R.d[p]+R.l[p]);
  return String(R.l[p]);
}
function paintMap(){
  const byReg = state.view==="reg", isCur = state.view==="cur";
  mapSvg.attr("class", byReg ? "v-reg" : "v-circ");
  gCur.style("display", isCur ? null : "none");
  document.getElementById("l39-mapBadge").hidden = isCur;
  gRid.style("display", state.view==="circ" ? null : "none");
  gRegFill.style("display", byReg ? null : "none");
  if (isCur) gCur.selectAll("path").each(function(f){
    const [c,o] = fillCur(f.properties.RID); this.style.fill = c; this.style.fillOpacity = o;
  });
  if (byReg) gRegFill.selectAll("path").each(function(f){
    const [c,o] = fillRegion(f.properties.REG); this.style.fill = c; this.style.fillOpacity = o;
  });
  else if (!isCur) gRid.selectAll("path").each(function(f){
    const [c,o] = fillRiding(f.properties.DID); this.style.fill = c; this.style.fillOpacity = o;
  });
  const sf = featOf(state.sel);
  document.getElementById("l39-selAll").setAttribute("aria-pressed", state.sel.type==="all");
  gSel.selectAll("path").data(sf ? [sf] : []).join("path").attr("class","selline").attr("d",path);

  const labs = gLbl.selectAll("g.lab").data(byReg ? GGEO.features : [], f=>f.properties.REG)
    .join(enter => { const g = enter.append("g").attr("class","lab");
      g.append("text").attr("class","lbl nmtxt").attr("text-anchor","middle");
      g.append("text").attr("class","lbl valtxt").attr("text-anchor","middle"); return g; });
  labs.each(function(f){
    const code = f.properties.REG, vals = labelLines(code), top = 0.35 - (vals.length-1)*0.575;
    // valeurs centrées sur le point d'ancrage ; le nom, une ligne au-dessus (affiché si la région est assez grande)
    const t = d3.select(this).select("text.valtxt"); t.selectAll("tspan").remove();
    vals.forEach((ln,i) => t.append("tspan").attr("x",0).attr("dy", i===0 ? `${top}em` : "1.15em").attr("class", i ? "sub" : null).text(ln));
    d3.select(this).select("text.nmtxt").attr("dy", `${top - 1.2}em`).text(REG[code].name);
  });
  placeLabels();

  const sc = document.getElementById("l39-scale");
  const p = state.party, col = p==="ALL" ? ALLC : PV[p];
  const ramp = `<span class="ramp" style="background:linear-gradient(90deg, color-mix(in srgb, ${col} 6%, var(--surface)), ${col})"></span>`;
  document.getElementById("l39-hint").textContent = isCur
    ? "Carte actuelle : les 127 circonscriptions de la carte électorale 2026 (Élections Québec), avec la projection Qc125 de chacune. C'est le mode de scrutin en vigueur, sans simulation."
    : "Loi 39 : découpage hypothétique à 80 circonscriptions construit pour cette simulation à partir des 16 951 sections de vote 2026 d'Élections Québec (voir « Méthode »). Ce n'est pas une carte officielle : la Commission de la représentation électorale n'en a jamais tracé.";
  sc.innerHTML = !byReg
    ? (state.mode==="vote" ? `<span>0 %</span>${ramp}<span>50 % et +</span><span>· vote ${p} dans chaque circonscription</span>`
       : isCur ? `Couleur : parti en tête dans chaque circonscription actuelle (projection Qc125). Plus la couleur est foncée, plus son score est élevé.`
       : `Couleur : gagnant projeté de chaque circonscription. Plus la couleur est foncée, plus son score est élevé.`)
    : state.mode==="lead" ? `Couleur : parti avec le plus de sièges dans la région. Plus la couleur est foncée, plus sa part des sièges est grande. Étiquettes : sièges de région de chaque région, et entre parenthèses ses sièges de circonscription.`
    : state.mode==="vote" ? `<span>0 %</span>${ramp}<span>50 % et +</span><span>· vote ${p} dans la région</span>`
    : p==="ALL" ? (state.mode==="seat"
        ? `Tous les partis · chiffre = nombre total de sièges de la région (circonscriptions + région). Plus la région ressort, plus elle a de sièges.`
        : `Tous les partis · chiffre = nombre de sièges compensatoires (sièges de région) de la région.`)
    : state.mode==="seat" ? `<span>0</span>${ramp}<span>tous les sièges</span><span>· chiffre = sièges totaux ${p} (circ. + rég.)</span>`
    : `Chiffre : sièges compensatoires seulement (sièges de région) obtenus par le ${p}, sans ses circonscriptions.`;
}

/* --- Panneau --- */
function select(sel, {zoomTo = false} = {}){
  state.sel = sel;
  if (sel.type !== "all" && sel.type !== state.view) setView(sel.type, {silent:true});
  paintMap(); renderPanel();
  if (isFs() && sel.type !== "all") showFloat("show-panel", true);   // en plein écran, le détail s'ouvre sur la sélection
  if (zoomTo && sel.type !== "all") zoomToFeature(featOf(sel), padOf(sel));
}
function renderPanel(){
  const t = state.sel.type;
  if (state.view==="cur") return t==="cur" ? renderCurPanel() : renderAllCurPanel();
  t==="all" ? renderAllPanel() : t==="reg" ? renderRegionPanel() : renderRidingPanel();
}
function selectAll(){
  select({type:"all"});
  mapSvg.transition().duration(reduceMotion?0:700).call(zoom.transform, d3.zoomIdentity);
}
const backLink = `<div><button type="button" class="linkbtn" data-all>← Tout le Québec</button></div>`;

function renderAllPanel(){
  const tot = RES.total, maj = 63;
  const order = P.slice().sort((a,b) => tot[b]-tot[a] || RES.natShare[b]-RES.natShare[a]);
  const lead = order[0];
  const rows = order.map(p => {
    const out = !RES.eligible.includes(p);
    return `<div class="vrow wide${out?" out":""}" title="${out?"Sous le seuil national : exclu de la compensation":""}">
      <b style="color:${PV[p]}">${p}</b>
      <div class="track"><i style="width:${Math.min(100,RES.natShare[p]*2)}%;background:${PV[p]}"></i></div>
      <span class="num">${fmt(RES.natShare[p])} %</span>
      <span class="num sx"><b>${tot[p]}</b> <small>${RES.totD[p]} + ${RES.totL[p]}</small></span></div>`;
  }).join("");
  const el = RES.eligible.slice().sort((a,b) => tot[b]-tot[a]);
  const regRows = DATA.regions.map(r => {
    const R = RES.regions[r.code];
    return `<tr><td><button type="button" class="linkbtn" data-goreg="${r.code}">${esc(r.name)}</button></td>
      ${el.map(p => `<td style="--c:${PV[p]}" class="${R.l[p]?"has":""}">${R.l[p] || '<span class="muted">·</span>'}</td>`).join("")}
      <td><b>${LIST[r.code]}</b></td></tr>`;
  }).join("");
  const sumRow = `<tr class="sum"><td>Total</td>${el.map(p=>`<td style="color:${PV[p]}"><b>${RES.totL[p]}</b></td>`).join("")}<td><b>45</b></td></tr>`;
  const pairs = [];
  for (let i=0;i<P.length;i++) for (let j=i+1;j<P.length;j++){ const n = tot[P[i]]+tot[P[j]]; if (n>=maj) pairs.push(`${P[i]} + ${P[j]} (${n})`); }
  document.getElementById("l39-panel").innerHTML = `
    <div style="display:grid;gap:6px">
      <span class="eyebrow">Ensemble du Québec · 17 régions</span>
      <h3 style="font-size:1.5rem">Tout le Québec</h3>
      <div class="meta">
        <span class="pill"><i class="dot" style="background:${PV[lead]}"></i>${lead} ${tot[lead] >= maj ? "majoritaire" : "minoritaire"} : ${tot[lead]} / 125</span>
        <span class="pill num">Majorité : ${maj}</span>
      </div>
      <p class="muted" style="font-size:.84rem">Cliquez sur une région ou une circonscription de la carte pour voir son détail. Cliquez sur l'eau ou sur « Tout le Québec » pour revenir ici.</p>
    </div>
    <div class="kv num"><div><b>80</b><span>Circ.</span></div><div><b>45</b><span>Région</span></div><div><b>125</b><span>Total</span></div></div>
    <div style="display:grid;gap:8px"><span class="eyebrow">Vote et sièges · total (circ. + rég.)</span>${rows}</div>
    ${tot[lead] < maj && pairs.length ? `<div class="note"><span class="eyebrow">Majorités possibles à deux partis</span><p>${pairs.join(" · ")}</p></div>` : ""}
    <div class="explain">
      <span class="eyebrow">D'où viennent les 45 sièges de région</span>
      <p>Chaque région fait sa propre compensation, avec ses propres votes. Le tableau montre combien de sièges de région chaque parti obtient dans chaque région. Cliquez sur une région pour voir le calcul tour par tour.</p>
      <div class="tablebox"><table class="ctable regsum"><thead><tr><th>Région</th>${el.map(p=>`<th style="color:${PV[p]}">${p}</th>`).join("")}<th>Sièges</th></tr></thead>
        <tbody>${regRows}${sumRow}</tbody></table></div>
    </div>`;
}

function compBlock(code, R){
  if (!LIST[code]) return `<div class="note"><span class="eyebrow">Sièges de région</span>
    <p>Le Nord-du-Québec n'a aucun siège de région : son seul député est celui de sa circonscription (art. 14.3).</p></div>`;
  const el = RES.eligible.slice().sort((a,b) => R.share[b]-R.share[a]);
  const out = P.filter(p => !RES.eligible.includes(p));
  const seats = DIST[code]+LIST[code];
  const start = el.map(p => {
    const n = R.d[p], half = Math.ceil(n/2), div = 1+half;
    return `<tr><td><b style="color:${PV[p]}">${p}</b></td><td>${fmt(R.share[p])} %</td><td>${n}</td>
      <td>1 + ${half} = <b>${div}</b></td><td>${fmt(R.share[p]/div,2)}</td></tr>`;
  }).join("");
  const rounds = R.steps.map((s,i) => `<tr><td class="n">${i+1}</td>${el.map(p => {
      const c = s.cands[p];
      return `<td class="${p===s.p?"win":""}" style="--c:${PV[p]}">${fmt(c.q,2)}<small>÷ ${c.div}</small></td>`;
    }).join("")}<td><b style="color:${PV[s.p]}">${s.p}</b></td></tr>`).join("");
  const bilan = el.map(p => {
    const t = R.d[p]+R.l[p];
    return `<tr><td><b style="color:${PV[p]}">${p}</b></td><td>${R.d[p]}</td><td>+ ${R.l[p]}</td><td><b>${t}</b></td>
      <td>${fmt(100*t/seats,0)} %</td><td>${fmt(R.share[p],0)} %</td></tr>`;
  }).join("");

  // Phrase d'exemple tirée du premier tour
  const s0 = R.steps[0], top = el[0];
  let ex = `Au 1<sup>er</sup> tour, le ${s0.p} l'emporte : ${fmt(s0.share)} % ÷ ${s0.div} = <b>${fmt(s0.q,2)}</b>.`;
  if (top !== s0.p){
    const c = s0.cands[top];
    ex += ` Le ${top} a pourtant plus de votes (${fmt(R.share[top])} %), mais ses ${R.d[top]} député${R.d[top]>1?"s":""} de circonscription `+
          `font monter son diviseur à ${c.div} : il n'obtient que ${fmt(c.q,2)}.`;
  }
  return `
    <div class="explain">
      <span class="eyebrow">Comment sont attribués les ${LIST[code]} sièges de région</span>
      <h4>1. Le principe</h4>
      <p>Les sièges de région servent à rapprocher le résultat du vote. Un parti qui a déjà gagné des circonscriptions dans la région
        part avec un <b>diviseur</b> plus grand, donc un score plus petit. Seule <b>la moitié</b> de ses députés de circonscription compte :
        la correction est volontairement partielle (art. 379.1).</p>

      <h4>2. Le point de départ</h4>
      <p class="muted">Diviseur = 1 + la moitié des députés de circonscription du parti, arrondie vers le haut. Score (quotient) = vote ÷ diviseur.</p>
      <div class="tablebox"><table class="ctable"><thead><tr><th>Parti</th><th>Vote</th><th>Élus circ.</th><th>Diviseur</th><th>Quotient</th></tr></thead>
        <tbody>${start}</tbody></table></div>
      ${out.length ? `<p class="muted">Exclu${out.length>1?"s":""} de la compensation : ${out.join(", ")} (moins de ${fmt(state.thr, state.thr%1?1:0)} % des votes à l'échelle du Québec, art. 379.2).</p>` : ""}

      <h4>3. Tour par tour</h4>
      <p class="muted">À chaque tour, le quotient le plus élevé remporte un siège (case colorée). Le diviseur de ce parti augmente alors de 1 : son score baisse pour le tour suivant, ce qui laisse une chance aux autres.</p>
      <div class="tablebox"><table class="ctable rounds"><thead><tr><th>Siège</th>${el.map(p=>`<th style="color:${PV[p]}">${p}</th>`).join("")}<th>Gagnant</th></tr></thead>
        <tbody>${rounds}</tbody></table></div>
      <p>${ex}</p>

      <h4>4. Le résultat</h4>
      <div class="tablebox"><table class="ctable"><thead><tr><th>Parti</th><th>Circ.</th><th>Région</th><th>Total</th><th>% sièges</th><th>% vote</th></tr></thead>
        <tbody>${bilan}</tbody></table></div>
    </div>`;
}

function renderRegionPanel(){
  const code = state.sel.code, r = REG[code], R = RES.regions[code];
  const seats = DIST[code]+LIST[code];
  const order = P.slice().sort((a,b) => R.share[b]-R.share[a]);
  const dots = p => Array.from({length:R.d[p]},()=>`<i class="dot" style="background:${PV[p]}"></i>`).join("")
                  + Array.from({length:R.l[p]},()=>`<i class="dot ring" style="color:${PV[p]}"></i>`).join("");
  const rows = order.map(p => {
    const out = !RES.eligible.includes(p);
    return `<div class="vrow${out?" out":""}" title="${out?"Sous le seuil national : exclu de la compensation":""}">
      <b style="color:${PV[p]}">${p}</b>
      <div class="track"><i style="width:${Math.min(100,R.share[p]*2)}%;background:${PV[p]}"></i></div>
      <span class="num">${fmt(R.share[p])} %</span>
      <span class="seats">${dots(p) || '<span class="muted">—</span>'}</span></div>`;
  }).join("");
  const rides = R.districts.map(x =>
    `<button type="button" data-rid="${x.id}"><i class="dot" style="background:${PV[x.w]}"></i><span>${esc(x.name)}</span></button>`).join("");
  const fp = P.filter(p=>R.fptp[p]).map(p=>`${p} ${R.fptp[p]}`).join(" · ");
  document.getElementById("l39-panel").innerHTML = `
    <div style="display:grid;gap:6px">
      <span class="eyebrow">Région ${code}</span>
      <h3 style="font-size:1.5rem">${esc(r.name)}</h3>
      <div class="meta"><span class="pill num">${r.electors.toLocaleString("fr-CA")} électeurs</span><span class="pill num">${R.ridings.length} circ. actuelles : ${fp}</span></div>
      <div style="display:flex;gap:14px;flex-wrap:wrap"><button type="button" class="linkbtn" data-all>← Tout le Québec</button><button type="button" class="linkbtn" data-zoomsel>Zoomer sur la région</button></div>
    </div>
    <div class="kv num"><div><b>${DIST[code]}</b><span>Circ.</span></div><div><b>${LIST[code]}</b><span>Région</span></div><div><b>${seats}</b><span>Total</span></div></div>
    <div style="display:grid;gap:8px"><span class="eyebrow">Vote et sièges obtenus</span>${rows}
      <div class="legend"><span><i class="dot" style="background:var(--muted)"></i>circonscription</span><span style="color:var(--muted)"><i class="dot ring"></i>région</span></div></div>
    ${compBlock(code, R)}
    <details open><summary>Les ${R.districts.length} circonscriptions de la région (carte hypothétique) et gagnant projeté</summary><div class="rides">${rides}</div></details>`;
}

function renderRidingPanel(){
  const x = RES.byId[state.sel.id], code = x.r, r = REG[code], R = RES.regions[code];
  const order = P.map((p,i)=>[p,x.sh[i]]).sort((a,b)=>b[1]-a[1]);
  const rows = order.map(([p,v]) => `<div class="vrow${p===x.w?" win":""}">
      <b style="color:${PV[p]}">${p}</b>
      <div class="track"><i style="width:${Math.min(100,v*2)}%;background:${PV[p]}"></i></div>
      <span class="num">${fmt(v)} %</span><span></span></div>`).join("");
  const parts = x.comp.map(([ri,e]) => {
    const rd = RES.ridings[ri], pct = 100*e/x.e;
    return `<tr><td><a href="https://qc125.com/${rd.id}f.htm" target="_blank" rel="noopener">${esc(rd.n)}</a></td>
      <td>${pct < 1 ? "< 1" : fmt(pct,0)} %</td><td><b style="color:${PV[rd.w]}">${rd.w}</b></td></tr>`;
  }).join("");
  const wd = R.d[x.w], wl = R.l[x.w];
  document.getElementById("l39-panel").innerHTML = `
    <div style="display:grid;gap:6px">
      <span class="eyebrow">Circonscription hypothétique · ${esc(r.name)}</span>
      <h3 style="font-size:1.4rem">${esc(x.name)}</h3>
      <div class="meta">
        <span class="pill"><i class="dot" style="background:${PV[x.w]}"></i>Gagnant projeté : ${x.w}</span>
        <span class="pill num">Avance : ${fmt(x.margin)} pts</span>
        <span class="pill num">${x.e.toLocaleString("fr-CA")} électeurs</span>
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        <button type="button" class="linkbtn" data-all>← Tout le Québec</button>
        <button type="button" class="linkbtn" data-zoomsel>Zoomer ici</button>
      </div>
    </div>
    <div style="display:grid;gap:8px"><span class="eyebrow">Vote projeté</span>${rows}</div>
    <div class="explain">
      <span class="eyebrow">De quoi est faite cette circonscription</span>
      <p>Elle regroupe des sections de vote de ${x.comp.length} circonscription${x.comp.length>1?"s":""} actuelle${x.comp.length>1?"s":""}. Son vote projeté est la moyenne des projections Qc125 de ces circonscriptions, pondérée par le nombre d'électeurs qui en viennent.</p>
      <div class="tablebox"><table class="ctable"><thead><tr><th>Circonscription actuelle</th><th>Part des électeurs</th><th>Gagnant Qc125</th></tr></thead>
        <tbody>${parts}</tbody></table></div>
    </div>
    <div class="note">
      <span class="eyebrow">Dans la région</span>
      <p>${esc(r.name)} : ${DIST[code]} circonscription${DIST[code]>1?"s":""} et ${LIST[code]} siège${LIST[code]>1?"s":""} de région. Le ${x.w} y obtient <b>${wd}</b> siège${wd>1?"s":""} de circonscription et <b>${wl}</b> siège${wl>1?"s":""} de région.</p>
      <div><button type="button" class="linkbtn" data-goreg="${code}">Voir la région et la compensation →</button></div>
    </div>`;
}

/* Carte actuelle : tout le Québec, puis une circonscription réelle */
function renderAllCurPanel(){
  const f = RES.fptp, order = P.slice().sort((a,b) => f[b]-f[a] || RES.natShare[b]-RES.natShare[a]), lead = order[0];
  const rows = order.map(p => `<div class="vrow wide"><b style="color:${PV[p]}">${p}</b>
      <div class="track"><i style="width:${Math.min(100,RES.natShare[p]*2)}%;background:${PV[p]}"></i></div>
      <span class="num">${fmt(RES.natShare[p])} %</span><span class="num sx"><b>${f[p]}</b> <small>sièges</small></span></div>`).join("");
  const byReg = DATA.regions.map(r => { const c = Object.fromEntries(P.map(p=>[p,0])); RES.ridings.filter(x=>x.r===r.code).forEach(x => c[x.w]++);
    return `<tr><td><button type="button" class="linkbtn" data-goreg="${r.code}">${esc(r.name)}</button></td>${P.map(p => `<td class="${c[p]?"has":""}" style="--c:${PV[p]}">${c[p]||"·"}</td>`).join("")}</tr>`; }).join("");
  document.getElementById("l39-panel").innerHTML = `
    <div style="display:grid;gap:6px">
      <span class="eyebrow">Carte actuelle · 127 circonscriptions</span>
      <h3 style="font-size:1.4rem">Tout le Québec</h3>
      <div class="meta"><span class="pill"><i class="dot" style="background:${PV[lead]}"></i>${lead} ${f[lead] >= 64 ? "majoritaire" : "minoritaire"} : ${f[lead]} / 127</span><span class="pill">Majorité : 64</span></div>
      <p class="muted" style="font-size:.86rem">Projection Qc125 dans chaque circonscription réelle : le parti en tête l'emporte, sans compensation. Cliquez sur une circonscription pour son détail.</p>
    </div>
    <div style="display:grid;gap:8px"><span class="eyebrow">Vote et sièges</span>${rows}</div>
    <div style="display:grid;gap:8px"><span class="eyebrow">Sièges par région (limites de 2019)</span>
      <div class="tablebox"><table class="ctable regsum"><thead><tr><th>Région</th>${P.map(p=>`<th style="color:${PV[p]}">${p}</th>`).join("")}</tr></thead><tbody>${byReg}</tbody></table></div></div>`;
}
function renderCurPanel(){
  const idx = state.sel.idx, x = RES.ridings[idx], code = x.r;
  const order = P.map((p,i)=>[p,x.sh[i]]).sort((a,b)=>b[1]-a[1]), margin = order[0][1] - order[1][1];
  const rows = order.map(([p,v]) => `<div class="vrow${p===x.w?" win":""}"><b style="color:${PV[p]}">${p}</b>
      <div class="track"><i style="width:${Math.min(100,v*2)}%;background:${PV[p]}"></i></div><span class="num">${fmt(v)} %</span><span></span></div>`).join("");
  // avec la loi 39 : dans quelles circonscriptions simulées vont ses électeurs
  const dests = DATA.districts.map(d => { const c = d.comp.find(([ri]) => ri === idx); return c ? {d, e: c[1]} : null; })
    .filter(Boolean).sort((a,b) => b.e - a.e);
  const destRows = dests.map(({d, e}) => { const w = RES.byId[d.id].w;
    return `<tr><td><button type="button" class="linkbtn" data-rid="${d.id}">${esc(d.name)}</button></td><td>${100*e/x.e < 1 ? "< 1" : fmt(100*e/x.e,0)} %</td><td><b style="color:${PV[w]}">${w}</b></td></tr>`; }).join("");
  document.getElementById("l39-panel").innerHTML = `
    <div style="display:grid;gap:6px">
      <span class="eyebrow">Circonscription actuelle · ${esc(REG[code].name)}</span>
      <h3 style="font-size:1.4rem">${esc(x.n)}</h3>
      <div class="meta">
        <span class="pill"><i class="dot" style="background:${PV[x.w]}"></i>En tête : ${x.w}</span>
        <span class="pill num">Avance : ${fmt(margin)} pts</span>
        <span class="pill num">${x.e.toLocaleString("fr-CA")} électeurs</span>
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        <button type="button" class="linkbtn" data-all>← Tout le Québec</button>
        <button type="button" class="linkbtn" data-zoomsel>Zoomer ici</button>
        <a class="linkbtn" href="https://qc125.com/${x.id}f.htm" target="_blank" rel="noopener">Fiche Qc125 ↗</a>
      </div>
    </div>
    <div style="display:grid;gap:8px"><span class="eyebrow">Projection Qc125</span>${rows}</div>
    <div class="explain">
      <span class="eyebrow">Avec la loi 39 <span class="tag sim" title="${SIM_TIP}">simulé</span></span>
      <p>Ses électeurs se retrouveraient dans ${dests.length} circonscription${dests.length>1?"s":""} de la carte simulée à 80 :</p>
      <div class="tablebox"><table class="ctable"><thead><tr><th>Circonscription simulée</th><th>Part de ses électeurs</th><th>Gagnant</th></tr></thead>
        <tbody>${destRows}</tbody></table></div>
      <div><button type="button" class="linkbtn" data-goreg="${code}">Voir la région ${esc(REG[code].name)} avec la loi 39 →</button></div>
    </div>`;
}

document.getElementById("l39-panel").addEventListener("click", e => {
  const cr = e.target.closest("[data-cur]");
  if (cr) return select({type:"cur", idx: +cr.dataset.cur}, {zoomTo:true});
  const rid = e.target.closest("[data-rid]");
  if (rid) return select({type:"circ", id: +rid.dataset.rid}, {zoomTo:true});
  if (e.target.closest("[data-all]")) return selectAll();
  const g = e.target.closest("[data-goreg]");
  if (g) return select({type:"reg", code: g.dataset.goreg}, {zoomTo:true});
  if (e.target.closest("[data-zoomsel]") && state.sel.type !== "all") {
    const s = state.sel;
    zoomToFeature(featOf(s), padOf(s));
  }
});

let loiView = "reg";   // dernier découpage choisi pour la loi 39
function setView(v, {silent = false} = {}){
  const prev = state.view;
  state.view = v;
  if (v !== "cur") loiView = v;
  document.getElementById("l39-c-act").setAttribute("aria-pressed", v==="cur");
  document.getElementById("l39-c-loi").setAttribute("aria-pressed", v!=="cur");
  document.getElementById("l39-loiSeg").hidden = v==="cur";
  document.getElementById("l39-v-reg").setAttribute("aria-pressed", v==="reg");
  document.getElementById("l39-v-circ").setAttribute("aria-pressed", v==="circ");
  for (const id of ["seat","comp"]) document.getElementById("l39-m-"+id).disabled = v!=="reg";
  if (v!=="reg" && (state.mode==="seat" || state.mode==="comp")) setMode("lead", {silent:true});
  if (!silent){
    // garder une sélection cohérente avec l'affichage
    if (v==="cur" && state.sel.type!=="cur") state.sel = {type:"all"};
    else if (prev==="cur" && state.sel.type==="cur"){
      // circonscription réelle → la circonscription simulée qui reçoit le plus de ses électeurs, ou sa région
      const idx = state.sel.idx, best = DATA.districts.map(d => [d, (d.comp.find(([ri]) => ri===idx)||[0,0])[1]]).sort((a,b) => b[1]-a[1])[0][0];
      state.sel = v==="circ" ? {type:"circ", id: best.id} : {type:"reg", code: DATA.ridings[idx].r};
    }
    else if (v==="circ" && state.sel.type==="reg"){
      state.sel = {type:"circ", id: RES.regions[state.sel.code].districts[0].id};
    } else if (v==="reg" && state.sel.type==="circ"){
      state.sel = {type:"reg", code: RES.byId[state.sel.id].r};
    }
    paintMap(); renderPanel();
  }
}
document.getElementById("l39-c-act").addEventListener("click", () => setView("cur"));
document.getElementById("l39-c-loi").addEventListener("click", () => setView(loiView));
document.getElementById("l39-v-reg").addEventListener("click", () => setView("reg"));
document.getElementById("l39-v-circ").addEventListener("click", () => setView("circ"));

const SIM_TIP = "Simulé : la loi 39 n'a jamais été appliquée. La carte à 80 circonscriptions a été construite pour cette page et les votes Qc125 y sont transposés (voir Méthode et limites).";
// chaque segment de la barre affiche son nombre : « PQ 54 », sinon « 54 », sinon juste sous la barre
function fitGlance(){
  document.getElementById("l39-glance").querySelectorAll(".gbar").forEach(gb => {
    let tiny = false;
    gb.querySelectorAll(".track i").forEach(i => {
      i.classList.remove("tiny"); i.textContent = `${i.dataset.p} ${i.dataset.n}`;
      if (i.scrollWidth > i.clientWidth) i.textContent = i.dataset.n;
      if (i.scrollWidth > i.clientWidth) { i.classList.add("tiny"); tiny = true; }
    });
    gb.classList.toggle("has-tiny", tiny);
  });
}
window.addEventListener("resize", () => fitGlance());

/* --- Résultats --- */
function render(){
  RES = simulate();
  const tot = RES.total, maj = 63;
  const lead = P.slice().sort((a,b)=>tot[b]-tot[a])[0];
  const big = document.getElementById("l39-bigNum");
  big.innerHTML = `${tot[lead]}<small>sièges ${lead} sur 125</small>`;
  big.style.setProperty("--lead", PV[lead]);
  document.getElementById("l39-headline").textContent =
    `Le ${lead} serait ${tot[lead] >= maj ? "majoritaire" : "minoritaire"} avec la loi 39`;
  const fl = P.slice().sort((a,b)=>RES.fptp[b]-RES.fptp[a])[0];
  document.getElementById("l39-lede").innerHTML =
    `Avec le mode actuel, le ${fl} obtient <b>${RES.fptp[fl]} sièges sur 127</b> avec ${fmt(RES.natShare[fl])} % des votes. `+
    `Avec la loi 39 (simulation), le ${lead} en obtient <b>${tot[lead]} sur 125</b> et la majorité est à ${maj}. `+
    `La CAQ passe de ${RES.fptp.CAQ} à ${tot.CAQ} siège${tot.CAQ>1?"s":""}.`;
  const modified = state.target.some((t,i)=>Math.abs(t-BASE[i])>0.05) || state.thr !== 10;
  document.getElementById("l39-statusPills").innerHTML =
    (modified ? `<span class="pill mod">Scénario modifié</span>` : `<span class="pill">Projection Qc125 du 28 sept. 2026</span>`) +
    `<span class="pill">Seuil ${fmt(state.thr,state.thr%1?1:0)} % : ${RES.eligible.length} parti${RES.eligible.length>1?"s":""} admissible${RES.eligible.length>1?"s":""}</span>`;

  const gbar = (label, seatsBy, n) => { const m = Math.floor(n/2)+1;
    return `<div class="gbar"><div class="gl"><span><b>${label}</b> · ${n} sièges</span><span>majorité ${m}</span></div>
      <div class="track">${SEAT_ORDER.filter(p=>seatsBy[p]).map(p =>
        `<i style="flex:${seatsBy[p]};background:${PV[p]};--c:${PV[p]}" title="${p} : ${seatsBy[p]}" data-p="${p}" data-n="${seatsBy[p]}">${p} ${seatsBy[p]}</i>`).join("")}
        <b style="left:${100*m/n}%" aria-hidden="true"></b></div></div>`; };
  document.getElementById("l39-glance").innerHTML = gbar("Mode actuel", RES.fptp, 127) + gbar("Loi 39", tot, 125);
  document.getElementById("l39-glance").querySelector(".gbar:last-child .gl b").insertAdjacentHTML("afterend", ` <span class="tag sim" title="${SIM_TIP}">simulé</span>`);
  fitGlance();

  // Ce qui changerait : un tableau (résultat, majorité, sièges par parti et écart)
  const fl1 = P.slice().sort((a,b)=>RES.fptp[b]-RES.fptp[a])[0];
  const res_ = (p, n, m) => `<span style="color:${PV[p]}">${p} ${n >= m ? '<span class="lg">majoritaire</span><span class="sh">maj.</span>' : '<span class="lg">minoritaire</span><span class="sh">min.</span>'}</span>`;
  const dcell = d => `<td class="d ${d>0?"up":d<0?"down":"eq"}">${d>0?"+":d<0?"−":"±"}${Math.abs(d)}</td>`;
  document.getElementById("l39-chgBody").innerHTML =
    `<tr class="st"><td>Résultat</td><td>${res_(fl1, RES.fptp[fl1], 64)}</td><td>${res_(lead, tot[lead], maj)}</td><td></td></tr>`+
    `<tr><td>Sièges<span class="lg"> · majorité</span><span class="sh"> (maj.)</span></td><td>127 <span class="muted">(${64})</span></td><td>125 <span class="muted">(${maj})</span></td><td></td></tr>`+
    P.slice().sort((a,b)=>tot[b]-tot[a]||RES.fptp[b]-RES.fptp[a]).map((p,i) =>
      `<tr${i===0?' class="sep"':""}><td><span class="pname"><i class="dot" style="background:${PV[p]}"></i>${p}</span><span class="vs">${fmt(RES.natShare[p])} %<span class="lg"> des votes</span></span></td>`+
      `<td class="num-big">${RES.fptp[p]}</td><td class="num-big">${tot[p]}</td>${dcell(tot[p]-RES.fptp[p])}</tr>`).join("");

  // Barres jumelées : part des sièges (actuel / loi 39) comparée à la part des votes, échelle 0–75 %
  document.getElementById("l39-twin").innerHTML = P.slice().sort((a,b)=>tot[b]-tot[a]||RES.fptp[b]-RES.fptp[a]).map(p => {
    const a = 100*RES.fptp[p]/127, b = 100*tot[p]/125, v = RES.natShare[p], sc = x => Math.min(100, x/0.75);
    return `<div class="tw-row" style="--c:${PV[p]}"><span class="pn">${p}</span>
      <div class="tw-bars" title="${p} : ${fmt(a)} % des sièges actuellement, ${fmt(b)} % avec la loi 39, ${fmt(v)} % des votes">
        <i class="a" style="width:${sc(a)}%"></i><i style="width:${sc(b)}%"></i>
        <span class="v" style="left:${sc(v)}%"></span><span class="m" style="left:${sc(50)}%"></span></div>
      <span class="c a">${fmt(a,0)} %</span><span class="c b">${fmt(b,0)} %</span><span class="c v">${fmt(v,0)} %</span></div>`;
  }).join("");
  document.getElementById("l39-twin").insertAdjacentHTML("afterbegin",
    `<div class="tw-row hd" aria-hidden="true"><span></span><span class="ax">Part des sièges (échelle 0–75 %)</span><span>Actuel</span><span>Loi 39</span><span>Votes</span></div>`);
  document.getElementById("l39-capA").textContent = `127 sièges · majorité 64`;
  document.getElementById("l39-capB").textContent = `125 sièges · majorité ${maj}`;
  chamber(document.getElementById("l39-hemiA"), RES.fptp, 127);
  chamber(document.getElementById("l39-hemiB"), tot, 125, RES.totL);

  document.getElementById("l39-resBody").innerHTML = P.slice().sort((a,b)=>tot[b]-tot[a]||RES.natShare[b]-RES.natShare[a]).map(p => {
    const vs = RES.natShare[p], ss = 100*tot[p]/125, gap = ss - vs;
    const el = RES.eligible.includes(p);
    return `<tr><td><span class="pname"><i class="dot" style="background:${PV[p]}"></i>${p}</span> <span class="muted" style="font-size:.8rem">${PNAME[p]}</span>${el?"":' <span class="pill">sous le seuil</span>'}</td>
      <td>${fmt(vs)} %</td><td>${RES.fptp[p]}</td><td>${RES.totD[p]}</td><td>${RES.totL[p]}</td><td class="total">${tot[p]}</td>
      <td>${fmt(ss)} % <span class="${gap>=0?"delta-pos":"delta-neg"}" style="font-size:.8rem">(${gap>=0?"+":"−"}${fmt(Math.abs(gap))})</span></td>
      <td class="bar-cell" style="text-align:left"><div class="mini" title="vote"><i style="width:${vs*2}%;background:${PV[p]};opacity:.35"></i></div>
        <div class="mini" style="margin-top:3px" title="sièges"><i style="width:${ss*2}%;background:${PV[p]}"></i></div></td></tr>`;
  }).join("");

  // Coalitions majoritaires à deux partis
  const pairs = [];
  for (let i=0;i<P.length;i++) for (let j=i+1;j<P.length;j++){ const s = tot[P[i]]+tot[P[j]]; if (s>=maj) pairs.push([P[i],P[j],s]); }
  pairs.sort((a,b)=>b[2]-a[2]);
  document.getElementById("l39-coalitions").innerHTML = tot[lead] >= maj
    ? `<span class="eyebrow">Majorité à elle seule</span><span class="pill"><b>${lead}</b>&nbsp;${tot[lead]} sièges</span>`
    : `<span class="eyebrow">Majorités à deux partis (≥ ${maj})</span>` + pairs.map(([a,b,s]) =>
      `<span class="pill"><i class="dot" style="background:${PV[a]}"></i><i class="dot" style="background:${PV[b]}"></i><b>${a} + ${b}</b>&nbsp;${s}</span>`).join("");

  document.getElementById("l39-regBody").innerHTML = DATA.regions.map(r => {
    const R = RES.regions[r.code];
    const cell = p => { const t = R.d[p]+R.l[p]; return t ? `<b>${t}</b> <span class="muted" style="font-size:.78rem">${R.d[p]}+${R.l[p]}</span>` : `<span class="muted">—</span>`; };
    return `<tr><td><a href="#l39-h-map" data-reg="${r.code}">${esc(r.name)}</a></td><td>${r.electors.toLocaleString("fr-CA")}</td><td>${R.ridings.length}</td>
      <td>${DIST[r.code]}</td><td>${LIST[r.code]}</td>${P.map(p=>`<td>${cell(p)}</td>`).join("")}</tr>`;
  }).join("");

  paintMap(); renderPanel();
}
document.getElementById("l39-regBody").addEventListener("click", e => {
  const a = e.target.closest("a[data-reg]"); if (!a) return;
  select({type:"reg", code:a.dataset.reg}, {zoomTo:true});
});

/* --- Contrôles --- */
function setMode(m, {silent = false} = {}){
  state.mode = m;
  for (const id of ["lead","vote","seat","comp"]) document.getElementById("l39-m-"+id).setAttribute("aria-pressed", id===m);
  document.getElementById("l39-partyChips").setAttribute("aria-disabled", m==="lead");
  // « Tous les partis » n'a pas de sens pour le vote : on reprend le dernier parti choisi
  if (m==="vote" && state.party==="ALL") state.party = state.lastParty;
  syncChips();
  if (!silent) paintMap();
}
for (const id of ["lead","vote","seat","comp"]) document.getElementById("l39-m-"+id).addEventListener("click", () => setMode(id));
document.getElementById("l39-partyChips").innerHTML =
  `<button type="button" class="chip" style="--c:${ALLC}" data-p="ALL" aria-pressed="${state.party==="ALL"}" title="Nombre total de sièges de chaque région">Tous les partis</button>` +
  P.map(p => `<button type="button" class="chip" style="--c:${PV[p]}" data-p="${p}" aria-pressed="${p===state.party}">${p}</button>`).join("");
function syncChips(){
  document.querySelectorAll("#l39-partyChips .chip").forEach(c => {
    c.setAttribute("aria-pressed", c.dataset.p===state.party);
    if (c.dataset.p==="ALL") c.disabled = state.mode==="vote";
  });
}
document.getElementById("l39-partyChips").setAttribute("aria-disabled","true");
document.getElementById("l39-partyChips").addEventListener("click", e => {
  const b = e.target.closest("button[data-p]"); if (!b) return;
  state.party = b.dataset.p;
  if (state.party!=="ALL") state.lastParty = state.party;
  syncChips();
  paintMap();
});

const sl = document.getElementById("l39-sliders");
sl.innerHTML = P.map((p,i) => `<div class="sl" style="--c:${PV[p]}">
  <label for="l39-s-${p}"><span style="color:${PV[p]}">${p}</span><span class="num" id="l39-v-${p}"></span></label>
  <input type="range" id="l39-s-${p}" min="0" max="60" step="0.5" data-i="${i}"></div>`).join("");
function syncSliders(){
  P.forEach((p,i) => { document.getElementById("l39-s-"+p).value = state.target[i]; document.getElementById("l39-v-"+p).textContent = fmt(state.target[i])+" %"; });
}
let raf = 0;
sl.addEventListener("input", e => {
  const i = +e.target.dataset.i; if (Number.isNaN(i)) return;
  const v = +e.target.value, others = state.target.reduce((a,t,j)=> j===i ? a : a+t, 0);
  state.target = state.target.map((t,j) => j===i ? v : (others>0 ? t*(100-v)/others : (100-v)/4));
  syncSliders();
  cancelAnimationFrame(raf); raf = requestAnimationFrame(render);
});
document.getElementById("l39-thr").addEventListener("input", e => {
  state.thr = +e.target.value; document.getElementById("l39-thrV").textContent = fmt(state.thr, state.thr%1?1:0)+" %";
  cancelAnimationFrame(raf); raf = requestAnimationFrame(render);
});
document.getElementById("l39-reset").addEventListener("click", () => {
  state.target = BASE.slice(); state.thr = 10;
  document.getElementById("l39-thr").value = 10; document.getElementById("l39-thrV").textContent = "10 %";
  syncSliders(); render();
});

drawBase(); syncSliders(); render();
