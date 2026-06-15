/*
 * firebase-config.js — couche de compatibilité PHP
 * Remplace le SDK Firebase par des appels fetch() vers /api/data.php
 * Exporte la même interface que l'ancien SDK Firebase utilisé dans le site.
 */

const API = '/api';

/* ── Références ── */
export const db = { __isFvDb: true };

export function doc(dbOrRef, ...pathParts) {
  const path = pathParts.join('/').split('/').filter(Boolean);
  return { __type: 'doc', collection: path[0], id: path.slice(1).join('/') };
}

export function collection(db, col) {
  return { __type: 'col', collection: col };
}

/* ── Lecture ── */
export async function getDoc(ref) {
  const res  = await fetch(`${API}/data.php?col=${enc(ref.collection)}&id=${enc(ref.id)}`, { credentials: 'include' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Erreur serveur');
  return { exists: () => json.exists, data: () => json.data ?? null, id: ref.id };
}

export async function getDocs(queryOrRef) {
  if (queryOrRef.__type === 'query') {
    const res  = await _post('query', { col: queryOrRef.collection, where: queryOrRef.wheres, orderBy: queryOrRef.order });
    const json = await res.json();
    return _snapFromDocs(json.docs ?? []);
  }
  const res  = await fetch(`${API}/data.php?col=${enc(queryOrRef.collection)}`, { credentials: 'include' });
  const json = await res.json();
  return _snapFromDocs(json.docs ?? []);
}

function _snapFromDocs(docs) {
  const snapDocs = docs.map(d => ({ id: d.id, data: () => d.data, exists: () => true }));
  return { docs: snapDocs, forEach: cb => snapDocs.forEach(cb), size: snapDocs.length };
}

/* ── Écriture ── */
export async function setDoc(ref, data, options = {}) {
  const action = options?.merge ? 'merge' : 'set';
  const res    = await _post(action, { col: ref.collection, id: ref.id, data });
  if (!res.ok) throw new Error((await res.json()).error ?? 'Erreur serveur');
}

export async function updateDoc(ref, data) {
  const res = await _post('update', { col: ref.collection, id: ref.id, data });
  if (!res.ok) throw new Error((await res.json()).error ?? 'Erreur serveur');
}

export async function deleteDoc(ref) {
  const res = await _post('delete', { col: ref.collection, id: ref.id });
  if (!res.ok) throw new Error((await res.json()).error ?? 'Erreur serveur');
}

export async function addDoc(colRef, data) {
  const res  = await _post('add', { col: colRef.collection, data });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Erreur serveur');
  return { id: json.id };
}

/* ── Requêtes ── */
export function query(colRef, ...constraints) {
  const wheres = [], order = [];
  for (const c of constraints) {
    if (c.__type === 'where')   wheres.push([c.field, c.op, c.value]);
    if (c.__type === 'orderBy') order.push([c.field, c.dir]);
  }
  return { __type: 'query', collection: colRef.collection, wheres, order: order[0] ?? null };
}

export function where(field, op, value)     { return { __type: 'where',   field, op, value }; }
export function orderBy(field, dir = 'asc') { return { __type: 'orderBy', field, dir }; }
export function limit(n)                    { return { __type: 'limit', n }; }

/* ── onSnapshot → polling toutes les 4 s ── */
export function onSnapshot(ref, callback, onError) {
  let lastJson = null;

  const poll = async () => {
    try {
      let snap;
      if (ref.__type === 'doc') {
        snap = await getDoc(ref);
      } else {
        const res  = await fetch(`${API}/data.php?col=${enc(ref.collection)}`, { credentials: 'include' });
        const json = await res.json();
        snap = _snapFromDocs(json.docs ?? []);
      }
      const serial = JSON.stringify(ref.__type === 'doc' ? snap.data() : snap.docs.map(d => d.data()));
      if (serial !== lastJson) { lastJson = serial; callback(snap); }
    } catch (e) {
      console.warn('[db] onSnapshot poll error:', e);
      onError?.(e);
    }
  };

  poll();
  const id = setInterval(poll, 4000);
  return () => clearInterval(id);
}

/* ── Valeurs spéciales ── */
export const serverTimestamp = () => new Date().toISOString();
export const arrayUnion  = (...items) => ({ __op: 'arrayUnion',  items });
export const arrayRemove = (...items) => ({ __op: 'arrayRemove', items });
export const deleteField = ()         => ({ __op: 'delete' });
export const increment   = (n)        => ({ __op: 'increment', n });

/* ── Helpers internes ── */
function enc(s) { return encodeURIComponent(s ?? ''); }

function _post(action, body) {
  return fetch(`${API}/data.php`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
}
