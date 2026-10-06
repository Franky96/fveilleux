"""Votes États-Unis : données qui bougent → ../projection.json et ../sondages.json

  - cote de chaque district de 2026 : consensus de 270toWin (7 prévisionnistes : Cook, Sabato, Inside Elections…),
    avec le représentant sortant et les candidats de l'élection générale ;
  - Sénat : cote de chaque course de 2026 (consensus de 270toWin), sénateurs actuels et candidats ;
  - Chambre actuelle : membres en exercice selon le Clerk de la Chambre (MemberData.xml), sièges vacants compris ;
  - vote générique (démocrate ou républicain au Congrès) : moyenne quotidienne et liste des sondages de Silver Bulletin
    (graphiques Datawrapper publics).
Seulement la bibliothèque standard : relancé par le pipeline aux 3 heures. Rien n'est écrit si une source est illisible.
Usage : /usr/bin/python3 usa.py   (dans le dossier outils/)
"""
import csv, html, io, json, os, re, urllib.request, datetime


def verifie(page):
    """Date de la vérification (heure de Montréal) dans /votes-verif.json : affichée sur la page même si rien n'a changé."""
    import datetime, json as _j, os as _o, zoneinfo
    f = _o.path.join(_o.path.dirname(_o.path.abspath(__file__)), "..", "..", "votes-verif.json")
    v = _j.load(open(f, encoding="utf-8")) if _o.path.exists(f) else {}
    a = datetime.datetime.now(zoneinfo.ZoneInfo("America/Montreal")).date()
    m = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    v[page] = {"date": a.isoformat(), "texte": f"{a.day} {m[a.month - 1]} {a.year}"}
    _j.dump(dict(sorted(v.items())), open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

ICI = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}
DATA = json.load(open(os.path.join(ICI, "..", "data.json"), encoding="utf-8"))
FIPS_DE = {e["ab"]: e["fips"] for e in DATA["etats"]}
# code de 270toWin → cote : 0 égalité, 1/2 sûr D/R, 3/4 probable, 5/6 penché, a/b léger (tilt)
COTE = {"0": "T", "1": "D3", "2": "R3", "3": "D2", "4": "R2", "5": "D1", "6": "R1", "a": "D1", "b": "R1"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
        return r.read().decode("utf-8", "ignore")


def objet_js(page, cle):
    i = page.index(cle); return json.JSONDecoder().raw_decode(page[page.index("=", i) + 1:].lstrip())[0]


# --- consensus de 270toWin
page = get("https://www.270towin.com/2026-house-election/consensus-2026-house-forecast")
chaine = re.search(r"new HouseMultiDistrictsMap\('(\w{435})'", page)[1]
ordre = objet_js(page, "map_d3.state_order =")
sieges = objet_js(page, "map_d3.seats =")
m = re.search(r"map_d3\.date_created_formatted = '([A-Z][a-z]+)\. (\d+), (\d{4})", page) or re.search(r"map_d3\.date_created_formatted = '([A-Z][a-z]+) (\d+), (\d{4})", page)
MOIS = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "June": 6, "Jul": 7, "July": 7, "Aug": 8, "Sep": 9, "Sept": 9, "Oct": 10, "Nov": 11, "Dec": 12}
maj = f"{m[3]}-{MOIS[m[1]]:02d}-{int(m[2]):02d}" if m else datetime.date.today().isoformat()
if len(ordre) != 435: raise SystemExit("Ordre des districts de 270toWin illisible : projection.json inchangé.")
circ = {}
for code, did in zip(chaine, ordre):
    gid = did[:2] + ("00" if did[2:] == "00" else did[2:])
    s = (sieges.get(did) or [{}])[0]
    cands = [{"nom": c.get("full_name") or "", "p": c.get("party") or "", "inc": int(c.get("is_incumbent") or 0)}
             for c in s.get("candidates") or [] if str(c.get("general_election_active")) == "2"]
    num = lambda x: float(x) if x not in (None, "") else None
    circ[gid] = {"r": COTE.get(code, "N"), "held": s.get("seat_party") or "", "rep": (s.get("seat_rep_name") or "").strip(),
                 "ret": bool(s.get("retired_code")), "mc": num(s.get("margin_congress")), "mp": num(s.get("margin_president")),
                 "cands": sorted(cands, key=lambda c: (c["p"] not in ("D", "R"), c["p"]))}
ids = {d["id"] for d in DATA["districts"]}
if set(circ) != ids: raise SystemExit(f"Districts de 270toWin ≠ data.json ({len(set(circ) ^ ids)} différences) : projection.json inchangé.")

# --- Chambre actuelle (Clerk)
xml = get("https://clerk.house.gov/xml/lists/MemberData.xml")
pub = re.search(r'publish-date="([^"]+)"', xml)
act = {}
for mbr in re.findall(r"<member>(.*?)</member>", xml, re.S):
    sd = re.search(r"<statedistrict>([A-Z]{2})(\d{2})</statedistrict>", mbr)
    if not sd or sd[1] not in FIPS_DE: continue                # délégués (DC, Porto Rico…)
    gid = FIPS_DE[sd[1]] + sd[2]
    nom = re.search(r"<official-name>([^<]*)</official-name>", mbr)
    p = re.search(r"<caucus>([^<]*)</caucus>", mbr) or re.search(r"<party>([^<]*)</party>", mbr)
    act[gid] = {"nom": html.unescape(nom[1]), "p": p[1]} if nom and p and p[1] else None
if len(act) != 435: raise SystemExit(f"{len(act)} sièges lus chez le Clerk (435 attendus) : projection.json inchangé.")

mc = re.match(r"([A-Z][a-z]+)\.? (\d+), (\d{4})", pub[1]) if pub else None
clerk = f"{mc[3]}-{MOIS[mc[1][:3]]:02d}-{int(mc[2]):02d}" if mc and mc[1][:3] in MOIS else ""
# --- Sénat : consensus de 270toWin (deux chiffres par État, un par siège ; 9 = pas d'élection), sénateurs actuels, candidats
ps = get("https://www.270towin.com/2026-senate-election/consensus-2026-senate-forecast")
chs = re.search(r"new SenateMap\('(\w{101,})'", ps)[1]
ordre_s = ["02", "01", "05", "04", "06", "08", "09", "10", "12", "13", "15", "19", "16", "17", "18", "20", "21", "22", "25", "24", "23", "26", "27", "29", "28",
           "30", "37", "38", "31", "33", "34", "35", "32", "36", "39", "40", "41", "42", "44", "45", "46", "47", "48", "49", "51", "50", "53", "55", "54", "56"]   # map.senate.class.js
ssieges = objet_js(ps, "map_d3.seats =")
ms = re.search(r"map_d3\.date_created_formatted = '([A-Z][a-z]+)\.? (\d+), (\d{4})", ps)
senat = {"maj": f"{ms[3]}-{MOIS[ms[1][:3]]:02d}-{int(ms[2]):02d}" if ms else maj, "etats": {}}
for i, f in enumerate(ordre_s):
    codes = chs[2 * i: 2 * i + 2]
    e = {"senateurs": [], "courses": []}
    for num in ("1", "2"):
        st = (ssieges.get(f) or {}).get(num) or {}
        e["senateurs"].append({"nom": (st.get("seat_rep_name") or "").strip(), "p": st.get("seat_party") or "", "fin": st.get("seat_rep_elected")})
        code = codes[int(num) - 1]
        if code != "9":
            cands = [{"nom": c.get("full_name") or "", "p": c.get("party") or "", "inc": int(c.get("is_incumbent") or 0)}
                     for c in st.get("candidates") or [] if str(c.get("general_election_active")) == "2"]
            e["courses"].append({"r": COTE.get(code, "N"), "siege": int(num), "special": bool(st.get("special_election")), "held": st.get("seat_party") or "",
                                 "ret": bool(st.get("retired_notes")), "cands": sorted(cands, key=lambda c: (c["p"] not in ("D", "R"), c["p"]))})
    senat["etats"][f] = e
nc = sum(len(e["courses"]) for e in senat["etats"].values())
if not 33 <= nc <= 37 or sum(len(e["senateurs"]) for e in senat["etats"].values()) != 100:
    raise SystemExit(f"Sénat illisible ({nc} courses) : projection.json inchangé.")
json.dump({"source": "Consensus de 270toWin (Cook Political Report, Sabato's Crystal Ball, Inside Elections, etc.)", "maj": maj,
           "clerk": clerk, "circ": circ, "actuel": act, "senat": senat},
          open(os.path.join(ICI, "..", "projection.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
compte = {}
for c in circ.values(): compte[c["r"]] = compte.get(c["r"], 0) + 1
print(f"Sénat : {nc} courses, consensus du {senat['maj']} : " + str({k: sum(1 for e in senat['etats'].values() for c in e['courses'] if c['r'] == k) for k in COTE.values()}))
print(f"Consensus du {maj} : {dict(sorted(compte.items()))} · Clerk ({pub[1] if pub else '?'}) : "
      + str({k: sum(1 for a in act.values() if (a or {}).get('p', 'VAC') == k) for k in ('R', 'D', 'I', 'VAC')}))

# --- vote générique (Silver Bulletin, Datawrapper)
def datawrapper(cle):
    v = re.search(cle + r"/(\d+)", get(f"https://datawrapper.dwcdn.net/{cle}/"))[0]
    return list(csv.DictReader(io.StringIO(get(f"https://datawrapper.dwcdn.net/{v}/dataset.csv"))))
def date_us(t):
    mo, j, a = t.split("/"); return f"{a}-{int(mo):02d}-{int(j):02d}"
moy = [{"d": date_us(r["modeldate"]), "D": round(float(r["dem"]), 2), "R": round(float(r["rep"]), 2)} for r in datawrapper("rfiFi")]
sondages = []
for r in datawrapper("sEHv2"):
    dates = r["Dates"].split("@@")[0]                         # « 9/8 - 9/13, 2026 » : date de fin
    m = re.match(r"(\d+)/(\d+)(?:\s*-\s*(?:(\d+)/)?(\d+))?,\s*(\d{4})", dates)
    if not m: continue
    mo_fin = int(m[3] or m[1]); j_fin = int(m[4] or m[2])
    firme = html.unescape(re.sub(r"<[^>]+>", "", r["Pollster"])).strip()
    try: sondages.append({"d": f"{m[5]}-{mo_fin:02d}-{j_fin:02d}", "f": firme, "n": r["Sample"].split("@@")[0], "D": float(r["Democrats"]), "R": float(r["Republicans"])})
    except ValueError: pass
sondages.sort(key=lambda x: x["d"]); moy.sort(key=lambda x: x["d"])
if len(sondages) < 100 or len(moy) < 100: raise SystemExit(f"Sondages illisibles ({len(sondages)}, moyenne {len(moy)}) : sondages.json inchangé.")
json.dump({"source": "Silver Bulletin (moyenne du vote générique et liste des sondages)", "moyenne": moy, "sondages": sondages},
          open(os.path.join(ICI, "..", "sondages.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(sondages)} sondages du {sondages[0]['d']} au {sondages[-1]['d']} · moyenne au {moy[-1]['d']} : D {moy[-1]['D']} R {moy[-1]['R']}")
verifie("usa")
