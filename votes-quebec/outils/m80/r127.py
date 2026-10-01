"""Régions de la carte « mode actuel » : chaque circonscription de c127.json reçoit sa région (REGION_OF de sim.py),
pour que mapshaper fusionne ensuite les 127 circonscriptions par région (m80/r127.json). Ainsi les limites de région
de la carte actuelle suivent exactement celles des circonscriptions réelles (pas celles du découpage à 80)."""
import json, re, importlib.util, io, contextlib
spec = importlib.util.spec_from_file_location("sim", "sim.py"); sim = importlib.util.module_from_spec(spec)
with contextlib.redirect_stdout(io.StringIO()): spec.loader.exec_module(sim)
norm = lambda s: re.sub(r'[^a-z]', '', s.lower().replace('’', '').translate(str.maketrans('éèêëàâîïôöûùüç', 'eeeeaaiioouuuc')))
reg = {norm(n): r for n, r in sim.REGION_OF.items()}
g = json.load(open("m80/c127.json", encoding="utf-8"))
for f in g["features"]: f["properties"] = {"REG": reg[norm(f["properties"]["NM_CEP"])]}
json.dump(g, open("m80/c127_reg.json", "w", encoding="utf-8"), ensure_ascii=False)
print("régions attribuées :", len({f["properties"]["REG"] for f in g["features"]}))
