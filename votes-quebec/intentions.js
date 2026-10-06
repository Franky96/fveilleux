/* Votes Québec — onglet « Votes Québec » : intentions de vote à jour.
   Tant que Qc125 n'a publié aucun sondage postérieur à l'élection du 5 octobre 2026, la page montre le résultat
   de l'élection (election-2026.json, Élections Québec). Ensuite : projection Qc125 par circonscription (data.json).
   Évolution : tous les sondages nationaux depuis l'élection de 2022 (sondages.json, Qc125), moyenne mobile 30 jours. */

const SIEGES = 127, MAJ = 64;
const P5 = ["PQ", "PLQ", "CAQ", "PCQ", "QS"];                // ordre de data.json (ridings[].s)
const NOMS = { PQ: "Parti québécois", PLQ: "Parti libéral", CAQ: "Coalition avenir Québec", PCQ: "Parti conservateur", QS: "Québec solidaire", AUT: "Autres" };
const COUL = { PQ: "var(--pq)", PLQ: "var(--plq)", CAQ: "var(--caq)", PCQ: "var(--pcq)", QS: "var(--qs)", AUT: "var(--aut)" };
const DATE_ELECTION = "2026-10-05";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const dateFr = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });

let DATA, ELEC, SOND, MODE, ETAT, sel = null, demarre = false;

/* ---------- état courant : résultat de l'élection, ou projection Qc125 ---------- */
function construireEtat() {
  const apres = SOND.sondages.filter(s => !s.e && s.d > DATE_ELECTION);
  MODE = apres.length ? "projection" : "election";
  if (MODE === "election") {
    const circ = DATA.ridings.map(r => {
      const c = ELEC.circ[r.n];
      if (!c) return null;
      const ordre = Object.entries(c.s).sort((a, b) => b[1] - a[1]);
      return { g: c.g, parts: c.s, marge: ordre[0][1] - (ordre[1] ? ordre[1][1] : 0), cands: c.c, final: c.f, part: c.part };
    });
    return { titre: "Résultat de l'élection du 5 octobre 2026", national: ELEC.national, sieges: ELEC.sieges, circ,
      source: `Élections Québec · ${ELEC.final ? "résultats officiels" : `résultats préliminaires (${nf(ELEC.bureaux, 1)} % des bureaux)`} · participation ${nf(ELEC.participation, 1)} %`,
      note: "Les intentions de vote remplaceront ce résultat dès que Qc125 publiera un premier sondage après l'élection." };
  }
  // projection Qc125 : gagnant prédit par circonscription, vote national pondéré par le nombre d'électeurs
  const nat = Object.fromEntries(P5.map(p => [p, 0])); let tot = 0;
  const sieges = {};
  const circ = DATA.ridings.map(r => {
    const e = r.e || 1; tot += e;
    P5.forEach((p, j) => nat[p] += e * r.s[j]);
    const ordre = P5.map((p, j) => [p, r.s[j]]).sort((a, b) => b[1] - a[1] || (r.o || []).indexOf(P5.indexOf(a[0])) - (r.o || []).indexOf(P5.indexOf(b[0])));
    sieges[ordre[0][0]] = (sieges[ordre[0][0]] || 0) + 1;
    return { g: ordre[0][0], parts: Object.fromEntries(ordre), marge: ordre[0][1] - ordre[1][1] };
  });
  const somme = Object.values(nat).reduce((a, b) => a + b, 0);
  P5.forEach(p => nat[p] = 100 * nat[p] / somme);
  const dernier = apres[apres.length - 1];
  return { titre: "Intentions de vote", national: nat, sieges, circ,
    source: `Projection Qc125 du ${DATA.maj?.texte || "—"} · dernier sondage : ${esc(dernier.f)}, ${dateFr(dernier.d)}`,
    note: `${apres.length} sondage${apres.length > 1 ? "s" : ""} publié${apres.length > 1 ? "s" : ""} depuis l'élection.` };
}

/* ---------- en-tête, barre des sièges, partis ---------- */
function dessinerTete() {
  $("viTitre").textContent = ETAT.titre;
  $("viSource").innerHTML = ETAT.source;
  $("viNote").textContent = ETAT.note;
  const s = ETAT.sieges, ordre = Object.keys(s).filter(p => s[p] > 0).sort((a, b) => s[b] - s[a]);
  const lead = ordre[0];
  $("viSiegesTitre").textContent = s[lead] >= MAJ ? `${NOMS[lead]} : ${s[lead]} sièges, gouvernement majoritaire` : `${NOMS[lead]} : ${s[lead]} sièges, gouvernement minoritaire`;
  $("viBarre").innerHTML = ordre.map(p => `<span class="lv-seg" style="width:${100 * s[p] / SIEGES}%;--c:${COUL[p]}" title="${NOMS[p]} : ${s[p]} sièges">`
    + `<i class="lv-elus" style="width:100%"></i><b>${p === "AUT" ? "Aut." : p} ${s[p]}</b></span>`).join("");
  for (const seg of $("viBarre").querySelectorAll(".lv-seg")) {
    const b = seg.querySelector("b");
    if (b.offsetWidth > seg.clientWidth - 6) b.textContent = b.textContent.split(" ").pop();
    if (b.offsetWidth > seg.clientWidth - 4) b.remove();
  }
  const partis = [...P5, "AUT"].filter(p => (ETAT.national[p] || 0) > 0.05).sort((a, b) => (s[b] || 0) - (s[a] || 0) || ETAT.national[b] - ETAT.national[a]);
  $("viPartis").innerHTML = partis.map(p => `<div class="lv-parti" style="--c:${COUL[p]}"><i></i><span class="lv-pnom">${p === "AUT" ? "Autres" : p}</span>`
    + `<b>${s[p] || 0}</b><small>${(s[p] || 0) > 1 ? "sièges" : "siège"}</small><span class="lv-pvote">${nf(ETAT.national[p], 1)} %</span></div>`).join("");
}

/* ---------- carte ---------- */
let svg, gZ, PATH, PROJ_FN, ZOOM;
const remplir = i => { const c = ETAT.circ[i]; return c ? [COUL[c.g], Math.max(0.45, Math.min(1, 0.45 + c.marge / 30))] : ["var(--soft)", 1]; };
function construireCarte() {
  const MW = 600, MH = 704;
  for (const g of [DATA.ridingGeo, DATA.curRegionGeo].filter(Boolean)) for (const f of g.features)
    if (d3.geoArea(f) > 2 * Math.PI) { const rev = q => q.map(x => x.slice().reverse()); f.geometry.coordinates = f.geometry.type === "Polygon" ? rev(f.geometry.coordinates) : f.geometry.coordinates.map(rev); }
  PROJ_FN = d3.geoConicConformal().rotate([71.6, 0]).parallels([46, 60]).fitExtent([[12, 12], [MW - 12, 648]], DATA.curRegionGeo || DATA.ridingGeo);
  PATH = d3.geoPath(PROJ_FN);
  svg = d3.select("#viCarte").attr("viewBox", `0 0 ${MW} ${MH}`);
  gZ = svg.append("g");
  gZ.append("g").selectAll("path").data(DATA.ridingGeo.features).join("path").attr("class", "lv-rid").attr("d", PATH)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => DATA.ridings[f.properties.RID].n)
    .on("click", (e, f) => choisir(f.properties.RID))
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(f.properties.RID); } })
    .on("mousemove", infobulle).on("mouseleave", () => { $("viTip").hidden = true; });
  if (DATA.curRegionGeo) gZ.append("g").selectAll("path").data(DATA.curRegionGeo.features).join("path").attr("class", "lv-reg").attr("d", PATH);
  gZ.append("g").attr("class", "vi-sel");
  ZOOM = d3.zoom().scaleExtent([1, 40]).translateExtent([[-100, -100], [MW + 100, MH + 100]]).on("zoom", e => gZ.attr("transform", e.transform));
  svg.call(ZOOM).on("dblclick.zoom", null);
  svg.node().parentElement.addEventListener("wheel", e => e.preventDefault(), { passive: false });
  svg.on("click", e => { if (e.target === svg.node()) choisir(null); });
  const vers = (lon0, lat0, lon1, lat1) => {
    const [x0, y0] = PROJ_FN([lon0, lat1]), [x1, y1] = PROJ_FN([lon1, lat0]);
    const k = Math.min(40, 0.9 / Math.max((x1 - x0) / MW, (y1 - y0) / MH));
    svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity.translate(MW / 2, MH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  };
  $("viZoom").addEventListener("click", e => {
    const z = e.target.closest("button")?.dataset.z; if (!z) return;
    if (z === "tout") svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity);
    else if (z === "mtl") vers(-74.1, 45.33, -73.3, 45.75);
    else if (z === "qc") vers(-71.55, 46.68, -71.0, 47.0);
    else if (z === "plus") svg.transition().duration(250).call(ZOOM.scaleBy, 1.6);
    else if (z === "moins") svg.transition().duration(250).call(ZOOM.scaleBy, 1 / 1.6);
  });
}
function dessinerCarte() {
  gZ.select("g").selectAll("path").each(function (f) { const [c, o] = remplir(f.properties.RID); this.style.fill = c; this.style.fillOpacity = o; });
  const f = sel != null ? DATA.ridingGeo.features.find(x => x.properties.RID === sel) : null;
  gZ.select(".vi-sel").selectAll("path").data(f ? [f] : []).join("path").attr("class", "lv-selline").attr("d", PATH);
}
function infobulle(e, f) {
  const i = f.properties.RID, c = ETAT.circ[i], t = $("viTip");
  const box = svg.node().parentNode.getBoundingClientRect();
  t.hidden = false; t.style.left = (e.clientX - box.left + 12) + "px"; t.style.top = (e.clientY - box.top + 12) + "px";
  t.innerHTML = `<b>${esc(DATA.ridings[i].n)}</b>` + (c ? Object.entries(c.parts).slice(0, 3).map(([p, v]) => `${p === "AUT" ? "Autres" : p} ${nf(v, MODE === "election" ? 1 : 0)} %`).join(" · ") : "<small>Aucune donnée</small>");
}

/* ---------- fiche d'une circonscription ---------- */
function choisir(i) { sel = i; dessinerCarte(); dessinerPanneau(); }
function dessinerPanneau() {
  const z = $("viPanneau");
  if (sel == null) {
    const serres = ETAT.circ.map((c, i) => [i, c]).filter(([, c]) => c && c.marge < 5).sort((a, b) => a[1].marge - b[1].marge);
    z.innerHTML = `<span class="lv-eyebrow">Circonscriptions</span><h3>Clique sur une circonscription</h3>
      <p class="lv-muted">Couleur : ${MODE === "election" ? "parti gagnant" : "parti en tête de la projection"} ; plus la couleur est foncée, plus l'écart avec le 2e est grand.</p>
      <span class="lv-eyebrow">Les plus serrées (moins de 5 points)</span>
      <ul class="vi-serres">${serres.slice(0, 12).map(([i, c]) => `<li data-rid="${i}" tabindex="0" style="--c:${COUL[c.g]}"><i></i>${esc(DATA.ridings[i].n)}<b>${c.g} +${nf(c.marge, 1)}</b></li>`).join("") || "<li>Aucune</li>"}</ul>`;
    return;
  }
  const r = DATA.ridings[sel], c = ETAT.circ[sel], reg = DATA.regions.find(x => x.code === r.r)?.name || "";
  if (!c) { z.innerHTML = `<span class="lv-eyebrow">${esc(reg)}</span><h3>${esc(r.n)}</h3><p class="lv-muted">Aucune donnée.</p>`; return; }
  const max = Math.max(...Object.values(c.parts));
  z.innerHTML = `<span class="lv-eyebrow">${esc(reg)}</span><h3>${esc(r.n)}</h3>
    <p class="lv-tete" style="--c:${COUL[c.g]}"><b>${NOMS[c.g]}</b> ${MODE === "election" ? "l'emporte" : "en tête"} par ${nf(c.marge, 1)} point${c.marge >= 2 ? "s" : ""}</p>
    <ul class="vi-parts">${Object.entries(c.parts).filter(([, v]) => v >= 0.5).map(([p, v]) => `<li style="--c:${COUL[p]}"><span>${p === "AUT" ? "Autres" : p}</span>`
      + `<span class="vi-jauge"><i style="width:${100 * v / max}%"></i></span><b>${nf(v, MODE === "election" ? 1 : 0)} %</b></li>`).join("")}</ul>`
    + (c.cands ? `<span class="lv-eyebrow">Candidats en tête</span><ul class="vi-cands">${c.cands.map(k => `<li style="--c:${COUL[k.p]}"><i></i><span>${esc(k.nom)}</span><em>${esc(k.sigle)}</em><b>${nf(k.v)}</b></li>`).join("")}</ul>` : "")
    + (c.part ? `<p class="lv-muted">Participation : ${nf(c.part, 1)} %${c.final ? "" : " · résultat préliminaire"}</p>` : "");
}

/* ---------- évolution des intentions de vote ---------- */
function dessinerEvolution() {
  const el = $("viEvol"), W = el.clientWidth || 800, H = Math.max(260, Math.min(420, W * 0.42));
  const m = { t: 16, r: 54, b: 28, l: 34 };
  const sond = SOND.sondages.filter(s => !s.e);
  const elections = SOND.sondages.filter(s => s.e).map(s => ({ d: s.d, ...Object.fromEntries(P5.map(p => [p, s[p]])) }));
  if (!elections.some(x => x.d === DATE_ELECTION)) elections.push({ d: DATE_ELECTION, ...Object.fromEntries(P5.map(p => [p, ELEC.national[p]])) });
  const t = s => new Date(s + "T12:00:00");
  const x = d3.scaleTime().domain([t("2022-10-01"), d3.max([new Date(), ...sond.map(s => t(s.d))])]).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([0, Math.ceil((d3.max(sond, s => d3.max(P5, p => s[p])) + 4) / 10) * 10]).range([H - m.b, m.t]);
  // tendance : moyenne pondérée des sondages autour de chaque semaine (noyau gaussien, écart-type 21 jours),
  // calculée seulement entre le premier et le dernier sondage
  const SIGMA = 21, t0 = t(sond[0].d), t1 = t(sond[sond.length - 1].d);
  const dates = [];
  for (let d = new Date(t0); d <= t1; d = new Date(+d + 7 * 864e5)) dates.push(d.toISOString().slice(0, 10));
  if (dates[dates.length - 1] !== sond[sond.length - 1].d) dates.push(sond[sond.length - 1].d);
  const poids = (d, s) => Math.exp(-0.5 * ((t(d) - t(s.d)) / 864e5 / SIGMA) ** 2);
  const cache = {};
  const moy = p => cache[p] ||= dates.map(d => { let a = 0, w = 0; for (const s of sond) { const k = poids(d, s); a += k * s[p]; w += k; } return { d, v: a / w }; });
  const nbAutour = d => sond.filter(s => Math.abs(t(d) - t(s.d)) / 864e5 <= 30).length;
  const ligne = d3.line().x(o => x(t(o.d))).y(o => y(o.v)).curve(d3.curveMonotoneX);
  const svgE = d3.select(el).html("").append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", "Évolution des intentions de vote depuis 2022");
  svgE.append("g").attr("class", "vi-axe").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(W < 600 ? 4 : 8).tickFormat(d => d.toLocaleDateString("fr-CA", { month: "short", year: "numeric" })).tickSizeOuter(0));
  svgE.append("g").attr("class", "vi-axe vi-grille").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(v => v + " %"));
  for (const e of elections) {
    svgE.append("line").attr("class", "vi-elec").attr("x1", x(t(e.d))).attr("x2", x(t(e.d))).attr("y1", m.t).attr("y2", H - m.b);
    const aDroite = x(t(e.d)) > W / 2;   // étiquette à gauche du trait près du bord droit
    svgE.append("text").attr("class", "vi-elec-txt").attr("x", x(t(e.d)) + (aDroite ? -4 : 4)).attr("y", m.t + 10).attr("text-anchor", aDroite ? "end" : "start").text("Élection " + e.d.slice(0, 4));
  }
  const fin = {};
  for (const p of P5) {
    svgE.append("g").selectAll("circle").data(sond).join("circle").attr("class", "vi-pt").attr("cx", s => x(t(s.d))).attr("cy", s => y(s[p])).attr("r", 2.2).style("fill", COUL[p]);
    const mm = moy(p); fin[p] = mm[mm.length - 1];
    svgE.append("path").attr("class", "vi-ligne").attr("d", ligne(mm)).style("stroke", COUL[p]);
    svgE.append("g").selectAll("rect").data(elections).join("rect").attr("class", "vi-elec-pt").attr("width", 8).attr("height", 8)
      .attr("transform", e => `translate(${x(t(e.d))},${y(e[p])}) rotate(45) translate(-4,-4)`).style("fill", COUL[p]);
  }
  // étiquettes de fin de ligne (écartées pour ne pas se chevaucher)
  const etiq = P5.map(p => ({ p, y: y(fin[p].v), v: fin[p].v })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < etiq.length; i++) if (etiq[i].y - etiq[i - 1].y < 13) etiq[i].y = etiq[i - 1].y + 13;
  svgE.append("g").selectAll("text").data(etiq).join("text").attr("class", "vi-fin").attr("x", W - m.r + 6).attr("y", d => d.y + 4).style("fill", d => COUL[d.p]).text(d => `${d.p} ${nf(d.v, 0)}`);
  // survol : moyenne à la date la plus proche
  const tipE = $("viEvolTip"), repere = svgE.append("line").attr("class", "vi-repere").attr("y1", m.t).attr("y2", H - m.b).style("display", "none");
  svgE.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
    .on("mousemove", ev => {
      const [mx] = d3.pointer(ev), dt = x.invert(mx), d = dates.reduce((a, b) => Math.abs(t(b) - dt) < Math.abs(t(a) - dt) ? b : a);
      repere.style("display", null).attr("x1", x(t(d))).attr("x2", x(t(d)));
      const vals = P5.map(p => [p, moy(p).find(o => o.d === d).v]).sort((a, b) => b[1] - a[1]);
      const n = nbAutour(d);
      tipE.hidden = false; tipE.innerHTML = `<b>Semaine du ${dateFr(d)}</b><small>tendance · ${n} sondage${n > 1 ? "s" : ""} à ±30 jours</small>`
        + vals.map(([p, v]) => `<span style="--c:${COUL[p]}"><i></i>${p} <b>${nf(v, 1)} %</b></span>`).join("");
      const r = el.getBoundingClientRect(), px = x(t(d)) * r.width / W;
      tipE.style.left = Math.min(r.width - tipE.offsetWidth - 4, Math.max(4, px + 12)) + "px"; tipE.style.top = "8px";
    })
    .on("mouseleave", () => { repere.style("display", "none"); tipE.hidden = true; });
  $("viEvolNote").textContent = `${sond.length} sondages nationaux depuis l'élection de 2022 (Qc125). Lignes : tendance (moyenne pondérée des sondages voisins) · points : sondages · losanges : résultats des élections.`;
}

/* ---------- démarrage (au premier affichage de l'onglet) ---------- */
async function demarrer() {
  if (demarre) return; demarre = true;
  try {
    const lireJ = u => fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u + " : " + r.status); return r.json(); });
    [DATA, ELEC, SOND] = await Promise.all([lireJ("votes-quebec/data.json"), lireJ("votes-quebec/election-2026.json"), lireJ("votes-quebec/sondages.json")]);
    ETAT = construireEtat();
    dessinerTete(); construireCarte(); dessinerCarte(); dessinerPanneau(); dessinerEvolution();
    let attente; addEventListener("resize", () => { clearTimeout(attente); attente = setTimeout(() => { if (!$("vue-votes").hidden) { dessinerEvolution(); dessinerTete(); } }, 200); });
    document.addEventListener("click", e => { const l = e.target.closest(".vi-serres [data-rid]"); if (l) choisir(+l.dataset.rid); });
  } catch (e) { $("viSource").textContent = "Chargement impossible : " + e.message; }
}
window.addEventListener("vue-votes", demarrer);
if (!$("vue-votes").hidden) demarrer();
