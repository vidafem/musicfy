const fs = require('fs');
const path = 'c:/Users/ADMIN/Downloads/musicfy/src/components/PlayerBar.css';
let content = fs.readFileSync(path, 'utf8');

const target = `  .fs-controls { gap: 15px; }
  .fs-ctrl-btn.primary svg { width: 26px; height: 26px; }
  .fs-play-pause { width: 50px; height: 50px; }
  .fs-play-pause svg { width: 24px; height: 24px; }
  .mixer-indicator { font-size: 0.55rem; padding: 2px 6px; }
  .fs-title { font-size: 1.6rem; }
  .fs-artist { font-size: 1rem; }
  .fs-cover { width: 140px; height: 140px; }
  .fs-text { left: 160px; width: calc(100% - 170px); }`;

const replacement = `  .fs-left-panel {
    width: 100% !important;
    align-items: center;
    justify-content: center;
  }

  .fs-main-info {
    align-items: center !important;
    text-align: center !important;
    width: 100%;
    margin-bottom: 0 !important;
  }

  .fs-cover {
    position: relative !important;
    bottom: 0 !important;
    width: min(300px, 70vw) !important;
    height: min(300px, 70vw) !important;
    margin: 0 auto;
    border-radius: 20px;
  }

  .fs-text {
    position: relative !important;
    bottom: 0 !important;
    left: 0 !important;
    width: 100% !important;
    align-items: center !important;
    text-align: center !important;
    margin-top: 20px;
  }

  .fs-title { font-size: 1.8rem; }
  .fs-artist { font-size: 1.1rem; }

  /* Letras en móvil: debajo de la info */
  .fs-right-panel {
    position: relative !important;
    width: 100% !important;
    height: 300px !important;
    padding: 0 !important;
    mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
  }

  .lyric-line {
    font-size: 1.8rem !important;
    text-align: center !important;
    transform-origin: center !important;
  }

  .fs-player-bottom {
    padding-bottom: 20px;
  }

  .fs-controls { gap: 15px; }
  .fs-ctrl-btn.primary svg { width: 32px; height: 32px; }
  .fs-play-pause { width: 65px; height: 65px; }
  .fs-play-pause svg { width: 30px; height: 30px; }
  .mixer-indicator { font-size: 0.6rem; padding: 2px 8px; }`;

// Intentamos un reemplazo más flexible
const lines = content.split('\\n');
let startIndex = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('.fs-controls { gap: 15px; }')) {
        startIndex = i;
        break;
    }
}

if (startIndex !== -1) {
    lines.splice(startIndex, 9, replacement);
    fs.writeFileSync(path, lines.join('\\n'));
    console.log('Successfully updated PlayerBar.css');
} else {
    console.log('Target line not found');
}
