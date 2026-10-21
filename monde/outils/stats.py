"""Information Monde : fiche de 20 statistiques par pays (mode normal, sans rubrique), dans monde/stats.json.

Sources : Banque mondiale, indicateurs du développement dans le monde (API v2, CC BY 4.0 ; dernière valeur connue de
chaque pays, avec son année), Unicode CLDR (licence Unicode ; langues officielles et monnaie en usage, en codes ISO 639 et
ISO 4217, nommés en français dans la page par Intl.DisplayNames) et Wikidata (CC0 ; capitale, libellé en français).
Wikidata n'a pas servi pour les langues et la monnaie : valeurs incohérentes (pas d'euro pour la France ni les Pays-Bas,
langues des territoires pour les États-Unis).
Clé : code ISO 3166-1 alpha-2 (celui de monde/pays.json). Taïwan n'est pas couvert par la Banque mondiale.

Usage : python3 monde/outils/stats.py   (à relancer de temps en temps : les valeurs sont mises à jour chaque année)
"""
import datetime as dt, json, os, time, urllib.parse, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.normpath(os.path.join(ICI, "..", "stats.json"))
UA = {"User-Agent": "fveilleux.com (Information Monde, statistiques des pays)"}

# clé courte → (code de l'indicateur, libellé, unité) ; l'ordre et les groupes sont ceux de la fiche (monde.js : STATS)
INDICATEURS = {
    "pop": ("SP.POP.TOTL", "Population", ""),
    "urb": ("SP.URB.TOTL.IN.ZS", "Population urbaine", "%"),
    "vie": ("SP.DYN.LE00.IN", "Espérance de vie", "ans"),
    "fec": ("SP.DYN.TFRT.IN", "Fécondité", "enfants par femme"),
    "mort": ("SP.DYN.IMRT.IN", "Mortalité infantile", "‰"),
    "pib": ("NY.GDP.MKTP.CD", "PIB", "$ US"),
    "pibh": ("NY.GDP.PCAP.CD", "PIB par habitant", "$ US"),
    "croiss": ("NY.GDP.MKTP.KD.ZG", "Croissance du PIB", "%"),
    "infl": ("FP.CPI.TOTL.ZG", "Inflation", "%"),
    "chom": ("SL.UEM.TOTL.ZS", "Chômage", "%"),
    "expo": ("NE.EXP.GNFS.ZS", "Exportations", "% du PIB"),
    "net": ("IT.NET.USER.ZS", "Internautes", "% de la population"),
    "sante": ("SH.XPD.CHEX.GD.ZS", "Dépenses de santé", "% du PIB"),
    "co2": ("EN.GHG.CO2.PC.CE.AR5", "CO₂ par habitant", "t"),
    "foret": ("AG.LND.FRST.ZS", "Forêts", "% du territoire"),
}


def lire(url, essais=4):
    for i in range(essais):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            if i == essais - 1: raise
            print("  nouvel essai :", e); time.sleep(3 * (i + 1))


def banque_mondiale():
    out = {}
    for cle, (code, lib, _) in INDICATEURS.items():
        # (tout en une page : avec « mrnev », les pages de 400 lignes de l'API sont incomplètes, ex. exportations du Canada)
        d = lire(f"https://api.worldbank.org/v2/country/all/indicator/{code}?format=json&per_page=20000&mrnev=1")
        n = 0
        for x in d[1] or []:
            a2, v = x["country"]["id"], x["value"]
            if a2 == "1W": a2 = "monde"                                  # (moyenne ou total mondial : comparaison dans la fiche)
            elif v is None or len(a2) != 2 or not a2.isalpha(): continue   # (agrégats régionaux : codes à chiffres)
            if v is None: continue
            out.setdefault(a2, {})[cle] = [round(v, 4) if isinstance(v, float) else v, int(x["date"])]; n += 1
        print(f"{lib} : {n} pays")
    return out


REQUETE = """
SELECT ?a2 (GROUP_CONCAT(DISTINCT ?capL; separator="|") AS ?cap) (GROUP_CONCAT(DISTINCT ?langL; separator="|") AS ?langues)
       (GROUP_CONCAT(DISTINCT ?monL; separator="|") AS ?mon) (MAX(?aire) AS ?sup) WHERE {
  ?p wdt:P297 ?a2 .
  OPTIONAL { ?p p:P2046 ?sa . ?sa a wikibase:BestRank ; psn:P2046/wikibase:quantityAmount ?aire }
  OPTIONAL { ?p wdt:P36 ?c . ?c rdfs:label ?capL . FILTER(LANG(?capL) = "fr") }
  OPTIONAL { ?p wdt:P37 ?l . ?l rdfs:label ?langL . FILTER(LANG(?langL) = "fr") }
  OPTIONAL { ?p wdt:P38 ?m . ?m rdfs:label ?monL . FILTER(LANG(?monL) = "fr") }
} GROUP BY ?a2
"""


def wikidata():
    url = "https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(REQUETE)
    d = lire(url)
    out = {}
    for b in d["results"]["bindings"]:
        a2 = b["a2"]["value"].upper()
        f = {}
        # (valeurs « vraies » de Wikidata : rang privilégié s'il y en a un, ex. l'euro pour la France, pas le franc Pacifique)
        for cle in ("cap", "langues", "mon"):
            v = b.get(cle, {}).get("value")
            if v: f[cle] = sorted(set(v.split("|")))
        # superficie de Wikidata (en m², normalisée) : celle de la Banque mondiale est fausse pour le Canada (15,6 millions de km²)
        if b.get("sup", {}).get("value"): f["sup"] = round(float(b["sup"]["value"]) / 1e6, 1)
        if f: out[a2] = f
    print(f"Wikidata : {len(out)} pays")
    return out


CLDR = "https://cdn.jsdelivr.net/npm/cldr-core@46.0.0/supplemental/"


def cldr():
    """Langues de statut officiel (ou officielles de fait) et monnaie(s) en usage de chaque territoire."""
    terr = lire(CLDR + "territoryInfo.json")["supplemental"]["territoryInfo"]
    mon = lire(CLDR + "currencyData.json")["supplemental"]["currencyData"]["region"]
    out = {}
    for a2, t in terr.items():
        if len(a2) != 2 or not a2.isalpha(): continue
        L = t.get("languagePopulation", {})
        langues = sorted((l for l, v in L.items() if v.get("_officialStatus") in ("official", "de_facto_official")),
                         key=lambda l: -float(L[l].get("_populationPercent", 0)))
        if langues: out.setdefault(a2, {})["langues"] = [l.replace("_", "-") for l in langues]
    for a2, liste in mon.items():
        cours = [c for d in liste for c, v in d.items() if "_to" not in v and v.get("_tender") != "false"]
        if cours: out.setdefault(a2, {})["mon"] = cours
    print(f"CLDR : {len(out)} territoires")
    return out


def main():
    bm, wd, cl = banque_mondiale(), wikidata(), cldr()
    pays = {}
    monde = bm.pop("monde", {})
    for a2 in sorted(set(bm) | set(wd) | set(cl)):
        p = pays[a2] = {**{k: v for k, v in wd.get(a2, {}).items() if k in ("cap", "sup")}, **cl.get(a2, {}), **bm.get(a2, {})}
        if p.get("sup") and p.get("pop"): p["dens"] = [round(p["pop"][0] / p["sup"], 2), p["pop"][1]]   # (habitants par km² de superficie totale)
    meta = {"genere": dt.date.today().isoformat(),
            "indicateurs": {k: {"code": c, "libelle": l, "unite": u} for k, (c, l, u) in INDICATEURS.items()},
            "superficie": "Wikidata (P2046)", "densite": "population / superficie",
            "sources": "Banque mondiale, Indicateurs du développement dans le monde (CC BY 4.0) ; Unicode CLDR ; Wikidata (CC0)"}
    with open(SORTIE, "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "monde": monde, "pays": pays}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{SORTIE} : {len(pays)} pays")


if __name__ == "__main__":
    main()
