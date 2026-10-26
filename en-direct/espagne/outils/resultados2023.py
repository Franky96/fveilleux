"""Élection générale du 23 juillet 2023 (Congrès) par circonscription, pour la comparaison et la démo de en-direct/espagne/direct.js.

Source : fichiers officiels du ministère de l'Intérieur (infoelectoral.interior.gob.es, 02202307_MESA : fichiers 03, 07, 08 ; voix
définitives, vote de l'étranger (CERA) compris), compilés en JSON par le projet github.com/nachorojo/elecciones (web/data/resultados.json,
version figée ci-dessous) : candidatures ayant au moins 1 % des voix valides ou un siège, les autres réunies dans « otros ».
Contrôle : PP 8 160 837 voix et 137 sièges, PSOE 7 821 718 et 121, Vox 3 057 000 et 33, Sumar 3 044 996 et 31 (résultats officiels).

Écrit :
  en-direct/espagne/resultats-2023.json   {nat, prov: {code: {valides, blancs, nuls, votants, censo, sieges, partis: [{p, sig, v, e}], autres}}}
  en-direct/espagne/demo-2023.json        les mêmes voix, dans la forme rendue par le relais (api/direct-es.php) : {disponible, maj, pages: [{url, type, corps}]}.
      ATTENTION : la présentation exacte des données publiques de 2023 (site resultados.generales23j.es, fermé, absent des archives
      consultables d'ici) n'a pas pu être retrouvée. « corps » suit donc une forme plausible (JSON imbriqué España → comunidades →
      provincias → candidaturas, clés en espagnol), qui sert à éprouver la lecture générique de direct.js (lireJson), pas une copie.

Usage : python3 en-direct/espagne/outils/resultados2023.py
"""
import json, os, re, sys, unicodedata, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
from provinces import PROVINCES  # noqa: E402

SOURCE = "https://raw.githubusercontent.com/nachorojo/elecciones/5d1b28b27b7c28c9da7747725d87edb98e5adcfb/web/data/resultados.json"
DOSSIER = os.path.normpath(os.path.join(ICI, ".."))
CA = {"AN": ("01", "Andalucía"), "AR": ("02", "Aragón"), "AS": ("03", "Principado de Asturias"), "IB": ("04", "Illes Balears"), "CN": ("05", "Canarias"),
      "CB": ("06", "Cantabria"), "CM": ("07", "Castilla-La Mancha"), "CL": ("08", "Castilla y León"), "CT": ("09", "Cataluña"), "EX": ("10", "Extremadura"),
      "GA": ("11", "Galicia"), "MD": ("12", "Comunidad de Madrid"), "NC": ("13", "Comunidad Foral de Navarra"), "PV": ("14", "País Vasco"),
      "MC": ("15", "Región de Murcia"), "RI": ("16", "La Rioja"), "VC": ("17", "Comunitat Valenciana"), "CE": ("18", "Ciudad de Ceuta"), "ML": ("19", "Ciudad de Melilla")}

# même correspondance que PARTI_DE dans direct.js (sigles normalisés : minuscules, sans accents ni ponctuation)
REGLES = [("erc", r"^erc|esquerrarepublicana"), ("junts", r"junts|jxcat"), ("bildu", r"bildu"), ("pnv", r"pnv|^eaj"), ("bng", r"^bng|bloquenacionalista"),
          ("upn", r"^upn$|uniondelpueblonavarro"), ("pp", r"^pp|partidopopular|upnpp"), ("psoe", r"psoe|^psc|^pse|socialista"), ("vox", r"^vox"),
          ("sumar", r"sumar"), ("fv", r"compromis|frontvalencia|^fv$"), ("fa", r"frenteamplio|^fa$|^fa[a-z]"), ("podemos", r"podemos|^podem"),
          ("cc", r"^cca|^cc$|^cc[a-z0-9]|coalicioncanaria"), ("salf", r"salf|seacabolafiesta"), ("adelante", r"adelante")]


def norm(s):
    s = unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


def parti(sig):
    n = norm(sig)
    for p, rx in REGLES:
        if re.search(rx, n): return p
    return "aut"


def main():
    d = json.load(urllib.request.urlopen(urllib.request.Request(SOURCE, headers={"User-Agent": "fveilleux.com"}), timeout=60))
    e = next(x for x in d["elecciones"] if x["id"] == "2023")

    def bloc(t):
        return {"valides": t["validos"], "blancs": t["blancos"], "nuls": t["nulos"], "votants": t["votantes"], "censo": t["censo"],
                "sieges": t["escanos_total"], "partis": [{"p": parti(k["s"]), "sig": k["s"], "v": k["v"], "e": k["e"]} for k in t["partidos"]], "autres": t["otros"]}
    out = {"election": "Congrès des députés, 23 juillet 2023 (résultats définitifs, vote de l'étranger compris)",
           "source": "Ministerio del Interior, infoelectoral (02202307_MESA), via github.com/nachorojo/elecciones",
           "nat": bloc(e["nacional"]), "prov": {c: bloc(t) for c, t in sorted(e["provincias"].items())}}
    nat = out["nat"]
    assert sum(k["e"] for k in nat["partis"]) == 350
    with open(os.path.join(DOSSIER, "resultats-2023.json"), "w", encoding="utf-8") as f: json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    # démo : forme imbriquée plausible (voir l'avertissement en tête)
    def amb(t, nombre, codigo, cle="codigo"):
        return {cle: codigo, "nombre": nombre, "escrutinio": {"mesasTotales": 100, "mesasEscrutadas": 100, "porcentaje": 100.0},
                "censoINE": t["censo"], "votantes": t["votants"], "nulos": t["nuls"], "blancos": t["blancs"], "escanosEnJuego": t["sieges"],
                "candidaturas": [{"siglas": k["sig"], "votos": k["v"], "porcentaje": round(100 * k["v"] / t["valides"], 2), "electos": k["e"]} for k in t["partis"]]
                + ([{"siglas": "OTRAS", "votos": t["autres"], "porcentaje": round(100 * t["autres"] / t["valides"], 2), "electos": 0}] if t["autres"] else [])}
    comms = {}
    for c, t in out["prov"].items():
        nom, noms, ca, _ = PROVINCES[c]
        comms.setdefault(ca, []).append(amb(t, noms[0], c, "codigoProvincia"))
    corps = {"convocatoria": "Elecciones Generales 2023 · Congreso de los Diputados", "fecha": "2023-07-23",
             "nacional": amb(nat, "Total España", "99"),
             "comunidades": [{"codigo": CA[ca][0], "nombre": CA[ca][1], "provincias": L} for ca, L in sorted(comms.items(), key=lambda x: CA[x[0]][0])]}
    demo = {"disponible": True, "maj": "2023-07-24T09:00:00+02:00", "source": "démo (2023)", "demo": 2023,
            "pages": [{"url": "demo-2023", "type": "json", "corps": json.dumps(corps, ensure_ascii=False, separators=(",", ":"))}]}
    with open(os.path.join(DOSSIER, "demo-2023.json"), "w", encoding="utf-8") as f: json.dump(demo, f, ensure_ascii=False, separators=(",", ":"))
    print("resultats-2023.json et demo-2023.json écrits ;", {k["p"]: k["e"] for k in nat["partis"]})


if __name__ == "__main__":
    main()
