"""Votes Canada : projection Qc125 (qc125.com/canada) → ../projection.json

  - projection nationale : vote et sièges de chaque parti, avec leur fourchette (page d'accueil de Qc125 Canada) ;
  - les 343 fiches de circonscription : projection de chaque parti (± marge) et résultat de l'élection de 2025 ;
  - la projection de chaque région de Qc125 (Atlantique, Québec, Ontario, Prairies, Alberta, Colombie-Britannique) ;
  - la carte de Qc125 : député actuel de chaque circonscription et son parti (changements de parti, sièges vacants).
Qc125 met sa projection à jour environ une fois par semaine : les 343 fiches ne sont relues que si la date de mise à jour
a changé (sinon rien n'est écrit). Seulement la bibliothèque standard : relancé par le pipeline aux 3 heures.
Usage : /usr/bin/python3 canada.py [--force]   (dans le dossier outils/)
"""
import html, json, os, re, sys, time, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(ICI, "..", "projection.json")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
HDR = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "fr-CA,fr;q=0.9"}
PARTIS = ["PLC", "PCC", "BQ", "NPD", "PVC", "PPC"]
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
# parti du député sur la carte de Qc125 → sigle
PARTI_ACT = {"Libéral": "PLC", "Conservateur": "PCC", "Bloc québécois": "BQ", "NPD": "NPD", "Parti vert": "PVC", "Indépendant": "IND"}


def get(url):
    # --cache : garde les pages dans brut/ (essais locaux sans retélécharger les 343 fiches)
    f = os.path.join(ICI, "brut", "pages", re.sub(r"\W", "_", url)) if "--cache" in sys.argv else None
    if f and os.path.exists(f): return open(f, encoding="utf-8").read()
    with urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=60) as r:
        s = r.read().decode("utf-8", "ignore")
    if f: os.makedirs(os.path.dirname(f), exist_ok=True); open(f, "w", encoding="utf-8").write(s)
    return s


def mise_a_jour(s):
    m = re.search(r"Mise à jour : (\d{1,2}) (" + "|".join(MOIS) + r") (\d{4})", s)
    if not m: raise SystemExit("Date de mise à jour introuvable : projection.json inchangé.")
    return {"date": f"{m[3]}-{MOIS.index(m[2]) + 1:02d}-{int(m[1]):02d}", "texte": f"{int(m[1])} {m[2]} {m[3]}"}


def derniers(bloc, cle):
    m = re.search(r"(?<![a-z])" + cle + r"\s*:\s*\[([^\]]*)\]", bloc)
    vals = [x.strip() for x in m[1].split(",") if x.strip()] if m else []
    return float(vals[-1]) if vals else None


def serie(page, nom):
    i = page.index(f"window.{nom}")
    zone = page[page.index("parties", i): page.index("</script>", i)]
    out = {}
    for b in re.split(r"\bkey\s*:", zone)[1:]:
        k = re.match(r"\s*'([^']+)'", b)[1]
        out[k] = {c: derniers(b, c) for c in ("values", "moe", "uppermoe", "lowermoe") if derniers(b, c) is not None}
    return out


accueil = get("https://qc125.com/canada/")
maj = mise_a_jour(accueil)
ancien = json.load(open(SORTIE, encoding="utf-8")) if os.path.exists(SORTIE) else {}
if ancien.get("maj", {}).get("date") == maj["date"] and "--force" not in sys.argv and "--cache" not in sys.argv:
    print(f"Projection Qc125 du {maj['texte']} déjà enregistrée : rien à faire."); raise SystemExit(0)
vote, sieges = serie(accueil, "indexvote_DATA"), serie(accueil, "indexseats_DATA")
national = {p: {"v": round(vote[p]["values"], 1), "moe": round(vote[p].get("moe", 0), 1), "s": round(sieges[p]["values"]),
                "smin": round(sieges[p].get("lowermoe", sieges[p]["values"])), "smax": round(sieges[p].get("uppermoe", sieges[p]["values"]))}
            for p in PARTIS if p in vote and p in sieges}
if not 330 <= sum(x["s"] for x in national.values()) <= 345: raise SystemExit(f"Sièges nationaux illisibles : {national}")

# projection régionale (pages de région de Qc125) : vote et sièges avec leur fourchette ; les sièges sont dans le même
# ordre que le vote (Qc125 donne la même clé « LIB » à toutes les séries de sièges : on lit l'étiquette)
REGIONS = {"ATL": ("atl", "Atlantique", ["NL", "PE", "NS", "NB"]), "QC": ("quebec", "Québec", ["QC"]), "ON": ("ontario", "Ontario", ["ON"]),
           "PR": ("prairies", "Prairies", ["MB", "SK"]), "AB": ("alberta", "Alberta", ["AB"]), "BC": ("cb", "Colombie-Britannique", ["BC"])}
def serie_lab(page, nom):
    i = page.index(f"window.{nom}")
    zone = page[page.index("parties", i): page.index("</script>", i)]
    out = {}
    for b in re.split(r"\bkey\s*:", zone)[1:]:
        k = re.search(r"label\s*:\s*'([^']+)'", b)[1]
        out[k] = {c: derniers(b, c) for c in ("values", "moe", "uppermoe", "lowermoe") if derniers(b, c) is not None}
    return out
regions = {}
for code, (page_reg, nom, provs) in REGIONS.items():
    pg = get(f"https://qc125.com/canada/{page_reg}.htm")
    v, st = serie_lab(pg, "regionvote_DATA"), serie_lab(pg, "regionseats_DATA")
    regions[code] = {"nom": nom, "provs": provs, "parts": {p: {"v": round(v[p]["values"], 1), "moe": round(v[p].get("moe", 0), 1), "s": round(st[p]["values"]) if p in st else 0,
                     "smin": round(st[p].get("lowermoe", 0)) if p in st else 0, "smax": round(st[p].get("uppermoe", 0)) if p in st else 0}
                     for p in PARTIS if p in v and v[p]["values"] >= 0.05}}
    if "--cache" not in sys.argv: time.sleep(0.4)
if not 330 <= sum(x["s"] for r in regions.values() for x in r["parts"].values()) <= 343: raise SystemExit(f"Sièges régionaux illisibles : {regions}")

# député actuel (carte de Qc125)
carte = get("https://qc125.com/canada/carte.htm")
act = {}
for m in re.finditer(r'"deputes_f":\'Député\(e\) : ([^\']*)\',.*?"party_f":\'([^\']*)\'.*?"FED_NUM":(\d+)', carte, flags=re.S):
    nom, parti, num = html.unescape(m[1]).strip(), html.unescape(m[2]).strip(), m[3]
    if num in act: continue
    if nom.lower() == "vacant" or not parti: act[num] = None; continue
    base = re.match(r"([^\[]+)", parti)[1].strip()
    note = re.search(r"\[(.*)\]", parti)
    act[num] = {"nom": nom, "p": PARTI_ACT.get(base, "AUT"), "note": note[1] if note else ""}
if len(act) != 343: raise SystemExit(f"{len(act)} députés lus sur la carte (343 attendus)")

# fiches de circonscription : tableau « Historique récent » (colonnes 2019, 2021, 2025, Projection)
liste = get("https://qc125.com/canada/districts.htm")
liens = list(dict.fromkeys(re.findall(r"href='https://qc125.com/canada/(\d{5})f\.htm'", liste)))
if len(liens) != 343: raise SystemExit(f"{len(liens)} circonscriptions dans la liste (343 attendues)")
circ, erreurs = {}, []
for num in liens:
    page = get(f"https://qc125.com/canada/{num}f.htm")
    i = page.find("<svg id='ridinghisto")
    svg = page[i: page.find("</svg>", i)]
    cols = {}
    for x, y, t in re.findall(r"<text x='([\d.]+)' y='([\d.]+)'[^>]*>([^<]*)</text>", svg):
        cols.setdefault(float(y), {})[float(x)] = html.unescape(t).strip()
    xs = sorted({x for r in cols.values() for x in r})          # étiquette, 2019, 2021, 2025, projection
    tete = cols[min(cols)]
    ann = {x: t for x, t in tete.items()}
    x25 = next((x for x, t in ann.items() if t == "2025"), None)
    xproj = next((x for x, t in ann.items() if t == "Projection"), None)
    s, e25 = {}, {}
    for y, r in cols.items():
        lab = r.get(min(xs))
        if lab not in PARTIS + ["IND"]: continue          # IND : candidat indépendant
        mp = re.match(r"(\d+)% ± (\d+)%", r.get(xproj, ""))
        if mp: s[lab] = [int(mp[1]), int(mp[2])]
        m5 = re.match(r"([\d,]+)%", r.get(x25, ""))
        if m5: e25[lab] = float(m5[1].replace(",", "."))
    if not 90 <= sum(v[0] for v in s.values()) <= 110 or not 90 <= sum(e25.values()) <= 101: erreurs.append(f"{num} {s} {e25}")
    circ[num] = {"s": dict(sorted(s.items(), key=lambda kv: -kv[1][0])), "e25": dict(sorted(e25.items(), key=lambda kv: -kv[1])), "act": act[num]}
    if "--cache" not in sys.argv: time.sleep(0.4)
if erreurs: raise SystemExit("Fiches Qc125 illisibles, projection.json inchangé :\n" + "\n".join(erreurs[:20]))
json.dump({"source": "Qc125 (qc125.com/canada)", "maj": maj, "national": national, "regions": regions, "circ": circ},
          open(SORTIE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
g25 = {}
for c in circ.values(): k = next(iter(c["e25"])); g25[k] = g25.get(k, 0) + 1
print(f"Projection Qc125 du {maj['texte']} · sièges {({p: x['s'] for p, x in national.items()})} · gagnants 2025 {g25}")
