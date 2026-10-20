"""Information Monde : villes et fiches des drapeaux (à relancer pour mettre à jour).

- monde/villes-ca.json : municipalités du Canada de 100 000 habitants et plus au recensement de 2021 (subdivisions de
  recensement de Statistique Canada, code à 7 chiffres dans Wikidata ; Toronto, aussi division de recensement, ajoutée),
  plus les capitales provinciales et territoriales ; coordonnées, population et drapeau d'après Wikidata (CC0).
  Drapeau : fichier de Wikimedia Commons (libre), vignette de 500 px copiée dans monde/drapeaux/ca/villes/, avec auteur et licence ;
  sinon fichier non libre de Wikipédia (infobox de l'article anglais) : vignette affichée depuis Wikipédia avec un lien.
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


def villes():
    rangs = sparql("""SELECT DISTINCT ?v WHERE {
      { ?v wdt:P17 wd:Q16; wdt:P3012 ?code; p:P1082 [ ps:P1082 ?pop; pq:P585 ?t ].
        FILTER(STRLEN(?code) = 7 && YEAR(?t) = 2021 && ?pop >= 100000) }
      UNION { VALUES ?v { wd:Q172 } }
      UNION { ?prov wdt:P300 ?iso. FILTER(STRSTARTS(?iso, "CA-")) ?prov wdt:P36 ?v. }
      UNION { VALUES ?v { wd:Q1930 } } }""")
    ids = sorted({qid(r["v"]) for r in rangs})
    lignes = sparql("""SELECT ?v ?nom ?coord ?pop ?iso ?drapeau ?en ?cap WHERE {
      VALUES ?v { %s }
      ?v wdt:P625 ?coord. OPTIONAL { ?v rdfs:label ?nom FILTER(LANG(?nom) = "fr") }
      OPTIONAL { ?v p:P1082 [ ps:P1082 ?pop; pq:P585 ?t ]. FILTER(YEAR(?t) = 2021) }
      OPTIONAL { ?v wdt:P131* ?prov. ?prov wdt:P300 ?iso. FILTER(STRSTARTS(?iso, "CA-")) }
      OPTIONAL { ?v wdt:P41 ?drapeau }
      OPTIONAL { ?en schema:about ?v; schema:isPartOf <https://en.wikipedia.org/> }
      OPTIONAL { ?p2 wdt:P36 ?v. ?p2 wdt:P300 ?ciso. FILTER(STRSTARTS(?ciso, "CA-")) BIND(?ciso AS ?cap) }
      OPTIONAL { wd:Q16 wdt:P36 ?v. BIND("CA" AS ?cap) } }""" % " ".join("wd:" + i for i in ids))
    V = {}
    for l in lignes:
        i = qid(l["v"]); v = V.setdefault(i, {"q": i})
        lon, lat = map(float, re.findall(r"-?[\d.]+", l["coord"])[:2])
        v.setdefault("lon", round(lon, 3)); v.setdefault("lat", round(lat, 3))
        v["nom"] = l.get("nom") or v.get("nom")
        if "pop" in l: v["pop"] = max(v.get("pop", 0), int(float(l["pop"])))
        if "iso" in l: v["prov"] = l["iso"]
        if "drapeau" in l: v["fichier"] = urllib.parse.unquote(l["drapeau"].rsplit("/", 1)[1])
        if "en" in l: v["en"] = urllib.parse.unquote(l["en"].rsplit("/", 1)[1]).replace("_", " ")
        if "cap" in l: v["cap"] = l["cap"]
    # sans drapeau dans Wikidata : celui de l'infobox de l'article anglais (souvent un fichier non libre de Wikipédia)
    sans = [v for v in V.values() if "fichier" not in v and "en" in v]
    for k in range(0, len(sans), 20):
        lot = sans[k:k + 20]
        d = api("en.wikipedia.org", action="query", prop="revisions", rvprop="content", rvslots="main", redirects=1,
                titles="|".join(v["en"] for v in lot))
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
    os.makedirs(VILLES_DIR, exist_ok=True)
    for k in range(0, len(avec), 20):
        lot = avec[k:k + 20]
        d = api("en.wikipedia.org", action="query", prop="imageinfo", iiprop="url|extmetadata", iiurlwidth="500",
                titles="|".join("File:" + v["fichier"] for v in lot))
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
                # vignette de 500 px (taille standard de Wikimedia, qui limite le téléchargement des originaux)
                src = ii.get("thumburl") or ii["url"]
                nomf = v["q"] + os.path.splitext(urllib.parse.urlparse(src).path)[1].lower()
                chemin = os.path.join(VILLES_DIR, nomf)
                if not os.path.exists(chemin):
                    try: donnees = lire(src, essais=2); open(chemin, "wb").write(donnees); time.sleep(2)
                    except urllib.error.HTTPError: pass   # débit limité : vignette affichée depuis Wikimedia, à copier plus tard
                dr["src"] = "monde/drapeaux/ca/villes/" + nomf if os.path.exists(chemin) else src
            else:
                dr["src"] = ii.get("thumburl") or ii["url"]
            v["drapeau"] = dr
            v.pop("fichier")
        time.sleep(1)
    liste = sorted(V.values(), key=lambda v: -v.get("pop", 0))
    for v in liste:
        v.pop("en", None)
        # limites du territoire (limites_qc.py) quand on les a
        if os.path.exists(os.path.join(MONDE, "limites", v["q"] + ".json")): v["limites"] = f"monde/limites/{v['q']}.json"
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
