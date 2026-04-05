'use strict';

let bitStates = {}; // bitNum → 0 or 1

function getMax()  { return parseFloat(document.getElementById('cfg-max').value)  || 180; }
function getNBits() { return Math.max(2, Math.min(29, (parseInt(document.getElementById('cfg-bits').value) || 11) + 1)); }

// Bit value for a data bit at position bitNum (bit 29 = sign, bit 28 = MSB = max/2)
function bitValue(bitNum, maxVal, nBits) {
  const dataBits = nBits - 1;           // exclude sign bit
  const msb      = maxVal / 2;          // bit 28 value
  const lsbBit   = 29 - dataBits;       // e.g. nBits=12 → lsbBit=18
  const pos      = bitNum - lsbBit;     // 0 = LSB, dataBits-1 = MSB
  return msb / Math.pow(2, dataBits - 1 - pos);
}

function getBitClass(bitNum, nBits) {
  if (bitNum === 29) return 'sign';
  const dataBits = nBits - 1;
  const lsbBit   = 29 - dataBits;
  const pos      = bitNum - lsbBit; // 0=LSB … dataBits-1=MSB
  const third    = dataBits / 3;
  if (pos >= dataBits - third)      return 'hi';
  if (pos >= dataBits - 2 * third)  return 'mid';
  return 'lo';
}

function stepBits(delta) {
  const input = document.getElementById('cfg-bits');
  const val = Math.max(1, Math.min(28, (parseInt(input.value) || 11) + delta));
  input.value = val;
  applyConfig();
}

function applyConfig() {
  bitStates = {};
  render();
}

function resetBits() {
  Object.keys(bitStates).forEach(k => { bitStates[k] = 0; });
  render();
}

function toggleBit(bitNum) {
  bitStates[bitNum] = bitStates[bitNum] ? 0 : 1;
  render();
}

function fmt(val, lsb) {
  if (lsb === 0) return val.toFixed(0);
  const decimals = lsb >= 10 ? 0 : lsb >= 1 ? 1 : lsb >= 0.1 ? 2 : lsb >= 0.01 ? 3 : lsb >= 0.001 ? 4 : 6;
  return val.toFixed(decimals);
}

function render() {
  const maxVal = getMax();
  const nBits  = getNBits();
  const dataBits = nBits - 1;
  const lsbBit   = 29 - dataBits;
  const lsb      = maxVal / 2 / Math.pow(2, dataBits - 1);

  // Initialize missing bit states
  const allBits = [29];
  for (let b = 28; b >= lsbBit; b--) allBits.push(b);
  allBits.forEach(b => { if (bitStates[b] === undefined) bitStates[b] = 0; });

  // Compute value
  const sign = bitStates[29];
  let magnitude = 0;
  for (let b = 28; b >= lsbBit; b--) {
    if (bitStates[b]) magnitude += bitValue(b, maxVal, nBits);
  }
  const value = magnitude - (sign ? maxVal : 0);

  // Binary word (bits 29→lsbBit)
  const binStr = allBits.map(b => bitStates[b]).join('');

  // ── Render bits ──
  const container = document.getElementById('enc-bits');
  container.innerHTML = '';

  allBits.forEach(bitNum => {
    const cls   = getBitClass(bitNum, nBits);
    const state = bitStates[bitNum];
    const isSign = bitNum === 29;

    const wrap = document.createElement('div');
    wrap.className = `enc-bit ${cls}${state ? ' active' : ''}`;
    wrap.onclick = () => toggleBit(bitNum);

    const numEl  = document.createElement('div');
    numEl.className = 'bit-num';
    numEl.textContent = bitNum;

    const cell = document.createElement('div');
    cell.className = 'bit-cell';
    cell.textContent = state;

    const valEl = document.createElement('div');
    valEl.className = 'bit-val';
    if (isSign) {
      valEl.textContent = state ? '−' : '+';
    } else {
      const bv = bitValue(bitNum, maxVal, nBits);
      valEl.textContent = bv >= 1 ? fmt(bv, lsb) : bv.toPrecision(3);
    }

    wrap.appendChild(numEl);
    wrap.appendChild(cell);
    wrap.appendChild(valEl);
    container.appendChild(wrap);
  });

  // ── Result ──
  const resEl = document.getElementById('res-value');
  resEl.textContent = (sign ? '−' : '') + fmt(Math.abs(value), lsb);
  resEl.className = 'res-value' + (sign ? ' negative' : '');

  document.getElementById('res-lsb').textContent = lsb >= 1
    ? fmt(lsb, 0) : lsb.toPrecision(4);

  document.getElementById('res-bin').textContent = binStr;

  // ── Table ──
  const tbody = document.getElementById('enc-tbody');
  tbody.innerHTML = '';

  allBits.forEach(bitNum => {
    const isSign = bitNum === 29;
    const state  = bitStates[bitNum];
    const bv     = isSign ? null : bitValue(bitNum, maxVal, nBits);
    const contrib = isSign ? null : (state ? (sign ? -bv : bv) : 0);

    const tr = document.createElement('tr');
    if (state) tr.classList.add('active-row');
    if (isSign) tr.classList.add('sign-row');

    const role = isSign ? `Bit de signe (−${maxVal})`
               : `Bit ${bitNum} — ${bv >= 1 ? fmt(bv, lsb) : bv.toPrecision(4)}`;

    const contribStr = isSign
      ? (state ? `−${maxVal}` : '0')
      : (state ? '+' + fmt(bv, lsb) : '0');

    const tdClass = isSign
      ? (state ? 'contrib neg' : '')
      : (state ? 'contrib' : '');

    tr.innerHTML = `
      <td>${bitNum}</td>
      <td>${role}</td>
      <td>${state ? '1' : '0'}</td>
      <td>${isSign ? '—' : (bv >= 1 ? fmt(bv, lsb) : bv.toPrecision(4))}</td>
      <td class="${tdClass}">${contribStr}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  render();
  document.getElementById('cfg-max').addEventListener('keydown',  e => { if (e.key === 'Enter') applyConfig(); });
  document.getElementById('cfg-bits').addEventListener('keydown', e => { if (e.key === 'Enter') applyConfig(); });
});
