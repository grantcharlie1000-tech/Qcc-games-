/** Approved direction B. Original QCC SVG marks; no third-party icon artwork. */
export const matchMarkup=`<div class="sr-match-hud" data-direction="B" aria-label="Strongroom match HUD">
  
  <div class="edge-scrim" aria-hidden="true"></div>
  <nav class="navigation" aria-label="Match menu"><button class="menu-button" aria-label="Open match menu" aria-keyshortcuts="P" data-action="menu"><svg class="icon"><use href="#sr-i-menu"/></svg></button><div class="location"><span class="eyebrow">HARBOR</span><span class="location-name">QUAYSIDE</span></div></nav>
  <section class="round-bar plate" aria-label="Round 4. Allies 2, enemies 1. 1 minute 48 seconds remaining.">
    <div class="team ally"><svg class="team-mark icon"><use href="#sr-i-shield"/></svg><div class="operators" role="list" aria-label="Allies">
      <span class="operator" role="listitem" aria-label="Ally 1, Watch, alive"><svg class="icon"><use href="#sr-i-watch"/></svg></span>
      <span class="operator" role="listitem" aria-label="Ally 2, Signal, alive"><svg class="icon"><use href="#sr-i-signal"/></svg></span>
      <span class="operator dead" role="listitem" aria-label="Ally 3, Pulse, dead"><svg class="icon"><use href="#sr-i-dead"/></svg></span>
    </div></div>
    <strong class="score ally" data-role="ally-score">2</strong><div class="round-clock"><span class="eyebrow">ROUND 04</span><strong class="timer" data-role="timer">1:48</strong></div><strong class="score enemy" data-role="enemy-score">1</strong>
    <div class="team enemy"><div class="operators" role="list" aria-label="Enemies">
      <span class="operator" role="listitem" aria-label="Enemy 1, Watch, alive"><svg class="icon"><use href="#sr-i-watch"/></svg></span>
      <span class="operator dead" role="listitem" aria-label="Enemy 2, Signal, dead"><svg class="icon"><use href="#sr-i-dead"/></svg></span>
      <span class="operator" role="listitem" aria-label="Enemy 3, Pulse, alive"><svg class="icon"><use href="#sr-i-pulse"/></svg></span>
    </div><svg class="team-mark icon"><use href="#sr-i-assault"/></svg></div>
  </section>
  <div class="phase-banner" role="status"><span class="phase-text">ACTION</span><span class="phase-detail">DEFEND</span></div>
  <div class="toast" role="status" aria-live="polite"><svg class="icon"><use href="#sr-i-quality"/></svg><span>Quality lowered</span></div>
  <ol class="kill-feed" aria-label="Kill feed"></ol>
  <div class="reticle" aria-hidden="true"><svg viewBox="0 0 72 72" class="reticle-lines"><g class="reticle-under"><path class="crosshair-strokes"/><path class="hit-strokes"/></g><g><path class="crosshair-strokes"/><path class="hit-strokes"/></g></svg></div>
  <section class="vitals plate" aria-label="Health and armour">
    <div class="vital-values"><div class="health-value baseline"><svg class="icon"><use href="#sr-i-health"/></svg><strong data-role="health" id="hp-value">100</strong><span class="unit" data-role="unit">HP</span></div><div class="armour-value baseline"><svg class="icon"><use href="#sr-i-armour"/></svg><strong data-role="armour" id="armour-value">50</strong><span class="unit" data-role="unit">AR</span></div></div>
    <div class="vital-bars"><div class="hp-bar" role="meter" aria-label="Health" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i></i></div><div class="armour-bar" role="meter" aria-label="Armour" aria-valuemin="0" aria-valuemax="50" aria-valuenow="50"><i></i></div></div>
  </section>
  <button class="objective plate" type="button" aria-label="Cracker status">
    <svg class="icon objective-icon"><use href="#sr-i-gadget"/></svg><div class="objective-copy"><div class="objective-title"><span class="site">A</span><span id="objective-title">CRACKER SECURED</span></div><div class="objective-detail"><span id="objective-detail">DEFEND THE SITES</span><span id="plant-percent">0%</span></div><div class="plant-bar" role="progressbar" aria-label="Plant progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div></div>
  </button>
  <button type="button" class="weapon plate sr-ammo" aria-label="Swap weapon">
    <div class="weapon-heading baseline"><span class="eyebrow">TC-5 CARBINE</span><svg class="weapon-icon icon"><use href="#sr-i-rifle"/></svg></div>
    <div class="ammo-row"><div class="ammo-value baseline"><strong id="ammo-value">24</strong><span class="ammo-divider">/</span><span id="reserve-value">150</span></div><div class="inventory"><span class="inventory-item baseline" aria-label="5 spare magazines"><svg class="icon"><use href="#sr-i-mag"/></svg><strong id="mag-count" data-role="inventory">5</strong></span><span class="inventory-item baseline" aria-label="2 gadgets"><svg class="icon"><use href="#sr-i-gadget"/></svg><strong id="gadget-count" data-role="inventory">2</strong></span></div></div>
    <div class="reload-status"><span>RELOADING</span><span>1.4 S</span><i></i></div>
  </button>
  <div class="sr-round-result" role="status" hidden><strong></strong><span></span></div>
  <div class="touch-controls" aria-label="Touch controls">
    <button class="move-zone" aria-label="Move" data-action="move"><svg class="stick" viewBox="0 0 112 112"><circle class="stick-rim-under" cx="56" cy="56" r="48"/><circle class="stick-rim" cx="56" cy="56" r="48"/><g class="stick-thumb"><circle class="stick-thumb-under" cx="56" cy="56" r="17"/><circle cx="56" cy="56" r="17"/></g></svg></button>
    <div class="action-arc">
      <button class="touch-button fire" aria-label="Fire" data-action="fire"><svg class="icon"><use href="#sr-i-fire"/></svg></button>
      <button class="touch-button aim" aria-label="Aim" aria-pressed="false" data-action="aim"><svg class="icon"><use href="#sr-i-aim"/></svg></button>
      <button class="touch-button reload" aria-label="Reload" data-action="reload"><svg class="icon"><use href="#sr-i-reload"/></svg></button>
      <button class="touch-button crouch" aria-label="Crouch" aria-pressed="false" data-action="crouch"><svg class="icon"><use href="#sr-i-crouch"/></svg></button>
      <button class="touch-button jump" aria-label="Jump" data-action="jump"><svg class="icon"><use href="#sr-i-jump"/></svg></button>
      <button class="touch-button gadget" aria-label="Gadget" aria-pressed="false" data-action="gadget"><svg class="icon"><use href="#sr-i-gadget"/></svg></button>
    </div>
  </div>
</div>`;
export const hudSymbols=`<svg xmlns="http://www.w3.org/2000/svg" class="sr-symbols" aria-hidden="true"><defs>
  <symbol id="sr-i-menu" viewBox="0 0 24 24"><path d="m9 5-7 7 7 7M3 12h18M15 5h6M15 19h6"/></symbol>
  <symbol id="sr-i-shield" viewBox="0 0 24 24"><path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Z"/><path d="m8 11 4-4 4 4M12 7v10"/></symbol>
  <symbol id="sr-i-assault" viewBox="0 0 24 24"><path d="m12 2 10 10-10 10L2 12Z"/><path d="m7 14 5-6 5 6M9 17h6"/></symbol>
  <symbol id="sr-i-watch" viewBox="0 0 24 24"><path d="M6 20V9l6-6 6 6v11ZM3 20h18M9 10h6M9 14h6M12 3v17"/></symbol>
  <symbol id="sr-i-signal" viewBox="0 0 24 24"><path d="M8 20h8M10 20V9h4v11M6 7a8 8 0 0 1 12 0M3 4a13 13 0 0 1 18 0M12 12v3"/></symbol>
  <symbol id="sr-i-pulse" viewBox="0 0 24 24"><path d="M3 4h18v16H3ZM3 12h5l2-5 4 10 2-5h5"/></symbol>
  <symbol id="sr-i-dead" viewBox="0 0 24 24"><path d="m5 5 14 14M19 5 5 19M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/></symbol>
  <symbol id="sr-i-health" viewBox="0 0 24 24"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/></symbol>
  <symbol id="sr-i-armour" viewBox="0 0 24 24"><path d="m5 3 7 2 7-2 2 6-3 3v9H6v-9L3 9Z"/><path d="M9 10h6v7H9Z"/></symbol>
  <symbol id="sr-i-rifle" viewBox="0 0 64 24"><path d="M2 10h10l5-5h21v3h9v2h15v3H44l-2 3H29l3 6h-6l-5-6h-7l-3 4H3v-5H1v-5ZM20 5V2h11v3M47 8v7M35 8v5"/></symbol>
  <symbol id="sr-i-mag" viewBox="0 0 24 24"><path d="M5 3h11l3 17H8ZM9 7h5M10 11h5M11 15h5"/></symbol>
  <symbol id="sr-i-gadget" viewBox="0 0 24 24"><path d="M5 7h14v14H5ZM9 7V3h6v4M8 11h8v4H8ZM9 18h1M14 18h1M19 10h3M19 17h3"/></symbol>
  <symbol id="sr-i-fire" viewBox="0 0 24 24"><path d="M9 15V6c0-2 3-5 3-5s3 3 3 5v9ZM9 18h6M10 21h4M3 5l3 3M21 5l-3 3M2 13h3M19 13h3"/></symbol>
  <symbol id="sr-i-aim" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></symbol>
  <symbol id="sr-i-reload" viewBox="0 0 24 24"><path d="M20 9a8 8 0 1 0 0 6M20 3v6h-6M10 8h4v9h-4Z"/></symbol>
  <symbol id="sr-i-crouch" viewBox="0 0 24 24"><circle cx="13" cy="4" r="2"/><path d="m11 8-4 5 7 1 3 7M11 8l5 3h5M7 13l-3 7h7"/></symbol>
  <symbol id="sr-i-jump" viewBox="0 0 24 24"><path d="m7 5 5-4 5 4M12 1v6M4 12l6-2 5 4 5-2M10 10l-2 7-5 3M15 14l-1 6 6 2"/></symbol>
  <symbol id="sr-i-quality" viewBox="0 0 24 24"><path d="M3 4h18v12H3ZM7 21h10M12 16v5M7 9l3 3 7-6"/></symbol>
  <symbol id="sr-i-close" viewBox="0 0 24 24"><path d="m5 5 14 14M19 5 5 19"/></symbol>
  <symbol id="sr-i-check" viewBox="0 0 24 24"><path d="m5 12 5 5L20 6"/></symbol>
<symbol id="sr-i-interact" viewBox="0 0 24 24"><path d="M4 8V3h5M15 3h5v5M4 16v5h5M15 21h5v-5M9 16V9h3v4l2-2 3 2-3 5h-3Z"/></symbol></defs></svg>`;
