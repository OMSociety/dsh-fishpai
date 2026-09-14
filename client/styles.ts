/**
 * 面板样式：只用 DSH 主题变量 `--dsw-alias-*`（浅色/深色自动跟随）。
 *
 * 注意别用旧名（`--dsw-text-secondary` 之类）——当前 DSH 里那些 token 一个都不存在，
 * 写 var(--x, #666) 会在深色主题下退化成硬编码浅色，出现白块。
 */

export const STYLE_TAG_ID = 'dsh-fishpai/panel.css'

export const CSS = `
.fp-root{
  display:flex;flex-direction:column;height:100%;min-height:0;
  color:var(--dsw-alias-label-primary);
  background:var(--dsw-alias-bg-layer-1);
  font-size:12px;line-height:1.6;
}
.fp-root *{box-sizing:border-box}
.fp-btn{
  font:inherit;color:var(--dsw-alias-label-secondary);background:transparent;
  border:1px solid transparent;border-radius:6px;padding:2px 7px;cursor:pointer;
  transition:color .15s ease,background-color .15s ease,border-color .15s ease;
  white-space:nowrap;
}
.fp-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.fp-btn[data-on="true"]{
  color:var(--dsw-alias-label-primary);
  background:var(--dsw-alias-bg-layer-2);
  border-color:var(--dsw-alias-border-l2);
}
.fp-btn[disabled]{opacity:.5;cursor:default}
/* 置灰的开关不该在悬停时又"亮"起来——那会让人以为还能点 */
.fp-btn[disabled]:hover{color:var(--dsw-alias-label-secondary);background:transparent}
.fp-btn-primary{
  color:var(--dsw-alias-label-primary-foreground);
  background:var(--dsw-alias-button-primary-fill);
  border-color:transparent;
}
.fp-btn-primary:hover{color:var(--dsw-alias-label-primary-foreground);filter:brightness(1.06)}
.fp-seg{display:inline-flex;gap:1px;padding:1px;border-radius:7px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2)}
.fp-seg .fp-btn{border-radius:5px;padding:2px 8px}
.fp-seg .fp-btn[data-on="true"]{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1)}

.fp-toolbar{display:flex;flex-direction:column;gap:4px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none}
.fp-row{display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-width:0}
.fp-row .fp-spacer{flex:1 1 auto}
.fp-select{
  font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);
  border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:2px 4px;max-width:11em;
}
.fp-swatches{display:flex;gap:3px;align-items:center}
.fp-swatch{
  width:14px;height:14px;border-radius:50%;border:1px solid var(--dsw-alias-border-l2);cursor:pointer;padding:0;
}
.fp-swatch[data-on="true"]{outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px}
.fp-color{width:22px;height:18px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;background:transparent;cursor:pointer}

.fp-main{display:flex;flex:1 1 auto;min-height:0;min-width:0}
.fp-main[data-layout="stack"]{flex-direction:column}
.fp-main[data-layout="side"]{flex-direction:row}
.fp-pane{display:flex;flex-direction:column;min-width:0;min-height:0;flex:1 1 50%}
.fp-pane + .fp-pane{border-top:1px solid var(--dsw-alias-border-l2)}
.fp-main[data-layout="side"] .fp-pane + .fp-pane{border-top:0;border-left:1px solid var(--dsw-alias-border-l2)}
.fp-pane-head{
  display:flex;align-items:center;gap:6px;padding:3px 8px;flex:none;
  color:var(--dsw-alias-label-secondary);font-size:11px;border-bottom:1px solid var(--dsw-alias-border-l2);
}
.fp-editor{
  flex:1 1 auto;min-height:0;width:100%;resize:none;border:0;outline:none;
  padding:10px 12px;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Consolas,monospace);
  font-size:12.5px;line-height:1.75;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);
  tab-size:2;
}
.fp-preview-wrap{flex:1 1 auto;min-height:0;overflow:hidden;background:#fff;display:flex;justify-content:center}
.fp-preview{width:100%;height:100%;border:0;background:#fff}
.fp-preview[data-mobile="true"]{width:375px;max-width:100%;box-shadow:0 0 0 1px var(--dsw-alias-border-l2)}
.fp-preview-empty{color:var(--dsw-alias-label-secondary);padding:16px;text-align:center}

.fp-drawer{flex:none;border-top:1px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;max-height:46%;min-height:0}
.fp-drawer-tabs{display:flex;gap:2px;padding:3px 6px;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l2)}
.fp-drawer-body{overflow:auto;padding:6px 8px;min-height:0}
.fp-empty{color:var(--dsw-alias-label-secondary);padding:8px 2px}
.fp-item{
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);
  border-radius:7px;padding:6px 8px;margin-bottom:6px;
}
.fp-item[data-orphan="true"]{border-color:var(--dsw-alias-state-warn-primary)}
.fp-item-head{display:flex;align-items:baseline;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.fp-item-head .fp-spacer{flex:1 1 auto}
.fp-item-text{margin-top:2px;white-space:pre-wrap;word-break:break-word}
.fp-quote{margin-top:3px;font-size:11px;color:var(--dsw-alias-label-secondary);border-left:2px solid var(--dsw-alias-border-l1);padding-left:6px}
.fp-compose{display:flex;flex-direction:column;gap:4px;margin-bottom:6px}
.fp-compose textarea{
  width:100%;min-height:48px;resize:vertical;font:inherit;padding:5px 7px;border-radius:6px;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);
}
.fp-status{
  display:flex;align-items:center;gap:8px;padding:3px 8px;flex:none;font-size:11px;
  color:var(--dsw-alias-label-secondary);border-top:1px solid var(--dsw-alias-border-l2);flex-wrap:wrap;
}
.fp-banner{
  margin:6px 8px;padding:6px 8px;border-radius:7px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;
  border:1px solid var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-bg-layer-2);
}
.fp-banner[data-kind="error"]{border-color:var(--dsw-alias-state-error-primary)}
/* 主题风险提示：与"有未保存改动""冲突"共用同一块区域，各自一行 */
.fp-banner[data-kind="warn"]{border-color:var(--dsw-alias-state-warn-primary)}
.fp-banner .fp-spacer{flex:1 1 auto}
.fp-toast{
  position:absolute;left:8px;right:8px;bottom:34px;padding:5px 9px;border-radius:7px;font-size:11px;
  background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv3,0 2px 8px rgba(0,0,0,.18));
}
.fp-root{position:relative}
.fp-muted{color:var(--dsw-alias-label-secondary)}
.fp-warn{color:var(--dsw-alias-state-warn-primary)}
.fp-err{color:var(--dsw-alias-state-error-primary)}
`

/** 幂等注入样式表（重复挂载只插一次；HMR 卸载由调用方决定是否移除）。 */
export function ensureStyles(doc: Document = document): () => void {
  const selector = `style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`
  if (doc.querySelector(selector)) return () => {}
  const tag = doc.createElement('style')
  tag.dataset.plugin = 'dsh-fishpai'
  tag.dataset.pluginCss = STYLE_TAG_ID
  tag.textContent = CSS
  doc.head.appendChild(tag)
  return () => tag.remove()
}
