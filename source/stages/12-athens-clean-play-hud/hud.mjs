const styles = `
 :root{--athens-hud-ink:#f6efdf;--athens-hud-soft:#d7ceba;--athens-hud-gold:#e6c78c;--athens-hud-line:#b8a17780;--athens-hud-panel:#202b26f5;--athens-hud-shadow:0 8px 26px #12161255}
 #antigravity-engine-badge{bottom:max(14px,env(safe-area-inset-bottom))!important;left:max(14px,env(safe-area-inset-left))!important;z-index:9996!important;padding:0!important;border:0!important;background:none!important;box-shadow:none!important;backdrop-filter:none!important}
 #athens-controls-toggle,#athens-controls-guide,#agora-wallet,#agora-market-prompt,#babylon-dialogue-prompt,#babylon-dialogue-modal,.road-journal-toggle,#road-journal-panel{
  background:var(--athens-hud-panel)!important;color:var(--athens-hud-ink)!important;border:1px solid var(--athens-hud-line)!important;border-radius:9px!important;box-shadow:var(--athens-hud-shadow)!important
 }
 #athens-controls-toggle{padding:8px 13px;min-height:38px;cursor:pointer;font:650 13px system-ui,sans-serif}
 #athens-controls-toggle[aria-expanded=true]{background:#3c493f!important}
 #athens-controls-guide{position:absolute;left:0;bottom:calc(100% + 8px);box-sizing:border-box;width:min(365px,calc(100vw - 28px));max-height:min(520px,calc(100dvh - 96px));overflow:auto;padding:14px 16px;font:13px/1.4 system-ui,sans-serif}
 #athens-controls-guide[hidden]{display:none!important}
 #athens-controls-guide h2{margin:0 0 8px;font:23px/1.2 Georgia,serif;font-weight:normal}
 #athens-controls-guide h3{margin:9px 0 3px;font:650 12px system-ui,sans-serif;color:var(--athens-hud-gold)}
 #athens-controls-guide dl{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 10px;margin:0;color:var(--athens-hud-soft)}
 #athens-controls-guide dd{margin:0;color:var(--athens-hud-ink);text-align:right}
 #athens-controls-guide kbd{font:600 12px system-ui,sans-serif;white-space:nowrap}
 #athens-controls-guide footer{display:flex;justify-content:space-between;align-items:baseline;gap:10px;border-top:1px solid var(--athens-hud-line);margin-top:11px;padding-top:8px}
 #athens-controls-guide summary,#athens-controls-guide a{cursor:pointer;color:var(--athens-hud-gold);text-underline-offset:3px}
 #athens-controls-toggle:focus-visible,#athens-controls-guide :focus-visible{outline:2px solid var(--athens-hud-gold);outline-offset:3px}
 #athens-babylon-telemetry{margin-top:5px;max-width:220px;color:var(--athens-hud-soft);font:11px/1.45 ui-monospace,monospace}
 #agora-wallet{top:max(14px,env(safe-area-inset-top))!important;right:max(14px,env(safe-area-inset-right))!important;max-width:min(246px,calc(100vw - 52px))!important;padding:8px 11px!important;font:12px/1.45 system-ui,sans-serif!important}
 #agora-market-prompt,#babylon-dialogue-prompt{max-width:calc(100vw - 28px);box-sizing:border-box;text-align:center;padding:7px 11px!important;font:600 13px/1.35 system-ui,sans-serif!important}
 #babylon-dialogue-modal{max-width:calc(100vw - 28px);border-radius:12px!important}
 #agora-market{max-width:calc(100vw - 28px);border:1px solid #a89469!important;box-shadow:var(--athens-hud-shadow)!important;border-radius:12px!important}
 #agora-market button:focus-visible,#babylon-dialogue-modal button:focus-visible{outline:2px solid #d9ad61;outline-offset:3px}
 @media(max-width:600px){
  #agora-market{padding:15px!important}
  #babylon-dialogue-modal{padding:14px!important;bottom:60px!important}
  #athens-controls-guide{padding:11px 13px}
 }
`;

export function markup(appearanceExpression) {
  return `<style>${styles}</style>
    <button id="athens-controls-toggle" type="button" aria-expanded="false" aria-controls="athens-controls-guide">Controls</button>
    <section id="athens-controls-guide" aria-label="Game controls" hidden>
      <h2>Controls</h2>
      <h3>Explore</h3>
      <dl>
        <dt>Move</dt><dd><kbd>W A S D</kbd></dd>
        <dt>Look</dt><dd><kbd>Mouse / arrows</kbd></dd>
        <dt>Run / fly faster</dt><dd><kbd>Shift</kbd></dd>
        <dt>Jump / fly higher</dt><dd><kbd>Space</kbd></dd>
        <dt>Fly lower</dt><dd><kbd>Ctrl</kbd></dd>
        <dt>Switch view / walk or fly</dt><dd><kbd>C</kbd> / <kbd>V</kbd></dd>
      </dl>
      <h3>Interact</h3>
      <dl>
        <dt>Talk / trade</dt><dd><kbd>E</kbd> / <kbd>F</kbd></dd>
        <dt>Chariot / stores</dt><dd><kbd>Y</kbd> / <kbd>G</kbd></dd>
        <dt>Sound / time of day</dt><dd><kbd>M</kbd> / <kbd>T</kbd></dd>
        <dt>Show or hide controls</dt><dd><kbd>H</kbd></dd>
      </dl>
      <footer>
        <details><summary>Performance</summary>
          <div id="athens-babylon-telemetry">Waiting for game data…</div>
        </details>
        ${appearanceExpression}
      </footer>
    </section>`;
}

export function connectControls(badge) {
  const button = badge.querySelector('#athens-controls-toggle');
  const panel = badge.querySelector('#athens-controls-guide');
  const setOpen = open => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => setOpen(panel.hidden));
  badge.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || panel.hidden) return;
    setOpen(false);
    button.focus({ preventScroll: true });
    event.stopPropagation();
  });
}
