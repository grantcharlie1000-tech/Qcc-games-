/** Breachline title card palette. Every colour in the cover and title comes from here.
 *  A ramp is [top, left (+y face), right (+x face)]: three shades per face direction. */
export type Ramp = readonly [string, string, string];

export const CARD = { bg: '#1f2a33', ink: '#fff3df', accent: '#f0b429' } as const;

/** Title lettering ramps: [front, right side, underside]. */
export const LETTER = {
  ink: ['#fff3df', '#c8b896', '#8c7d63'],
  accent: ['#f0b429', '#b67f12', '#7c560c'],
} as const;

const r = (top: string, left: string, right: string): Ramp => [top, left, right];

export const P = {
  // building
  slab: r('#56626d', '#46515b', '#37404a'),
  board: r('#efe5d2', '#ddd0b8', '#b9aa8f'),
  boardDim: r('#e4d8c1', '#cfc1a6', '#ab9c81'),
  gypsum: r('#fbf5ea', '#ece2cf', '#cdbfa5'),
  dado: r('#8a99a6', '#6f7f8c', '#576571'),
  trim: r('#4a5662', '#3b4651', '#2e3740'),
  stud: r('#d4ab72', '#b48a52', '#8a683b'),
  carpet: r('#4d5d72', '#3f4d61', '#323e4f'),
  tile: r('#e3e0d7', '#cdc9bf', '#aca89e'),
  tileAlt: r('#cfd0ca', '#b9bab4', '#9a9b95'),
  // furniture
  steel: r('#b3bdc7', '#97a2ad', '#7a8591'),
  brace: r('#8a96a2', '#717d89', '#5a6570'),
  steelDark: r('#56616c', '#444e58', '#343c45'),
  hazard: r('#f5c040', '#f0b429', '#c48c14'),
  hazardInk: r('#2c3138', '#23272d', '#1a1d21'),
  desk: r('#456789', '#33506d', '#273e55'),
  laminate: r('#d3bd94', '#bba57b', '#968260'),
  cabinet: r('#a2abb4', '#858f98', '#69727b'),
  monitor: r('#2f343b', '#25292f', '#1b1e22'),
  paper: r('#f6f1e6', '#e3ddcf', '#c2bcae'),
  // people
  skin: r('#e9b893', '#cf9876', '#a8775b'),
  gun: r('#9aa1ab', '#5a6069', '#454a52'),
  gunLight: r('#b5bcc5', '#7d848e', '#636a73'),
  boot: r('#2c2a28', '#232120', '#1a1918'),
  goggle: r('#bfe3f2', '#93c4d9', '#6c9fb6'),
  visor: r('#1a1d22', '#15171b', '#101215'),
  atkCloth: r('#7086a3', '#5b6f8a', '#475771'),
  atkVest: r('#475771', '#3a4860', '#2d394d'),
  atkHelmet: r('#7a8fab', '#627593', '#4c5d78'),
  atkBand: r('#6cb8ff', '#3b93f5', '#2470cc'),
  defCloth: r('#a99f80', '#8c8367', '#6d664f'),
  defVest: r('#6c7255', '#595e46', '#454936'),
  defHelmet: r('#7f8466', '#686d53', '#525641'),
  defBand: r('#ffa24a', '#f5801f', '#c86312'),
  // light and objective
  uplink: r('#3c434c', '#30363e', '#252a30'),
  uplinkGlow: r('#c9fff0', '#7df2cf', '#4fd3ad'),
  screen: r('#9fe0ff', '#7fcff5', '#5fb3dc'),
  soot: r('#a59a88', '#8f8473', '#71685a'),
  scorch: r('#6e5f4f', '#5b4e41', '#473d33'),
  flash: r('#ffffff', '#fff6d8', '#ffe7a0'),
  brass: r('#f2c96a', '#d9a843', '#b0852c'),
  fire: r('#fff1c4', '#ffd277', '#f0b429'),
} as const;

export type Material = keyof typeof P;

/** Lights, as linear multipliers. */
export const LIGHT = {
  ambient: [0.46, 0.47, 0.54],
  fill: [0.2, 0.2, 0.23],
  breach: [1.3, 0.85, 0.35],
  uplink: [0.2, 0.7, 0.55],
} as const;
