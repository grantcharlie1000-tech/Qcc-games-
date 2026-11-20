import type { GameModule } from '../../core/types';
import './style.css';

const game: GameModule = {
  id: 'gta-iv-web',
  title: 'GTA IV on the Web',
  cover: 'game-art/gta-iv-web/cover.svg',
  rules: 'This entry opens the community GTA IV browser port on your own computer. It is not a copy of the game hosted by QCC-Games. You need a legitimately owned USA Xbox 360 disc image and Title Update 8. Download the GPL-licensed web port, place your own game files in its game-files folder, run Play GTA IV, then choose Open local game. Chrome or Edge is required. Your saves and game files stay on your device.',
  mount(container, context) {
    const root = document.createElement('section');
    root.className = 'gta4-local';
    root.setAttribute('aria-label', 'GTA IV community web port launcher');
    root.innerHTML = `
      <div class="gta4-local-card">
        <div class="gta4-local-header">
          <span class="gta4-local-kicker">COMMUNITY WEB PORT</span>
          <h1>GTA IV on the Web</h1>
          <p>Play the Xbox 360 version in Chrome or Edge from your own disc.</p>
        </div>
        <div class="gta4-local-detail">
          <p class="gta4-local-disclaimer">A legitimately owned <strong>USA Xbox 360</strong> game disc and <strong>Title Update 8</strong> are required. The game is <strong>not hosted on QCC-Games</strong>.</p>
          <ol>
            <li>Download the community web port.</li>
            <li>Put your own disc ISO and Title Update 8 in <code>game-files/</code>.</li>
            <li>Run <strong>Play GTA IV</strong> on your computer.</li>
            <li>Come back here and open your local game.</li>
          </ol>
          <div class="gta4-local-actions">
            <a class="game-button" href="https://github.com/itzzace/gta4-web/releases/latest" target="_blank" rel="noopener noreferrer">Get the web port</a>
            <a class="game-button secondary" href="http://localhost:8765/" target="_blank" rel="noopener noreferrer">Open local game</a>
          </div>
          <p class="gta4-local-footnote">The web port is maintained by its community developers, not QCC-Games. The open-source code does not include the game, music or assets. PC editions are not compatible with this port.</p>
          <a class="gta4-local-source" href="https://github.com/itzzace/gta4-web" target="_blank" rel="noopener noreferrer">Source and setup instructions</a>
        </div>
      </div>
    `;
    container.append(root);
    context.setScore(0);
    context.setLevel('Local install');
    context.setStatus('Requires your own game files');
    return {
      pause() { root.inert = true; },
      resume() { root.inert = false; },
      restart() { return true; },
      serialize() { return undefined; },
      restore() {},
      dispose() { root.remove(); },
    };
  },
};

export default game;
