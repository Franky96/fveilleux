const d3=require('d3-geo'); const g=require('./m80/d80.json'); const D=require('./m80/districts.json').districts;
const [x0,y0,x1,y1]=process.argv.slice(2).map(Number); const out=process.argv[6];
const box={type:'MultiPoint',coordinates:[[x0,y0],[x1,y1]]};
const p=d3.geoConicConformal().rotate([71.6,0]).parallels([46,60]).fitExtent([[10,10],[1190,890]],box);
const path=d3.geoPath(p);
const col=['#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#46f0f0','#f032e6','#bcf60c','#fabebe','#008080','#e6beff','#9a6324','#fffac8','#800000','#aaffc3','#808000','#ffd8b1','#6f8fff','#c0c0c0'];
let s='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#0d1b2a"/>';
for (const f of g.features){ if(!f.geometry) continue; if(d3.geoArea(f)>2*Math.PI){ const rev=poly=>poly.map(r=>r.slice().reverse()); f.geometry.coordinates=f.geometry.type==='Polygon'?rev(f.geometry.coordinates):f.geometry.coordinates.map(rev);}
  s+='<path d="'+path(f)+'" fill="'+col[f.properties.DID%col.length]+'" stroke="#fff" stroke-width="1.2" fill-opacity="0.85"/>'; }
for (const f of g.features){ if(!f.geometry) continue; const c=path.centroid(f); if(c[0]>0&&c[0]<1200&&c[1]>0&&c[1]<900) s+='<text x="'+c[0]+'" y="'+c[1]+'" font-size="12" font-family="sans-serif" text-anchor="middle" fill="#000" stroke="#fff" stroke-width="3" paint-order="stroke">'+D[f.properties.DID].name.slice(0,30)+'</text>'; }
require('fs').writeFileSync(out.replace('.png','.svg'),s+'</svg>');
