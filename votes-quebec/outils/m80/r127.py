"""Régions de la carte « mode actuel » : chaque circonscription de c127.json reçoit sa région principale, celle où vit la
majorité de ses électeurs d'après les sections de vote (m80/districts.json, rid_reg, sortie de m80/district2.py), pour que
mapshaper fusionne ensuite les 127 circonscriptions par région (m80/r127.json). Les limites de région de la carte actuelle
suivent donc les circonscriptions réelles ; les vraies limites de l'annexe I (qui coupent 6 circonscriptions) sont dans
m80/r80.json. Même règle que « r » des circonscriptions dans build_data80.py."""
import json, re
norm = lambda s: re.sub(r'[^a-z]', '', s.lower().replace('’', '').translate(str.maketrans('éèêëàâîïôöûùüç', 'eeeeaaiioouuuc')))
reg = {norm(n): max(v, key=v.get) for n, v in json.load(open("m80/districts.json", encoding="utf-8"))["rid_reg"].items()}
g = json.load(open("m80/c127.json", encoding="utf-8"))
for f in g["features"]: f["properties"] = {"REG": reg[norm(f["properties"]["NM_CEP"])]}
json.dump(g, open("m80/c127_reg.json", "w", encoding="utf-8"), ensure_ascii=False)
print("régions attribuées :", len({f["properties"]["REG"] for f in g["features"]}))
