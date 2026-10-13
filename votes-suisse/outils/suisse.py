"""Votes Suisse : sondages, projection du Conseil national et élus actuels → ../sondages.json, ../projection.json, ../actuel.json

Lancé par le pipeline aux 3 heures (bibliothèque standard seulement). Chaque source est indépendante : si l'une est
illisible ou douteuse, son fichier reste tel quel (et le script se termine en erreur pour le signaler).

  sondages.json   sondages nationaux depuis l'élection du 22 octobre 2023, tableau « Sondages électoraux » de la page
                  Wikipédia « Élections fédérales suisses de 2027 » (YouGov, Sotomo pour la SSR, LeeWas pour Tamedia et
                  20 minutes…) ; l'élection de 2023 est gardée comme repère.
  projection.json simulation du site : « si l'élection avait lieu aujourd'hui ». Moyenne des sondages (le dernier de chaque
                  institut, sur les 12 mois qui précèdent le plus récent) ; écart proportionnel de chaque parti par rapport
                  à 2023 appliqué aux suffrages de chacune de ses listes de 2023, dans chaque canton ; puis répartition des
                  sièges de 2027 de chaque canton comme le fait la loi (Hagenbach-Bischoff, avec les apparentements et
                  sous-apparentements de 2023). Cantons à un siège : la liste en tête l'emporte. Fourchette : 90 % de
                  1000 simulations (erreur des sondages et écarts propres à chaque canton).
  actuel.json     membres actuels du Conseil national, du Conseil des États et du Conseil fédéral (Services du Parlement,
                  ws.parlament.ch) : parti, groupe parlementaire, canton.

Usage : python3 suisse.py   (dans le dossier outils/)
"""
import datetime, json, math, os, random, re, sys, urllib.parse, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
RAC = os.path.join(ICI, "..")
HDR = {"User-Agent": "fveilleuxBot/1.0 (https://fveilleux.com)"}
WIKI = "https://fr.wikipedia.org/w/index.php?title=%C3%89lections_f%C3%A9d%C3%A9rales_suisses_de_2027&action=raw"
SIX = ["UDC", "PS", "C", "PLR", "VERT", "PVL"]          # partis présents dans tous les sondages
ELECTION = "2023-10-22"


def verifie(page):
    """Date et heure de la vérification (heure de Montréal) dans /votes-verif.json : affichée sur la page même si rien n'a changé."""
    import datetime, json as _j, os as _o, zoneinfo
    f = _o.path.join(_o.path.dirname(_o.path.abspath(__file__)), "..", "..", "votes-verif.json")
    v = _j.load(open(f, encoding="utf-8")) if _o.path.exists(f) else {}
    h = datetime.datetime.now(zoneinfo.ZoneInfo("America/Montreal")); a = h.date()
    m = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    v[page] = {"date": a.isoformat(), "heure": h.strftime("%H:%M"), "texte": f"{a.day} {m[a.month - 1]} {a.year} à {h.hour} h {h.minute:02d}"}
    _j.dump(dict(sorted(v.items())), open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def lire_url(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=90) as r:
        return r.read().decode("utf-8", "replace")


def ecrire(nom, obj):
    json.dump(obj, open(os.path.join(RAC, nom), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


R23 = json.load(open(os.path.join(RAC, "resultats-2023.json"), encoding="utf-8"))
DATA = json.load(open(os.path.join(RAC, "data.json"), encoding="utf-8"))
NAT23 = {p: x["v"] for p, x in R23["national"].items()}
erreurs = []

# ---------- 1. sondages (Wikipédia) ----------
MOIS = {m: i for i, m in enumerate(["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"], 1)}
ABR = {"janv.": 1, "févr.": 2, "mars": 3, "avr.": 4, "mai": 5, "juin": 6, "juil.": 7, "août": 8, "sept.": 9, "oct.": 10, "nov.": 11, "déc.": 12}
ETIQ = {"PS": "PS", "LV": "VERT", "VERTS": "VERT", "PES": "VERT", "PVL": "PVL", "PEV": "PEV", "LC": "C", "CENTRE": "C", "PLR": "PLR",
        "UDC": "UDC", "UDF": "UDF", "AUTRES": "AUT"}


def date_wiki(cel):
    """dernière date de la cellule (fin du terrain ou publication) → AAAA-MM-JJ"""
    t = re.findall(r"\{\{\s*date\s*\|([^}]*)\}\}", cel, re.I)
    s = t[-1] if t else re.sub(r"\{\{[^}]*\}\}", "", cel)
    p = [x.strip() for x in s.replace("|", " ").split()]
    p = [x for x in p if x]
    try:
        if len(p) >= 3 and p[-2].isdigit():                        # 07|06|2024
            return datetime.date(int(p[-1]), int(p[-2]), int(p[-3])).isoformat()
        j, m, a = p[-3], p[-2].lower(), p[-1]
        mois = MOIS.get(m) or ABR.get(m)
        return datetime.date(int(a), mois, int(re.sub(r"\D", "", j))).isoformat()
    except (ValueError, IndexError, TypeError):
        return None


def nombre(cel):
    if re.search(r"N/?A|—|–", cel) and not re.search(r"\d", re.sub(r"\{\{[^}]*\|(UDC|PSS|PES|PVL|PEV|LC|PLR|UDF|blanc)\}\}", "", cel)): return None
    m = re.findall(r"(\d+(?:,\d+)?)\s*%", cel)
    return float(m[-1].replace(",", ".")) if m else None


def sondages_wiki():
    w = lire_url(WIKI)
    w = re.sub(r"<ref[^>]*/>", "", w); w = re.sub(r"<ref[^>]*>.*?</ref>", "", w, flags=re.S); w = re.sub(r"<!--.*?-->", "", w, flags=re.S)
    i = w.find("Sondages électoraux")
    if i < 0: raise ValueError("section « Sondages électoraux » introuvable")
    t = w[w.find("{|", i): w.find("\n|}", i)]
    entete = [l for l in t.split("\n") if l.startswith("!") and "||" not in l]
    lab = []
    for l in entete:
        l = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", l); l = re.sub(r"\[\[([^\]]*)\]\]", r"\1", l)
        lab.append(l.split("|")[-1].strip().replace("'", ""))
    cols = [ETIQ.get(x.upper()) for x in lab[3:]]
    if lab[:2] != ["Institut", "Date"] or not set(SIX) <= set(cols): raise ValueError(f"colonnes inattendues : {lab}")
    out = []
    for bloc in re.split(r"\n\|-[^\n]*", t):
        bloc = bloc.strip()
        if "||" not in bloc: continue
        cel = [c.strip() for c in re.split(r"\|\|", bloc.lstrip("|!").strip())]
        if len(cel) < 3 + len(cols): continue
        inst = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", cel[0]); inst = re.sub(r"\[\[([^\]]*)\]\]|'''|\{\{[^}]*\}\}", lambda m: m.group(1) or "", inst).strip()
        d = date_wiki(cel[1])
        if not d: continue
        n = re.sub(r"\D", "", cel[2]) or None
        v = {p: nombre(c) for p, c in zip(cols, cel[3:3 + len(cols)]) if p}
        if any(v.get(p) is None for p in SIX): continue
        e = "élection" in inst.lower()
        out.append({"d": d, "f": "Élection fédérale" if e else inst, "e": e, "n": int(n) if n else None, **{p: x for p, x in v.items() if x is not None}})
    out.sort(key=lambda s: (s["d"], s["f"]))
    el = [s for s in out if s["e"]]
    if not el or el[0]["d"] != ELECTION or abs(el[0]["UDC"] - 27.93) > 0.1 or abs(el[0]["PS"] - 18.27) > 0.1:
        raise ValueError(f"ligne de l'élection de 2023 introuvable ou colonnes décalées : {el[:1]}")
    son = [s for s in out if not s["e"] and s["d"] > ELECTION]
    if len(son) < 5: raise ValueError(f"seulement {len(son)} sondages lus")
    for s in son:
        tot = sum(s.get(p, 0) for p in SIX) + s.get("PEV", 0) + s.get("UDF", 0) + s.get("AUT", 0)
        if not 95 <= tot <= 105 or not 20 <= s["UDC"] <= 40: raise ValueError(f"sondage douteux : {s}")
    # repère de l'élection : chiffres officiels de l'OFS
    e23 = {"d": ELECTION, "f": "Élection fédérale", "e": True, "n": None, **{p: NAT23[p] for p in SIX},
           "PEV": NAT23.get("PEV"), "UDF": NAT23.get("UDF"), "AUT": round(100 - sum(NAT23[p] for p in SIX) - NAT23.get("PEV", 0) - NAT23.get("UDF", 0), 2)}
    return [e23] + son


try:
    SOND = sondages_wiki()
except Exception as ex:                                       # source illisible : on garde l'ancien fichier
    erreurs.append(f"Sondages : {ex}")
    f = os.path.join(RAC, "sondages.json")
    SOND = json.load(open(f, encoding="utf-8"))["sondages"] if os.path.exists(f) else None
else:
    ecrire("sondages.json", {"source": "Wikipédia, « Élections fédérales suisses de 2027 », tableau des sondages électoraux (avec un lien vers chaque sondage)",
                             "sondages": SOND})
    print(f"{len(SOND) - 1} sondages · dernier : {SOND[-1]['d']} {SOND[-1]['f']} " + " ".join(f"{p} {SOND[-1][p]}" for p in SIX))

# ---------- 2. projection ----------
def dhondt(items, n):
    s = {k: 0 for k, _ in items}; v = dict(items)
    for _ in range(n):
        k = max(s, key=lambda k: (v[k] / (s[k] + 1), v[k])); s[k] += 1
    return s


def repartir(listes, voix, n):
    """même règle que suisse_fixe.py (vérifiée sur les 200 élus de 2023) ; voix : suffrages de chaque liste"""
    if n == 1:
        i = max(range(len(listes)), key=lambda i: voix[i]); return [int(j == i) for j in range(len(listes))]
    grp = {}
    for i, l in enumerate(listes): grp.setdefault(l[1] or ("seule", i), []).append(i)
    sg = dhondt([(k, sum(voix[i] for i in ix)) for k, ix in grp.items()], n)
    out = [0] * len(listes)
    for k, ix in grp.items():
        sous = {}
        for i in ix: sous.setdefault(listes[i][2] or ("seule", i), []).append(i)
        ss = dhondt([(kk, sum(voix[i] for i in x)) for kk, x in sous.items()], sg[k])
        for kk, x in sous.items():
            for i, s in dhondt([(i, voix[i]) for i in x], ss[kk]).items(): out[i] = s
    return out


REST23 = 100 - sum(NAT23[p] for p in SIX)
SIEGES27 = {c["ab"]: c["s27"] for c in DATA["cantons"]}


def simuler(ratio, bruit=None):
    """ratio : {parti: facteur national} (autres partis : ratio["_"]) → sièges et parts par canton"""
    cant, nat = {}, {}
    for ab, c in R23["cantons"].items():
        fac = {p: ratio.get(p, ratio["_"]) * (bruit(ab, p) if bruit else 1) for p in c["p"]}
        voix = [l[3] * fac[l[0]] for l in c["listes"]]
        s = repartir(c["listes"], voix, SIEGES27[ab])
        sp = {}
        for l, k in zip(c["listes"], s):
            if k: sp[l[0]] = sp.get(l[0], 0) + k
        tot = sum(c["p"][p] * fac[p] for p in c["p"])
        cant[ab] = {"s": sp, "p": {p: c["p"][p] * fac[p] * 100 / tot for p in c["p"]}}
        for p, k in sp.items(): nat[p] = nat.get(p, 0) + k
    return cant, nat


def projection():
    son = [s for s in SOND if not s["e"]]
    fin = max(s["d"] for s in son)
    lim = (datetime.date.fromisoformat(fin) - datetime.timedelta(days=365)).isoformat()
    der = {}
    for s in son:                                              # le plus récent de chaque institut
        if s["d"] >= lim and (s["f"] not in der or s["d"] >= der[s["f"]]["d"]): der[s["f"]] = s
    util = sorted(der.values(), key=lambda s: s["d"])
    moy = {p: sum(s[p] for s in util) / len(util) for p in SIX}
    moy["_"] = 100 - sum(moy[p] for p in SIX)
    ratio = {p: moy[p] / NAT23[p] for p in SIX}; ratio["_"] = moy["_"] / REST23
    cant, nat = simuler(ratio)
    if sum(nat.values()) != 200: raise ValueError("répartition incomplète")
    # fourchette : erreur nationale de chaque parti (écart type ≈ 0,4 point + 7 % du score) et écart propre à chaque
    # canton et parti (8 % de son score) ; tirages fixes (graine) pour que le fichier ne change qu'avec les sondages
    alea = random.Random(2027)
    tirs = {p: [] for p in set(nat) | set(SIX)}
    for _ in range(1000):
        m = {p: max(0.3, moy[p] + alea.gauss(0, 0.4 + 0.07 * moy[p])) for p in SIX}
        m["_"] = max(1.0, moy["_"] + alea.gauss(0, 0.4 + 0.07 * moy["_"]))
        r = {p: m[p] / NAT23[p] for p in SIX}; r["_"] = m["_"] / REST23
        b = {}
        _, n = simuler(r, lambda ab, p: b.setdefault((ab, p), math.exp(alea.gauss(0, 0.08))))
        for p in tirs: tirs[p].append(n.get(p, 0))
    def bornes(v):
        v = sorted(v); return v[int(0.05 * len(v))], v[int(0.95 * len(v)) - 1]
    natv = {p: moy[p] for p in SIX}
    # parts nationales des autres partis : leur score de 2023 multiplié par le facteur commun
    for p, x in NAT23.items():
        if p not in SIX: natv[p] = x * ratio["_"]
    national = {}
    for p in sorted(set(nat) | set(SIX), key=lambda p: -nat.get(p, 0)):
        lo, hi = bornes(tirs[p])
        national[p] = {"v": round(natv.get(p, 0), 1), "s": nat.get(p, 0), "smin": lo, "smax": hi}
    return {"maj": fin, "methode": "écart proportionnel par rapport à 2023, appliqué aux listes de chaque canton ; Hagenbach-Bischoff avec les apparentements de 2023 ; sièges de 2027",
            "sondages": [{"d": s["d"], "f": s["f"]} for s in util], "moyenne": {p: round(moy[p], 1) for p in SIX} | {"AUT": round(moy["_"], 1)},
            "national": national,
            "cantons": {ab: {"s": dict(sorted(c["s"].items(), key=lambda kv: -kv[1])), "p": {p: round(v, 1) for p, v in sorted(c["p"].items(), key=lambda kv: -kv[1]) if v >= 0.05}}
                        for ab, c in cant.items()}}


if SOND:
    try:
        PROJ = projection()
    except Exception as ex:
        erreurs.append(f"Projection : {ex}")
    else:
        ecrire("projection.json", PROJ)
        print("Projection :", {p: (x["s"], x["smin"], x["smax"]) for p, x in PROJ["national"].items() if x["s"] or x["smax"]})

# ---------- 3. élus actuels (Services du Parlement) ----------
PARL = {"UDC": "UDC", "PSS": "PS", "M-E": "C", "PLR": "PLR", "PLD": "PLR", "VERT-E-S": "VERT", "Al": "VERT", "pvl": "PVL",
        "PEV": "PEV", "UDF": "UDF", "MCG": "MCG", "Lega": "LEGA", "PST": "PST", "-": "IND"}


def actuel():
    q = urllib.parse.urlencode({"$filter": "Language eq 'FR' and Active eq true", "$format": "json"})
    d = json.loads(lire_url(f"https://ws.parlament.ch/odata.svc/MemberCouncil?{q}"))["d"]
    d = d["results"] if isinstance(d, dict) else d
    date = lambda s: datetime.datetime.fromtimestamp(int(s[6:-2]) / 1000, datetime.timezone.utc).date().isoformat() if s else None
    out = {"cn": {}, "ce": {}, "cf": [], "groupes": {}}
    for m in sorted(d, key=lambda m: (m["LastName"], m["FirstName"])):
        nom = f"{m['FirstName']} {m['LastName']}"
        if m["Council"] == 99:
            out["cf"].append({"nom": nom, "p": PARL.get(m["PartyAbbreviation"], "AUT"), "depuis": date(m.get("DateOath") or m["DateJoining"])}); continue
        if m["Council"] not in (1, 2): continue
        g = m.get("ParlGroupAbbreviation") or ""
        if g: out["groupes"][g] = m.get("ParlGroupName") or g
        x = {"nom": nom, "p": PARL.get(m["PartyAbbreviation"], "AUT"), "pa": m["PartyAbbreviation"], "g": g, "depuis": date(m.get("DateOath") or m["DateJoining"])}
        out["cn" if m["Council"] == 1 else "ce"].setdefault(m["CantonAbbreviation"], []).append(x)
    ncn, nce = sum(map(len, out["cn"].values())), sum(map(len, out["ce"].values()))
    if ncn != 200 or nce != 46 or len(out["cf"]) != 7: raise ValueError(f"{ncn} conseillers nationaux, {nce} conseillers aux États, {len(out['cf'])} conseillers fédéraux")
    out["cn"] = dict(sorted(out["cn"].items())); out["ce"] = dict(sorted(out["ce"].items()))
    out["groupes"] = dict(sorted(out["groupes"].items()))
    return out


try:
    ACT = actuel()
except Exception as ex:
    erreurs.append(f"Élus actuels : {ex}")
else:
    ecrire("actuel.json", {"source": "Services du Parlement (ws.parlament.ch)", **ACT})
    print("Élus actuels lus :", {k: len(v) for k, v in ACT.items() if k != "groupes"})

if erreurs:
    print("\n".join(erreurs), file=sys.stderr)
    sys.exit(1)
verifie("suisse")
