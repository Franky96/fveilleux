"""Votes Alberta : sondages, projection des 87 sièges et Assemblée actuelle → ../sondages.json, ../projection.json, ../actuel.json

Lancé par le pipeline aux 3 heures (bibliothèque standard seulement). Chaque source est indépendante : si l'une est
illisible ou douteuse, son fichier reste tel quel (et le script se termine en erreur pour le signaler).

  sondages.json   sondages provinciaux depuis l'élection du 29 mai 2023. Base vérifiée à la main (sondages_base.json :
                  chiffres de chaque firme, parts régionales, conventions) complétée par le tableau « Opinion polls » de la
                  page Wikipédia « 32nd Alberta general election » : tout nouveau sondage qui y paraît est ajouté.
                  Conventions : Parti albertain et Progressive Tory = une seule série (PT) ; sondages écartés (exclus) ;
                  un sondage de la base l'emporte toujours sur la ligne Wikipédia de la même firme et de la même date.
  projection.json simulation du site, « si l'élection avait lieu aujourd'hui », sur la carte actuelle de 87 circonscriptions :
                  1. moyenne provinciale : le sondage le plus récent de chaque firme, sur les 90 jours qui précèdent le dernier ;
                  2. trois régions des sondeurs (Calgary 01-26, Edmonton 27-46, reste 47-87) : rapport moyen « région / province »
                     de l'UCP et du NPD dans les sondages qui publient leurs régions (le plus récent de chaque firme, 180 jours),
                     calé pour que les trois régions redonnent la moyenne provinciale ;
                  3. report proportionnel : dans chaque circonscription, les parts de 2023 de l'UCP et du NPD sont multipliées
                     par le même facteur dans toute la région, réglé pour retrouver la moyenne régionale ; les petits partis
                     reçoivent leur part régionale (leur vote de 2023, sur une liste incomplète, ne dit pas où ils sont forts) ;
                  4. fourchettes : 2000 simulations (erreur provinciale des sondages, écart propre à chaque région et à chaque
                     circonscription), intervalle de 90 %.
  actuel.json     député de chaque circonscription et son caucus (Assemblée législative de l'Alberta, assembly.ab.ca),
                  avec les changements depuis 2023 (partielles, changements de caucus).

Usage : python3 sondages_ab.py   (dans le dossier outils/)
"""
import datetime, html, json, math, os, random, re, sys, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
RAC = os.path.join(ICI, "..")
HDR = {"User-Agent": "Mozilla/5.0 (compatible; fveilleuxBot/1.0; +https://fveilleux.com)"}
WIKI = "https://en.wikipedia.org/w/index.php?title=32nd_Alberta_general_election&action=raw"
ASSEMBLEE = "https://www.assembly.ab.ca/members/members-of-the-legislative-assembly"
ELECTION = "2023-05-29"
PETITS = ["PT", "LIB", "VERT", "RPA", "AUT"]


def verifie(page):
    """Date et heure de la vérification (heure de Montréal) dans /votes-verif.json : affichée sur la page même si rien n'a changé."""
    import zoneinfo
    f = os.path.join(RAC, "..", "votes-verif.json")
    v = json.load(open(f, encoding="utf-8")) if os.path.exists(f) else {}
    h = datetime.datetime.now(zoneinfo.ZoneInfo("America/Montreal")); a = h.date()
    m = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    v[page] = {"date": a.isoformat(), "heure": h.strftime("%H:%M"), "texte": f"{a.day} {m[a.month - 1]} {a.year} à {h.hour} h {h.minute:02d}"}
    json.dump(dict(sorted(v.items())), open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def lire_url(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=90) as r:
        return r.read().decode("utf-8", "replace")


def ecrire(nom, obj):
    json.dump(obj, open(os.path.join(RAC, nom), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


DATA = json.load(open(os.path.join(RAC, "data.json"), encoding="utf-8"))
R23 = json.load(open(os.path.join(RAC, "resultats-2023.json"), encoding="utf-8"))
BASE = json.load(open(os.path.join(ICI, "sondages_base.json"), encoding="utf-8"))
erreurs = []

# ---------- 1. sondages ----------
MOIS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
FIRME = [("leger", "Léger"), ("janet brown", "Janet Brown"), ("abacus", "Abacus Data"), ("research co", "Research Co."), ("ipsos", "Ipsos"),
         ("angus reid", "Angus Reid"), ("probe", "Probe Research"), ("mainstreet", "Mainstreet"), ("pollara", "Pollara"),
         ("liaison", "Liaison Strategies"), ("cardinal", "Cardinal Research"), ("canadian election study", "Étude électorale canadienne"),
         ("environics", "Environics"), ("sovereign north", "Sovereign North"), ("pallas", "Pallas Data"), ("forum", "Forum Research")]
# colonnes du tableau Wikipédia → clé de la page (Wildrose Loyalty Coalition, Wildrose Independence et « Others » : AUT)
COL = {"UCP": "UCP", "NDP": "NPD", "GRN": "VERT", "TORY": "PT", "AP": "PT", "ALBERTA": "PT", "LIB": "LIB", "RPA": "RPA", "WLC": "AUT", "WIP": "AUT"}


def firme(t):
    b = t.lower()
    return next((nom for k, nom in FIRME if k in b), t.strip())


def dates_wiki(cel):
    """« Feb 20, 2026–25, 2026 », « Nov 26, 2025–Dec 1, 2025 », « Sep 8–21 2026 » → (début, fin) AAAA-MM-JJ"""
    s = re.sub(r"\{\{\s*dts\s*\|([^|}]*)[^}]*\}\}", r"\1", cel).replace("&ndash;", "–").replace(" - ", "–")
    ans = [int(a) for a in re.findall(r"\b(20\d\d)\b", s)]
    mois = [MOIS[m.lower()[:3]] for m in re.findall(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?", s)]
    if not ans or not mois: return None, None
    parts = re.split(r"[–—-]", s)
    j = lambda t: [int(x) for x in re.findall(r"\b(\d{1,2})\b", t)]
    jf, jd = j(parts[-1]), j(parts[0])
    try:
        fin = datetime.date(ans[-1], mois[-1], jf[0] if jf else jd[0])
        deb = datetime.date(ans[0] if re.search(r"20\d\d", parts[0]) else ans[-1], mois[0], jd[0] if jd else fin.day)
        if deb > fin: deb = deb.replace(year=deb.year - 1)
    except (ValueError, IndexError):
        return None, None
    return deb.isoformat(), fin.isoformat()


def nombre(cel):
    c = re.sub(r"\{\{[^{}]*\}\}", "", cel).split("|")[-1]
    c = c.replace("'''", "").strip()
    if c.startswith("<1"): return 0.5
    m = re.search(r"(\d+(?:\.\d+)?)\s*%", c)
    return float(m[1]) if m else None


def sondages_wiki():
    w = lire_url(WIKI)
    w = re.sub(r"<ref[^>]*/>", "", w); w = re.sub(r"<ref[^>]*>.*?</ref>", "", w, flags=re.S); w = re.sub(r"<!--.*?-->", "", w, flags=re.S)
    i = w.find("==Opinion polls==")
    if i < 0: i = w.find("== Opinion polls ==")
    if i < 0: raise ValueError("section « Opinion polls » introuvable")
    t = w[w.find("{|", i): w.find("\n|}", i)]
    # en-tête : sigles des colonnes de parti, dans l'ordre
    entete = t[: t.find("\n|-\n|", 0) if "\n|-\n|" in t else len(t)]
    sig = [m.split("|")[-1].strip() for m in re.findall(r"\[\[([^\]]+)\]\]", entete)]
    sig = [x for x in sig if x.upper() in COL or x.upper() == "OTHERS"]
    cols = [COL.get(x.upper(), "AUT") for x in sig]
    if cols[:2] != ["UCP", "NPD"] or "PT" not in cols: raise ValueError(f"colonnes inattendues : {sig}")
    out = []
    for bloc in re.split(r"\n\|-[^\n]*", t)[1:]:
        cel = [l[1:] for l in bloc.split("\n") if l.startswith("|") and not l.startswith("|}")]
        if len(cel) < 4 + len(cols): continue
        if "general election" in bloc.lower():
            v = [nombre(c) for c in cel[3:3 + len(cols)]]
            out.append({"e": True, "UCP": v[0], "NPD": v[1]}); continue
        d0, d = dates_wiki(cel[2])
        if not d: continue
        v = {}
        for p, c in zip(cols, cel[4:4 + len(cols)]):
            x = nombre(c)
            if x is not None: v[p] = round(v.get(p, 0) + x, 1)
        if v.get("UCP") is None or v.get("NPD") is None: continue
        n = re.sub(r"\D", "", re.sub(r"\(.*?\)", "", cel[5 + len(cols)])) if len(cel) > 5 + len(cols) else ""
        cl = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", cel[1]).strip()
        out.append({"f": firme(re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", cel[0])), "cl": None if cl in ("N/A", "") else cl,
                    "d0": d0, "d": d, "n": int(n) if n else None, "m": re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", cel[6 + len(cols)]).strip() if len(cel) > 6 + len(cols) else None, **v})
    el = [s for s in out if s.get("e")]
    if not el or abs(el[0]["UCP"] - 52.63) > 0.05 or abs(el[0]["NPD"] - 44.05) > 0.05:
        raise ValueError(f"ligne de l'élection de 2023 introuvable ou colonnes décalées : {el[:1]}")
    son = [s for s in out if not s.get("e") and s["d"] > ELECTION]
    if len(son) < 30: raise ValueError(f"seulement {len(son)} sondages lus")
    for s in son:
        tot = sum(s.get(p, 0) for p in ["UCP", "NPD"] + PETITS)
        if not 90 <= tot <= 106 or not 25 <= s["UCP"] <= 70: raise ValueError(f"sondage douteux : {s}")
    return son


def proche(a, b, jours):
    return abs((datetime.date.fromisoformat(a) - datetime.date.fromisoformat(b)).days) <= jours


def assembler(wiki):
    base = [dict(s) for s in BASE["sondages"]]
    ajoutes = []
    for s in wiki:
        if any(s["f"] == b["f"] and proche(s["d"], b["d"], 3) for b in base): continue
        if any(s["f"] == x["f"] and proche(s["d"], x["d"], 12) for x in BASE["exclus"]): continue
        s = {k: v for k, v in s.items() if v is not None}
        s["note"] = "Chiffres du tableau Wikipédia (ajout automatique)."
        ajoutes.append(s)
    son = sorted(base + ajoutes, key=lambda s: (s["d"], s["f"]))
    for s in son:   # autres partis : ce qui manque pour arriver à 100 quand la firme ne le donne pas
        if "AUT" not in s: s["AUT"] = round(max(0, 100 - sum(s.get(p, 0) for p in ["UCP", "NPD"] + PETITS)), 1)
    p23 = R23["province"]["pct"]
    e23 = {"d": ELECTION, "f": "Élection générale", "e": True, "n": R23["province"]["valides"],
           **{p: p23.get(p, 0) for p in ["UCP", "NPD", "PT", "LIB", "VERT", "AUT"]},
           "reg": {k: [x["pct"]["UCP"], x["pct"]["NPD"]] for k, x in R23["regions"].items()}}
    return [e23] + son, len(ajoutes)


try:
    WIKI_SON = sondages_wiki()
except Exception as ex:                                       # source illisible : la base suffit (sondages déjà relevés)
    erreurs.append(f"Sondages Wikipédia : {ex}")
    WIKI_SON = []
SOND, nouveaux = assembler(WIKI_SON)
ecrire("sondages.json", {"source": BASE["source"], "exclus": BASE["exclus"], "sondages": SOND})
print(f"{len(SOND) - 1} sondages ({len(WIKI_SON)} lignes lues sur Wikipédia, {nouveaux} ajoutées) · dernier : {SOND[-1]['d']} {SOND[-1]['f']} UCP {SOND[-1]['UCP']} NPD {SOND[-1]['NPD']}")

# ---------- 2. projection ----------
REG = [r["code"] for r in DATA["regions"]]
CIRC = R23["circ"]
REGION = [r["r"] for r in DATA["ridings"]]
POIDS = [c["valides"] for c in CIRC]
P6 = ["UCP", "NPD", "PT", "LIB", "VERT", "AUT"]          # partis suivis circonscription par circonscription (RPA compté dans AUT)
CLES = set(P6)


def parts23(c):
    o = {p: 0.0 for p in P6}
    for _, p, v in c["c"]: o[p if p in CLES else "AUT"] += 100 * v / c["valides"]
    return o


S23 = [parts23(c) for c in CIRC]
B23 = {k: x["pct"] for k, x in R23["regions"].items()}


def recents(son, jours, filtre=lambda s: True):
    fin = max(s["d"] for s in son)
    lim = (datetime.date.fromisoformat(fin) - datetime.timedelta(days=jours)).isoformat()
    der = {}
    for s in son:
        if s["d"] >= lim and filtre(s) and (s["f"] not in der or s["d"] >= der[s["f"]]["d"]): der[s["f"]] = s
    return sorted(der.values(), key=lambda s: s["d"])


def repartir_region(k, cible_ucp, petits, bruit=None):
    """parts de chaque circonscription de la région k : petits partis = part régionale ; UCP et NPD = parts de 2023 × facteur,
    rapport UCP/NPD réglé (bissection) pour que la moyenne pondérée de la région donne cible_ucp"""
    idx = [i for i, r in enumerate(REGION) if r == k]
    reste = 100 - sum(petits.values())
    bu = {i: S23[i]["UCP"] * (bruit[i][0] if bruit else 1) for i in idx}
    bn = {i: S23[i]["NPD"] * (bruit[i][1] if bruit else 1) for i in idx}
    pt = sum(POIDS[i] for i in idx)
    def ucp(lk):
        f = math.exp(lk); return {i: reste * bu[i] * f / (bu[i] * f + bn[i]) for i in idx}
    lo, hi = -6.0, 6.0
    for _ in range(36):
        mid = (lo + hi) / 2
        m = sum(POIDS[i] * u for i, u in ucp(mid).items()) / pt
        lo, hi = (mid, hi) if m < cible_ucp else (lo, mid)
    u = ucp((lo + hi) / 2)
    return {i: {"UCP": u[i], "NPD": reste - u[i], **petits} for i in idx}


def projeter(moy, q, bruit_reg=None, bruit_circ=None):
    """moy : parts provinciales (UCP, NPD, petits partis) ; q : {région: (rapport UCP, rapport NPD)} déjà calés"""
    out = {}
    for k in REG:
        cu, cn = moy["UCP"] * q[k][0], moy["NPD"] * q[k][1]
        if bruit_reg: cu, cn = cu + bruit_reg[k] / 2, cn - bruit_reg[k] / 2
        # petits partis : même part dans toute la province (leur vote de 2023, sur des listes incomplètes, ne dit pas où ils
        # sont forts), mise à l'échelle pour remplir ce que l'UCP et le NPD laissent dans la région
        petits = {p: moy[p] for p in PETITS_C}
        reste = 100 - cu - cn
        tot = sum(petits.values()) or 1
        petits = {p: v * reste / tot for p, v in petits.items()}
        out.update(repartir_region(k, cu, petits, bruit_circ))
    return [out[i] for i in range(len(CIRC))]


PETITS_C = ["PT", "LIB", "VERT", "AUT"]


def projection():
    son = [s for s in SOND if not s.get("e")]
    util = recents(son, 90)
    moy = {p: sum(s[p] for s in util) / len(util) for p in ("UCP", "NPD")}
    # petits partis : sondages qui les nomment (le plus récent de chaque firme, 180 jours), ramenés au reste (100 − UCP − NPD)
    detail = recents(son, 180, lambda s: any(s.get(p) is not None for p in ("PT", "LIB", "VERT")))
    pp = {p: sum(s.get(p, 0) for s in detail) / len(detail) for p in ("PT", "LIB", "VERT", "RPA")} if detail else {"PT": 0, "LIB": 0, "VERT": 0, "RPA": 0}
    pp["AUT"] = max(0.5, sum(100 - s["UCP"] - s["NPD"] - sum(s.get(p, 0) for p in ("PT", "LIB", "VERT", "RPA")) for s in detail) / len(detail)) if detail else 1
    reste = 100 - moy["UCP"] - moy["NPD"]
    tp = sum(pp.values())
    for p in pp: moy[p] = pp[p] * reste / tp
    moy_c = {p: v for p, v in moy.items() if p != "RPA"}; moy_c["AUT"] = moy["AUT"] + moy["RPA"]   # circonscriptions : RPA compté dans AUT
    # rapports régionaux : part dans la région / part provinciale du même sondage (UCP, NPD). Les sondeurs ne découpent pas les
    # régions comme les circonscriptions (souvent la région métropolitaine, banlieues comprises) : on compare donc les rapports
    # récents (le plus récent de chaque firme, 180 jours) à ceux des sondages régionaux de la première année après l'élection
    # (jusqu'au 30 septembre 2024), et c'est cet écart qu'on applique aux rapports réels de 2023 ; puis calage sur la province
    # (poids : votes valides de 2023), pour que les trois régions redonnent la moyenne provinciale
    complet = lambda s: s.get("reg") and all(k in s["reg"] for k in REG)
    regs = recents(son, 180, complet)
    repere = [s for s in son if complet(s) and s["d"] <= "2024-09-30"]
    w = {k: R23["regions"][k]["valides"] / R23["province"]["valides"] for k in REG}
    p23 = R23["province"]["pct"]
    rapport = lambda lst, k, j: sum(s["reg"][k][j] / s[("UCP", "NPD")[j]] for s in lst) / len(lst)
    q = {k: [B23[k]["UCP"] / p23["UCP"], B23[k]["NPD"] / p23["NPD"]] for k in REG}   # sans sondage régional : rapports de 2023
    if regs and repere:
        for k in REG:
            for j in (0, 1): q[k][j] *= rapport(regs, k, j) / rapport(repere, k, j)
    for j in (0, 1):
        c = sum(w[k] * q[k][j] for k in REG)
        for k in REG: q[k][j] /= c
    central = projeter(moy_c, q)
    gagnant = lambda parts: max(parts, key=parts.get)
    sieges = {}
    for x in central: sieges[gagnant(x)] = sieges.get(gagnant(x), 0) + 1
    # simulations : erreur provinciale (UCP et NPD, écart type 3 points chacun), écart propre à chaque région sur l'avance
    # UCP-NPD (écart type 3 points), écart propre à chaque circonscription (8 % de la part de chaque parti) ; graine fixe
    alea = random.Random(2027)
    N = 2000
    tirs = {p: [] for p in P6}
    gains = [dict.fromkeys(P6, 0) for _ in CIRC]
    parts_t = [{"UCP": [], "NPD": []} for _ in CIRC]
    plus, majo = dict.fromkeys(P6, 0), dict.fromkeys(P6, 0)
    regs_s = {k: {p: [] for p in P6} for k in REG}
    for _ in range(N):
        m = dict(moy_c)
        m["UCP"] = max(20, moy_c["UCP"] + alea.gauss(0, 3.0)); m["NPD"] = max(20, moy_c["NPD"] + alea.gauss(0, 3.0))
        for p in PETITS_C: m[p] = max(0.1, moy_c[p] * math.exp(alea.gauss(0, 0.25)))
        br = {k: alea.gauss(0, 3.0) for k in REG}
        bc = [(math.exp(alea.gauss(0, 0.08)), math.exp(alea.gauss(0, 0.08))) for _ in CIRC]
        res = projeter(m, q, br, bc)
        n = dict.fromkeys(P6, 0); nr = {k: dict.fromkeys(P6, 0) for k in REG}
        for i, x in enumerate(res):
            g = gagnant(x); n[g] += 1; nr[REGION[i]][g] += 1; gains[i][g] += 1
            parts_t[i]["UCP"].append(x["UCP"]); parts_t[i]["NPD"].append(x["NPD"])
        for p in P6: tirs[p].append(n[p])
        for k in REG:
            for p in P6: regs_s[k][p].append(nr[k][p])
        top = max(n.values()); meneurs = [p for p in P6 if n[p] == top]
        for p in meneurs: plus[p] += 1 / len(meneurs)
        for p in P6:
            if n[p] >= 44: majo[p] += 1
    def bornes(v):
        v = sorted(v); return v[int(0.05 * len(v))], v[int(0.95 * len(v)) - 1]
    national = {}
    for p in sorted(P6, key=lambda p: (-sieges.get(p, 0), -moy_c[p])):
        lo, hi = bornes(tirs[p])
        national[p] = {"v": round(moy_c[p], 1), "s": sieges.get(p, 0), "smin": lo, "smax": hi,
                       "plus": round(100 * plus[p] / N), "maj": round(100 * majo[p] / N)}
    national["RPA"] = {"v": round(moy["RPA"], 1), "s": 0, "smin": 0, "smax": 0, "plus": 0, "maj": 0}
    national["AUT"]["v"] = round(moy["AUT"], 1)
    regions = {}
    for k in REG:
        idx = [i for i, r in enumerate(REGION) if r == k]; pt = sum(POIDS[i] for i in idx)
        s = {}
        for i in idx: s[gagnant(central[i])] = s.get(gagnant(central[i]), 0) + 1
        regions[k] = {"v": {p: round(sum(POIDS[i] * central[i][p] for i in idx) / pt, 1) for p in P6},
                      "s": s, "fourchette": {p: list(bornes(regs_s[k][p])) for p in P6 if max(regs_s[k][p])}}
    circ = []
    for i, x in enumerate(central):
        circ.append({"s": {p: round(v, 1) for p, v in sorted(x.items(), key=lambda kv: -kv[1]) if v >= 0.05},
                     "f": {p: [round(a, 1) for a in bornes(parts_t[i][p])] for p in ("UCP", "NPD")},
                     "prob": {p: round(100 * v / N) for p, v in sorted(gains[i].items(), key=lambda kv: -kv[1]) if v}})
    fin = max(s["d"] for s in son)
    return {"maj": fin, "methode": "report proportionnel régional (Calgary, Edmonton, reste) à partir de 2023 ; 2000 simulations",
            "sondages": [{"d": s["d"], "f": s["f"]} for s in util], "regionaux": [{"d": s["d"], "f": s["f"]} for s in regs],
            "moyenne": {p: round(v, 1) for p, v in moy.items()},
            "rapports": {k: [round(q[k][0], 3), round(q[k][1], 3)] for k in REG},
            "national": national, "regions": regions, "circ": circ}


try:
    PROJ = projection()
except Exception as ex:
    erreurs.append(f"Projection : {ex}")
else:
    if sum(x["s"] for x in PROJ["national"].values()) != 87: erreurs.append("Projection : répartition incomplète")
    else:
        ecrire("projection.json", PROJ)
        print("Projection :", {p: (x["v"], x["s"], x["smin"], x["smax"], x["plus"]) for p, x in PROJ["national"].items() if x["s"] or x["smax"]})
        print("  régions :", {k: (x["s"], {p: x["v"][p] for p in ("UCP", "NPD")}) for k, x in PROJ["regions"].items()})

# ---------- 3. Assemblée actuelle (assembly.ab.ca) ----------
CAUCUS = {"UC": "UCP", "UCP": "UCP", "NDP": "NPD", "PTP": "PT", "PT": "PT", "TORY": "PT", "IND": "IND", "INDEPENDENT": "IND"}
# changements depuis l'élection de 2023 (partielles, changements de caucus) : note affichée avec le député
NOTES = {
    "Airdrie-Cochrane": "élu avec l'UCP en 2023, exclu du caucus en avril 2025 ; chef du Progressive Tory Party (ex-Parti albertain) depuis décembre 2025",
    "Lesser Slave Lake": "exclu du caucus de l'UCP en mars 2025, de retour le 7 mai 2026",
    "Lacombe-Ponoka": "élue avec l'UCP en 2023, a siégé comme indépendante jusqu'à son retour au caucus en octobre 2024",
    "Lethbridge-West": "élu à la partielle du 18 décembre 2024",
    "Edmonton-Strathcona": "élu à la partielle du 23 juin 2025",
    "Edmonton-Ellerslie": "élu à la partielle du 23 juin 2025",
    "Olds-Didsbury-Three Hills": "élue à la partielle du 23 juin 2025",
    "Calgary-Shaw": "élu à la partielle du 14 septembre 2026 (gain du NPD sur l'UCP)",
}
# circonscriptions renommées depuis la carte de 2017 (nom actuel → nom de la carte)
RENOMMEES = {"Calgary-Bhullar-McCall": "Calgary-McCall"}
TITRES = r"\b(The|Honourable|Hon\.|Ms|Mrs|Mr|Dr\.?|Member|KC|ECA|MLA)\b\.?"
cle_nom = lambda s: re.sub(r"[^a-z]", "", s.lower().replace("–", "-"))


def actuel():
    s = lire_url(ASSEMBLEE)
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    L = [x.strip() for x in html.unescape(re.sub(r"<[^>]+>", "\n", t)).split("\n") if x.strip()]
    i = L.index("Constituency") + 1
    circ_n = {cle_nom(r["n"]): j for j, r in enumerate(DATA["ridings"])}
    for nouveau, ancien in RENOMMEES.items(): circ_n[cle_nom(nouveau)] = circ_n[cle_nom(ancien)]
    out = [None] * len(DATA["ridings"])
    while i + 2 < len(L) and "," in L[i]:
        nom, cau, ci = L[i:i + 3]; i += 3
        if ci == "Former Member": continue
        if cle_nom(ci) not in circ_n: raise ValueError(f"circonscription inconnue : {ci}")
        nom, prenom = [x.strip() for x in nom.split(",", 1)]
        prenom = re.sub(r"\s+", " ", re.sub(TITRES, "", prenom.replace(",", " "))).strip()
        j = circ_n[cle_nom(ci)]
        out[j] = {"nom": f"{prenom} {nom}".strip(), "p": CAUCUS.get(cau.upper(), cau)}
        if DATA["ridings"][j]["n"] in NOTES: out[j]["note"] = NOTES[DATA["ridings"][j]["n"]]
    n = {}
    for a in out:
        k = a["p"] if a else "VAC"; n[k] = n.get(k, 0) + 1
    if sum(1 for a in out if a) < 80 or n.get("UCP", 0) < 40: raise ValueError(f"liste des députés douteuse : {n}")
    return out, n


try:
    ACT, NB = actuel()
except Exception as ex:
    erreurs.append(f"Assemblée actuelle : {ex}")
else:
    ecrire("actuel.json", {"source": "Assemblée législative de l'Alberta (assembly.ab.ca), liste des députés",
                           "date": datetime.date.today().isoformat(), "president": {"nom": "Ric McIver", "p": "UCP", "circ": "Calgary-Hays", "depuis": "2025-05-13"},
                           "sieges": NB, "circ": ACT})
    print("Assemblée actuelle :", NB)

if erreurs:
    print("\n".join(erreurs), file=sys.stderr)
    sys.exit(1)
verifie("alberta")
