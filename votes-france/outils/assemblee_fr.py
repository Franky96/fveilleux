"""Composition actuelle de l'Assemblée nationale (données ouvertes de l'Assemblée, députés en exercice) → ../assemblee.json

Petit fichier à part (data.json, 4 Mo, ne change pas) :
  - groupes parlementaires (sigle, nom, couleur officielle, nombre de députés), sièges vacants, date des données ;
  - « act » : pour chaque circonscription, député actuel et son groupe (absente = siège vacant).
Seulement la bibliothèque standard : relancé par le pipeline aux 3 heures (élections partielles, changements de groupe).
Usage : /usr/bin/python3 assemblee_fr.py   (dans le dossier outils/)
"""
import io, json, os, urllib.request, zipfile, datetime


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
URL = "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes.json.zip"
OUTREMER = {"971": "ZA", "972": "ZB", "973": "ZC", "974": "ZD", "975": "ZS", "976": "ZM", "977": "ZX", "986": "ZW", "987": "ZP", "988": "ZN", "099": "ZZ", "99": "ZZ"}
# ordre de l'hémicycle, de gauche à droite (non-inscrits à la fin)
ORDRE = ["LFI-NFP", "GDR", "ECOS", "SOC", "LIOT", "DEM", "EPR", "HOR", "DR", "UDDPLR", "UDR", "RN", "NI"]

z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"}), timeout=120).read()))
organes = {}
for n in z.namelist():
    if "/organe/" in n:
        o = json.loads(z.read(n))["organe"]; organes[o["uid"]] = o
data = json.load(open(os.path.join(ICI, "..", "data.json"), encoding="utf-8"))
ids = {c["id"] for c in data["circ"]}
groupes, act = {}, {}
for n in z.namelist():
    if "/acteur/" not in n: continue
    a = json.loads(z.read(n))["acteur"]
    ms = a["mandats"]["mandat"]; ms = ms if isinstance(ms, list) else [ms]
    an = [m for m in ms if m["typeOrgane"] == "ASSEMBLEE" and not m.get("dateFin")]
    gp = [m for m in ms if m["typeOrgane"] == "GP" and not m.get("dateFin")]
    if not an: continue
    lieu = an[0]["election"]["lieu"]
    dep = str(lieu.get("numDepartement") or "")
    dep = OUTREMER.get(dep, dep.zfill(2) if dep.isdigit() else dep)
    cid = dep + f"{int(lieu.get('numCirco') or 0):02d}"
    g = organes.get(gp[0]["organes"]["organeRef"]) if gp else None
    sigle = g["libelleAbrev"] if g else "NI"
    groupes.setdefault(sigle, {"id": sigle, "nom": g["libelle"] if g else "Non inscrit", "c": (g or {}).get("couleurAssociee") or "#8D949A", "n": 0})
    groupes[sigle]["n"] += 1
    ident = a["etatCivil"]["ident"]
    if cid in ids: act[cid] = {"nom": f"{ident['prenom']} {ident['nom']}", "gp": sigle}
total = sum(g["n"] for g in groupes.values())
if total < 500: raise SystemExit(f"Seulement {total} députés lus : assemblee.json inchangé.")
ordre = sorted(groupes.values(), key=lambda g: ORDRE.index(g["id"]) if g["id"] in ORDRE else len(ORDRE))
date = max(datetime.datetime(*i.date_time) for i in z.infolist()).date().isoformat()
json.dump({"date": date, "groupes": ordre, "vacants": 577 - total, "act": dict(sorted(act.items()))},
          open(os.path.join(ICI, "..", "assemblee.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{total} députés en exercice · {577 - total} sièges vacants · données du {date} · " + ", ".join(f"{g['id']} {g['n']}" for g in ordre))
verifie("france")
