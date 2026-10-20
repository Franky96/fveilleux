"""Information Monde : villes et fiches des drapeaux (à relancer pour mettre à jour).

- monde/villes-ca.json : les 5 villes les plus peuplées de chaque province et territoire (subdivisions de recensement de
  Statistique Canada, code à 7 chiffres dans Wikidata ; Toronto, aussi division de recensement, ajoutée ; réserves,
  territoires non organisés, municipalités rurales et comtés écartés), plus les capitales provinciales ; population du
  recensement de 2021 (Statistique Canada, table 98-10-0002) ; type, coordonnées et drapeau d'après Wikidata (CC0).
  Drapeau : fichier de Wikimedia Commons (libre), vignette de 500 px affichée depuis Wikimedia avec auteur et licence
  (copies déjà faites dans monde/drapeaux/ca/villes/ gardées) ; sinon fichier non libre de Wikipédia (infobox de
  l'article anglais) : vignette affichée depuis Wikipédia avec un lien.
- monde/fiches.json : pour chaque pays (ISO alpha-2), province (CA-QC) et ville (Qxxx) : date d'adoption et proportions
  du drapeau (élément « drapeau » de Wikidata) et début de l'article de Wikipédia en français sur le drapeau.
Usage : python3 monde/outils/fiches.py
"""
import json, os, re, time, urllib.error, urllib.parse, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
MONDE = os.path.dirname(ICI)
UA = {"User-Agent": "fveilleux-monde/1.0 (https://fveilleux.com)"}
VILLES_DIR = os.path.join(MONDE, "drapeaux", "ca", "villes")


def lire(url, essais=6):
    for i in range(essais):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                return r.read()
        except urllib.error.HTTPError as e:   # limites de débit de Wikimedia : on attend
            if e.code not in (429, 503) or i == essais - 1: raise
            time.sleep(15 * (i + 1))


def sparql(q):
    d = json.loads(lire("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q)))
    return [{k: v["value"] for k, v in b.items()} for b in d["results"]["bindings"]]


def api(site, essais=6, **p):
    p.update(format="json", formatversion="2")
    return json.loads(lire(f"https://{site}/w/api.php?" + urllib.parse.urlencode(p), essais))


qid = lambda u: u.rsplit("/", 1)[1]


# provinces et territoires : 2 premiers chiffres du code de subdivision de recensement (CGT de Statistique Canada)
PROVINCES = {"10": "CA-NL", "11": "CA-PE", "12": "CA-NS", "13": "CA-NB", "24": "CA-QC", "35": "CA-ON", "46": "CA-MB",
             "47": "CA-SK", "48": "CA-AB", "59": "CA-BC", "60": "CA-YT", "61": "CA-NT", "62": "CA-NU"}
PAR_PROVINCE = 5   # les 5 villes les plus peuplées de chaque province et territoire (demande de l'utilisateur)
# ce qui n'est pas une ville : réserves, territoires non organisés, municipalités rurales, comtés, districts régionaux…
# (« territoire hors MRC » et « région administrative » : aussi Montréal, Québec, Laval… : gardés)
EXCLUS_TYPE = re.compile(r"(?i)indian reserv|reserved land|unorganized|former municipality|regional district|"
                         r"county|municipal district|parish of New Brunswick|rural municipality")
# population officielle : recensement de 2021 de Statistique Canada, table 98-10-0002 (subdivisions de recensement)
STATCAN = "https://www150.statcan.gc.ca/n1/tbl/csv/98100002-eng.zip"


def populations_2021():
    import csv, io, zipfile
    cache = os.path.join(__import__("tempfile").gettempdir(), "fveilleux-98100002.zip")   # la table change peu : gardée
    if not os.path.exists(cache):
        for essai in range(4):
            try: donnees = lire(STATCAN); break
            except (urllib.error.URLError, ConnectionError, TimeoutError):
                if essai == 3: raise
                time.sleep(15 * (essai + 1))
        open(cache, "wb").write(donnees)
    z = zipfile.ZipFile(cache)
    lignes = [x for x in csv.reader(io.StringIO(z.read("98100002.csv").decode("utf-8-sig"))) if len(x) > 4]
    # identifiant géographique « 2021A0005 » + code de subdivision à 7 chiffres
    return {x[2][-7:]: (x[1], int(x[4])) for x in lignes[1:] if "A0005" in x[2] and x[4].isdigit()}
EXCLUS_NOM = re.compile(r"(?i)subd\.|unorganized|non organis|county|comt[ée] |regional district|district r[ée]gional")


def villes():
    """Villes : les PAR_PROVINCE municipalités les plus peuplées de chaque province et territoire (population du
    recensement de 2021 de Statistique Canada ; type, nom, coordonnées et drapeau de Wikidata par le code de subdivision),
    plus les capitales provinciales."""
    pop21 = populations_2021()
    lignes = sparql("""SELECT ?v ?fr ?en ?code ?pop ?t ?type WHERE {
      ?v wdt:P17 wd:Q16; wdt:P3012 ?code. FILTER(STRLEN(?code) = 7 || ?v = wd:Q172)
      ?v p:P1082 ?st. ?st ps:P1082 ?pop; wikibase:rank ?r. FILTER(?r != wikibase:DeprecatedRank) OPTIONAL { ?st pq:P585 ?t }
      OPTIONAL { ?v rdfs:label ?fr FILTER(LANG(?fr) = "fr") } OPTIONAL { ?v rdfs:label ?en FILTER(LANG(?en) = "en") }
      OPTIONAL { ?v wdt:P31 ?ty. ?ty rdfs:label ?type FILTER(LANG(?type) = "en") } }""")
    M = {}
    for l in lignes:
        i = qid(l["v"]); m = M.setdefault(i, {"code": l["code"], "fr": l.get("fr", ""), "en": l.get("en", ""), "pops": {}, "types": set()})
        an = l.get("t", "")[:4]
        m["pops"][an] = max(m["pops"].get(an, 0), int(float(l["pop"])))
        if l.get("type"): m["types"].add(l["type"])
    # classement officiel par province ; chaque subdivision retrouvée dans Wikidata par son code (Toronto : 3520 dans
    # Wikidata), sinon par son nom ; on descend le classement jusqu'à PAR_PROVINCE villes (types non urbains écartés)
    par_code = {}
    for i, m in M.items(): par_code.setdefault("3520005" if i == "Q172" else m["code"], []).append(i)
    reserve = re.compile(r"\s\d+[A-Z]?$|\(Part")                   # réserves : « Golden Lake 39 », « Six Nations (Part) 40 »
    candidats = {}
    for code, (nom, pop) in pop21.items():
        prov = PROVINCES.get(code[:2])
        if prov and not EXCLUS_NOM.search(nom) and not reserve.search(nom): candidats.setdefault(prov, []).append((pop, code, nom))
    for l in candidats.values(): l.sort(reverse=True); del l[12:]
    sans_code = {nom: (prov, code) for prov, l in candidats.items() for pop, code, nom in l if code not in par_code}
    if sans_code:
        noms = " ".join(json.dumps(n) + "@en" for n in sans_code)
        trouves = {}
        for l in sparql("""SELECT ?v ?l ?iso ?type ?pop WHERE { VALUES ?l { %s } ?v rdfs:label ?l; wdt:P17 wd:Q16; wdt:P625 ?c.
            ?v wdt:P131+ ?p. ?p wdt:P300 ?iso. FILTER(STRSTARTS(?iso, "CA-")) OPTIONAL { ?v wdt:P1082 ?pop }
            OPTIONAL { ?v wdt:P31 ?ty. ?ty rdfs:label ?type FILTER(LANG(?type) = "en") } }""" % noms):
            prov, code = sans_code.get(l["l"], (None, None))
            if prov != l["iso"]: continue
            t = trouves.setdefault(qid(l["v"]), {"code": code, "nom": l["l"], "types": set(), "pops": set()})
            if l.get("type"): t["types"].add(l["type"])
            if l.get("pop"): t["pops"].add(float(l["pop"]))
        for i, t in trouves.items():
            types = " | ".join(t["types"]); ref = pop21[t["code"]][1]
            # lieu habité seulement (pas une station météo, un lac ou une école du même nom)
            if not re.search(r"(?i)municipal|city|town|village|hamlet|community|settlement|capital|locality", types): continue
            # même nom, autre lieu (ex. la ville de Lunenburg pour le district municipal de Lunenburg) : population trop différente
            if t["pops"] and not any(0.5 <= p / ref <= 2 for p in t["pops"]): continue
            # sans population à comparer : une vraie municipalité seulement, pas un village ou une communauté du même nom
            # (ex. le village de Chester pour le district municipal de Chester)
            if not t["pops"] and (not re.search(r"(?i)\bcity\b|\btown\b|municipalit", types) or re.search(r"(?i)village|community|hamlet", types)): continue
            M.setdefault(i, {"code": t["code"], "fr": "", "en": t["nom"], "pops": {}, "types": set()})["types"] |= t["types"]
            if i not in par_code.get(t["code"], []): par_code.setdefault(t["code"], []).append(i)
    par = {}
    for prov, l in candidats.items():
        for pop, code, nom in l:
            ok = [i for i in par_code.get(code, []) if not any(EXCLUS_TYPE.search(t) for t in M[i]["types"])
                  and not EXCLUS_NOM.search(M[i]["en"]) and not EXCLUS_NOM.search(M[i]["fr"])]
            if ok and len(par.setdefault(prov, [])) < PAR_PROVINCE: par[prov].append({"q": ok[0], "pop": pop, "prov": prov, "csd": code})
    choisies = {v["q"]: v for l in par.values() for v in l}
    caps = sparql("""SELECT ?v WHERE { ?p wdt:P300 ?iso. FILTER(STRSTARTS(?iso, "CA-") && STRLEN(?iso) = 5) ?p wdt:P36 ?v. }""")
    for c in caps:
        i = qid(c["v"])
        if i not in choisies and i in M:
            code = "3520005" if i == "Q172" else M[i]["code"]
            if code in pop21: choisies[i] = {"q": i, "pop": pop21[code][1], "prov": PROVINCES.get(code[:2]), "csd": code}
    ids = sorted(choisies)
    lignes = sparql("""SELECT ?v ?nom ?coord ?drapeau ?en ?cap WHERE {
      VALUES ?v { %s }
      ?v wdt:P625 ?coord. OPTIONAL { ?v rdfs:label ?nom FILTER(LANG(?nom) = "fr") }
      OPTIONAL { ?v wdt:P41 ?drapeau }
      OPTIONAL { ?en schema:about ?v; schema:isPartOf <https://en.wikipedia.org/> }
      OPTIONAL { ?p2 wdt:P36 ?v. ?p2 wdt:P300 ?ciso. FILTER(STRSTARTS(?ciso, "CA-")) BIND(?ciso AS ?cap) }
      OPTIONAL { wd:Q16 wdt:P36 ?v. BIND("CA" AS ?cap) } }""" % " ".join("wd:" + i for i in ids))
    V = {}
    for l in lignes:
        i = qid(l["v"]); v = V.setdefault(i, dict(choisies[i]))
        lon, lat = map(float, re.findall(r"-?[\d.]+", l["coord"])[:2])
        v.setdefault("lon", round(lon, 3)); v.setdefault("lat", round(lat, 3))
        v["nom"] = l.get("nom") or v.get("nom") or M[i]["en"]
        if "drapeau" in l: v["fichier"] = urllib.parse.unquote(l["drapeau"].rsplit("/", 1)[1])
        if "en" in l: v["en"] = urllib.parse.unquote(l["en"].rsplit("/", 1)[1]).replace("_", " ")
        if "cap" in l and (v.get("cap") != "CA"): v["cap"] = l["cap"]
    # drapeaux déjà trouvés (liste précédente) : repris tels quels, sans rien redemander à Wikipédia
    try: avant = {v["q"]: v for v in json.load(open(os.path.join(MONDE, "villes-ca.json")))}
    except (OSError, ValueError): avant = {}
    for v in V.values():
        if avant.get(v["q"], {}).get("drapeau"): v["drapeau"] = avant[v["q"]]["drapeau"]; v.pop("fichier", None)
    # sans drapeau dans Wikidata : celui de l'infobox de l'article anglais (souvent un fichier non libre de Wikipédia) ;
    # Wikipédia limite le débit : un lot refusé est sauté (relancer le script le complète)
    sans = [v for v in V.values() if "fichier" not in v and "drapeau" not in v and "en" in v]
    for k in range(0, len(sans), 20):
        lot = sans[k:k + 20]
        try:
            d = api("en.wikipedia.org", essais=2, action="query", prop="revisions", rvprop="content", rvslots="main", redirects=1,
                    titles="|".join(v["en"] for v in lot))
        except urllib.error.HTTPError:
            print("Wikipédia : lot d'articles sauté (débit limité)"); continue
        norm = {x["from"]: x["to"] for x in d["query"].get("redirects", []) + d["query"].get("normalized", [])}
        pages = {p["title"]: p for p in d["query"]["pages"]}
        for v in lot:
            p = pages.get(norm.get(v["en"], v["en"]))
            txt = p and p.get("revisions", [{}])[0].get("slots", {}).get("main", {}).get("content", "")
            m = txt and re.search(r"\|\s*image_flag\s*=\s*(?:\[\[)?(?:File:|Image:)?([^|\]\n<{}]+)", txt)
            if m and m.group(1).strip(): v["fichier"] = m.group(1).strip()
        time.sleep(1)
    # licence et adresse de chaque fichier (Wikipédia anglaise : voit aussi les fichiers de Commons)
    avec = [v for v in V.values() if "fichier" in v]
    for k in range(0, len(avec), 20):
        lot = avec[k:k + 20]
        try:
            d = api("en.wikipedia.org", essais=2, action="query", prop="imageinfo", iiprop="url|extmetadata", iiurlwidth="500",
                    titles="|".join("File:" + v["fichier"] for v in lot))
        except urllib.error.HTTPError:
            print("Wikipédia : lot de fichiers sauté (débit limité)")
            for v in lot: v.pop("fichier", None)
            continue
        norm = {x["from"]: x["to"] for x in d["query"].get("normalized", [])}
        pages = {p["title"]: p for p in d["query"]["pages"]}
        for v in lot:
            t = "File:" + v["fichier"]; p = pages.get(norm.get(t, t))
            if not p or "imageinfo" not in p: v.pop("fichier"); continue
            ii = p["imageinfo"][0]; md = ii.get("extmetadata", {})
            val = lambda n: re.sub(r"<[^>]+>", "", md.get(n, {}).get("value", "")).strip()
            libre = p.get("imagerepository") == "shared"   # Commons n'accepte que des fichiers libres
            dr = {"page": ii["descriptionurl"], "licence": val("LicenseShortName"), "auteur": val("Artist")[:120], "libre": libre}
            # fichier daté « (2002-2024) » : ancienne version (ex. Gatineau, logo changé en 2024)
            m = re.search(r"\((\d{4})\s*[-–]\s*(\d{4})\)", v["fichier"])
            if m: dr["ancien"] = f"{m.group(1)}-{m.group(2)}"
            if libre:
                # vignette de 500 px affichée depuis Wikimedia (plus de copie : débit limité) ; copie déjà faite gardée
                src = ii.get("thumburl") or ii["url"]
                local = [f for f in os.listdir(VILLES_DIR) if f.split(".")[0] == v["q"]] if os.path.isdir(VILLES_DIR) else []
                dr["src"] = "monde/drapeaux/ca/villes/" + local[0] if local else src
            else:
                dr["src"] = ii.get("thumburl") or ii["url"]
            v["drapeau"] = dr
            v.pop("fichier")
        time.sleep(1)
    liste = sorted(V.values(), key=lambda v: -v.get("pop", 0))
    for v in liste: v.pop("en", None)
    json.dump(liste, open(os.path.join(MONDE, "villes-ca.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    return liste


def date_fr(t, prec):
    m = re.match(r"([+-]?)(\d+)-(\d\d)-(\d\d)", t)
    an, mois, jour = int(m.group(2)) * (-1 if m.group(1) == "-" else 1), int(m.group(3)), int(m.group(4))
    MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    if int(prec) >= 11: return f"{'1er' if jour == 1 else jour} {MOIS[mois - 1]} {an}"
    if int(prec) == 10: return f"{MOIS[mois - 1]} {an}"
    return str(an)


def fiches(liste_villes):
    # entités : pays (alpha-2), provinces et territoires (CA-xx), villes (Qxxx)
    lignes = sparql("""SELECT ?cle ?d ?t ?prec ?ratioLabel ?fr WHERE {
      { ?e wdt:P297 ?cle } UNION { ?e wdt:P300 ?cle FILTER(STRSTARTS(?cle, "CA-") && STRLEN(?cle) = 5) }
      UNION { VALUES ?e { %s } BIND(STRAFTER(STR(?e), "entity/") AS ?cle) }
      ?e p:P163 ?st. ?st ps:P163 ?d. FILTER NOT EXISTS { ?st pq:P582 ?fin0 } ?st wikibase:rank ?rang. FILTER(?rang != wikibase:DeprecatedRank)
      OPTIONAL { ?d p:P571/psv:P571 [ wikibase:timeValue ?t0; wikibase:timePrecision ?prec ]. BIND(STR(?t0) AS ?t) }
      OPTIONAL { ?d wdt:P2061 ?ratio }
      OPTIONAL { ?fr schema:about ?d; schema:isPartOf <https://fr.wikipedia.org/> }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } }""" % " ".join("wd:" + v["q"] for v in liste_villes))
    F = {}
    for l in lignes:
        f = F.setdefault(l["cle"], {})
        # plusieurs drapeaux possibles (pavillons, variantes) : on garde celui qui a un article en français
        if f and "wiki" in f and "fr" not in l: continue
        if "fr" in l and f.get("wiki") and f["wiki"] != l["fr"]: continue
        if "t" in l: f["adopte"] = date_fr(l["t"], l["prec"])
        # proportions : élément « format 2/1 » (largeur/hauteur dans Wikidata) → « 1:2 » (hauteur:largeur, usage en vexillologie)
        m = re.search(r"(\d+(?:[.,]\d+)?)\s*[:/]\s*(\d+(?:[.,]\d+)?)", l.get("ratioLabel", ""))
        if m: f["ratio"] = f"{m.group(2)}:{m.group(1)}"
        if "fr" in l: f["wiki"] = l["fr"]
    # début des articles de Wikipédia en français (CC BY-SA, cité avec le lien)
    # on reprend les résumés déjà obtenus (Wikipédia limite le débit : relancer complète ce qui manque)
    ancien = os.path.join(MONDE, "fiches.json")
    avant = json.load(open(ancien)) if os.path.exists(ancien) else {}
    for c, f in F.items():
        if avant.get(c, {}).get("wiki") == f.get("wiki") and "resume" in avant.get(c, {}): f["resume"] = avant[c]["resume"]
    titres = {urllib.parse.unquote(f["wiki"].rsplit("/", 1)[1]).replace("_", " "): c for c, f in F.items() if "wiki" in f and "resume" not in f}
    noms = list(titres)
    for k in range(0, len(noms), 5):
        try:
            d = api("fr.wikipedia.org", essais=1, action="query", prop="extracts", exintro=1, explaintext=1, exsentences=3, exlimit=5,
                    redirects=1, titles="|".join(noms[k:k + 5]))
        except urllib.error.HTTPError:
            time.sleep(20); continue
        norm = {x["to"]: x["from"] for x in d["query"].get("redirects", []) + d["query"].get("normalized", [])}
        for p in d["query"]["pages"]:
            t = p["title"]; t0 = norm.get(t, t); t0 = norm.get(t0, t0)
            if t0 in titres and p.get("extract"): F[titres[t0]]["resume"] = re.sub(r"\s+", " ", p["extract"]).strip()
        json.dump(F, open(ancien, "w"), ensure_ascii=False, separators=(",", ":"), sort_keys=True)   # progrès gardé
        time.sleep(3)
    json.dump(F, open(os.path.join(MONDE, "fiches.json"), "w"), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return F


if __name__ == "__main__":
    import sys
    # « fiches » : seulement les fiches, à partir de villes-ca.json déjà fait
    L = json.load(open(os.path.join(MONDE, "villes-ca.json"))) if sys.argv[1:] == ["fiches"] else villes()
    print(len(L), "villes,", sum(1 for v in L if v.get("drapeau", {}).get("libre")), "drapeaux libres,",
          sum(1 for v in L if "drapeau" in v and not v["drapeau"]["libre"]), "non libres,", sum(1 for v in L if "drapeau" not in v), "sans")
    F = fiches(L)
    print(len(F), "fiches,", sum(1 for f in F.values() if "resume" in f), "avec résumé,", sum(1 for f in F.values() if "adopte" in f), "avec date")
