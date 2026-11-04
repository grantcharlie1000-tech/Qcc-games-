import type { WeaponId } from './config';

/* Original Quad Clash icon set. All strings are decorative inline SVG; size them with CSS. */

const A = 'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"';
const OUT = '<g stroke="#1b2238" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">';
const HI = 'fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"';

/** Wrap weapon artwork in the shared 96x40 frame with the consistent 2px outline. */
const weapon = (art: string): string => `<svg ${A} viewBox="0 0 96 40">${OUT}${art}</g></svg>`;

/** Original weapon icons, side view, muzzle right. viewBox 0 0 96 40. */
export const WEAPON_ICONS: Readonly<Record<WeaponId, string>> = {
  bell: weapon(
    '<path d="M3 14h17v12H8q-5 0-5-5z" fill="#2f4a8a"/>' +
      '<path d="M21 26h7l-2 10h-7z" fill="#26335c"/>' +
      '<path d="M37 26q1 10 12 10l5-3q-8-1-8-7z" fill="#f2b632"/>' +
      '<rect x="18" y="13" width="46" height="13" rx="2" fill="#3d5fb0"/>' +
      '<rect x="64" y="15" width="26" height="7" rx="1" fill="#9aa3bb"/>' +
      '<rect x="88" y="13" width="5" height="11" rx="1" fill="#5b6482"/>' +
      '<path d="M38 13q0-8 7-8t7 8z" fill="#f2b632"/><circle cx="45" cy="16" r="1.6" fill="#f2b632"/>' +
      `<path d="M22 17h34M66 18h18" ${HI}/>`,
  ),
  detention: weapon(
    '<path d="M2 15l21-3v15L11 33H5q-3 0-3-4z" fill="#a8672f"/>' +
      '<rect x="22" y="11" width="14" height="17" rx="2" fill="#5a6178"/>' +
      '<rect x="36" y="11" width="56" height="7" rx="1" fill="#6b738c"/>' +
      '<rect x="36" y="19" width="52" height="7" rx="1" fill="#565d75"/>' +
      '<rect x="46" y="22" width="22" height="9" rx="4" fill="#c98542"/>' +
      '<path d="M54 24v5M60 24v5" stroke-width="1.5"/>' +
      `<path d="M6 18l12-1.5M38 14h50" ${HI}/>`,
  ),
  hallpass: weapon(
    '<path d="M3 15h14v13H8q-5 0-5-5z" fill="#2f4a8a"/>' +
      '<rect x="16" y="14" width="46" height="12" rx="2" fill="#f4ead2"/>' +
      '<rect x="62" y="16" width="30" height="5" rx="1" fill="#2f4a8a"/>' +
      '<rect x="38" y="26" width="7" height="10" rx="1" fill="#2f4a8a"/>' +
      '<path d="M20 26h7l-1 6h-5z" fill="#d9cba8"/>' +
      '<path d="M32 14v-3M50 14v-3"/><rect x="28" y="4" width="28" height="8" rx="4" fill="#3d5fb0"/>' +
      '<circle cx="55" cy="8" r="2" fill="#bfe6ff"/>' +
      '<path d="M26 26l2 5" stroke-width="1.5"/><rect x="25" y="31" width="7" height="7" rx="1" fill="#f2b632"/>' +
      `<path d="M20 18h38M33 7h16" ${HI}/>`,
  ),
  firedrill: weapon(
    '<path d="M14 24Q6 25 6 33" fill="none"/>' +
      '<path d="M20 27h12l-2 9h-8z" fill="#26335c"/>' +
      '<path d="M26 10V5h16l4 4v1z" fill="#5a6178"/>' +
      '<rect x="12" y="10" width="62" height="18" rx="8" fill="#e0352b"/>' +
      '<rect x="24" y="10" width="6" height="18" fill="#f2b632"/>' +
      '<rect x="54" y="10" width="6" height="18" fill="#f2b632"/>' +
      '<path d="M74 14l14 3v6l-14 3z" fill="#3a3f52"/>' +
      '<rect x="87" y="15" width="5" height="10" rx="1" fill="#1b2238"/>' +
      `<path d="M34 15h18M64 15h6" ${HI}/>`,
  ),
  recess: weapon(
    '<rect x="5" y="14" width="15" height="9" rx="2" fill="#1f8a4a"/>' +
      '<path d="M24 26h8l-1 9h-7z" fill="#1f8a4a"/>' +
      '<rect x="37" y="25" width="9" height="13" rx="1" fill="#1f8a4a"/>' +
      '<rect x="19" y="12" width="46" height="14" rx="3" fill="#38c06b"/>' +
      '<rect x="65" y="15" width="24" height="7" rx="1" fill="#9aa3bb"/>' +
      '<rect x="28" y="8" width="12" height="4" rx="1" fill="#ffd54a"/>' +
      `<path d="M23 17h38M67 18h16" ${HI}/>`,
  ),
  valedictorian: weapon(
    '<path d="M2 19l13-2v10H8q-6 0-6-4z" fill="#2f4a8a"/>' +
      '<rect x="14" y="17" width="44" height="10" rx="2" fill="#3d5fb0"/>' +
      '<rect x="58" y="20" width="36" height="5" rx="1" fill="#9aa3bb"/>' +
      '<rect x="36" y="27" width="7" height="8" rx="1" fill="#26335c"/>' +
      '<path d="M18 27h7l-1 6h-5z" fill="#26335c"/>' +
      '<rect x="24" y="10" width="34" height="8" rx="4" fill="#5b6fa8"/>' +
      '<circle cx="57" cy="14" r="2" fill="#bfe6ff"/>' +
      '<path d="M32 4l9-3 9 3-9 3z" fill="#3b4468"/>' +
      '<path d="M50 4l1 6" stroke="#f2b632"/><circle cx="51" cy="11" r="1.5" fill="#f2b632"/>' +
      `<path d="M18 21h36M28 13h22" ${HI}/>`,
  ),
  triple: weapon(
    '<path d="M3 13h58l6 4v10H3z" fill="#8a4bd6"/>' +
      '<rect x="67" y="17" width="24" height="6" rx="1" fill="#9aa3bb"/>' +
      '<rect x="40" y="27" width="9" height="10" rx="1" fill="#5a2aa0"/>' +
      '<path d="M54 27h7l-1 8h-6z" fill="#5a2aa0"/>' +
      '<rect x="42" y="8" width="14" height="5" rx="1" fill="#f2b632"/>' +
      '<path d="M18 14v12M26 14v12M34 14v12" stroke="#f2b632" stroke-width="4" stroke-linecap="butt"/>' +
      `<path d="M7 17h8M40 17h18" ${HI}/>`,
  ),
  pencil: weapon(
    '<rect x="4" y="12" width="13" height="17" rx="5" fill="#f48fb1"/>' +
      '<rect x="17" y="12" width="10" height="17" fill="#b8c0cc"/>' +
      '<rect x="27" y="12" width="42" height="17" fill="#f7c928"/>' +
      '<path d="M69 12l17 8.500L69 29z" fill="#f1c690"/>' +
      '<path d="M81 17.700L91 20.500L81 23.300z" fill="#2b2f3a"/>' +
      '<path d="M21 12v17M24 12v17M27 20.500h42" stroke-width="1.500"/>' +
      '<path d="M30 33l5 5h5l-3-9" fill="#26335c"/>' +
      `<path d="M30 16h36M7 16h5" ${HI}/>`,
  ),
};

/** Grenade-style Science Fair flask. viewBox 0 0 40 40. */
export const FLASK_ICON =
  `<svg ${A} viewBox="0 0 40 40">${OUT}` +
  '<path d="M15 6v9C6 20 4 29 9 34c4 4 18 4 22 0 5-5 3-14-6-19V6z" fill="#d6eef8"/>' +
  '<path d="M8 27q12-5 24 0c2 4 1 6-1 7-4 4-18 4-22 0-2-1-3-3-1-7z" fill="#3ddc6b"/>' +
  '<rect x="13" y="1" width="14" height="6" rx="2" fill="#b9783a"/>' +
  '<circle cx="17" cy="30" r="1.800" fill="#c9ffd8" stroke="none"/><circle cx="24" cy="31" r="1.200" fill="#c9ffd8" stroke="none"/>' +
  `<path d="M18 10v5" ${HI}/>` +
  '</g></svg>';

export type UiIcon =
  | 'fire'
  | 'aim'
  | 'jump'
  | 'reload'
  | 'swap'
  | 'grenade'
  | 'board'
  | 'health'
  | 'shield'
  | 'streak';

const ui = (art: string): string =>
  `<svg ${A} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${art}</svg>`;

/** Single-colour (currentColor) HUD and touch-button icons. viewBox 0 0 24 24. */
export const UI_ICONS: Readonly<Record<UiIcon, string>> = {
  fire: ui(
    '<circle cx="12" cy="12" r="2.500" fill="currentColor"/>' +
      '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.600 5.600l2 2M16.400 16.400l2 2M18.400 5.600l-2 2M7.600 16.400l-2 2"/>',
  ),
  aim: ui('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
  jump: ui('<path d="M6 12l6-6 6 6M5 19h14"/>'),
  reload: ui('<path d="M21 12a9 9 0 0 0-15-6.700L3 8M3 3v5h5M3 12a9 9 0 0 0 15 6.700L21 16M16 16h5v5"/>'),
  swap: ui('<path d="M4 8h16M16 4l4 4-4 4M20 16H4M8 12l-4 4 4 4"/>'),
  grenade: ui('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.800 3h10.400A2 2 0 0 0 19 18l-5-9V3M7.500 15h9"/>'),
  board: ui('<path d="M9 9h6v11H9zM3 14h6v6H3zM15 16h6v4h-6zM12 3v3"/>'),
  health: ui('<path d="M12 5v14M5 12h14"/>'),
  shield: ui('<path d="M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6z"/>'),
  streak: ui('<path d="M12 3l2.700 5.600 6.100.9-4.400 4.300 1 6.100L12 17l-5.400 2.900 1-6.100-4.400-4.300 6.100-.9z"/>'),
};
