// Shared header + footer — single source of truth so they never drift across pages.
(function () {
  const HDR =
    `<a class="wm" href="/">LYAPUNOV<b>.</b></a>` +
    `<div class="rt"><a href="/paper">paper</a>&nbsp;&nbsp;·&nbsp;&nbsp;$LPNV&nbsp;/&nbsp;SOLANA&nbsp;&nbsp;·&nbsp;&nbsp;<a href="https://pump.fun/coin/pvysiEDLr6E9SsS4gETrDCikMdekAPBtYxK7AnZpump" target="_blank" rel="noopener">acquire ●</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="https://x.com/lyapunovproject" target="_blank" rel="noopener" aria-label="LYAPUNOV on X" style="border-bottom:none;display:inline-flex;vertical-align:middle"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="https://github.com/lyapunovproject/lyapunov" target="_blank" rel="noopener" aria-label="LYAPUNOV on GitHub" style="border-bottom:none;display:inline-flex;vertical-align:middle"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.21 11.19.6.11.82-.25.82-.56 0-.28-.01-1.02-.02-2-3.34.71-4.04-1.58-4.04-1.58-.55-1.37-1.34-1.74-1.34-1.74-1.09-.73.08-.72.08-.72 1.2.08 1.84 1.22 1.84 1.22 1.07 1.8 2.81 1.28 3.5.98.11-.76.42-1.28.76-1.57-2.67-.3-5.47-1.31-5.47-5.84 0-1.29.47-2.35 1.24-3.18-.12-.3-.54-1.51.12-3.15 0 0 1.01-.32 3.3 1.21.96-.26 1.98-.39 3-.4 1.02.01 2.04.14 3 .4 2.29-1.53 3.3-1.21 3.3-1.21.66 1.64.24 2.85.12 3.15.77.83 1.24 1.89 1.24 3.18 0 4.54-2.81 5.54-5.49 5.83.43.36.81 1.09.81 2.2 0 1.59-.01 2.87-.01 3.26 0 .31.22.68.83.56C20.56 21.91 24 17.5 24 12.29 24 5.78 18.63.5 12 .5z"/></svg></a></div>`;
  const FOOT =
    `<div class="fbrand"><img class="lm" src="/icons/logomark.png" alt=""><span>LYAPUNOV<b style="color:var(--orange)">.</b>&nbsp;&nbsp;$LPNV</span></div>` +
    `<div>dV/dt &lt; 0 · DESCENT ONGOING</div><div>SOLANA · <b>2026</b></div>`;
  const HSTYLE = `<style>
    :host{display:flex;justify-content:space-between;align-items:baseline;gap:1em;pointer-events:auto}
    .wm{font-family:'Archivo',system-ui,sans-serif;font-weight:700;font-size:clamp(15px,1.5vw,19px);letter-spacing:.16em;text-decoration:none;color:var(--ink)}
    .wm b{color:var(--orange)}
    .rt{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.2em;color:var(--mute);white-space:nowrap}
    .rt a{color:var(--ink);text-decoration:none;border-bottom:1px solid var(--orange);padding-bottom:2px}
    .rt a:hover{color:var(--orange)}
  </style>`;
  const FSTYLE = `<style>
    :host{display:flex;justify-content:space-between;gap:2em;flex-wrap:wrap;border-top:1px solid var(--line);padding:28px var(--m) 60px;font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.16em;color:var(--mute)}
    b{color:var(--ink);font-weight:400}
    .fbrand{display:inline-flex;align-items:center;gap:.6em}
    .lm{height:1.5em;width:auto;display:block}
  </style>`;
  customElements.define('site-header', class extends HTMLElement {
    connectedCallback(){ if(this.shadowRoot) return; this.attachShadow({mode:'open'}).innerHTML = HSTYLE + HDR; }
  });
  customElements.define('site-footer', class extends HTMLElement {
    connectedCallback(){ if(this.shadowRoot) return; this.attachShadow({mode:'open'}).innerHTML = FSTYLE + FOOT; }
  });
})();
