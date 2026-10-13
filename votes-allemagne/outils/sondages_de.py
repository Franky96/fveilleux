"""Votes Allemagne : données qui bougent → ../sondages.json, ../projection.json et ../bundestag.json

  - sondages : « Sonntagsfrage » (secondes voix, Zweitstimme) de tous les instituts compilés par wahlrecht.de
    (Allensbach, Verian, Forsa, Forschungsgruppe Wahlen, GMS, Infratest dimap, INSA, YouGov, Ipsos et « autres
    instituts »), depuis l'élection du 23 février 2025 ;
  - projection des sièges « si l'élection avait lieu aujourd'hui » : simulation faite par le site (pas celle d'un institut)
    à partir de la moyenne récente des sondages, selon la loi électorale de 2023 (630 sièges, Sainte-Laguë, seuil de 5 %,
    clause des trois circonscriptions, partis des minorités, couverture des circonscriptions par les secondes voix) ;
  - Bundestag actuel : groupe et Land de chaque député en exercice (bundestag.de, plan des sièges).
Seulement la bibliothèque standard : relancé par le pipeline aux 3 heures. Rien n'est écrit pour une source illisible.
Le résultat de 2025 (resultats-2025.json, fichier fixe) vient de allemagne_geo.py.
Usage : python3 sondages_de.py   (dans le dossier outils/)
"""
import datetime, html, json, os, re, sys, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
DOSSIER = os.path.join(ICI, "..")
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "de-DE,de;q=0.9"}
DEPUIS = "2025-02-23"
SIEGES = 630


def verifie(page):
    """Date et heure de la vérification (heure de Montréal) dans /votes-verif.json : affichée sur la page même si rien n'a changé."""
    import datetime, json as _j, os as _o, zoneinfo
    f = _o.path.join(_o.path.dirname(_o.path.abspath(__file__)), "..", "..", "votes-verif.json")
    v = _j.load(open(f, encoding="utf-8")) if _o.path.exists(f) else {}
    h = datetime.datetime.now(zoneinfo.ZoneInfo("America/Montreal")); a = h.date()
    m = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    v[page] = {"date": a.isoformat(), "heure": h.strftime("%H:%M"), "texte": f"{a.day} {m[a.month - 1]} {a.year} à {h.hour} h {h.minute:02d}"}
    _j.dump(dict(sorted(v.items())), open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read().decode(r.headers.get_content_charset() or "utf-8", "ignore")


def ecrire(nom, obj):
    json.dump(obj, open(os.path.join(DOSSIER, nom), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


R25 = json.load(open(os.path.join(DOSSIER, "resultats-2025.json"), encoding="utf-8"))
UNION25 = R25["z"]["CDU"] + R25["z"]["CSU"]
erreurs = []

# ======================= 1. sondages (wahlrecht.de) =======================
INSTITUTS = {"allensbach": "Allensbach", "emnid": "Verian", "forsa": "Forsa", "politbarometer": "Forschungsgruppe Wahlen",
             "gms": "GMS", "dimap": "Infratest dimap", "insa": "INSA", "yougov": "YouGov", "ipsos": "Ipsos"}
COL = {"CDU/CSU": "Union", "SPD": "SPD", "GRÜNE": "Grüne", "FDP": "FDP", "LINKE": "Linke", "AfD": "AfD", "FW": "FW", "BSW": "BSW", "Sonstige": "AUT"}
PARTIS = ["Union", "AfD", "SPD", "Grüne", "Linke", "BSW", "FDP", "FW", "AUT"]


def texte(c):
    return html.unescape(re.sub(r"<[^>]+>", " ", c.replace("<br>", " | "))).replace("\xa0", " ").strip()


def pct(c):
    m = re.fullmatch(r"(\d+(?:,\d+)?)\s*%", texte(c))
    return float(m[1].replace(",", ".")) if m else None


def date_iso(s):
    j, m, a = s.split("."); return f"{a}-{m}-{j}"


def fin_terrain(zeitraum, publie):
    """« 29.09.–05.10. » ou « 30.09.–04.10.2026 » → date de fin du terrain (année de la publication, ou la précédente en janvier)"""
    m = re.findall(r"(\d{2})\.(\d{2})\.(\d{4})?", zeitraum)
    if not m: return None
    j, mo, a = m[-1]
    a = a or (str(int(publie[:4]) - 1) if int(mo) > int(publie[5:7]) else publie[:4])
    try: return datetime.date(int(a), int(mo), int(j)).isoformat()
    except ValueError: return None


def lire_tableau(page):
    """lignes du premier tableau de sondages : (en-têtes, [cellules])"""
    tete = re.search(r"<thead[^>]*>(.*?)</thead>", page, re.S)
    corps = re.search(r"<tbody[^>]*>(.*?)(?:</tbody>|</table>)", page, re.S)
    if not tete or not corps: raise ValueError("tableau introuvable")
    entetes = [re.sub(r"\s*/\s*", "/", texte(c)) for c in re.findall(r"<th[^>]*>(.*?)</th>", tete[1], re.S)]
    lignes = [re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S) for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", corps[1], re.S)]
    return entetes, lignes


def sondages_institut(cle, nom):
    entetes, lignes = lire_tableau(get(f"https://www.wahlrecht.de/umfragen/{cle}.htm"))
    idx = {COL[h]: i for i, h in enumerate(entetes) if h in COL}
    i_bef = next(i for i, h in enumerate(entetes) if h.startswith("Befragte"))
    i_zr = next(i for i, h in enumerate(entetes) if h.startswith("Zeitraum"))
    if not {"Union", "SPD", "AfD", "Grüne"} <= set(idx): raise ValueError(f"colonnes inattendues : {entetes}")
    out = []
    for cs in lignes:
        if len(cs) != len(entetes) or not re.fullmatch(r"\d{2}\.\d{2}\.\d{4}", texte(cs[0])): continue
        publie = date_iso(texte(cs[0]))
        if publie <= DEPUIS: break                         # ligne de l'élection et sondages plus anciens
        v = {p: pct(cs[i]) for p, i in idx.items()}
        if v["Union"] is None or v["AfD"] is None: continue
        n = re.findall(r"\d{1,3}(?:\.\d{3})+|\d{3,}", texte(cs[i_bef]))
        out.append({"d": fin_terrain(texte(cs[i_zr]), publie) or publie, "pub": publie, "f": nom,
                    "n": int(n[-1].replace(".", "")) if n else None, **{p: v.get(p) for p in PARTIS}})
    return out


def sondages_autres():
    """« weitere Umfragen » : institut et terrain dans des colonnes à part ; BSW et FW dans la cellule « Sonstige »"""
    entetes, lignes = lire_tableau(get("https://www.wahlrecht.de/umfragen/weitere-umfragen.htm"))
    idx = {COL[h]: i for i, h in enumerate(entetes) if h in COL}
    i_inst, i_bef, i_dat = entetes.index("Institut"), entetes.index("Befragte"), entetes.index("Datum")
    out = []
    for cs in lignes:
        if len(cs) != len(entetes) or not re.fullmatch(r"\d{2}\.\d{2}\.\d{4}", texte(cs[i_dat])): continue
        publie = date_iso(texte(cs[i_dat]))
        if publie <= DEPUIS: continue
        v = {p: pct(cs[i]) for p, i in idx.items() if p != "AUT"}
        son = texte(cs[idx["AUT"]])
        for p, mot in (("BSW", "BSW"), ("FW", "FW"), ("AUT", "Sonst")):
            m = re.search(mot + r"\.?\s*(\d+(?:,\d+)?)\s*%", son)
            v[p] = float(m[1].replace(",", ".")) if m else None
        if v.get("AUT") is None: v["AUT"] = pct(cs[idx["AUT"]])
        if v.get("Union") is None or v.get("AfD") is None: continue
        bef = texte(cs[i_bef]); n = re.findall(r"\d{1,3}(?:\.\d{3})+|\d{3,}", bef.split("|")[0])
        out.append({"d": fin_terrain(bef.split("|")[-1], publie) or publie, "pub": publie, "f": texte(cs[i_inst]),
                    "n": int(n[-1].replace(".", "")) if n else None, **{p: v.get(p) for p in PARTIS}})
    return out


sondages, lus = [], 0
for cle, nom in INSTITUTS.items():
    try:
        s = sondages_institut(cle, nom); sondages += s; lus += 1
        print(f"  {nom:26} {len(s):4} sondages")
    except Exception as e:
        print(f"  {nom:26} illisible : {e}")
try:
    s = sondages_autres(); sondages += s; print(f"  {'autres instituts':26} {len(s):4} sondages")
except Exception as e:
    print(f"  autres instituts           illisible : {e}")
vus, uniques = set(), []
for s in sorted(sondages, key=lambda s: (s["d"], s["f"])):
    k = (s["f"], s["pub"])
    if k in vus: continue
    vus.add(k)
    if not 90 <= sum(s[p] or 0 for p in PARTIS) <= 102: continue    # ligne mal lue
    uniques.append(s)
sondages = uniques
SOND_OK = lus >= 6 and len(sondages) >= 40
if not SOND_OK:
    erreurs.append(f"sondages : seulement {lus} instituts et {len(sondages)} sondages lus, sondages.json et projection.json inchangés")
else:
    election = {"d": DEPUIS, "f": "Élection fédérale", "e": True, "Union": round(UNION25, 2),
                **{p: R25["z"].get(p) for p in ("AfD", "SPD", "Grüne", "Linke", "BSW", "FDP", "FW")}, "AUT": None}
    election["AUT"] = round(100 - sum(election[p] for p in PARTIS if p != "AUT"), 2)
    ecrire("sondages.json", {"source": "wahlrecht.de (Sonntagsfrage, tous les instituts)", "maj": datetime.date.today().isoformat(),
                             "sondages": [election] + sondages})
    print(f"{len(sondages)} sondages depuis le {DEPUIS} · dernier : {sondages[-1]['d']} {sondages[-1]['f']}")


# ======================= 2. projection des sièges (simulation du site) =======================
def sainte_lague(voix, n):
    """méthode du diviseur avec arrondi standard (Sainte-Laguë/Schepers) : plus forts quotients voix / (s + 0,5)"""
    s = {p: 0 for p in voix if voix[p] > 0}
    for _ in range(n):
        p = max(s, key=lambda k: (voix[k] / (s[k] + 0.5), voix[k]))
        s[p] += 1
    return s


def repartir(national, par_land, e_circ, qualifies):
    """Oberverteilung (630 sièges entre les partis), Unterverteilung (sièges de chaque parti entre ses listes de Land),
    puis couverture : dans chaque Land, les vainqueurs de la 1re voix d'un parti, classés selon leur pourcentage,
    prennent les sièges du parti dans ce Land tant qu'il en reste ; les autres circonscriptions restent sans élu."""
    sieges = sainte_lague({p: v for p, v in national.items() if p in qualifies}, SIEGES)
    s_land = {L: {} for L in par_land}
    for p, n in sieges.items():
        for L, k in sainte_lague({L: par_land[L].get(p, 0) for L in par_land}, n).items():
            if k: s_land[L][p] = k
    siege_circ = {}
    for L in par_land:
        for p in {c["g"] for c in e_circ if c["r"] == L}:
            gagnes = sorted((c for c in e_circ if c["r"] == L and c["g"] == p), key=lambda c: -c["pct"])
            for i, c in enumerate(gagnes): siege_circ[c["id"]] = p in sieges and i < s_land[L].get(p, 0)
    return sieges, s_land, siege_circ


LAND_DE = {c["id"]: None for c in R25["circ"]}
DATA = json.load(open(os.path.join(DOSSIER, "data.json"), encoding="utf-8"))
for r in DATA["ridings"]: LAND_DE[r["id"]] = r["r"]
# vérification de la méthode : appliquée au résultat de 2025, elle doit redonner les sièges officiels
qual25 = {p for p, v in R25["z"].items() if v >= 5} | {"SSW"}
s25, l25, c25 = repartir(R25["voix_z"], {L: x["voix_z"] for L, x in R25["lands"].items()},
                         [{"id": c["id"], "r": LAND_DE[c["id"]], "g": c["g"], "pct": c["e"][c["g"]]} for c in R25["circ"]], qual25)
assert s25 == R25["sieges"], f"méthode : {s25} ≠ {R25['sieges']}"
assert all(l25[L] == x["sieges"] for L, x in R25["lands"].items()), "méthode : sièges par Land différents du résultat officiel"
assert all(c25[c["id"]] == c["siege"] for c in R25["circ"]), "méthode : circonscriptions sans siège différentes du résultat officiel"


def balancer(parts, ecart):
    """écart uniforme : chaque parti sondé gagne ou perd le même nombre de points partout (jamais sous 0), puis total ramené à 100"""
    nv = {}
    for k, v in parts.items():
        cle = "Union" if k in ("CDU", "CSU") else k
        nv[k] = max(0.0, v + ecart[cle]) if cle in ecart else v
    t = sum(nv.values()) or 1
    return {k: round(100 * v / t, 1) for k, v in sorted(nv.items(), key=lambda x: -x[1]) if v > 0}


if SOND_OK:
    # moyenne récente : le dernier sondage de chaque institut terminé dans les 30 jours précédant le plus récent
    fin = max(s["d"] for s in sondages)
    for jours in (30, 45, 60):
        debut = (datetime.date.fromisoformat(fin) - datetime.timedelta(days=jours)).isoformat()
        dernier = {}
        for s in sondages:
            if s["d"] >= debut: dernier[s["f"]] = s
        if len(dernier) >= 5: break
    retenus = sorted(dernier.values(), key=lambda s: s["d"])
    moy = {}
    for p in PARTIS:
        vals = [s[p] for s in retenus if s[p] is not None]
        if p == "FW" and len(vals) < len(retenus) / 2: continue      # FW rarement publié à part : reste dans « autres »
        if vals: moy[p] = round(sum(vals) / len(vals), 2)
    ecart = {p: moy[p] - (UNION25 if p == "Union" else R25["z"].get(p, 0)) for p in moy if p != "AUT"}
    # secondes voix nationales : CDU et CSU séparées selon leur rapport de 2025 (la CSU ne se présente qu'en Bavière) ;
    # SSW (parti de la minorité danoise, exempté du seuil) : son score de 2025
    nat = {"CDU": moy["Union"] * R25["z"]["CDU"] / UNION25, "CSU": moy["Union"] * R25["z"]["CSU"] / UNION25,
           **{p: moy[p] for p in moy if p not in ("Union", "AUT")}, "SSW": R25["z"]["SSW"]}
    # circonscriptions : écart uniforme sur les résultats de 2025 (1re et 2e voix)
    circ = []
    for c in R25["circ"]:
        e, z = balancer(c["e"], ecart), balancer(c["z"], ecart)
        g = max(e, key=e.get)
        o = sorted(e.values(), reverse=True)
        circ.append({"id": c["id"], "r": LAND_DE[c["id"]], "g": g, "pct": e[g], "marge": round(o[0] - o[1], 1), "e": e, "z": z})
    # clause des trois circonscriptions : un parti sous 5 % qui gagnerait au moins trois circonscriptions entre quand même
    gagnes = {}
    for c in circ: gagnes[c["g"]] = gagnes.get(c["g"], 0) + 1
    seuil = {p for p, v in nat.items() if v >= 5}
    clause = {p for p, n in gagnes.items() if n >= 3 and p not in seuil and p in nat}
    qualifies = seuil | clause | {"SSW"}
    # Länder : écart uniforme sur les secondes voix de 2025 du Land, puis voix = part × suffrages valides de 2025
    lands = {L: balancer(x["z"], ecart) for L, x in R25["lands"].items()}
    voix_land = {L: {p: v * sum(R25["lands"][L]["voix_z"].values()) / 100 for p, v in lands[L].items()} for L in lands}
    sieges, s_land, siege_circ = repartir(nat, voix_land, circ, qualifies)
    union = {"v": round(moy["Union"], 1), "s": sieges.get("CDU", 0) + sieges.get("CSU", 0)}
    proj = {
        "maj": {"date": datetime.date.today().isoformat(), "dernier": fin, "debut": debut},
        "methode": "Simulation du site : moyenne des derniers sondages, Sainte-Laguë, loi électorale de 2023",
        "moyenne": {"v": {p: round(v, 1) for p, v in moy.items()}, "sondages": [{"f": s["f"], "d": s["d"]} for s in retenus]},
        "ecart": {p: round(v, 2) for p, v in ecart.items()},
        "national": {p: {"v": round(nat[p], 1), "s": sieges.get(p, 0)} for p in sorted(nat, key=lambda k: (-sieges.get(k, 0), -nat[k]))},
        "union": union, "seuil": sorted(seuil), "clause": sorted(clause),
        "sieges_land": s_land, "lands": lands,
        "circ": [{"id": c["id"], "g": c["g"], "siege": siege_circ[c["id"]], "marge": c["marge"], "e": c["e"], "z": c["z"]} for c in circ],
    }
    assert sum(sieges.values()) == SIEGES
    ecrire("projection.json", proj)
    print(f"projection ({len(retenus)} instituts, {debut} → {fin}) : " + " · ".join(f"{p} {x['s']}" for p, x in proj["national"].items() if x["s"])
          + f" · {sum(not v for v in siege_circ.values())} circonscriptions sans siège" + (f" · clause des trois circonscriptions : {clause}" if clause else ""))


# ======================= 3. Bundestag actuel (bundestag.de) =======================
GROUPE = {"CDU/CSU": "Union", "AfD": "AfD", "SPD": "SPD", "Bündnis 90/Die Grünen": "Grüne", "Die Linke": "Linke", "fraktionslos": "FL"}
ABK = {"Baden-Württemberg": "BW", "Bayern": "BY", "Berlin": "BE", "Brandenburg": "BB", "Bremen": "HB", "Hamburg": "HH", "Hessen": "HE",
       "Mecklenburg-Vorpommern": "MV", "Niedersachsen": "NI", "Nordrhein-Westfalen": "NW", "Rheinland-Pfalz": "RP", "Saarland": "SL",
       "Sachsen": "SN", "Sachsen-Anhalt": "ST", "Schleswig-Holstein": "SH", "Thüringen": "TH"}
try:
    plan = json.loads(get("https://www.bundestag.de/static/appdata/sitzplan/data.json"))
    membres = [m for k, m in plan.items() if k != "-1" and isinstance(m, dict) and m.get("name")]
    groupes, lands, fl = {}, {L: {} for L in ABK.values()}, []
    for m in membres:
        g = GROUPE.get(m.get("party"))
        if not g: raise ValueError(f"groupe inconnu : {m.get('party')}")
        groupes[g] = groupes.get(g, 0) + 1
        L = ABK.get(m.get("federalState"))
        if L: lands[L][g] = lands[L].get(g, 0) + 1
        if g == "FL": fl.append({"nom": m["name"], "land": L})
    total = sum(groupes.values())
    if not 600 <= total <= SIEGES or len(groupes) < 5: raise ValueError(f"{total} députés, {len(groupes)} groupes")
    ecrire("bundestag.json", {"date": datetime.date.today().isoformat(), "source": "bundestag.de (Sitzverteilung des 21. Deutschen Bundestages)",
                              "groupes": dict(sorted(groupes.items(), key=lambda x: -x[1])), "vacants": SIEGES - total, "lands": lands,
                              "fraktionslos": sorted(fl, key=lambda x: x["nom"])})
    print("Bundestag actuel : " + " · ".join(f"{g} {n}" for g, n in sorted(groupes.items(), key=lambda x: -x[1])))
except Exception as e:
    erreurs.append(f"Bundestag actuel illisible ({e}) : bundestag.json inchangé")

if SOND_OK: verifie("allemagne")
for e in erreurs: print("::warning::" + e)
sys.exit(1 if erreurs else 0)
