#!/usr/bin/env python3
"""Lit les tableaux du manuel ARINC 429 Part 1-17 (le PDF n'est pas dans le dépôt) et écrit 3 fichiers JSON :
  att11.json : Attachment 1-1, une ligne par (étiquette, équipement, paramètre, type BNR/BCD/DISC/SAL)
  att12.json : Attachment 1-2, codes d'équipement (hexa) → nom
  att2.json  : Attachment 2, tables 1 (BCD) et 2 (BNR) : unités, plage, bits significatifs, résolution
Usage : python3 outils/arinc429_lire.py Manuel_Arinc_429.pdf /tmp/a429   (puis outils/arinc429_generer.py)
Pages du manuel (PDF) : 1-1 → 21-50, 1-2 → 51-54, 2 → 55-82. Il faut pdftotext (poppler-utils).
"""
import json, os, re, subprocess, sys

def lire_att11(entree, sortie):
    lignes = open(entree, encoding='utf-8').read().split('\n')
    RE = re.compile(r'([0-9A-F])\s+([0-9A-F])\s+([0-9A-F])\s+([01])\s+([01])\s+([01])\s+([01])\s+([01])\s+([01])\s+([01])\s+([01])\s{2,}(\S.*)$')
    cols = None
    out = []
    for l in lignes:
        if 'BNR' in l and 'BCD' in l and 'DISC' in l:
            cols = {k: l.index(k) for k in ['BNR', 'BCD', 'DISC', 'SAL'] if k in l}
            continue
        m = RE.search(l)
        if cols is None: continue
        if not m:
            # « X » seul sur la ligne suivante (nom du paramètre trop long) : il complète la ligne précédente
            if out and out[-1]['type'] is None and re.fullmatch(r'\s*X\s*(\S.*)?', l):
                pos = l.index('X')
                out[-1]['type'] = min(cols, key=lambda k: abs(cols[k] + len(k) / 2 - pos))
            continue
        eq = ''.join(m.group(1, 2, 3))
        b = [int(x) for x in m.group(*range(4, 12))]          # bits 1..8 dans l'ordre de transmission
        oct_ = f"{b[0]*2+b[1]}{b[2]*4+b[3]*2+b[4]}{b[5]*4+b[6]*2+b[7]}"
        reste = m.group(12)
        debut = m.start(12)
        # le nom du paramètre : jusqu'au premier « X » de colonne (2 espaces ou plus avant)
        mx = re.search(r'\s{2,}X(\s|$)', reste)
        nom = (reste[:mx.start()] if mx else reste).strip()
        typ = None; notes = ''
        if mx:
            pos = debut + mx.start() + len(mx.group(0)) - (2 if mx.group(1) else 1)
            # colonne la plus proche
            typ = min(cols, key=lambda k: abs(cols[k] + len(k) / 2 - pos))
            notes = reste[mx.end():].strip()
        if re.match(r'^\d\s+Spare', nom) or nom == 'Spare': continue
        out.append({'oct': oct_, 'eq': eq, 'nom': nom, 'type': typ, 'notes': notes})
    json.dump(out, open(sortie, 'w'), ensure_ascii=False, indent=0)

def lire_att12(entree, sortie):
    eq = {}
    for l in open(entree, encoding='utf-8'):
        l = re.sub(r'^\s*c-\d+\s', ' ', l)
        for m in re.finditer(r'(?:^|\s{2,})([0-9A-F]{3})\s{2,}(\S(?:.*?\S)?)(?=\s{2,}(?:c-\d+\s+)?[0-9A-F]{3}\s|\s{2,}c-\d+|\s*$)', l):
            nom = re.sub(r'\s+c-\d+$', '', m.group(2)).strip()
            nom = re.sub(r'\s*\[\d+\]$', '', re.sub(r'\s{2,}', ' ', nom))
            if nom and not re.fullmatch(r'[0-9A-F]{3}', nom): eq[m.group(1)] = nom
    json.dump(eq, open(sortie, 'w'), ensure_ascii=False, indent=0, sort_keys=True)

def lire_att2(entree, sortie):
    lignes = open(entree, encoding='utf-8').read().split('\n')
    out = []; table = None; cols = None; label = None
    RE_EQ = re.compile(r'^\s*(?:(\d{3})\s+)?([0-9A-F]\s?[0-9A-F]\s?[0-9A-F]|0--)\s+(.*)$')
    for i, l in enumerate(lignes):
        if 'TABLE 1 - BCD DATA' in l: table = 'BCD'
        if 'TABLE 2 - BNR DATA' in l: table = 'BNR'
        if 'Units' in l and ('Bits' in l or 'Sig' in l):
            c = {}
            c['units'] = l.index('Units')
            c['range'] = l.index('(Scale)') if '(Scale)' in l else l.index('Range')
            c['sig'] = l.index('Bits') if 'Bits' in l else l.index('Sig')
            c['pos'] = l.index('Sense') if 'Sense' in l else l.index('Pos')
            c['res'] = l.index('lution') if 'lution' in l else l.index('Resolution')
            it = [m.start() for m in re.finditer('Interval', l)]
            c['min'], c['max'] = it[0], it[1]
            c['delay'] = l.index('port')
            c['notes'] = l.index('to Tables')
            cols = c; continue
        if cols is None: continue
        m = RE_EQ.match(l)
        if not m: continue
        if m.group(1): label = m.group(1)
        if not label: continue
        eq = m.group(2).replace(' ', '')
        # jetons séparés par 2 espaces ou plus, avec leur position
        toks = [(t.start(), t.group(0)) for t in re.finditer(r'\S+(?: \S+)*', l)]
        champs = {'nom': []}
        centres = sorted(cols.items(), key=lambda kv: kv[1])
        for x, t in toks:
            if x + len(t) / 2 < cols['units'] - 3: champs['nom'].append(t); continue
            cx = x + len(t) / 2
            # la colonne dont l'en-tête est le plus proche (début de l'en-tête, avec une tolérance)
            k = min(cols, key=lambda k: abs(cols[k] + 3 - cx))
            champs.setdefault(k, []).append(t)
        rec = {'table': table, 'oct': label, 'eq': eq}
        for k in ['units', 'range', 'sig', 'pos', 'res', 'notes']:
            rec[k] = ' '.join(champs.get(k, []))
        nom = ' '.join(champs['nom'])
        nom = re.sub(r'^(\d{3}\s+)?([0-9A-F]\s?[0-9A-F]\s?[0-9A-F]|0--)\s+', '', nom)
        rec['nom'] = nom
        out.append(rec)
    json.dump(out, open(sortie, 'w'), ensure_ascii=False, indent=0)

if __name__ == '__main__':
    pdf, dossier = sys.argv[1], sys.argv[2]
    os.makedirs(dossier, exist_ok=True)
    for nom, (de, a), lire in [('att11', (21, 50), lire_att11), ('att12', (51, 54), lire_att12), ('att2', (55, 82), lire_att2)]:
        txt = os.path.join(dossier, nom + '.txt')
        subprocess.run(['pdftotext', '-layout', '-f', str(de), '-l', str(a), pdf, txt], check=True)
        lire(txt, os.path.join(dossier, nom + '.json'))
        print(nom, 'lu')
