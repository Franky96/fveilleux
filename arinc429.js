// ════════════════════════════════════════════════════
//  Décodeur ARINC 429
// ════════════════════════════════════════════════════

// Sécurité : vérifier la connexion et les permissions
const _permsArinc = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || (!_permsArinc.includes('arinc429') && sessionStorage.getItem('userRole') !== 'admin')) {
  alert("Accès refusé.");
  window.location.href = 'dashboard.html';
}

let currentWord = null;

// ── Label reference data ────────────────────────────
// Source: ARINC Specification 429 Part 1-17 (May 17, 2004)
// Attachment 1-1 (label table), Attachment 2 (BCD/BNR data standards),
// Attachment 6 (reference tables 6-25 through 6-46).
// Rules: most common parameter per label; skip Spare/Not Used/proprietary;
// BNR=X→BNR, BCD=X→BCD, DISC=X→DIS.
const LABELS = [
  { oct: '001', enc: 'BCD', param: 'Distance to Go',                    unit: 'nm' },
  { oct: '002', enc: 'BCD', param: 'Time to Go',                        unit: 'min' },
  { oct: '003', enc: 'BCD', param: 'Cross Track Distance',              unit: 'nm' },
  { oct: '004', enc: 'BCD', param: 'Runway Distance to Go',             unit: 'ft' },
  { oct: '010', enc: 'BCD', param: 'Present Position - Latitude',       unit: 'deg:min' },
  { oct: '011', enc: 'BCD', param: 'Present Position - Longitude',      unit: 'deg:min' },
  { oct: '012', enc: 'BCD', param: 'Ground Speed',                      unit: 'kt' },
  { oct: '013', enc: 'BCD', param: 'Track Angle - True',                unit: 'deg' },
  { oct: '014', enc: 'BCD', param: 'Magnetic Heading',                  unit: 'deg' },
  { oct: '015', enc: 'BCD', param: 'Wind Speed',                        unit: 'kt' },
  { oct: '016', enc: 'BCD', param: 'Wind Direction - True',             unit: 'deg' },
  { oct: '017', enc: 'BCD', param: 'Selected Runway Heading',           unit: 'deg' },
  { oct: '020', enc: 'BCD', param: 'Selected Vertical Speed',           unit: 'ft/min' },
  { oct: '021', enc: 'BCD', param: 'Selected EPR',                      unit: 'EPR' },
  { oct: '022', enc: 'BCD', param: 'Selected Mach',                     unit: 'Mach' },
  { oct: '023', enc: 'BCD', param: 'Selected Heading',                  unit: 'deg' },
  { oct: '024', enc: 'BCD', param: 'Selected Course #1',                unit: 'deg' },
  { oct: '025', enc: 'BCD', param: 'Selected Altitude',                 unit: 'ft' },
  { oct: '026', enc: 'BCD', param: 'Selected Airspeed',                 unit: 'kt' },
  { oct: '027', enc: 'BCD', param: 'Selected Course #2',                unit: 'deg' },
  { oct: '030', enc: 'BCD', param: 'VHF COM Frequency',                 unit: 'MHz' },
  { oct: '031', enc: 'DIS', param: 'Beacon Transponder Code',           unit: 'code' },
  { oct: '032', enc: 'BCD', param: 'ADF Frequency',                     unit: 'kHz' },
  { oct: '033', enc: 'BCD', param: 'ILS Frequency',                     unit: 'MHz' },
  { oct: '034', enc: 'BCD', param: 'VOR/ILS Frequency',                 unit: 'MHz' },
  { oct: '035', enc: 'BCD', param: 'DME Frequency',                     unit: 'MHz' },
  { oct: '036', enc: 'BCD', param: 'MLS Frequency',                     unit: 'MHz' },
  { oct: '037', enc: 'BCD', param: 'HF COM Frequency',                  unit: 'MHz' },
  { oct: '041', enc: 'BCD', param: 'Set Latitude',                      unit: 'deg/min' },
  { oct: '042', enc: 'BCD', param: 'Set Longitude',                     unit: 'deg/min' },
  { oct: '043', enc: 'BCD', param: 'Set Magnetic Heading',              unit: 'deg' },
  { oct: '044', enc: 'BCD', param: 'True Heading',                      unit: 'deg' },
  { oct: '045', enc: 'BCD', param: 'Minimum Airspeed',                  unit: 'kt' },
  { oct: '052', enc: 'BNR', param: 'Body Pitch Acceleration',           unit: 'deg/s²' },
  { oct: '053', enc: 'BNR', param: 'Body Roll Acceleration',            unit: 'deg/s²' },
  { oct: '054', enc: 'BNR', param: 'Body Yaw Acceleration',             unit: 'deg/s²' },
  { oct: '056', enc: 'BCD', param: 'Estimated Time of Arrival',         unit: 'hr:min' },
  { oct: '065', enc: 'BCD', param: 'Gross Weight',                      unit: '100 lb' },
  { oct: '066', enc: 'BCD', param: 'Longitudinal Center of Gravity',    unit: '% MAC' },
  { oct: '067', enc: 'BCD', param: 'Lateral Center of Gravity',         unit: '% MAC' },
  { oct: '070', enc: 'BNR', param: 'Reference Airspeed (Vref)',         unit: 'kt' },
  { oct: '071', enc: 'BNR', param: 'Take-Off Climb Airspeed (V2)',      unit: 'kt' },
  { oct: '072', enc: 'BNR', param: 'Rotation Speed (VR)',               unit: 'kt' },
  { oct: '073', enc: 'BNR', param: 'V1',                                unit: 'kt' },
  { oct: '074', enc: 'BNR', param: 'Zero Fuel Weight',                  unit: 'lb' },
  { oct: '075', enc: 'BNR', param: 'Gross Weight',                      unit: 'lb' },
  { oct: '076', enc: 'BNR', param: 'GNSS Altitude (MSL)',               unit: 'ft' },
  { oct: '077', enc: 'BNR', param: 'Lateral Center of Gravity',         unit: '% MAC' },
  { oct: '100', enc: 'BNR', param: 'Selected Course #1',                unit: 'deg' },
  { oct: '101', enc: 'BNR', param: 'Selected Heading',                  unit: 'deg' },
  { oct: '102', enc: 'BNR', param: 'Selected Altitude',                 unit: 'ft' },
  { oct: '103', enc: 'BNR', param: 'Selected Airspeed',                 unit: 'kt' },
  { oct: '104', enc: 'BNR', param: 'Selected Vertical Speed',           unit: 'ft/min' },
  { oct: '105', enc: 'BNR', param: 'Selected Runway Heading',           unit: 'deg' },
  { oct: '106', enc: 'BNR', param: 'Selected Mach',                     unit: 'Mach' },
  { oct: '107', enc: 'BNR', param: 'Selected Cruise Altitude',          unit: 'ft' },
  { oct: '110', enc: 'BNR', param: 'Selected Course #2',                unit: 'deg' },
  { oct: '111', enc: 'BNR', param: 'GNSS Longitude',                    unit: 'deg' },
  { oct: '112', enc: 'BNR', param: 'Runway Length',                     unit: 'ft' },
  { oct: '114', enc: 'BNR', param: 'Desired Track',                     unit: 'deg' },
  { oct: '115', enc: 'BNR', param: 'Waypoint Bearing',                  unit: 'deg' },
  { oct: '116', enc: 'BNR', param: 'Cross Track Distance',              unit: 'nm' },
  { oct: '117', enc: 'BNR', param: 'Vertical Deviation',                unit: 'ft' },
  { oct: '120', enc: 'BNR', param: 'Range to Altitude',                 unit: 'nm' },
  { oct: '121', enc: 'BNR', param: 'Horizontal Command Signal',         unit: 'deg' },
  { oct: '122', enc: 'BNR', param: 'Vertical Command Signal',           unit: 'deg' },
  { oct: '123', enc: 'BNR', param: 'Throttle Command',                  unit: 'deg/s' },
  { oct: '125', enc: 'BCD', param: 'Universal Time Coordinated (UTC)',  unit: 'hr:min' },
  { oct: '126', enc: 'BNR', param: 'Vertical Deviation (wide)',         unit: 'ft' },
  { oct: '127', enc: 'BNR', param: 'Selected Landing Altitude',         unit: 'ft' },
  { oct: '130', enc: 'BNR', param: 'Intruder Range',                    unit: 'nm' },
  { oct: '131', enc: 'BNR', param: 'Intruder Altitude',                 unit: 'ft' },
  { oct: '132', enc: 'BNR', param: 'Intruder Bearing',                  unit: 'deg' },
  { oct: '133', enc: 'BNR', param: 'Thrust Lever Angle',                unit: 'deg' },
  { oct: '134', enc: 'BNR', param: 'Throttle Lever Angle',              unit: 'deg' },
  { oct: '135', enc: 'BNR', param: 'Engine Vibration',                  unit: 'in/s' },
  { oct: '140', enc: 'BNR', param: 'Flight Director - Roll',            unit: 'deg' },
  { oct: '141', enc: 'BNR', param: 'Flight Director - Pitch',           unit: 'deg' },
  { oct: '142', enc: 'BNR', param: 'Flight Director - Fast/Slow',       unit: 'kt' },
  { oct: '143', enc: 'BNR', param: 'Flight Director - Yaw',             unit: 'deg' },
  { oct: '144', enc: 'BNR', param: 'Altitude Error',                    unit: 'ft' },
  { oct: '145', enc: 'BCD', param: 'TACAN Control',                     unit: 'ch' },
  { oct: '150', enc: 'BNR', param: 'Universal Time Coordinate (UTC)',   unit: 's' },
  { oct: '151', enc: 'BNR', param: 'Localizer Bearing (True)',          unit: 'deg' },
  { oct: '152', enc: 'BNR', param: 'Cabin Pressure',                    unit: 'mb' },
  { oct: '153', enc: 'BNR', param: 'Maximum Altitude',                  unit: 'ft' },
  { oct: '154', enc: 'BNR', param: 'Runway Heading (True)',             unit: 'deg' },
  { oct: '162', enc: 'BNR', param: 'ADF Bearing',                       unit: 'deg' },
  { oct: '164', enc: 'BNR', param: 'Radio Height',                      unit: 'ft' },
  { oct: '165', enc: 'BNR', param: 'Vertical Velocity',                 unit: 'ft/min' },
  { oct: '166', enc: 'BNR', param: 'North/South Velocity',              unit: 'kt' },
  { oct: '167', enc: 'BNR', param: 'EPU/ANP',                           unit: 'nm' },
  { oct: '170', enc: 'BCD', param: 'Decision Height Selected',          unit: 'ft' },
  { oct: '171', enc: 'BNR', param: 'RNP',                               unit: 'nm' },
  { oct: '173', enc: 'BNR', param: 'Localizer Deviation',               unit: 'DDM' },
  { oct: '174', enc: 'BNR', param: 'Glideslope Deviation',              unit: 'DDM' },
  { oct: '175', enc: 'BNR', param: 'Economical Speed',                  unit: 'kt' },
  { oct: '176', enc: 'BNR', param: 'Economical Mach',                   unit: 'Mach' },
  { oct: '177', enc: 'BNR', param: 'Economical Flight Level',           unit: 'ft' },
  { oct: '200', enc: 'BCD', param: 'Drift Angle',                       unit: 'deg' },
  { oct: '201', enc: 'BCD', param: 'DME Distance',                      unit: 'nm' },
  { oct: '202', enc: 'BNR', param: 'DME Distance',                      unit: 'nm' },
  { oct: '203', enc: 'BNR', param: 'Altitude (1013.25 mb)',             unit: 'ft' },
  { oct: '204', enc: 'BNR', param: 'Baro Corrected Altitude #1',        unit: 'ft' },
  { oct: '205', enc: 'BNR', param: 'Mach',                              unit: 'Mach' },
  { oct: '206', enc: 'BNR', param: 'Computed Airspeed',                 unit: 'kt' },
  { oct: '207', enc: 'BNR', param: 'Maximum Allowable Airspeed',        unit: 'kt' },
  { oct: '210', enc: 'BNR', param: 'True Airspeed',                     unit: 'kt' },
  { oct: '211', enc: 'BNR', param: 'Total Air Temperature',             unit: '°C' },
  { oct: '212', enc: 'BNR', param: 'Altitude Rate',                     unit: 'ft/min' },
  { oct: '213', enc: 'BNR', param: 'Static Air Temperature',            unit: '°C' },
  { oct: '215', enc: 'BNR', param: 'Impact Pressure',                   unit: 'mb' },
  { oct: '217', enc: 'BNR', param: 'Geometric Vertical Rate',           unit: 'ft/min' },
  { oct: '220', enc: 'BNR', param: 'Baro Corrected Altitude #2',        unit: 'ft' },
  { oct: '221', enc: 'BNR', param: 'Indicated Angle of Attack',         unit: 'deg' },
  { oct: '222', enc: 'BNR', param: 'VOR Omnibearing / AoA',            unit: 'deg' },
  { oct: '225', enc: 'BNR', param: 'Minimum Maneuvering Airspeed',      unit: 'kt' },
  { oct: '230', enc: 'BCD', param: 'True Airspeed',                     unit: 'kt' },
  { oct: '231', enc: 'BCD', param: 'Total Air Temperature',             unit: '°C' },
  { oct: '232', enc: 'BCD', param: 'Altitude Rate',                     unit: 'ft/min' },
  { oct: '233', enc: 'BCD', param: 'Static Air Temperature',            unit: '°C' },
  { oct: '234', enc: 'BCD', param: 'Baro Correction',                   unit: 'mb' },
  { oct: '235', enc: 'BCD', param: 'Baro Correction',                   unit: 'inHg' },
  { oct: '241', enc: 'BNR', param: 'Min Airspeed for Flap Extension',   unit: 'kt' },
  { oct: '242', enc: 'BNR', param: 'Total Pressure',                    unit: 'mb' },
  { oct: '244', enc: 'BNR', param: 'Fuel Flow',                         unit: 'lb/hr' },
  { oct: '245', enc: 'BNR', param: 'Minimum Airspeed',                  unit: 'kt' },
  { oct: '246', enc: 'BNR', param: 'N1 (Engine Direct)',                unit: '% RPM' },
  { oct: '247', enc: 'BNR', param: 'Total Fuel',                        unit: 'lb' },
  { oct: '250', enc: 'BNR', param: 'Continuous N1 Limit',               unit: '% RPM' },
  { oct: '251', enc: 'BNR', param: 'Distance to Go',                    unit: 'nm' },
  { oct: '252', enc: 'BNR', param: 'Time to Go',                        unit: 'min' },
  { oct: '253', enc: 'BNR', param: 'Go-Around N1 Limit',                unit: '% RPM' },
  { oct: '254', enc: 'BNR', param: 'Cruise N1 Limit',                   unit: '% RPM' },
  { oct: '255', enc: 'BNR', param: 'Climb N1 Limit',                    unit: '% RPM' },
  { oct: '256', enc: 'BNR', param: 'Time for Climb',                    unit: 'min' },
  { oct: '257', enc: 'BNR', param: 'Time for Descent',                  unit: 'min' },
  { oct: '260', enc: 'BCD', param: 'Date/Flight Leg',                   unit: '' },
  { oct: '261', enc: 'BCD', param: 'Flight Number',                     unit: '' },
  { oct: '262', enc: 'BNR', param: 'Documentary Data',                  unit: '' },
  { oct: '263', enc: 'BNR', param: 'Min Airspeed for Flap Retraction',  unit: 'kt' },
  { oct: '264', enc: 'BNR', param: 'Time to Touchdown',                 unit: 'min' },
  { oct: '265', enc: 'BNR', param: 'Min Buffet Airspeed',               unit: 'kt' },
  { oct: '267', enc: 'BNR', param: 'Maximum Maneuver Airspeed',         unit: 'kt' },
  { oct: '270', enc: 'DIS', param: 'Discrete Data #1',                  unit: '' },
  { oct: '271', enc: 'DIS', param: 'Discrete Data #2',                  unit: '' },
  { oct: '272', enc: 'DIS', param: 'Discrete Data #3',                  unit: '' },
  { oct: '273', enc: 'DIS', param: 'Discrete Data #4',                  unit: '' },
  { oct: '274', enc: 'DIS', param: 'Discrete Data #5',                  unit: '' },
  { oct: '275', enc: 'DIS', param: 'Discrete Data #6',                  unit: '' },
  { oct: '276', enc: 'DIS', param: 'Discrete Data #7',                  unit: '' },
  { oct: '277', enc: 'DIS', param: 'Discrete Data #8',                  unit: '' },
  { oct: '300', enc: 'DIS', param: 'Application Dependent #1',          unit: '' },
  { oct: '301', enc: 'DIS', param: 'Application Dependent #2',          unit: '' },
  { oct: '302', enc: 'DIS', param: 'Application Dependent #3',          unit: '' },
  { oct: '303', enc: 'DIS', param: 'Application Dependent #4',          unit: '' },
  { oct: '304', enc: 'DIS', param: 'Application Dependent #5',          unit: '' },
  { oct: '305', enc: 'DIS', param: 'Application Dependent #6',          unit: '' },
  { oct: '306', enc: 'DIS', param: 'Application Dependent #7',          unit: '' },
  { oct: '307', enc: 'DIS', param: 'Application Dependent #8',          unit: '' },
  { oct: '310', enc: 'BNR', param: 'Present Position - Latitude',       unit: 'deg' },
  { oct: '311', enc: 'BNR', param: 'Present Position - Longitude',      unit: 'deg' },
  { oct: '312', enc: 'BNR', param: 'Ground Speed',                      unit: 'kt' },
  { oct: '313', enc: 'BNR', param: 'Track Angle - True',                unit: 'deg' },
  { oct: '314', enc: 'BNR', param: 'True Heading',                      unit: 'deg' },
  { oct: '315', enc: 'BNR', param: 'Wind Speed',                        unit: 'kt' },
  { oct: '316', enc: 'BNR', param: 'Wind Direction - True',             unit: 'deg' },
  { oct: '317', enc: 'BNR', param: 'Track Angle - Magnetic',            unit: 'deg' },
  { oct: '320', enc: 'BNR', param: 'Magnetic Heading',                  unit: 'deg' },
  { oct: '321', enc: 'BNR', param: 'Drift Angle',                       unit: 'deg' },
  { oct: '322', enc: 'BNR', param: 'Flight Path Angle',                 unit: 'deg' },
  { oct: '323', enc: 'BNR', param: 'Flight Path Acceleration',          unit: 'g' },
  { oct: '324', enc: 'BNR', param: 'Pitch Angle',                       unit: 'deg' },
  { oct: '325', enc: 'BNR', param: 'Roll Angle',                        unit: 'deg' },
  { oct: '326', enc: 'BNR', param: 'Body Pitch Rate',                   unit: 'deg/s' },
  { oct: '327', enc: 'BNR', param: 'Body Roll Rate',                    unit: 'deg/s' },
  { oct: '330', enc: 'BNR', param: 'Body Yaw Rate',                     unit: 'deg/s' },
  { oct: '331', enc: 'BNR', param: 'Body Longitudinal Acceleration',    unit: 'g' },
  { oct: '332', enc: 'BNR', param: 'Body Lateral Acceleration',         unit: 'g' },
  { oct: '333', enc: 'BNR', param: 'Body Normal Acceleration',          unit: 'g' },
  { oct: '334', enc: 'BNR', param: 'Platform Heading',                  unit: 'deg' },
  { oct: '335', enc: 'BNR', param: 'Track Angle Rate',                  unit: 'deg/s' },
  { oct: '336', enc: 'BNR', param: 'Inertial Pitch Rate',               unit: 'deg/s' },
  { oct: '337', enc: 'BNR', param: 'Inertial Roll Rate',                unit: 'deg/s' },
  { oct: '340', enc: 'BNR', param: 'EPR Actual',                        unit: 'ratio' },
  { oct: '341', enc: 'BNR', param: 'N1 Command',                        unit: '% RPM' },
  { oct: '342', enc: 'BNR', param: 'N1 Limit',                          unit: '% RPM' },
  { oct: '343', enc: 'BNR', param: 'N1 Derate',                         unit: '% RPM' },
  { oct: '344', enc: 'BNR', param: 'N2',                                unit: '% RPM' },
  { oct: '345', enc: 'BNR', param: 'Exhaust Gas Temperature',           unit: '°C' },
  { oct: '346', enc: 'BNR', param: 'N1 Actual',                         unit: '% RPM' },
  { oct: '347', enc: 'BNR', param: 'Fuel Flow',                         unit: 'lb/hr' },
  { oct: '350', enc: 'DIS', param: 'Maintenance Data #1',               unit: '' },
  { oct: '351', enc: 'DIS', param: 'Maintenance Data #2',               unit: '' },
  { oct: '352', enc: 'DIS', param: 'Maintenance Data #3',               unit: '' },
  { oct: '353', enc: 'DIS', param: 'Maintenance Data #4',               unit: '' },
  { oct: '354', enc: 'DIS', param: 'Maintenance Data #5',               unit: '' },
  { oct: '355', enc: 'DIS', param: 'Acknowledgement',                   unit: '' },
  { oct: '356', enc: 'DIS', param: 'ISO Alphabet #5 Message',           unit: '' },
  { oct: '357', enc: 'DIS', param: 'ISO Alphabet #5 Message',           unit: '' },
  { oct: '360', enc: 'BNR', param: 'Potential Vertical Speed',          unit: 'ft/min' },
  { oct: '361', enc: 'BNR', param: 'Altitude (Inertial)',               unit: 'ft' },
  { oct: '362', enc: 'BNR', param: 'Along Track Horizontal Acceleration', unit: 'g' },
  { oct: '363', enc: 'BNR', param: 'Cross Track Acceleration',          unit: 'g' },
  { oct: '364', enc: 'BNR', param: 'Vertical Acceleration',             unit: 'g' },
  { oct: '365', enc: 'BNR', param: 'Inertial Vertical Velocity',        unit: 'ft/min' },
  { oct: '366', enc: 'BNR', param: 'North-South Velocity',              unit: 'kt' },
  { oct: '367', enc: 'BNR', param: 'East-West Velocity',                unit: 'kt' },
  { oct: '370', enc: 'BNR', param: 'Geometric Altitude / g',            unit: 'ft' },
  { oct: '371', enc: 'DIS', param: 'General Aviation Equipment Identifier', unit: '' },
  { oct: '372', enc: 'BNR', param: 'Wind Direction - Magnetic',         unit: 'deg' },
  { oct: '373', enc: 'BNR', param: 'North-South Velocity - Magnetic',   unit: 'kt' },
  { oct: '374', enc: 'BNR', param: 'East-West Velocity - Magnetic',     unit: 'kt' },
  { oct: '375', enc: 'BNR', param: 'Along Heading Acceleration',        unit: 'g' },
  { oct: '376', enc: 'BNR', param: 'Cross Heading Acceleration',        unit: 'g' },
  { oct: '377', enc: 'DIS', param: 'Equipment Identification',          unit: '' },
];

// Pre-compute hex for each label
LABELS.forEach(l => {
  const dec = parseInt(l.oct, 8);
  l.hex = dec.toString(16).toUpperCase().padStart(2, '0');
  l.dec = dec;
});

// ── Bit helpers ─────────────────────────────────────

// ARINC 429: bit 1 = LSB (rightmost), bit 32 = MSB (leftmost)
function getBit(word, bitNum) {
  return (word >>> (bitNum - 1)) & 1;
}

function setBitVal(word, bitNum, val) {
  const mask = 1 << (bitNum - 1);
  return val ? ((word | mask) >>> 0) : ((word & ~mask) >>> 0);
}

// The label (bits 1-8) is transmitted LSB-first, so the actual label octal
// value is the bit-reverse of those 8 bits.
function reverseBits8(byte) {
  let r = 0;
  for (let i = 0; i < 8; i++) r |= ((byte >> i) & 1) << (7 - i);
  return r;
}

function popCount(n) {
  let c = 0, v = n >>> 0;
  while (v) { c += v & 1; v >>>= 1; }
  return c;
}

function getBitClass(bitNum) {
  if (bitNum === 32)                    return 'bit-parity';
  if (bitNum >= 30 && bitNum <= 31)     return 'bit-ssm';
  if (bitNum >= 11 && bitNum <= 29)     return 'bit-data';
  if (bitNum >= 9  && bitNum <= 10)     return 'bit-sdi';
  return 'bit-label';                   // bits 1-8
}

// ── Rendering ───────────────────────────────────────

function renderBits(word) {
  const container = document.getElementById('bit-display');
  container.innerHTML = '';

  // Display bit 32 (left) → bit 1 (right)
  for (let bitNum = 32; bitNum >= 1; bitNum--) {
    const val = getBit(word, bitNum);
    const cls = getBitClass(bitNum);

    const wrapper = document.createElement('div');
    wrapper.className = 'bit-wrapper';

    const numEl = document.createElement('div');
    numEl.className = 'bit-num';
    numEl.textContent = bitNum;

    const cell = document.createElement('div');
    cell.className = `bit-cell ${cls}`;
    cell.textContent = val;
    cell.dataset.bit = bitNum;
    cell.title = `Bit ${bitNum} — clic pour basculer`;
    cell.addEventListener('click', () => toggleBit(bitNum));

    wrapper.appendChild(numEl);
    wrapper.appendChild(cell);
    container.appendChild(wrapper);
  }
}

function renderFields(word) {
  // ── Label (bits 1-8, reversed) ──
  const labelRaw = word & 0xFF;
  const labelVal = reverseBits8(labelRaw);
  const labelOct = labelVal.toString(8).padStart(3, '0');
  const labelHex = '0x' + labelVal.toString(16).toUpperCase().padStart(2, '0');
  const labelDec = labelVal;
  const labelBin = labelVal.toString(2).padStart(8, '0');
  const labelInfo = LABELS.find(l => l.oct === labelOct);

  document.getElementById('d-label-oct').textContent = labelOct;
  document.getElementById('d-label-dec').textContent = labelDec;
  document.getElementById('d-label-hex').textContent = labelHex;
  document.getElementById('d-label-bin').textContent = labelBin;
  document.getElementById('d-label-name').textContent = labelInfo ? labelInfo.param : '—';
  document.getElementById('d-label-msb').textContent = labelOct[0];
  document.getElementById('d-label-med').textContent = labelOct[1];
  document.getElementById('d-label-lsb').textContent = labelOct[2];

  // ── SDI (bits 9-10) ──
  const sdi = (word >> 8) & 0x3;
  const sdiDescs = ['Toutes stations / non utilisé', 'SDI #1', 'SDI #2', 'SDI #3'];
  document.getElementById('d-sdi').textContent = sdi.toString(2).padStart(2, '0');
  document.getElementById('d-sdi-desc').textContent = sdiDescs[sdi];

  // ── Data (bits 11-29, 19 bits) ──
  const data19 = (word >> 10) & 0x7FFFF;
  const dataBin = data19.toString(2).padStart(19, '0');
  const dataBinGrouped = dataBin.replace(/(.{4})/g, '$1 ').trim();
  document.getElementById('d-data-bin').textContent = dataBinGrouped;
  document.getElementById('d-data-dec').textContent = data19;
  document.getElementById('d-data-hex').textContent = '0x' + data19.toString(16).toUpperCase().padStart(5, '0');
  document.getElementById('d-data-decoded').textContent = '—';
  document.getElementById('d-data-format').textContent = labelInfo ? labelInfo.enc : '—';

  // ── SSM (bits 30-31) ──
  const ssm = (word >> 29) & 0x3;
  const ssmDescs = {
    '00': 'Failure Warning / Plus',
    '01': 'No Computed Data / North / East / Right',
    '10': 'Functional Test / South / West / Left',
    '11': 'Normal Operation / Minus',
  };
  const ssmBin = ssm.toString(2).padStart(2, '0');
  document.getElementById('d-ssm').textContent = ssmBin;
  document.getElementById('d-ssm-sig').textContent = ssmDescs[ssmBin];

  // ── Parity (bit 32) — odd parity ──
  const ones = popCount(word);
  const parityOk = (ones % 2 === 1);
  const parityEl = document.getElementById('d-parity');
  parityEl.textContent = parityOk ? 'Odd Parity OK' : 'Odd Parity Error';
  parityEl.className = 'detail-val ' + (parityOk ? 'ok' : 'err');

  // ── Banner ──
  document.getElementById('banner-oct').textContent = labelOct;
  document.getElementById('banner-name').textContent = labelInfo ? labelInfo.param : 'Label inconnu';
  document.getElementById('banner-sub').textContent = labelInfo
    ? `Label ${labelOct} (octal) | ${labelHex} | ${labelInfo.enc}`
    : `Label ${labelOct} (octal) | ${labelHex}`;
  document.getElementById('banner-value').textContent = '—';

}

// ── Actions ─────────────────────────────────────────

function decodeFromInput() {
  const raw = document.getElementById('hex-input').value.trim().replace(/^0x/i, '');
  const errEl = document.getElementById('error-msg');

  if (!/^[0-9A-Fa-f]{1,8}$/.test(raw)) {
    errEl.textContent = 'Valeur invalide — entrez 1 à 8 chiffres hexadécimaux';
    return;
  }
  errEl.textContent = '';

  currentWord = parseInt(raw.padStart(8, '0'), 16) >>> 0;
  renderBits(currentWord);
  renderFields(currentWord);
}

function toggleBit(bitNum) {
  if (currentWord === null) return;
  const cur = getBit(currentWord, bitNum);
  currentWord = setBitVal(currentWord, bitNum, cur ? 0 : 1);
  document.getElementById('hex-input').value =
    currentWord.toString(16).toUpperCase().padStart(8, '0');
  renderBits(currentWord);
  renderFields(currentWord);
}

// ── Init ─────────────────────────────────────────────

document.getElementById('hex-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') decodeFromInput();
});

// Afficher les panneaux avec tous les bits à zéro au chargement
currentWord = 0;
renderBits(currentWord);
renderFields(currentWord);
