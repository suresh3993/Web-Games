/** Shared stylesheet for DOM-based games (scoped under .pv-game). Injected once per document. */
const CSS = `
.pv-game{position:relative;width:100%;height:100%;overflow:auto;background:#0b1022;color:#e6e9f5;font-family:'Inter Variable',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;gap:12px;padding:14px;box-sizing:border-box;user-select:none;-webkit-user-select:none;line-height:1.35}
.pv-game *{box-sizing:border-box}
.pv-game h2,.pv-game h3{margin:0;font-family:'Space Grotesk Variable','Inter Variable',sans-serif}
.pv-hud{display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:center;align-items:center;font-size:14px;color:#9aa0c0}
.pv-hud b{color:#e6e9f5;font-variant-numeric:tabular-nums}
.pv-msg{min-height:1.4em;text-align:center;font-weight:600;color:#22d3ee}
.pv-msg.bad{color:#fb7185}.pv-msg.good{color:#4ade80}
.pv-btn{appearance:none;border:1px solid rgba(148,163,255,.28);background:#141b3a;color:#e6e9f5;border-radius:10px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;touch-action:manipulation;transition:border-color .15s,transform .1s}
.pv-btn:hover:not([disabled]){border-color:#7c5cff}.pv-btn:active:not([disabled]){transform:translateY(1px)}
.pv-game button:focus-visible{outline:2px solid #a78bfa;outline-offset:2px}
.pv-btn.primary{background:#6d4aff;border-color:#6d4aff;color:#fff}
.pv-btn.small{padding:5px 10px;font-size:13px}
.pv-btn[disabled]{opacity:.4;cursor:default}
.pv-btn.sel,.pv-cell.sel{box-shadow:0 0 0 3px #22d3ee inset}
.pv-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:center}
.pv-col{display:flex;flex-direction:column;gap:8px;align-items:center}
.pv-grid{display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));gap:var(--gap,4px);width:min(100%,var(--w,480px))}
.pv-cell{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:var(--r,8px);background:#141b3a;border:1px solid rgba(148,163,255,.16);font-weight:700;font-size:var(--fs,clamp(12px,3.4vmin,22px));color:#e6e9f5;padding:0;font-family:inherit;touch-action:manipulation;position:relative;min-width:0}
button.pv-cell{cursor:pointer}button.pv-cell:hover:not([disabled]){border-color:#7c5cff}
.pv-cell[disabled]{cursor:default}
.pv-big{font-size:clamp(22px,6vmin,46px);font-weight:800;font-family:'Space Grotesk Variable',sans-serif;text-align:center}
.pv-muted{color:#9aa0c0;font-size:13px;text-align:center}
.pv-panel{background:#0e1430;border:1px solid rgba(148,163,255,.16);border-radius:14px;padding:12px}
.pv-card{width:var(--cw,54px);height:calc(var(--cw,54px)*1.4);border-radius:7px;background:#f8fafc;color:#0f172a;display:flex;flex-direction:column;justify-content:space-between;padding:3px 4px;font-weight:800;font-size:calc(var(--cw,54px)*.3);border:1px solid #cbd5e1;line-height:1;flex:none;font-family:inherit;text-align:left}
button.pv-card{cursor:pointer}
.pv-card .s{align-self:flex-end;font-size:1.25em}
.pv-card.red{color:#dc2626}
.pv-card.back{background:repeating-linear-gradient(45deg,#6d4aff 0 6px,#4c1d95 6px 12px);border-color:#a78bfa}
.pv-card.empty{background:transparent;border:2px dashed rgba(148,163,255,.3)}
.pv-card.sel{box-shadow:0 0 0 3px #22d3ee}
.pv-card.dim{opacity:.45}
.pv-stack{display:flex;flex-direction:column;align-items:center}
.pv-stack>.pv-card:not(:first-child){margin-top:calc(var(--cw,54px)*-1.08)}
.pv-stack.tight>.pv-card:not(:first-child){margin-top:calc(var(--cw,54px)*-1.22)}
.pv-keys{display:flex;flex-direction:column;gap:6px;width:min(100%,520px)}
.pv-keys .pv-row{flex-wrap:nowrap;gap:5px}
.pv-key{flex:1;min-width:0;height:44px;border-radius:8px;border:1px solid rgba(148,163,255,.22);background:#1b2350;color:#e6e9f5;font:inherit;font-weight:700;cursor:pointer;padding:0;touch-action:manipulation}
.pv-key.wide{flex:1.6}
.pv-key.hit{background:#15803d;border-color:#15803d}.pv-key.near{background:#a16207;border-color:#a16207}.pv-key.miss{background:#262c48;color:#5b6280}
.pv-meter{width:min(100%,420px);height:10px;border-radius:999px;background:#141b3a;overflow:hidden}
.pv-meter>i{display:block;height:100%;background:linear-gradient(90deg,#7c5cff,#22d3ee)}
.pv-choice{min-width:min(44%,160px)}
.pv-press{transition:transform .06s}.pv-press:active{transform:scale(.94)}
`;

export function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById('pv-game-css')) return;
  const style = document.createElement('style');
  style.id = 'pv-game-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}
