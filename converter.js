'use strict';

const inputs = { dec: null, hex: null, bin: null, oct: null };

document.addEventListener('DOMContentLoaded', () => {
  inputs.dec = document.getElementById('input-dec');
  inputs.hex = document.getElementById('input-hex');
  inputs.bin = document.getElementById('input-bin');
  inputs.oct = document.getElementById('input-oct');
});

function getBitWidth() {
  return parseInt(document.getElementById('bit-width').value);
}

function isSigned() {
  return document.getElementById('sign-mode').value === 'signed';
}

// Parse any input string to a BigInt value, returns null on error
function parseInput(src, raw) {
  const s = raw.replace(/\s/g, '').toLowerCase();
  if (s === '' || s === '-') return null;

  let val;
  try {
    switch (src) {
      case 'dec': val = BigInt(s); break;
      case 'hex': val = BigInt('0x' + s); break;
      case 'bin': val = BigInt('0b' + s); break;
      case 'oct': val = BigInt('0o' + s); break;
    }
  } catch { return null; }

  return val;
}

// Apply bit-width mask and sign extension
function applyWidth(val, bits, signed) {
  if (bits === 0) return val; // unlimited
  const mask = (1n << BigInt(bits)) - 1n;
  val = ((val % (1n << BigInt(bits))) + (1n << BigInt(bits))) % (1n << BigInt(bits));
  val = val & mask;
  if (signed) {
    const signBit = 1n << BigInt(bits - 1);
    if (val & signBit) val = val - (1n << BigInt(bits));
  }
  return val;
}

// Format binary with spaces every 8 bits (from right)
function formatBin(val, bits) {
  let s;
  if (val < 0n) {
    // Two's complement representation
    const mask = (1n << BigInt(bits)) - 1n;
    s = (val & mask).toString(2);
  } else {
    s = val.toString(2);
  }
  if (bits > 0) s = s.padStart(bits, '0');
  // Group by 8 from right
  const groups = [];
  for (let i = s.length; i > 0; i -= 8) {
    groups.unshift(s.slice(Math.max(0, i - 8), i));
  }
  return groups.join(' ');
}

// Format hex with spaces every 4 chars (2 bytes) from right
function formatHex(val, bits) {
  let s;
  if (val < 0n) {
    const mask = (1n << BigInt(bits)) - 1n;
    s = (val & mask).toString(16).toUpperCase();
  } else {
    s = val.toString(16).toUpperCase();
  }
  const padLen = bits > 0 ? Math.ceil(bits / 4) : s.length;
  s = s.padStart(padLen, '0');
  // Group by 4 from right
  const groups = [];
  for (let i = s.length; i > 0; i -= 4) {
    groups.unshift(s.slice(Math.max(0, i - 4), i));
  }
  return groups.join(' ');
}

function convert(src) {
  const raw = inputs[src].value;
  const bits = getBitWidth();
  const signed = isSigned();

  // Clear error state
  Object.keys(inputs).forEach(k => {
    document.getElementById('field-' + k).classList.remove('error');
    inputs[k].classList.remove('error');
  });

  if (raw.replace(/\s|-/g, '') === '') {
    // Empty — clear other fields
    Object.keys(inputs).forEach(k => { if (k !== src) inputs[k].value = ''; });
    updateGroups(null, bits);
    return;
  }

  let val = parseInput(src, raw);

  if (val === null) {
    document.getElementById('field-' + src).classList.add('error');
    inputs[src].classList.add('error');
    Object.keys(inputs).forEach(k => { if (k !== src) inputs[k].value = ''; });
    updateGroups(null, bits);
    return;
  }

  val = applyWidth(val, bits, signed);

  // Fill other fields
  if (src !== 'dec') inputs.dec.value = val.toString(10);
  if (src !== 'hex') inputs.hex.value = formatHex(val, bits);
  if (src !== 'bin') inputs.bin.value = formatBin(val, bits);
  if (src !== 'oct') {
    let octVal = val < 0n ? (val & ((1n << BigInt(bits)) - 1n)) : val;
    inputs.oct.value = octVal.toString(8);
  }

  updateGroups(val, bits);
}

// Show byte breakdown under hex and binary
function updateGroups(val, bits) {
  const hexG = document.getElementById('hex-groups');
  const binG  = document.getElementById('bin-groups');

  if (val === null || bits === 0 || bits <= 8) {
    hexG.innerHTML = '';
    binG.innerHTML = '';
    return;
  }

  // Show bit ranges for each byte
  let hexHTML = '';
  let binHTML = '';
  const numBytes = bits / 8;
  for (let i = numBytes - 1; i >= 0; i--) {
    const hi = (i + 1) * 8 - 1;
    const lo = i * 8;
    const byteVal = (val >> BigInt(lo)) & 0xFFn;
    const mask = val < 0n ? ((val & ((1n << BigInt(bits)) - 1n)) >> BigInt(lo)) & 0xFFn : byteVal;
    hexHTML += `<div>bits ${hi}-${lo}<br><span>0x${mask.toString(16).toUpperCase().padStart(2,'0')}</span></div>`;
    binHTML += `<div>bits ${hi}-${lo}<br><span>${mask.toString(2).padStart(8,'0')}</span></div>`;
  }
  hexG.innerHTML = hexHTML;
  binG.innerHTML = binHTML;
}

function clearAll() {
  Object.values(inputs).forEach(el => { if (el) el.value = ''; });
  Object.keys(inputs).forEach(k => {
    document.getElementById('field-' + k).classList.remove('error');
    inputs[k] && inputs[k].classList.remove('error');
  });
  updateGroups(null, getBitWidth());
}

function copyField(key) {
  const val = inputs[key] && inputs[key].value;
  if (!val) return;
  navigator.clipboard.writeText(val.replace(/\s/g, '')).then(() => {
    const btn = document.querySelector(`#field-${key} .field-copy`);
    btn.textContent = '✓ Copié';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copier'; btn.classList.remove('copied'); }, 1500);
  });
}

// Re-convert when options change
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('bit-width').addEventListener('change', () => {
    const active = Object.keys(inputs).find(k => inputs[k] && inputs[k].value !== '');
    if (active) convert(active);
  });
  document.getElementById('sign-mode').addEventListener('change', () => {
    const active = Object.keys(inputs).find(k => inputs[k] && inputs[k].value !== '');
    if (active) convert(active);
  });
});
