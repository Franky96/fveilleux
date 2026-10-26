"""Votes Royaume-Uni : sondages, projection des 650 sièges et Chambre des communes actuelle → ../sondages.json, ../projection.json, ../actuel.json

Lancé par le pipeline aux 3 heures (bibliothèque standard seulement). Chaque source est indépendante : si l'une est
illisible ou douteuse, son fichier reste tel quel (et le script se termine en erreur pour le signaler).

  sondages.json   sondages nationaux (Grande-Bretagne ou Royaume-Uni) depuis l'élection du 4 juillet 2024, lus dans les tableaux de
                  la page Wikipédia « Opinion polling for the next United Kingdom general election » ; sondages propres à l'Écosse
                  (page « Opinion polling in Scotland for the next United Kingdom general election ») et au pays de Galles (tableau
                  « Wales » de la page nationale). Aucune saisie à la main : tout nouveau sondage qui y paraît est ajouté.
                  Restore Britain (RB) a sa propre colonne depuis 2026 : avant, il est compté dans « Autres » (AUT).
  projection.json simulation du site, « si l'élection avait lieu aujourd'hui », sur les 650 circonscriptions de 2024 :
                  1. moyenne nationale : le dernier sondage de chaque firme sur les 30 jours qui précèdent le dernier sondage ;
                  2. Écosse et pays de Galles : moyenne des sondages de ces deux pays (le dernier de chaque firme, 90 jours pour
                     l'Écosse, 180 jours pour le pays de Galles) ; l'Angleterre en est déduite pour que le total redonne la
                     moyenne nationale (poids : votes valides de 2024) ;
                  3. report proportionnel : dans chaque pays, la part de 2024 de chaque parti dans chaque circonscription est
                     multipliée par un même facteur, réglé pour retrouver la moyenne du pays, puis les parts sont ramenées à 100 ;
                  4. Irlande du Nord (18 sièges, aucun sondage dans les moyennes) et siège du président (Chorley) : résultat de 2024 ;
                  5. fourchettes : 1000 simulations (erreur nationale propre à chaque parti, écart propre à l'Écosse et au pays de
                     Galles, écart propre à chaque circonscription), intervalle de 90 %.
  actuel.json     député de chaque circonscription et son parti (API des membres du Parlement, members-api.parliament.uk),
                  avec les changements depuis 2024 (partielles, changements de parti).

Usage : python3 sondages_uk.py   (dans le dossier outils/)
"""
import datetime, json, math, os, random, re, sys, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
RAC = os.path.join(ICI, "..")
HDR = {"User-Agent": "Mozilla/5.0 (compatible; fveilleuxBot/1.0; +https://fveilleux.com)"}
WIKI = "https://en.wikipedia.org/w/index.php?title={}&action=raw"
PAGE_NAT = "Opinion_polling_for_the_next_United_Kingdom_general_election"
PAGE_ECOSSE = "Opinion_polling_in_Scotland_for_the_next_United_Kingdom_general_election"
MEMBRES = "https://members-api.parliament.uk/api/Location/Constituency/Search?skip={}&take=20"
ELECTION = "2024-07-04"
SIM = 1000


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
R24 = json.load(open(os.path.join(RAC, "resultats-2024.json"), encoding="utf-8"))
erreurs = []

# ---------- 1. sondages (tableaux Wikipédia) ----------
MOIS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
COL = {"LAB": "LAB", "CON": "CON", "REF": "REF", "LD": "LD", "GRN": "VERT", "GREEN": "VERT", "SNP": "SNP", "PC": "PC", "RB": "RB", "OTHERS": "AUT"}
PARTIS_SOND = ["LAB", "CON", "REF", "LD", "VERT", "SNP", "PC", "RB", "AUT"]


def nettoyer(t):
    t = re.sub(r"<ref[^>]*/>", "", t); t = re.sub(r"<ref[^>]*>.*?</ref>", "", t, flags=re.S); t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    return t


def lien(t):
    """texte affiché d'un lien wiki ou externe"""
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[https?://\S+ ([^\]]*)\]", r"\1", t)
    return re.sub(r"\{\{[^{}]*\}\}", "", t).replace("'''", "").replace("''", "").strip()


def nombre(cel):
    c = cel
    m = re.match(r"\{\{\s*[Hh]idden\s*\|([^|}]*)", c.strip())
    if m: c = m[1]
    c = re.sub(r"\{\{[^{}]*\}\}", "", c) if "{{Hidden" not in cel and "{{hidden" not in cel else c
    c = c.split("|")[-1].replace("'''", "").strip()
    if c.startswith("<1"): return 0.5
    m = re.search(r"(\d+(?:\.\d+)?)\s*%", c)
    return float(m[1]) if m else None


def date_fin(cel):
    """{{opdrts|21|23|October|2026}}, {{opdrts||4|Jul|2024|year}}, {{opdrts|30 Sep|2|Oct|2026}} → date de fin AAAA-MM-JJ"""
    m = re.search(r"\{\{\s*opdrts\s*\|([^|}]*)\|([^|}]*)\|([A-Za-z]+)\|(\d{4})", cel)
    if m:
        j = re.findall(r"\d+", m[2]) or re.findall(r"\d+", m[1])
        mois = MOIS.get(m[3].lower()[:3])
        if j and mois:
            try: return datetime.date(int(m[4]), mois, int(j[0])).isoformat()
            except ValueError: return None
    return None


SAUTEES = []   # lignes dont le nombre de cellules ne correspond pas à l'en-tête (cellules fusionnées) : sautées


def tableaux(txt):
    """[(colonnes, lignes)] : colonnes = clés de parti dans l'ordre des cellules de chaque ligne (None = autre colonne), lignes = listes de cellules"""
    out = []
    for t in re.split(r"\n(?=\{\|)", nettoyer(txt)):
        if not t.startswith("{|"): continue
        t = t[: t.find("\n|}")] if "\n|}" in t else t
        blocs = re.split(r"\n\|-[^\n]*", t)
        entete = [re.sub(r"<br\s*/?>", " ", lien(l[1:]).split("|")[-1]).strip() for l in blocs[0].split("\n") if l.startswith("!")]
        entete = [re.sub(r"\s+", " ", h) for h in entete]
        if not entete or not entete[0].lower().startswith("date"): continue
        cols = [COL.get(h.upper()) for h in entete]
        lignes = []
        for b in blocs[1:]:
            cel = [l[1:] for l in b.split("\n") if l.startswith("|") and not l.startswith("|}")]
            if len(cel) == len(entete): lignes.append(cel)
            elif len(cel) > 3: SAUTEES.append(len(cel))
        out.append((entete, cols, lignes))
    return out


def lire_sondages(entete, cols, lignes):
    """sondages d'un tableau (colonnes de parti repérées par leur en-tête)"""
    idx = {i: c for i, c in enumerate(entete) if cols[i] in PARTIS_SOND}
    i_zone = next((i for i, h in enumerate(entete) if h.lower() == "area"), None)
    i_n = next((i for i, h in enumerate(entete) if h.lower().startswith("sample")), None)
    out = []
    for cel in lignes:
        d = date_fin(cel[0])
        if not d or d <= ELECTION: continue
        zone = lien(cel[i_zone]) if i_zone is not None and i_zone < len(cel) else "GB"
        if zone not in ("GB", "UK"): continue
        v = {}
        for i, h in idx.items():
            if i >= len(cel): continue
            x = nombre(cel[i])
            if x is not None: v[cols[i]] = round(v.get(cols[i], 0) + x, 1)
        n = re.sub(r"\D", "", lien(cel[i_n])) if i_n is not None and i_n < len(cel) else ""
        firme = re.sub(r"\s+", " ", lien(cel[1])).strip()
        out.append({"f": firme, "d": d, "n": int(n) if n else None, **v})
    return out


def sondages_nationaux(txt):
    out = []
    for entete, cols, lignes in tableaux(txt):
        if "Lab" in entete and "Con" in entete and "Area" in entete: out += lire_sondages(entete, cols, lignes)
    for s in out:
        s.setdefault("RB", None)
        tot = sum(s.get(p) or 0 for p in PARTIS_SOND)
        if not 90 <= tot <= 106 or not all(3 <= s.get(p, 0) <= 60 for p in ("LAB", "CON", "REF")):
            raise ValueError(f"sondage douteux : {s}")
    out = [{k: v for k, v in s.items() if v is not None} for s in out]
    if len(out) < 200: raise ValueError(f"seulement {len(out)} sondages nationaux lus")
    return sorted(out, key=lambda s: (s["d"], s["f"]))


def sondages_region(txt, mots, minimum):
    """premier tableau de sondages d'un pays (sans colonne « Area ») : dans la page nationale, celui de la section voulue"""
    for entete, cols, lignes in tableaux(txt):
        if "Area" in entete or "Lab" not in entete: continue
        if mots and not mots(entete): continue
        sons = lire_sondages(entete, cols, lignes)
        if len(sons) >= minimum:
            for s in sons:
                s.setdefault("RB", None)
                if not 90 <= sum(s.get(p) or 0 for p in PARTIS_SOND) <= 106: raise ValueError(f"sondage régional douteux : {s}")
            return sorted(({k: v for k, v in s.items() if v is not None} for s in sons), key=lambda s: (s["d"], s["f"]))
    raise ValueError("tableau introuvable")


try:
    txt_nat = lire_url(WIKI.format(PAGE_NAT))
    NAT = sondages_nationaux(txt_nat)
except Exception as ex:
    erreurs.append(f"Sondages nationaux : {ex}"); NAT = []
try:
    ECO = sondages_region(lire_url(WIKI.format(PAGE_ECOSSE)), lambda e: "SNP" in e and "Lab" in e, 20)
except Exception as ex:
    erreurs.append(f"Sondages d'Écosse : {ex}"); ECO = []
try:
    # pays de Galles : tableau dont l'en-tête contient « PC » (Plaid Cymru), sans colonne « Area », dans la page nationale
    GAL = sondages_region(txt_nat, lambda e: "PC" in e and "Ref" in e and "SNP" not in e, 5)
except Exception as ex:
    erreurs.append(f"Sondages du pays de Galles : {ex}"); GAL = []

# élection de 2024 : parts en Grande-Bretagne (sans l'Irlande du Nord), comme les sondages
GB = R24["gb"]
e24 = {"d": ELECTION, "f": "Élection générale", "e": True, "n": GB["valides"]}
e24.update({p: round(GB["pct"].get(p, 0), 2) for p in ("LAB", "CON", "REF", "LD", "VERT", "SNP", "PC")})
e24["AUT"] = round(100 - sum(e24[p] for p in ("LAB", "CON", "REF", "LD", "VERT", "SNP", "PC")), 2)
if NAT:
    ecrire("sondages.json", {"source": "Sondages d'intentions de vote pour la Chambre des communes depuis l'élection du 4 juillet 2024, lus dans les tableaux de la page Wikipédia « Opinion polling for the next United Kingdom general election » ; Écosse : page « Opinion polling in Scotland for the next United Kingdom general election » ; pays de Galles : tableau « Wales » de la page nationale. Parts publiées par chaque firme (Grande-Bretagne ou Royaume-Uni). AUT : tous les autres partis (Restore Britain y est compté jusqu'à ce que les sondages le nomment).",
                             "sondages": [e24] + NAT, "regionaux": {"SCO": ECO, "WAL": GAL}})
    dn = NAT[-1]
    print(f"{len(NAT)} sondages nationaux, {len(ECO)} d'Écosse, {len(GAL)} du pays de Galles · dernier : {dn['d']} {dn['f']} LAB {dn['LAB']} CON {dn['CON']} REF {dn['REF']}")

# ---------- 2. projection ----------
IDX = {r["id"]: i for i, r in enumerate(DATA["ridings"])}
REGION = [r["r"] for r in DATA["ridings"]]
REG = [r["code"] for r in DATA["regions"]]
PAYS = lambda r: "SCO" if r == "SCO" else "WAL" if r == "WAL" else "NI" if r == "NI" else "ENG"
GRANDS = ["LAB", "CON", "REF", "LD", "VERT"]
PARTIS_P = ["LAB", "CON", "REF", "LD", "VERT", "SNP", "PC", "AUT"]            # partis suivis par la projection (RB et NI dans AUT)
# « AUT » = indépendants et petits partis locaux : leur vote tient à des candidats connus (Corbyn, les indépendants de 2024), il ne suit pas
# la moyenne nationale des « Autres » et reste donc à son niveau de 2024. La hausse des « Autres » dans les sondages (Restore Britain, Your Party…)
# est « NOUV », une part égale dans toutes les circonscriptions de la Grande-Bretagne ; les deux sont additionnés (« AUT ») à l'affichage.
PARTIS_M = PARTIS_P + ["NOUV"]
PLANCHER = 1.0                                                                # part minimale d'un grand parti dans une circonscription de la Grande-Bretagne (il peut n'y avoir pas présenté de candidat)
CIRC = R24["circ"]
VALIDES = [c["valides"] for c in CIRC]


def parts24(c):
    o = dict.fromkeys(PARTIS_P, 0.0)
    for nom, p, v, *_ in c["c"]: o[p if p in o else "AUT"] += 100 * v / c["valides"]
    return o


def parts_fixe(c):
    o = {}
    for nom, p, v, *_ in c["c"]: o[p] = o.get(p, 0) + 100 * v / c["valides"]
    return o


S24 = [parts24(c) for c in CIRC]
FIXES = {i for i, c in enumerate(CIRC) if REGION[i] == "NI" or any(p == "SPK" for _, p, *_ in c["c"][:1])}   # Irlande du Nord et siège du président
BASE = []                                       # parts de départ de chaque circonscription (avec plancher)
for i, s in enumerate(S24):
    b = dict(s)
    if i not in FIXES:
        for p in GRANDS: b[p] = max(b[p], PLANCHER)
        if PAYS(REGION[i]) == "SCO": b["SNP"] = max(b["SNP"], PLANCHER)
        if PAYS(REGION[i]) == "WAL": b["PC"] = max(b["PC"], PLANCHER)
        b["NOUV"] = 1.0
    BASE.append(b)
PAYS_IDX = {k: [i for i in range(len(CIRC)) if PAYS(REGION[i]) == k and i not in FIXES] for k in ("ENG", "SCO", "WAL")}
POIDS_PAYS = {k: sum(VALIDES[i] for i in idx) for k, idx in PAYS_IDX.items()}


def recents(son, jours, filtre=lambda s: True):
    fin = max(s["d"] for s in son)
    lim = (datetime.date.fromisoformat(fin) - datetime.timedelta(days=jours)).isoformat()
    der = {}
    for s in son:
        if s["d"] >= lim and filtre(s) and (s["f"] not in der or s["d"] >= der[s["f"]]["d"]): der[s["f"]] = s
    return sorted(der.values(), key=lambda s: s["d"])


def moyenne(sons, partis):
    """moyenne des parts, ramenée à 100 sur les partis suivis (RB et les autres : AUT)"""
    m = {p: sum(s.get(p, 0) for s in sons) / len(sons) for p in partis}
    m["AUT"] = sum(s.get("AUT", 0) + s.get("RB", 0) for s in sons) / len(sons)
    tot = sum(m.values())
    return {p: 100 * v / tot for p, v in m.items()}


def cibles(son_nat, son_eco, son_gal):
    """parts visées dans l'Angleterre, l'Écosse et le pays de Galles"""
    g = moyenne(son_nat, PARTIS_P[:-1])
    w = dict(POIDS_PAYS); wt = sum(w.values())
    eco = moyenne(son_eco, ["LAB", "CON", "REF", "LD", "VERT", "SNP"]) if son_eco else None
    gal = moyenne(son_gal, ["LAB", "CON", "REF", "LD", "VERT", "PC"]) if son_gal else None
    # sans sondage propre à l'Écosse ou au pays de Galles : leurs parts de 2024 déplacées comme la moyenne nationale
    vide = dict.fromkeys(PARTIS_P, 0.0)
    if eco is None: eco = {**vide, **{p: g[p] * R24["regions"]["SCO"]["pct"].get(p, 0) / max(0.1, GB["pct"].get(p, 0.1)) for p in PARTIS_P}}
    if gal is None: gal = {**vide, **{p: g[p] * R24["regions"]["WAL"]["pct"].get(p, 0) / max(0.1, GB["pct"].get(p, 0.1)) for p in PARTIS_P}}
    for d in (eco, gal):
        for p in PARTIS_P: d.setdefault(p, 0.0)
        t = sum(d.values());
        for p in PARTIS_P: d[p] *= 100 / t
    eng = {}
    for p in GRANDS + ["AUT"]:
        eng[p] = max(0.2, (g[p] * wt - eco[p] * w["SCO"] - gal[p] * w["WAL"]) / w["ENG"])
    eng["SNP"] = eng["PC"] = 0.0
    t = sum(eng.values())
    for p in PARTIS_P: eng[p] *= 100 / t
    cib = {"ENG": eng, "SCO": eco, "WAL": gal}
    for k, c in cib.items():       # « Autres » des sondages = autres locaux (niveau de 2024) + nouveaux partis
        a24 = sum(VALIDES[i] * S24[i]["AUT"] for i in PAYS_IDX[k]) / POIDS_PAYS[k]
        c["NOUV"] = max(0.2, c["AUT"] - a24); c["AUT"] = a24
        t = sum(c.values())
        for p in c: c[p] *= 100 / t
    return g, cib


def facteurs(cible, idx, base=BASE, passes=60):
    """facteur de chaque parti pour que la moyenne (pondérée par les votes de 2024) des circonscriptions de idx redonne la cible"""
    f = {p: 1.0 for p in PARTIS_M}
    partis = [p for p in PARTIS_M if cible.get(p, 0) > 0]
    tot = sum(VALIDES[i] for i in idx)
    for _ in range(passes):
        m = dict.fromkeys(PARTIS_M, 0.0)
        for i in idx:
            w = {p: base[i].get(p, 0) * f[p] for p in partis}; s = sum(w.values()) or 1
            for p in partis: m[p] += VALIDES[i] * w[p] / s
        for p in partis:
            if p != "AUT": f[p] *= (cible[p] / max(0.01, 100 * m[p] / tot)) ** 0.8
    return f


def parts_circ(i, f):
    w = {p: BASE[i].get(p, 0) * f.get(p, 0) for p in PARTIS_M}; s = sum(w.values()) or 1
    return {p: 100 * v / s for p, v in w.items()}


def affichage(parts):
    """AUT + NOUV → AUT"""
    o = {p: v for p, v in parts.items() if p != "NOUV"}
    o["AUT"] = o.get("AUT", 0) + parts.get("NOUV", 0)
    return o


def gagnant(parts):
    return max(parts, key=parts.get)


def projection():
    son = [s for s in NAT]
    util = recents(son, 30)
    eco = recents(ECO, 90) if ECO else []; gal = recents(GAL, 180) if GAL else []
    g, cib = cibles(util, eco, gal)
    F = {k: facteurs(cib[k], PAYS_IDX[k]) for k in PAYS_IDX}
    # circonscriptions : parts centrales ; fixes = résultat de 2024
    central = []
    for i in range(len(CIRC)):
        if i in FIXES:
            c = CIRC[i]["c"]; central.append(None)
        else:
            central.append(parts_circ(i, F[PAYS(REGION[i])]))
    gagnants24 = [CIRC[i]["c"][0][1] for i in range(len(CIRC))]
    def vainqueur(i, parts): return gagnants24[i] if i in FIXES else gagnant(affichage(parts))
    sieges = {}
    for i in range(len(CIRC)):
        k = vainqueur(i, central[i]); sieges[k] = sieges.get(k, 0) + 1
    # simulations
    alea = random.Random(2029)
    sig_nat = {"LAB": 0.10, "CON": 0.10, "REF": 0.10, "LD": 0.15, "VERT": 0.15, "SNP": 0.15, "PC": 0.15, "AUT": 0.0, "NOUV": 0.25}
    tirs = {}; plus = {}; majo = {}; gains = [dict() for _ in CIRC]
    hist = []; parts_t = [{} for _ in CIRC]
    ordre_p = lambda i: sorted(affichage(central[i]), key=affichage(central[i]).get, reverse=True)[:3] if central[i] else []
    haut = [ordre_p(i) for i in range(len(CIRC))]
    parties_gagnantes = set(gagnants24) | set(PARTIS_P)
    for p in parties_gagnantes: tirs[p] = []; plus[p] = 0.0; majo[p] = 0
    base_w = {i: {p: BASE[i].get(p, 0) * F[PAYS(REGION[i])].get(p, 0) for p in PARTIS_M} for i in range(len(CIRC)) if i not in FIXES}
    for _ in range(SIM):
        choc = {p: math.exp(alea.gauss(0, sig_nat[p])) for p in PARTIS_M}
        choc_pays = {"SCO": {p: math.exp(alea.gauss(0, 0.10)) for p in ("LAB", "SNP", "CON", "REF")}, "WAL": {p: math.exp(alea.gauss(0, 0.10)) for p in ("LAB", "PC", "CON", "REF")}}
        n = dict.fromkeys(parties_gagnantes, 0); nr = {k: {} for k in REG}
        for i in range(len(CIRC)):
            if i in FIXES:
                k = gagnants24[i]
            else:
                pays = PAYS(REGION[i]); cp = choc_pays.get(pays, {})
                w = {p: v * choc[p] * cp.get(p, 1) * math.exp(alea.gauss(0, 0.15)) for p, v in base_w[i].items() if v > 0}
                s = sum(w.values()); k = max(w, key=w.get)
                if k == "NOUV": k = "AUT"
                for p in haut[i]:
                    parts_t[i].setdefault(p, []).append(100 * (w.get(p, 0) + (w.get("NOUV", 0) if p == "AUT" else 0)) / s)
            n[k] += 1; nr[REGION[i]][k] = nr[REGION[i]].get(k, 0) + 1; gains[i][k] = gains[i].get(k, 0) + 1
        for p in parties_gagnantes: tirs[p].append(n[p])
        hist.append(nr)
        top = max(n.values()); meneurs = [p for p in parties_gagnantes if n[p] == top]
        for p in meneurs: plus[p] += 1 / len(meneurs)
        for p in parties_gagnantes:
            if n[p] >= 326: majo[p] += 1
    def bornes(v):
        v = sorted(v); return v[int(0.05 * len(v))], v[int(0.95 * len(v)) - 1]
    reg_s = {r: {p: [h[r].get(p, 0) for h in hist] for p in {p for h in hist for p in h[r]}} for r in REG}
    national = {}
    for p in sorted(parties_gagnantes, key=lambda p: (-sieges.get(p, 0), -(g.get(p, 0)))):
        lo, hi = bornes(tirs[p])
        national[p] = {"v": round(g.get(p, 0), 1), "s": sieges.get(p, 0), "smin": lo, "smax": hi, "plus": round(100 * plus[p] / SIM), "maj": round(100 * majo[p] / SIM)}
    regions = {}
    for r in REG:
        idx = [i for i in range(len(CIRC)) if REGION[i] == r]; pt = sum(VALIDES[i] for i in idx)
        s = {}; vote = dict.fromkeys(PARTIS_P, 0.0)
        for i in idx:
            k = vainqueur(i, central[i]); s[k] = s.get(k, 0) + 1
            ps = affichage(central[i]) if central[i] else parts_fixe(CIRC[i])
            for p, v in ps.items(): vote[p] = vote.get(p, 0.0) + VALIDES[i] * v / pt
        regions[r] = {"v": {p: round(v, 1) for p, v in vote.items() if v >= 0.05}, "s": s,
                      "fourchette": {p: list(bornes(v)) for p, v in reg_s[r].items() if max(v) and p in s}}
    circ = []
    for i in range(len(CIRC)):
        if i in FIXES:
            valides = CIRC[i]["valides"]
            circ.append({"s": {p: round(v, 1) for p, v in sorted(parts_fixe(CIRC[i]).items(), key=lambda kv: -kv[1]) if v >= 0.05},
                         "f": {}, "prob": {gagnants24[i]: 100}, "fixe": True})
            continue
        circ.append({"s": {p: round(v, 1) for p, v in sorted(affichage(central[i]).items(), key=lambda kv: -kv[1]) if v >= 0.05},
                     "f": {p: [round(a, 1) for a in bornes(parts_t[i][p])] for p in haut[i][:2]},
                     "prob": {p: round(100 * v / SIM) for p, v in sorted(gains[i].items(), key=lambda kv: -kv[1]) if v}})
    return {"maj": max(s["d"] for s in son), "methode": f"report proportionnel par pays (Angleterre, Écosse, pays de Galles) à partir de 2024 ; {SIM} simulations",
            "sondages": [{"d": s["d"], "f": s["f"]} for s in util], "ecosse": [{"d": s["d"], "f": s["f"]} for s in eco], "galles": [{"d": s["d"], "f": s["f"]} for s in gal],
            "moyenne": {p: round(v, 1) for p, v in g.items()}, "cibles": {k: {p: round(v, 1) for p, v in affichage(c).items()} for k, c in cib.items()},
            "facteurs": {k: {p: round(v, 3) for p, v in f.items()} for k, f in F.items()},
            "national": national, "regions": regions, "circ": circ}


PROJ = None
if NAT:
    try:
        PROJ = projection()
    except Exception as ex:
        import traceback; traceback.print_exc()
        erreurs.append(f"Projection : {ex}")
    else:
        if sum(x["s"] for x in PROJ["national"].values()) != 650: erreurs.append("Projection : répartition incomplète")
        else:
            ecrire("projection.json", PROJ)
            print("Projection :", {p: (x["v"], x["s"], x["smin"], x["smax"], x["plus"], x["maj"]) for p, x in PROJ["national"].items() if x["s"] or x["smax"]})

# ---------- 3. Chambre des communes actuelle (API des membres du Parlement) ----------
CODES_P = {"LAB": "LAB", "CON": "CON", "RUK": "REF", "LD": "LD", "GREEN": "VERT", "SNP": "SNP", "PC": "PC", "SF": "SF", "DUP": "DUP", "APNI": "ALL",
           "UUP": "UUP", "SDLP": "SDLP", "TUV": "TUV", "IND": "IND", "SPK": "SPK", "YP": "YP", "RB": "RB"}
ETIQ = {"LAB": "avec le Parti travailliste", "CON": "avec les conservateurs", "REF": "avec Reform UK", "LD": "avec les libéraux-démocrates", "VERT": "avec les Verts",
        "SNP": "avec le SNP", "PC": "avec le Plaid Cymru", "SF": "avec le Sinn Féin", "DUP": "avec le DUP", "ALL": "avec Alliance", "UUP": "avec l'UUP", "SDLP": "avec le SDLP",
        "TUV": "avec le TUV", "IND": "sans étiquette", "SPK": "comme président de la Chambre", "AUT": "avec un autre parti", "YP": "avec Your Party", "RB": "avec Restore Britain"}
GAIN = {"LAB": "les travaillistes", "CON": "les conservateurs", "REF": "Reform UK", "LD": "les libéraux-démocrates", "VERT": "les Verts", "SNP": "le SNP", "PC": "le Plaid Cymru",
        "SF": "le Sinn Féin", "DUP": "le DUP", "ALL": "Alliance", "UUP": "l'UUP", "SDLP": "le SDLP", "TUV": "le TUV", "IND": "un indépendant", "SPK": "le président", "AUT": "un autre parti"}
MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
date_fr = lambda iso: f"{int(iso[8:10]) if iso[8:10] != '01' else '1er'} {MOIS_FR[int(iso[5:7]) - 1]} {iso[:4]}"
cle_nom = lambda s: re.sub(r"[^a-z]", "", s.lower().replace("&", "and"))
JOURS = lambda iso: iso[:10]


def actuel():
    items = []
    for skip in range(0, 700, 20):
        page = json.loads(lire_url(MEMBRES.format(skip)))["items"]
        items += page
        if len(page) < 20: break
    noms = {cle_nom(r["n"]): i for i, r in enumerate(DATA["ridings"])}
    out = [None] * len(DATA["ridings"]); president = None
    for it in items:
        v = it["value"]; cr = v.get("currentRepresentation")
        if not cr or not cr.get("member"): continue
        cle = cle_nom(v["name"])
        if cle not in noms: raise ValueError(f"circonscription inconnue : {v['name']}")
        i = noms[cle]; m = cr["member"]["value"]
        ab = (m["latestParty"]["abbreviation"] or "").upper()
        p = CODES_P.get(ab)
        if not p: p = "AUT"
        # début du mandat actuel : la dernière entrée à la Chambre du député (une partielle est postérieure à l'élection générale)
        debuts = [d for d in (m.get("latestHouseMembership", {}).get("membershipStartDate"), (cr.get("representation") or {}).get("membershipStartDate")) if d]
        depuis = JOURS(max(debuts)) if debuts else ELECTION
        nom = re.sub(r"^(Rt Hon|Ms|Mrs|Mr|Dr|Sir|Dame|Lord|Lady|Prof|Reverend|Rev)\s+", "", m["nameDisplayAs"]).strip()
        a = {"nom": nom, "p": p}
        p24 = CIRC[i]["c"][0][1]
        if depuis > ELECTION:     # partielle : le siège a-t-il changé de main ?
            a["partielle"] = depuis
            a["note"] = f"élu à la partielle du {date_fr(depuis)}" + (f" (gain sur {GAIN.get(p24, p24)})" if p != p24 else "")
        elif p != p24:            # changement de parti en cours de mandat
            a["note"] = f"élu {ETIQ.get(p24, 'avec un autre parti')} en 2024"
        if p == "SPK": president = {"nom": nom, "p": "SPK", "circ": DATA["ridings"][i]["n"]}
        out[i] = a
    n = {}
    for a in out:
        k = a["p"] if a else "VAC"; n[k] = n.get(k, 0) + 1
    if sum(1 for a in out if a) < 640 or n.get("LAB", 0) < 200: raise ValueError(f"liste des députés douteuse : {n}")
    return out, n, president


try:
    ACT, NB, PRES = actuel()
except Exception as ex:
    erreurs.append(f"Chambre des communes actuelle : {ex}")
else:
    ecrire("actuel.json", {"source": "Chambre des communes (API des membres du Parlement, members-api.parliament.uk)", "date": datetime.date.today().isoformat(),
                           "president": PRES, "sieges": NB, "circ": ACT})
    print("Chambre actuelle :", NB)

if erreurs:
    print("\n".join(erreurs), file=sys.stderr)
    sys.exit(1)
verifie("royaume-uni")
