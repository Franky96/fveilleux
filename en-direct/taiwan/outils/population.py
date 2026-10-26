"""Élections locales à Taïwan : population de chaque municipalité et comté (part de la population gouvernée par parti).

Source : statistiques mensuelles de l'état civil du ministère de l'Intérieur (內政部戶政司, jeu ODRP014 « 村里戶數、人口數 »,
ris.gov.tw, Licence de données ouvertes du gouvernement de Taïwan 1.0), additionnées par comté (5 premiers chiffres du code).
Écrit le champ « pop » de chaque course dans en-direct/taiwan/courses.json (et « popMois »).

Usage : python3 en-direct/taiwan/outils/population.py [AAAMM]   (année de la République de Chine : 11509 = septembre 2026)
"""
import json, os, sys, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
COURSES = os.path.normpath(os.path.join(ICI, "..", "courses.json"))
MOIS = sys.argv[1] if len(sys.argv) > 1 else "11509"


def page(n):
    url = f"https://www.ris.gov.tw/rs-opendata/api/v1/datastore/ODRP014/{MOIS}?page={n}"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "fveilleux.com"}), timeout=60) as r:
        return json.load(r)


def main():
    tot, n, pages = {}, 1, 1
    while n <= pages:
        d = page(n)
        pages = int(d.get("totalPage") or 1)
        for x in d.get("responseData", []):
            k = x["district_code"][:5]
            tot[k] = tot.get(k, 0) + int(x["people_total"])
        n += 1
    c = json.load(open(COURSES, encoding="utf-8"))
    for code, course in c["courses"].items():
        if code in tot: course["pop"] = tot[code]
    c["popMois"] = MOIS
    with open(COURSES, "w", encoding="utf-8") as f: json.dump(c, f, ensure_ascii=False, indent=1)
    print(f"{len(tot)} comtés, {sum(tot.values()):,} habitants ({MOIS}) : {COURSES}")


if __name__ == "__main__":
    main()
