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

// ── Decode metadata ─────────────────────────────────
// Source: ARINC 429 Part 1-17 Attachment 2 (BNR/BCD data standards)
//
// BNR: { msb: <value represented when ONLY bit 28 is set, in engineering units> }
//      Sign-magnitude format: bit 29 = sign, bits 28-11 = 18-bit magnitude
//      Exception: ssmSign:true → sign derived from SSM (01=+/N/E, 10=-/S/W)
//
// BCD: { decimals: <decimal places to apply to the 5-digit BCD integer> }
//      5-digit BCD packed MSB-first in bits 29-11:
//        bits 29-27 = d4 (3 bits, 0-7)
//        bits 26-23 = d3 (4 bits, 0-9)
//        bits 22-19 = d2 (4 bits, 0-9)
//        bits 18-15 = d1 (4 bits, 0-9)
//        bits 14-11 = d0 (4 bits, 0-9)   [LSB digit]
//      value = (d4×10000 + d3×1000 + d2×100 + d1×10 + d0) / 10^decimals
//
// Special flags:
//   maskD0    – force d0=0 (bits 14-11 contain discrete data, not BCD)
//   bcdDigits – use only top N digits (3 = d4+d3+d2 only, force d1=d0=0)
//   halfBit   – ARINC bit number whose value × halfStep is added to result
//   halfStep  – value added per halfBit (e.g. 0.5 kHz for ADF, 0.05 MHz for DME)
//   squawk    – decode as 4-digit octal transponder squawk code (031)

// SSM descriptions by label type (BIT31, BIT30 → index 0-3)
const SSM_TABLES = {
  radio: ['Normal (NML)',          'No Computed Data (NCD)', 'Functional Test (FT)', 'Undefined'],
  bcd:   ['Normal + (N,E,R,TO,↑)', 'No Computed Data (NCD)', 'Functional Test (FT)', 'Normal − (S,W,L,FROM,↓)'],
  bnr:   ['Failure Warning (FW)',  'No Computed Data (NCD)', 'Functional Test (FT)', 'Normal (NML)'],
  dis:   ['Normal (NML)',          'No Computed Data (NCD)', 'Functional Test (FT)', 'Failure Warning (FW)'],
  maint: ['Failure Warning (FW)', 'No Computed Data (NCD)', 'Functional Test (FT)', 'Normal (NML)'],
};

// SDI descriptions by label type (bits 10-9 → index 0-3)
const SDI_TABLES = {
  tous:  ['Tous / Système #4', 'Système #1', 'Système #2', 'Système #3'],
  other: ['Non utilisé',       'Système #1', 'Système #2', 'Système #3'],
};

function getLabelSsmType(labelInfo) {
  if (!labelInfo) return 'bcd';
  const oct = parseInt(labelInfo.oct, 8);
  if (oct >= 0o030 && oct <= 0o037) return 'radio';
  if ((oct >= 0o155 && oct <= 0o161) || (oct >= 0o350 && oct <= 0o354)) return 'maint';
  if (oct >= 0o270 && oct <= 0o276) return 'dis';
  if (labelInfo.enc === 'BNR') return 'bnr';
  return 'bcd';
}

const DECODE_META = {
  // ── BCD labels ────────────────────────────────────
  // decimals = PAD_nibbles + physical_decimal_places
  // e.g. 4 sig digits + 1 PAD nibble + 0.1 resolution → 1+1 = decimals:2
  '001': { decimals: 1 },  // Distance to Go (NM)     – 5 digits, 0.1 NM res
  '002': { decimals: 2 },  // Time to Go (min)         – 4 digits + PAD, 0.1 min res
  '003': { decimals: 2 },  // Cross Track Distance (NM)– 4 digits + PAD, 0.1 NM res
  '004': { decimals: 0 },  // Runway Distance to Go (ft)
  '010': { decimals: 4 },  // Present Position - Latitude (deg DDMM.mmmm)
  '011': { decimals: 4 },  // Present Position - Longitude (deg DDDMM.mmmm)
  '012': { decimals: 0 },  // Ground Speed (kt)
  '013': { decimals: 2 },  // Track Angle - True (deg)
  '014': { decimals: 1 },  // Magnetic Heading (deg)
  '015': { decimals: 0 },  // Wind Speed (kt)
  '016': { decimals: 1 },  // Wind Direction - True (deg)
  '017': { decimals: 1 },  // Selected Runway Heading (deg)
  '020': { decimals: 0 },  // Selected Vertical Speed (ft/min)
  '021': { decimals: 1 },  // N1 Selected / EPR        – 4 digits + PAD, 1 RPM res
  '022': { decimals: 3 },  // Selected Mach
  '023': { decimals: 2 },  // Selected Heading (deg)   – 3 digits + 2 PAD, 1° res
  '024': { decimals: 2 },  // Selected Course #1 (deg) – 3 digits + 2 PAD, 1° res
  '025': { decimals: 0 },  // Selected Altitude (ft)
  '026': { decimals: 2 },  // Selected Airspeed (kt)   – 3 digits + 2 PAD, 1 kt res
  '027': { decimals: 2 },  // Selected Course #2 (deg) – 3 digits + 2 PAD, 1° res
  // ── Radio frequency labels (SSM: 00=NML, 01=NCD, 10=FT, 11=Undef) ──
  '030': { decimals: 3, implicit: 100 },  // VHF COM (MHz) – 118-137, centaine implicite
  '031': { squawk: true },                // Code Transpondeur (ABCD octal)
  '032': { decimals: 1, maskD0: true, halfBit: 14, halfStep: 0.5 },  // ADF (kHz) – bit14=0.5kHz
  '033': { decimals: 3, implicit: 100, maskD0: true },  // ILS (MHz) – bits12-11=CAT (ignorés)
  '034': { decimals: 3, implicit: 100 },  // VOR/ILS (MHz) – bit15=mode inclus dans BCD
  '035': { decimals: 3, implicit: 100, bcdDigits: 3, halfBit: 18, halfStep: 0.05 },  // DME (MHz)
  '036': { decimals: 3, implicit: 100 },  // MLS Frequency (MHz)
  '037': { decimals: 3 },  // HF COM Frequency (MHz)
  '041': { decimals: 4 },  // Set Latitude
  '042': { decimals: 4 },  // Set Longitude
  '043': { decimals: 1 },  // Set Magnetic Heading (deg)
  '044': { decimals: 1 },  // True Heading (deg)
  '045': { decimals: 0 },  // Minimum Airspeed (kt)
  '056': { decimals: 0 },  // ETA (HHMM)
  '065': { decimals: 0 },  // Gross Weight (100 lb)
  '066': { decimals: 1 },  // Longitudinal CG (% MAC)
  '067': { decimals: 1 },  // Lateral CG (% MAC)
  '125': { decimals: 1 },  // UTC/GMT (H:min)           – 5 digits, 0.1 H/min res
  '145': { decimals: 0 },  // TACAN Control (channel)
  '170': { decimals: 0 },  // Decision Height Selected (ft)
  '200': { decimals: 1 },  // Drift Angle (deg)
  '201': { decimals: 2 },  // DME Distance (nm)
  '230': { decimals: 2 },  // True Airspeed (kt)        – 3 digits + 2 PAD, 1 kt res
  '231': { decimals: 1 },  // Total Air Temperature (°C)
  '232': { decimals: 0 },  // Altitude Rate (ft/min)
  '233': { decimals: 1 },  // Static Air Temperature (°C)
  '234': { decimals: 2 },  // Baro Correction (mb)
  '235': { decimals: 2 },  // Baro Correction (inHg)    – 4 digits, 0.01 inHg res
  '260': { decimals: 0 },  // Date/Flight Leg
  '261': { decimals: 0 },  // Flight Number

  // ── BNR labels ────────────────────────────────────
  '052': { msb: 128    },  '053': { msb: 128    },  '054': { msb: 128    },
  '070': { msb: 512    },  '071': { msb: 512    },  '072': { msb: 512    },
  '073': { msb: 512    },  '074': { msb: 262144  },  '075': { msb: 262144  },
  '076': { msb: 131072  },  '077': { msb: 64     },
  '100': { msb: 180    },  '101': { msb: 180    },  '102': { msb: 131072  },
  '103': { msb: 512    },  '104': { msb: 16384   },  '105': { msb: 180    },
  '106': { msb: 4      },  '107': { msb: 131072  },  '110': { msb: 180    },
  '111': { msb: 180    },  '112': { msb: 32768   },  '114': { msb: 180    },
  '115': { msb: 180    },  '116': { msb: 64      },  '117': { msb: 2500   },
  '120': { msb: 512    },  '121': { msb: 90      },  '122': { msb: 90     },
  '123': { msb: 128    },  '126': { msb: 32768   },  '127': { msb: 131072  },
  '130': { msb: 512    },  '131': { msb: 131072  },  '132': { msb: 180    },
  '133': { msb: 180    },  '134': { msb: 180     },  '135': { msb: 16     },
  '140': { msb: 90     },  '141': { msb: 90      },  '142': { msb: 256    },
  '143': { msb: 90     },  '144': { msb: 2048    },
  '150': { msb: 43200  },  '151': { msb: 180     },  '152': { msb: 1024   },
  '153': { msb: 131072  },  '154': { msb: 180    },
  '162': { msb: 180    },  '164': { msb: 2500    },  '165': { msb: 16384  },
  '166': { msb: 1024   },  '167': { msb: 128     },  '171': { msb: 32     },
  '173': { msb: 0.4    },  '174': { msb: 0.4     },  '175': { msb: 512    },
  '176': { msb: 4      },  '177': { msb: 131072  },
  '202': { msb: 2048   },  '203': { msb: 131072  },  '204': { msb: 131072  },
  '205': { msb: 4      },  '206': { msb: 1024    },  '207': { msb: 1024   },
  '210': { msb: 1024   },  '211': { msb: 512     },  '212': { msb: 16384  },
  '213': { msb: 512    },  '215': { msb: 1024    },  '217': { msb: 16384  },
  '220': { msb: 131072  },  '221': { msb: 90     },  '222': { msb: 180    },
  '225': { msb: 1024   },
  '241': { msb: 512    },  '242': { msb: 2048    },  '244': { msb: 131072  },
  '245': { msb: 512    },  '246': { msb: 128     },  '247': { msb: 262144  },
  '250': { msb: 128    },  '251': { msb: 2048    },  '252': { msb: 1024   },
  '253': { msb: 128    },  '254': { msb: 128     },  '255': { msb: 128    },
  '256': { msb: 1024   },  '257': { msb: 1024    },
  '262': { msb: 65536  },  '263': { msb: 512     },  '264': { msb: 128    },
  '265': { msb: 512    },  '267': { msb: 512     },
  '310': { msb: 90,    ssmSign: true },  // Latitude  (SSM 01=N, 10=S)
  '311': { msb: 180,   ssmSign: true },  // Longitude (SSM 01=E, 10=W)
  '312': { msb: 2048   },  '313': { msb: 180    },  '314': { msb: 180    },
  '315': { msb: 1024   },  '316': { msb: 180    },  '317': { msb: 180    },
  '320': { msb: 180    },  '321': { msb: 90     },  '322': { msb: 90     },
  '323': { msb: 4      },  '324': { msb: 90     },  '325': { msb: 180    },
  '326': { msb: 128    },  '327': { msb: 128    },
  '330': { msb: 128    },  '331': { msb: 4      },  '332': { msb: 4      },
  '333': { msb: 4      },  '334': { msb: 180    },  '335': { msb: 8      },
  '336': { msb: 128    },  '337': { msb: 128    },
  '340': { msb: 8      },  '341': { msb: 128    },  '342': { msb: 128    },
  '343': { msb: 128    },  '344': { msb: 128    },  '345': { msb: 1024   },
  '346': { msb: 128    },  '347': { msb: 131072  },
  '360': { msb: 16384  },  '361': { msb: 131072  },  '362': { msb: 4      },
  '363': { msb: 4      },  '364': { msb: 4      },  '365': { msb: 16384  },
  '366': { msb: 1024   },  '367': { msb: 1024   },  '370': { msb: 131072  },
  '372': { msb: 180    },  '373': { msb: 1024   },  '374': { msb: 1024   },
  '375': { msb: 4      },  '376': { msb: 4      },
};

// Decode the data field (bits 11-29) according to the label's encoding
// Returns a formatted string, or null if no metadata / invalid data.
function decodeData(word, labelInfo) {
  if (!labelInfo) return null;
  const meta = DECODE_META[labelInfo.oct];
  if (!meta) return null;

  // data19: bits 29-11 of the word mapped to bit positions 18-0
  const data19 = (word >> 10) & 0x7FFFF;

  // ── BNR (sign-magnitude) ──────────────────────────
  if (labelInfo.enc === 'BNR' && meta.msb !== undefined) {
    const ssm = (word >> 29) & 0x3;
    let sign;
    if (meta.ssmSign) {
      // SSM 01 = N/E/Right (+), SSM 10 = S/W/Left (-)
      sign = (ssm === 0b10) ? 1 : 0;
    } else {
      // Bit 29 of word = bit 18 of data19 = sign bit
      sign = (data19 >> 18) & 1;
    }
    // Bits 28-11 of word = bits 17-0 of data19 = 18-bit magnitude
    const magnitude = data19 & 0x3FFFF;
    // Resolution: bit 28 represents meta.msb, so LSB = meta.msb / 2^17
    const resolution = meta.msb / 131072;
    const value = (sign ? -1 : 1) * magnitude * resolution;
    // Choose decimal places based on resolution magnitude
    const dp = resolution >= 10 ? 1 : resolution >= 1 ? 2 : resolution >= 0.01 ? 3 : 5;
    return (sign ? '−' : '') + Math.abs(value).toFixed(dp);
  }

  // ── BCD ──────────────────────────────────────────
  if (labelInfo.enc === 'BCD' && (meta.decimals !== undefined || meta.squawk)) {
    // 5-digit BCD, MSB-first in bits 29-11:
    //   d4 (3 bits) = bits 29-27 → data19 bits 18-16
    //   d3 (4 bits) = bits 26-23 → data19 bits 15-12
    //   d2 (4 bits) = bits 22-19 → data19 bits 11-8
    //   d1 (4 bits) = bits 18-15 → data19 bits 7-4
    //   d0 (4 bits) = bits 14-11 → data19 bits 3-0
    const d4 = (data19 >> 16) & 0x7;
    const d3 = (data19 >> 12) & 0xF;
    const d2 = (data19 >> 8)  & 0xF;
    // bcdDigits:3 → only d4/d3/d2 are BCD; maskD0/bcdDigits → force lower digits to 0
    const d1 = (meta.bcdDigits === 3) ? 0 : ((data19 >> 4) & 0xF);
    const d0 = (meta.bcdDigits === 3 || meta.maskD0) ? 0 : (data19 & 0xF);

    // ── Squawk (label 031): 4-digit octal transponder code ──
    if (meta.squawk) {
      // Codes A-D each 0-7; validate all ≤7
      if (d4 > 7 || d3 > 7 || d2 > 7 || d1 > 7) return null;
      return `${d4}${d3}${d2}${d1}`;
    }

    // Reject invalid BCD digits (>9 means binary garbage)
    if (d3 > 9 || d2 > 9 || d1 > 9 || d0 > 9) return null;

    const raw = d4 * 10000 + d3 * 1000 + d2 * 100 + d1 * 10 + d0;
    const base = meta.implicit || 0;
    let value = base + raw / Math.pow(10, meta.decimals);

    // halfBit: one discrete bit that adds halfStep to the frequency
    if (meta.halfBit !== undefined) {
      value += getBit(word, meta.halfBit) * meta.halfStep;
    }

    // Auto-choose display decimals: enough for halfStep precision
    let dp = meta.decimals;
    if (meta.halfStep !== undefined) {
      const halfDp = Math.max(0, -Math.floor(Math.log10(meta.halfStep)));
      dp = Math.max(dp, halfDp);
    }
    return value.toFixed(dp);
  }

  return null;
}

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

// ── Field map ────────────────────────────────────────

function getDataFieldSegments(oct, enc, meta) {
  // Label-specific
  if (oct === '030') return [
    { span:3, label:'10MHz',    cls:'fmap-freq' },
    { span:4, label:'1MHz',     cls:'fmap-freq' },
    { span:4, label:'0.1MHz',  cls:'fmap-freq' },
    { span:4, label:'0.01MHz', cls:'fmap-freq' },
    { span:4, label:'0.001MHz',cls:'fmap-freq' },
  ];
  if (oct === '031') return [
    { span:3, label:'A',    cls:'fmap-bcd' },
    { span:3, label:'B',    cls:'fmap-bcd' },
    { span:3, label:'C',    cls:'fmap-bcd' },
    { span:3, label:'D',    cls:'fmap-bcd' },
    { span:7, label:'CTRL', cls:'fmap-dis' },
  ];
  if (oct === '032') return [
    { span:3, label:'1000kHz',cls:'fmap-freq' },
    { span:4, label:'100kHz', cls:'fmap-freq' },
    { span:4, label:'10kHz',  cls:'fmap-freq' },
    { span:4, label:'1kHz',   cls:'fmap-freq' },
    { span:1, label:'½kHz',  cls:'fmap-freq' },
    { span:1, label:'SP',     cls:'fmap-pad'  },
    { span:1, label:'ANT',    cls:'fmap-dis'  },
    { span:1, label:'BFO',    cls:'fmap-dis'  },
  ];
  if (oct === '033') return [
    { span:3, label:'10MHz',   cls:'fmap-freq' },
    { span:4, label:'1MHz',    cls:'fmap-freq' },
    { span:4, label:'0.1MHz',  cls:'fmap-freq' },
    { span:4, label:'0.01MHz', cls:'fmap-freq' },
    { span:2, label:'SP',      cls:'fmap-pad'  },
    { span:2, label:'CAT',     cls:'fmap-dis'  },
  ];
  if (oct === '034') return [
    { span:3, label:'10MHz',   cls:'fmap-freq' },
    { span:4, label:'1MHz',    cls:'fmap-freq' },
    { span:4, label:'0.1MHz',  cls:'fmap-freq' },
    { span:4, label:'0.01MHz', cls:'fmap-freq' },
    { span:1, label:'ILS',     cls:'fmap-dis'  },
    { span:3, label:'SP',      cls:'fmap-pad'  },
  ];
  if (oct === '035') return [
    { span:3, label:'10MHz',  cls:'fmap-freq' },
    { span:4, label:'1MHz',   cls:'fmap-freq' },
    { span:4, label:'0.1MHz', cls:'fmap-freq' },
    { span:1, label:'.05M',   cls:'fmap-freq' },
    { span:1, label:'ID',     cls:'fmap-dis'  },
    { span:1, label:'IDd',    cls:'fmap-dis'  },
    { span:2, label:'FLG',    cls:'fmap-dis'  },
    { span:3, label:'MODE',   cls:'fmap-dis'  },
  ];
  if (oct === '036') return [
    { span:3, label:'10MHz',    cls:'fmap-freq' },
    { span:4, label:'1MHz',     cls:'fmap-freq' },
    { span:4, label:'0.1MHz',   cls:'fmap-freq' },
    { span:4, label:'0.01MHz',  cls:'fmap-freq' },
    { span:4, label:'0.001MHz', cls:'fmap-freq' },
  ];
  // Generic by encoding
  if (enc === 'BCD') {
    const isPad1 = meta && (meta.bcdDigits === 3 || meta.maskD0);
    const isPad2 = meta && meta.bcdDigits === 3;
    return [
      { span:3, label:'d4', cls:'fmap-bcd' },
      { span:4, label:'d3', cls:'fmap-bcd' },
      { span:4, label:'d2', cls:'fmap-bcd' },
      { span:4, label: isPad2 ? 'PAD' : 'd1', cls: isPad2 ? 'fmap-pad' : 'fmap-bcd' },
      { span:4, label: isPad1 ? 'DIS' : 'd0', cls: isPad1 ? 'fmap-dis' : 'fmap-bcd' },
    ];
  }
  if (enc === 'BNR') return [
    { span:1,  label:'sgn',  cls:'fmap-sign' },
    { span:18, label:'data', cls:'fmap-bnr'  },
  ];
  if (enc === 'DIS') return [
    { span:19, label:'discrets 11-29', cls:'fmap-dis' },
  ];
  return [{ span:19, label:'DATA', cls:'fmap-bnr' }];
}

function renderFieldMap(labelInfo, meta) {
  const container = document.getElementById('field-map');
  container.innerHTML = '';
  const oct = labelInfo ? labelInfo.oct : null;
  const enc = labelInfo ? labelInfo.enc : null;

  const segs = [
    { span:1, label:'P',     cls:'fmap-parity' },
    { span:2, label:'SSM',   cls:'fmap-ssm'    },
    ...getDataFieldSegments(oct, enc, meta),
    { span:2, label:'SDI',   cls:'fmap-sdi'    },
    { span:8, label:'LABEL', cls:'fmap-label'  },
  ];

  for (const s of segs) {
    const el = document.createElement('div');
    el.className = `fmap-seg ${s.cls}`;
    el.style.gridColumn = `span ${s.span}`;
    el.textContent = s.label;
    container.appendChild(el);
  }
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
  const meta = DECODE_META[labelOct];
  renderFieldMap(labelInfo, meta);

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
  const ssmType = getLabelSsmType(labelInfo);
  const sdiTable = ['radio', 'dis', 'bnr'].includes(ssmType) ? SDI_TABLES.tous : SDI_TABLES.other;
  document.getElementById('d-sdi').textContent = sdi.toString(2).padStart(2, '0');
  document.getElementById('d-sdi-desc').textContent = sdiTable[sdi];

  // ── Data (bits 11-29, 19 bits) ──
  const data19 = (word >> 10) & 0x7FFFF;
  const dataBin = data19.toString(2).padStart(19, '0');
  const dataBinGrouped = dataBin.replace(/(.{4})/g, '$1 ').trim();
  document.getElementById('d-data-bin').textContent = dataBinGrouped;
  document.getElementById('d-data-dec').textContent = data19;
  document.getElementById('d-data-hex').textContent = '0x' + data19.toString(16).toUpperCase().padStart(5, '0');
  const decoded = decodeData(word, labelInfo);
  document.getElementById('d-data-decoded').textContent = decoded !== null
    ? decoded + (labelInfo && labelInfo.unit ? ' ' + labelInfo.unit : '')
    : '—';
  document.getElementById('d-data-format').textContent = labelInfo ? labelInfo.enc : '—';

  // ── SSM (bits 30-31) ──
  const ssm = (word >> 29) & 0x3;
  const ssmBin = ssm.toString(2).padStart(2, '0');
  const ssmTable = SSM_TABLES[ssmType] || SSM_TABLES.bcd;
  const ssmDesc = ssmTable[ssm];

  function ssmCatClass(desc) {
    if (!desc || desc === '—') return 'ssm-undef';
    if (desc.includes('FW') || desc.includes('Failure Warning')) return 'ssm-fw';
    if (desc.includes('NCD') || desc.includes('No Computed'))    return 'ssm-ncd';
    if (desc.includes('FT') || desc.includes('Functional Test')) return 'ssm-ft';
    if (desc.includes('Undefined'))                               return 'ssm-undef';
    return 'ssm-normal'; // Normal NML, Normal+, Normal−
  }

  document.getElementById('d-ssm').textContent = ssmBin;
  document.getElementById('d-ssm-type').textContent = ssmType.toUpperCase();

  // Populate SSM reference table
  document.getElementById('ssm-ref-title').textContent = `Référentiel SSM (${ssmType.toUpperCase()}) :`;
  for (let i = 0; i < 4; i++) {
    const desc = ssmTable[i];
    document.getElementById(`ssm-ref-desc-${i}`).textContent = desc;
    const row = document.getElementById(`ssm-ref-${i}`);
    const cat = ssmCatClass(desc);
    row.className = `ssm-ref-row ${cat}${i === ssm ? ' ssm-active' : ''}`;
  }

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
  document.getElementById('banner-value').textContent = decoded !== null
    ? decoded + (labelInfo && labelInfo.unit ? ' ' + labelInfo.unit : '')
    : '—';

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
