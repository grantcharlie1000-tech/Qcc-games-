/**
 * The North Pole workshop at night, as one inline SVG. Decorative only (aria-hidden).
 * Motion is CSS on transform and opacity (see santa.css), so a low-end phone composites it
 * without repainting. It pauses off-screen and stops under reduced motion.
 */
const lights=[
  [388,262,'#e8323f'],[410,276,'#f4c430'],[372,288,'#2f8fe0'],[400,300,'#2fb35a'],[426,304,'#f07f2b'],
  [360,318,'#f4c430'],[386,326,'#e8323f'],[414,330,'#b45cd6'],[440,334,'#2fb35a'],[350,346,'#2f8fe0'],[452,350,'#e8323f'],
] as const;
const bulb=([x,y,c]:readonly [number,number,string],i:number)=>`<circle class="sp-light" style="animation-delay:${(i*0.37%1.6).toFixed(2)}s" cx="${x}" cy="${y}" r="4.2" fill="${c}"/>`;

export const northPoleScene=`<svg class="santa-scene-art" viewBox="0 0 800 420" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
<defs>
  <linearGradient id="sp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050b1f"/><stop offset=".6" stop-color="#0b1a44"/><stop offset="1" stop-color="#1b3466"/></linearGradient>
  <linearGradient id="sp-aurora-a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3ff2b0" stop-opacity="0"/><stop offset=".35" stop-color="#3ff2b0" stop-opacity=".55"/><stop offset=".7" stop-color="#4fc3ff" stop-opacity=".35"/><stop offset="1" stop-color="#4fc3ff" stop-opacity="0"/></linearGradient>
  <linearGradient id="sp-aurora-b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9b7bff" stop-opacity="0"/><stop offset=".5" stop-color="#7cf5c8" stop-opacity=".4"/><stop offset="1" stop-color="#7cf5c8" stop-opacity="0"/></linearGradient>
  <radialGradient id="sp-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd27a" stop-opacity=".75"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
  <radialGradient id="sp-moon" cx=".4" cy=".4" r=".7"><stop offset="0" stop-color="#fffbe9"/><stop offset="1" stop-color="#e9e1c2"/></radialGradient>
  <linearGradient id="sp-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8283a"/><stop offset="1" stop-color="#7c1726"/></linearGradient>
  <linearGradient id="sp-snow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfdcee"/></linearGradient>
  <pattern id="sp-stripe" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="14" height="14" fill="#f8f3ea"/><rect width="7" height="14" fill="#d8263a"/></pattern>
</defs>
<rect width="800" height="420" fill="url(#sp-sky)"/>
<g class="sp-aurora">
  <path d="M-20 120C120 40 240 150 380 80S640 30 820 110L820 150C650 80 520 150 380 128S120 90-20 170Z" fill="url(#sp-aurora-a)"/>
</g>
<g class="sp-aurora sp-aurora-2">
  <path d="M-20 70C160 20 300 110 460 60S700 20 820 60L820 86C680 50 560 110 440 100S150 50-20 108Z" fill="url(#sp-aurora-b)"/>
</g>
<g fill="#fff8dc">
  <circle cx="60" cy="40" r="1.4"/><circle cx="150" cy="96" r="1"/><circle cx="246" cy="30" r="1.6"/><circle cx="320" cy="150" r="1"/><circle cx="470" cy="24" r="1.2"/>
  <circle cx="520" cy="130" r="1"/><circle cx="700" cy="168" r="1.2"/><circle cx="760" cy="40" r="1.4"/><circle cx="40" cy="180" r="1"/><circle cx="586" cy="70" r="1"/>
  <path class="sp-twinkle" d="M200 64l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path class="sp-twinkle sp-twinkle-2" d="M640 110l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z"/>
</g>
<circle cx="150" cy="128" r="24" fill="url(#sp-moon)"/>
<circle cx="143" cy="122" r="4" fill="#ddd3b0" opacity=".6"/><circle cx="157" cy="137" r="2.8" fill="#ddd3b0" opacity=".55"/>
<path d="M0 300C110 250 210 268 300 290S520 240 620 262 760 250 800 262V420H0Z" fill="#9fb6d6"/>
<path d="M0 300C110 250 210 268 300 290S520 240 620 262 760 250 800 262" fill="none" stroke="#e2ecf8" stroke-width="3" opacity=".7"/>
<!-- The workshop. -->
<ellipse cx="560" cy="300" rx="150" ry="60" fill="url(#sp-glow)" class="sp-glow"/>
<g>
  <rect x="604" y="160" width="26" height="70" fill="#5a2a22"/><rect x="600" y="154" width="34" height="12" rx="3" fill="#f6faff"/>
  <g class="sp-smoke-group" fill="#d9e3f1">
    <circle class="sp-smoke" cx="617" cy="146" r="9"/><circle class="sp-smoke sp-smoke-2" cx="617" cy="146" r="9"/><circle class="sp-smoke sp-smoke-3" cx="617" cy="146" r="9"/>
  </g>
  <rect x="470" y="226" width="200" height="110" fill="url(#sp-wall)"/>
  <path d="M470 246h200M470 270h200M470 294h200M470 318h200" stroke="#6e1220" stroke-width="2" opacity=".55"/>
  <path d="M452 232 570 160 688 232Z" fill="#3b2a2f"/>
  <path d="M462 226L570 158L678 226Q668 236 656 229Q646 238 634 230Q622 239 610 230Q598 238 586 230Q574 239 562 230Q550 238 538 230Q526 239 514 230Q502 238 490 230Q478 238 462 226Z" fill="url(#sp-snow)"/>
  <rect x="546" y="270" width="48" height="66" rx="22" fill="#4a2a1e"/><rect x="546" y="270" width="48" height="66" rx="22" fill="none" stroke="#e9b949" stroke-width="3"/>
  <circle cx="584" cy="306" r="3" fill="#e9b949"/>
  <path d="M552 266c6-10 30-10 36 0" fill="none" stroke="#2c9a55" stroke-width="7" stroke-linecap="round"/>
  <circle cx="570" cy="262" r="4" fill="#d8263a"/>
  <g class="sp-window"><rect x="490" y="258" width="40" height="38" rx="5" fill="#ffd27a"/><rect x="610" y="258" width="40" height="38" rx="5" fill="#ffd27a"/></g>
  <path d="M510 258v38M490 277h40M630 258v38M610 277h40" stroke="#7c1726" stroke-width="4"/>
  <path d="M486 296h48M606 296h48" stroke="#f6faff" stroke-width="6" stroke-linecap="round"/>
  <path d="M470 226q16 14 33 0t33 0 33 0 33 0 34 0 34 0" fill="none" stroke="#1d3527" stroke-width="2"/>
  <g class="sp-roof-lights"><circle cx="486" cy="234" r="3.6" fill="#e8323f"/><circle cx="520" cy="234" r="3.6" fill="#f4c430"/><circle cx="553" cy="234" r="3.6" fill="#2fb35a"/><circle cx="586" cy="234" r="3.6" fill="#2f8fe0"/><circle cx="619" cy="234" r="3.6" fill="#f07f2b"/><circle cx="653" cy="234" r="3.6" fill="#e8323f"/></g>
</g>
<!-- The North Pole itself, with its sign. Kept inside the narrowest phone crop. -->
<g transform="translate(-24 0)">
  <rect x="704" y="190" width="14" height="150" fill="url(#sp-stripe)"/>
  <circle cx="711" cy="184" r="12" fill="#e9b949"/><circle cx="707" cy="180" r="4" fill="#fff6d2" opacity=".8"/>
  <rect x="674" y="214" width="74" height="24" rx="5" fill="#f6faff" stroke="#a81b2d" stroke-width="2"/>
  <text x="711" y="230.5" text-anchor="middle" font-size="11" font-weight="800" fill="#a81b2d" font-family="Arcade,Arial,sans-serif">NORTH POLE</text>
</g>
<!-- Tree. -->
<g>
  <rect x="394" y="352" width="16" height="22" fill="#5a3a26"/>
  <path d="M402 234 448 300H420L462 346H342L384 300H356Z" fill="#1f7a42"/>
  <path d="M402 234 448 300H420L462 346H402Z" fill="#175f33"/>
  <path d="M356 300h92M342 346h120" stroke="#f6faff" stroke-width="5" stroke-linecap="round" opacity=".9"/>
  ${lights.map(bulb).join('')}
  <path class="sp-star" d="M402 214l6 13 14 2-10 10 3 14-13-7-13 7 3-14-10-10 14-2z" fill="#f8dd8a" stroke="#e9b949" stroke-width="2" stroke-linejoin="round"/>
</g>
<!-- Sleigh, packed and waiting, with one reindeer. -->
<g class="sp-sleigh">
  <path d="M110 352h170q16 0 16-12" fill="none" stroke="#e9b949" stroke-width="6" stroke-linecap="round"/>
  <path d="M132 352v-14M250 352v-14" stroke="#e9b949" stroke-width="5"/>
  <path d="M118 296q-8 42 30 42h112q30 0 34-36l-40 8q-6-36-46-36h-60q-26 0-30 22z" fill="#d8263a" stroke="#6e1220" stroke-width="3" stroke-linejoin="round"/>
  <path d="M124 320h150" stroke="#e9b949" stroke-width="4"/>
  <path d="M150 270q-6-40 40-44 46 4 40 44z" fill="#8b5a2b" stroke="#5a3a1a" stroke-width="3"/>
  <path d="M172 234q18 10 36 0" stroke="#e9b949" stroke-width="4" fill="none"/>
  <rect x="226" y="252" width="26" height="26" rx="3" fill="#2c9a55"/><path d="M239 252v26M226 265h26" stroke="#e9b949" stroke-width="4"/>
  <rect x="138" y="254" width="22" height="22" rx="3" fill="#2f8fe0"/><path d="M149 254v22M138 265h22" stroke="#f6faff" stroke-width="3.5"/>
</g>
<g class="sp-reindeer">
  <path d="M296 330q8 0 12-6" stroke="#7a4b2a" stroke-width="2" fill="none"/>
  <ellipse cx="338" cy="314" rx="34" ry="17" fill="#8b5a33"/>
  <path d="M312 326v28M322 328v26M352 328v26M362 324v30" stroke="#6b4226" stroke-width="7" stroke-linecap="round"/>
  <path d="M362 306q12-20 14-34" stroke="#8b5a33" stroke-width="13" stroke-linecap="round" fill="none"/>
  <g class="sp-head">
    <ellipse cx="384" cy="266" rx="16" ry="11" fill="#8b5a33"/>
    <path d="M376 258q-6-18-18-22M374 248l-10-2M382 256q4-20 18-26M392 238l8-10" stroke="#5a3a1a" stroke-width="3.5" stroke-linecap="round" fill="none"/>
    <circle cx="384" cy="263" r="2.4" fill="#1b1b1b"/>
    <circle class="sp-nose" cx="399" cy="270" r="5.5" fill="#ff3b3b"/>
  </g>
  <path d="M312 304q-10-6-6 4" fill="#f6faff"/>
  <path d="M320 304q18 6 36 0" stroke="#d8263a" stroke-width="5" fill="none"/>
  <circle cx="338" cy="309" r="3.6" fill="#e9b949"/>
</g>
<path d="M0 352C120 330 230 362 360 356S600 330 800 350V420H0Z" fill="url(#sp-snow)"/>
<path d="M0 392C160 372 300 398 460 388S690 372 800 386V420H0Z" fill="#eef4fb"/>
</svg>`;
