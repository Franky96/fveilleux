"""Simulation de référence (carte hypothétique à 80) : sert à valider la page."""
import json, math
from collections import Counter
P=["PQ","PLQ","CAQ","PCQ","QS"]
D=json.load(open('data.json'))
R=D['ridings']
# base de la simulation : résultat de l'élection quand il est définitif, sinon projection Qc125
if D.get('source',{}).get('type')=='election':
    for x in R: x['s'],x['o']=x['se'],x['oe']
def hq(w,n):
    q=sorted(((v/d,k) for k,v in w.items() for d in range(1,n+1)),reverse=True)[:n]; return Counter(k for _,k in q)
el={r['code']:r['electors'] for r in D['regions']}
ed,elq=hq(el,62),hq(el,29)
DIST={c:1+(c=="11")+ed[c] for c in el}; LIST={c:(c!="10")+elq[c] for c in el}
nat=[0]*5; reg={c:[0]*5 for c in el}; fptp=Counter()
sh=[]
for x in R:
    t=sum(x['s']); s=[v/t for v in x['s']]; sh.append(s)
    for i in range(5): nat[i]+=x['e']*s[i]; reg[x['r']][i]+=x['e']*s[i]
    w=x['o'][0]
    for i in x['o']:
        if x['s'][i]>x['s'][w]: w=i
    fptp[P[w]]+=1
N=sum(nat); ns={P[i]:100*nat[i]/N for i in range(5)}
elig=[p for p in P if ns[p]>=10]
d=Counter(); dreg={c:Counter() for c in el}
for di in D['districts']:
    v=[0]*5
    for ri,e in di['comp']:
        for i in range(5): v[i]+=e*sh[ri][i]
    w=max(range(5),key=lambda i:v[i]); d[P[w]]+=1; dreg[di['r']][P[w]]+=1
l=Counter()
for c in el:
    share={P[i]:reg[c][i] for i in range(5)}; ll=Counter()
    for _ in range(LIST[c]):
        b=max(elig,key=lambda p: share[p]/(1+math.ceil(dreg[c][p]/2)+ll[p])); ll[b]+=1
    l+=ll
print('vote',{p:round(v,1) for p,v in ns.items()})
print('DIST',DIST); print('LIST',LIST)
for p in P: print(p,'actuel',fptp[p],'circ',d[p],'rég',l[p],'total',d[p]+l[p])
