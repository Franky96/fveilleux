"""Région électorale (annexe I du projet de loi 39) de chaque municipalité des sections de vote 2026 → m80/mun_region.csv

L'annexe I définit chaque région par une carte et par la liste des MRC, villes et territoires qu'elle « comprend
principalement » (texte : brut/projet-de-loi-39.pdf, p. 57-75). On applique ces listes à l'organisation municipale
actuelle : chaque code géographique (CODE_MUNCP des sections de vote) → sa MRC ou son territoire équivalent dans le
Répertoire des municipalités du MAMH (brut/MUN.csv) → la région de l'annexe I.

Règles (colonne REGLE de la sortie) :
  mrc        MRC nommée dans l'annexe I (MRC du Répertoire, liens actuels)
  municipal  ville, municipalité ou réserve nommée dans l'annexe I (hors MRC : Québec, Laval, Wendake, etc.)
  nord       Nord-du-Québec : code 99xxx (Eeyou Istchee Baie-James, Matagami, Lebel-sur-Quévillon, Chibougamau, Chapais,
             villages cris et naskapi, terres IA, Kativik, TNO de catégorie II ; « tout territoire situé au nord » des MRC
             nommées)
  enclave    réserve, établissement ou terre de catégorie IA-N non nommé, ou TNO aquatique/terrestre absent du Répertoire :
             région de la division de recensement qui l'entoure (toutes ses municipalités sont dans la même région)

Usage : /usr/bin/python3 -I m80/regions39.py   (dans outils/, après le téléchargement de brut/MUN.csv)
"""
import csv, re, sys, os
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import sim

# annexe I : (région, MRC [code du Répertoire, nom dans l'annexe], municipalités hors MRC [code, nom dans l'annexe])
ANNEXE = {
    "Abitibi-Témiscamingue": ({"880": "Abitibi", "870": "Abitibi-Ouest", "890": "La Vallée-de-l'Or", "850": "Témiscamingue"},
                              {"86042": "Rouyn-Noranda"}),
    "Bas-Saint-Laurent": ({"140": "Kamouraska", "080": "La Matanie", "070": "La Matapédia", "090": "La Mitis",
                           "100": "Rimouski-Neigette", "120": "Rivière-du-Loup", "130": "Témiscouata", "110": "Les Basques"}, {}),
    "Capitale-Nationale": ({"160": "Charlevoix", "150": "Charlevoix-Est", "210": "La Côte-de-Beaupré", "220": "La Jacques-Cartier",
                            "200": "L'Île-d'Orléans", "340": "Portneuf"},
                           {"23015": "Notre-Dame-des-Anges", "23802": "Wendake", "23057": "L'Ancienne-Lorette", "23027": "Québec",
                            "23072": "Saint-Augustin-de-Desmaures"}),
    "Centre-du-Québec": ({"390": "Arthabaska", "380": "Bécancour", "490": "Drummond", "320": "L'Érable", "500": "Nicolet-Yamaska"}, {}),
    # MRC Robert-Cliche dans l'annexe : renommée Beauce-Centre depuis (même code 270, mêmes municipalités)
    "Chaudière-Appalaches": ({"310": "Les Appalaches", "190": "Bellechasse", "290": "Beauce-Sartigan", "280": "Les Etchemins",
                              "260": "La Nouvelle-Beauce", "170": "L'Islet", "330": "Lotbinière", "180": "Montmagny", "270": "Robert-Cliche"},
                             {"25213": "Lévis"}),
    "Côte-Nord": ({"972": "Caniapiscau", "950": "La Haute-Côte-Nord", "960": "Manicouagan", "981": "Minganie", "971": "Sept-Rivières",
                   "982": "Le Golfe-du-Saint-Laurent"}, {}),
    "Estrie": ({"440": "Coaticook", "450": "Memphrémagog", "400": "Les Sources", "300": "Le Granit", "410": "Le Haut-Saint-François",
                "420": "Le Val-Saint-François"}, {"43027": "Sherbrooke"}),
    "Gaspésie–Îles-de-la-Madeleine": ({"060": "Avignon", "050": "Bonaventure", "030": "La Côte-de-Gaspé", "040": "La Haute-Gaspésie",
                                       "020": "Le Rocher-Percé"}, {"01042": "Grosse-Île", "01023": "Les Îles-de-la-Madeleine"}),
    "Lanaudière": ({"520": "D'Autray", "610": "Joliette", "600": "L'Assomption", "620": "Matawinie", "630": "Montcalm", "640": "Les Moulins"}, {}),
    "Laurentides": ({"790": "Antoine-Labelle", "760": "Argenteuil", "720": "Deux-Montagnes", "750": "La Rivière-du-Nord",
                     "730": "Thérèse-De Blainville", "780": "Les Laurentides", "770": "Les Pays-d'en-Haut"}, {"74005": "Mirabel"}),
    "Laval": ({}, {"65005": "Laval"}),
    "Mauricie": ({"510": "Maskinongé", "350": "Mékinac", "372": "Des Chenaux"},
                 {"90017": "La Bostonnais", "90027": "Lac-Édouard", "90012": "La Tuque", "36033": "Shawinigan", "37067": "Trois-Rivières"}),
    "Montréal": ({}, {"66127": "Senneville", "66112": "Baie-D'Urfé", "66107": "Beaconsfield", "66058": "Côte-Saint-Luc",
                      "66142": "Dollard-des-Ormeaux", "66087": "Dorval", "66062": "Hampstead", "66102": "Kirkland", "66092": "L'Île-Dorval",
                      "66023": "Montréal", "66007": "Montréal-Est", "66047": "Montréal-Ouest", "66072": "Mont-Royal", "66097": "Pointe-Claire",
                      "66117": "Sainte-Anne-de-Bellevue", "66032": "Westmount"}),
    # Brome-Missisquoi et La Haute-Yamaska : Montérégie dans l'annexe (région administrative de l'Estrie depuis 2021)
    "Montérégie": ({"480": "Acton", "700": "Beauharnois-Salaberry", "460": "Brome-Missisquoi", "470": "La Haute-Yamaska",
                    "570": "La Vallée-du-Richelieu", "590": "Marguerite-D'Youville", "530": "Pierre-De Saurel", "670": "Roussillon",
                    "550": "Rouville", "710": "Vaudreuil-Soulanges", "680": "Les Jardins-de-Napierville", "540": "Les Maskoutains",
                    "560": "Le Haut-Richelieu", "690": "Le Haut-Saint-Laurent"},
                   {"58033": "Boucherville", "58007": "Brossard", "58227": "Longueuil", "58037": "Saint-Bruno-de-Montarville",
                    "58012": "Saint-Lambert"}),
    "Nord-du-Québec": ({}, {}),        # règle « nord » : tout code 99xxx
    "Outaouais": ({"830": "La Vallée-de-la-Gatineau", "800": "Papineau", "840": "Pontiac", "820": "Les Collines-de-l'Outaouais"},
                  {"81017": "Gatineau"}),
    "Saguenay–Lac-Saint-Jean": ({"910": "Le Domaine-du-Roy", "942": "Le Fjord-du-Saguenay", "930": "Lac-Saint-Jean-Est",
                                 "920": "Maria-Chapdelaine"}, {"94068": "Saguenay"}),
}
RENOMMEES = {"270": "Beauce-Centre"}   # MRC renommées depuis 2019 (code inchangé)
assert set(ANNEXE) == set(sim.REGIONS)
norm = lambda s: re.sub(r"[^a-z]", "", s.lower().replace("’", "'").translate(str.maketrans("éèêëàâîïôöûùüç", "eeeeaaiioouuuc")))

# --- Répertoire des municipalités (MAMH) ---
MUN = {r["mcode"]: r for r in csv.DictReader(open("brut/MUN.csv", encoding="utf-8-sig"))}
mrc_de = lambda r: (re.search(r"\((\d{3})\)", r["mrc"]) or [None, None])[1]
cd_de = lambda r: re.search(r"\((\d{2})\)", r["divrec"])[1]
nom_mrc = {mrc_de(r): re.sub(r"^MRC |\s*\(\d+\)$", "", r["mrc"]) for r in MUN.values() if mrc_de(r)}
reg_mrc = {m: reg for reg, (mrcs, _) in ANNEXE.items() for m in mrcs}
reg_mun = {c: reg for reg, (_, muns) in ANNEXE.items() for c in muns}

# vérifications : toutes les MRC du Répertoire sont dans l'annexe, et sous le même nom (sauf renommées)
assert set(nom_mrc) == set(reg_mrc), (set(nom_mrc) ^ set(reg_mrc))
for reg, (mrcs, muns) in ANNEXE.items():
    for m, n in mrcs.items():
        assert norm(nom_mrc[m]) == norm(RENOMMEES.get(m, n)), (m, n, nom_mrc[m])
    for c, n in muns.items():
        assert norm(MUN[c]["munnom"]) == norm(n) and not mrc_de(MUN[c]), (c, n)
renommees = [f"MRC {n} → {nom_mrc[m]} ({m})" for reg, (mrcs, _) in ANNEXE.items() for m, n in mrcs.items() if norm(n) != norm(nom_mrc[m])]


def region(code):
    """(région, règle, territoire) d'un code géographique à 5 chiffres."""
    r = MUN.get(code)
    if code.startswith("99"): return sim.NORD, "nord", (r["munnom"] if r else "Nord-du-Québec")
    if r and mrc_de(r): return reg_mrc[mrc_de(r)], "mrc", "MRC " + nom_mrc[mrc_de(r)]
    if code in reg_mun: return reg_mun[code], "municipal", MUN[code]["munnom"]
    return None, "enclave", None


# division de recensement → région (pour les enclaves) : chaque division doit tomber dans une seule région
par_cd = defaultdict(Counter)
for c, r in MUN.items():
    reg, regle, _ = region(c)
    if reg: par_cd[c[:2]][reg] += 1
multi = {cd: dict(v) for cd, v in par_cd.items() if len(v) > 1}
assert not multi, multi
reg_cd = {cd: next(iter(v)) for cd, v in par_cd.items()}

# --- Sections de vote 2026 ---
sec = defaultdict(lambda: [0, 0, None, Counter()])
for s in csv.DictReader(open("m80/sections_pts.csv", encoding="utf-8")):
    c = s["CODE_MUNCP"].zfill(5); x = sec[c]
    x[0] += 1; x[1] += int(s["ELEC_2026"] or 0); x[2] = s["NM_MUNCP"]; x[3][s["NM_CEP"]] += int(s["ELEC_2026"] or 0)

lignes = []
for c in sorted(sec):
    n, e, nm, circ = sec[c]
    reg, regle, terr = region(c)
    if reg is None:
        reg = reg_cd[c[:2]]
        r = MUN.get(c)
        terr = (r["mdes"] + " · " if r else "") + "enclave, division " + (r["divrec"] if r else c[:2])
    lignes.append({"CODE_MUNCP": c, "NM_MUNCP": nm, "DESIGNATION": MUN[c]["mdes"] if c in MUN else "(absent du Répertoire)",
                   "TERRITOIRE": terr, "REG": sim.CODE[reg], "REGION": reg, "REGLE": regle, "SECTIONS": n, "ELEC_2026": e,
                   "REG_ADM_MAMH": MUN[c]["regadm"] if c in MUN else "", "CIRC_2026": " | ".join(k for k, _ in circ.most_common())})

with open("m80/mun_region.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(lignes[0])); w.writeheader(); w.writerows(lignes)

# --- Résumé ---
tot = Counter(); regles = Counter()
for l in lignes: tot[l["REGION"]] += l["ELEC_2026"]; regles[l["REGLE"]] += 1
print(f"{len(lignes)} codes géographiques ({sum(regles.values())}) :", dict(regles))
print("MRC renommées depuis l'annexe :", renommees or "aucune")
print("Enclaves :")
for l in lignes:
    if l["REGLE"] == "enclave" and l["ELEC_2026"]: print(f"  {l['CODE_MUNCP']} {l['NM_MUNCP']:28} {l['ELEC_2026']:6} électeurs → {l['REGION']}")
print("Région de l'annexe ≠ région administrative actuelle (MAMH) :")
for l in lignes:
    adm = re.sub(r"\s*\(\d+\)$", "", l["REG_ADM_MAMH"]).replace("--", "–")
    if adm and adm != l["REGION"]: print(f"  {l['CODE_MUNCP']} {l['NM_MUNCP']:28} {l['ELEC_2026']:6} électeurs : {adm} → {l['REGION']}")
for r in sim.REGIONS: print(f"  {sim.CODE[r]} {r:32} {tot[r]:9}")
print("total", sum(tot.values()))
