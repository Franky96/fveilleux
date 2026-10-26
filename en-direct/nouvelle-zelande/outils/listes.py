"""Élections générales en Nouvelle-Zélande du 7 novembre 2026 : listes fixes de la page « En direct ».

  - en-direct/nouvelle-zelande/candidats.json : partis, 71 circonscriptions (64 générales, 7 maories) et candidatures de 2026, lus dans
    le flux XML de la Commission électorale (parties.xml, electorates.xml, candidates.xml ; publié avant le vote, voix à zéro) ;
  - en-direct/nouvelle-zelande/resultats-2023.json : résultats officiels de 2023 par circonscription (anciennes limites, 72
    circonscriptions) et pour tout le pays, lus dans l'archive XML de la Commission (archive.electionresults.govt.nz).

Usage : python3 en-direct/nouvelle-zelande/outils/listes.py
"""
import json, os, urllib.request
import xml.etree.ElementTree as ET

ICI = os.path.dirname(os.path.abspath(__file__))
DOSSIER = os.path.normpath(os.path.join(ICI, ".."))
FLUX_2026 = ["https://media.election.net.nz/xml/", "https://www.electionresults.govt.nz/xml/"]
ARCHIVE_2023 = "https://archive.electionresults.govt.nz/electionresults_2023/xml/"
MAORIES = {"Hauraki-Waikato", "Ikaroa-Rāwhiti", "Tāmaki Makaurau", "Te Tai Hauāuru", "Te Tai Tokerau", "Te Tai Tonga", "Waiariki"}
ABREV = {"TOP": "OPP"}           # The Opportunity Party (2023) = Opportunity Party (2026)


def lire(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "fveilleux.com (resultats en direct)"}), timeout=60) as r:
        return ET.fromstring(r.read())


def lire_flux(bases, f):
    for b in bases:
        try: return lire(b + f)
        except Exception as e: print("Lecture impossible :", b + f, e)
    raise SystemExit("Flux de la Commission électorale introuvable.")


def listes(bases):
    partis = {x.get("p_no"): {"a": ABREV.get(x.findtext("abbrev"), x.findtext("abbrev")), "nom": x.findtext("short_name"), "reg": x.findtext("registered") == "yes"}
              for x in lire_flux(bases, "parties.xml")}
    circ = {x.get("e_no"): {"nom": x.findtext("electorate_name"), "t": "m" if x.findtext("electorate_name") in MAORIES else "g"} for x in lire_flux(bases, "electorates.xml")}
    cands = [{"c": x.get("c_no"), "nom": x.findtext("candidate_name"), "e": x.findtext("electorate"), "p": x.findtext("party"), "l": int(x.findtext("list_no") or 0)}
             for x in lire_flux(bases, "candidates.xml")]
    return partis, circ, cands


def main():
    partis, circ, cands = listes(FLUX_2026)
    json.dump({"source": FLUX_2026[0], "partis": partis, "circ": circ, "cands": cands},
              open(os.path.join(DOSSIER, "candidats.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(len(circ), "circonscriptions,", len(cands), "candidatures")

    # 2023 : résultats officiels
    p23, c23, k23 = listes([ARCHIVE_2023])
    parti_de = {k["c"]: k["p"] for k in k23}
    nom_de = {k["c"]: k["nom"] for k in k23}
    ab = lambda p: partis_ab(p23, p)
    out = {}
    for e, ci in c23.items():
        x = lire(f"{ARCHIVE_2023}e{int(e):02d}/e{int(e):02d}.xml")
        cv = sorted(((int(c.findtext("votes") or 0), c.get("c_no")) for c in x.find("candidatevotes")), reverse=True)
        pv = sorted(((int(p.findtext("votes") or 0), p.get("p_no")) for p in x.find("partyvotes")), reverse=True)
        tc, tp = sum(v for v, _ in cv) or 1, sum(v for v, _ in pv) or 1
        out[ci["nom"]] = {"t": ci["t"], "gagnant": ab(parti_de.get(cv[0][1])),
                          "cands": [{"nom": nom_de.get(c), "p": ab(parti_de.get(c)), "pct": round(100 * v / tc, 2)} for v, c in cv[:3]],
                          "pv": [{"p": ab(p), "pct": round(100 * v / tp, 2)} for v, p in pv[:4]]}
    el = lire(ARCHIVE_2023 + "election.xml")
    nat = {ab(p.get("p_no")): {"pct": float(p.findtext("percent_votes") or 0), "sieges": int(p.findtext("total_seats") or 0), "circ": int(p.findtext("candidate_seats") or 0)}
           for p in el.find("partystatus") if float(p.findtext("percent_votes") or 0) >= 0.5 or int(p.findtext("total_seats") or 0)}
    json.dump({"source": ARCHIVE_2023, "national": nat, "circ": out}, open(os.path.join(DOSSIER, "resultats-2023.json"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    print("2023 :", len(out), "circonscriptions")


def partis_ab(partis, p):
    return partis[p]["a"] if p in partis else "IND"


if __name__ == "__main__":
    main()
