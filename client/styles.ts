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
/* 三个动作按钮是一组：窄到放不下时整体换行，而不是"复制到公众号"被单独挤到下一行 */
.fp-actions{display:inline-flex;align-items:center;gap:4px;flex:none;margin-left:auto}
/* 面板窄的时候收紧一点：让「导出 HTML / 复制到公众号」仍然留在第一行 */
.fp-root[data-narrow="true"] .fp-toolbar{padding:6px 6px;gap:3px}
.fp-root[data-narrow="true"] .fp-row{gap:3px}
.fp-root[data-narrow="true"] .fp-btn{padding:2px 5px}
.fp-root[data-narrow="true"] .fp-actions{gap:3px}
.fp-select{
  font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);
  border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:2px 4px;max-width:11em;
}

/* 主题选择器：自绘 listbox（原生 <option> 放不进图标）。图标全走 currentColor，
   所以浅色/深色主题共用一套，不需要换图。 */
.fp-picker{position:relative;display:inline-flex}
.fp-picker-btn{
  font:inherit;display:inline-flex;align-items:center;gap:5px;max-width:12em;cursor:pointer;
  color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);
  border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:2px 6px;
}
.fp-picker-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.fp-picker-glyph{flex:none;color:var(--dsw-alias-label-secondary)}
.fp-picker-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fp-picker-caret{flex:none;color:var(--dsw-alias-label-secondary)}
.fp-menu{
  position:absolute;top:calc(100% + 4px);left:0;z-index:40;min-width:12em;
  max-height:min(60vh,340px);overflow:auto;padding:4px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:8px;
  background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv3,0 4px 14px rgba(0,0,0,.28));
}
/* 分组标题：组名一行、小字提示一行（挤成一行在窄面板里会折得很难看） */
.fp-menu-group{
  display:flex;flex-direction:column;gap:1px;
  padding:6px 6px 3px;font-size:11px;line-height:1.45;color:var(--dsw-alias-label-secondary);
}
.fp-menu-group-title{font-weight:500}
.fp-menu-group-note{font-size:10px;color:var(--dsw-alias-label-secondary);opacity:.8}
/* 第二组之前来一条细分隔线：一眼能看出"上面是能直接用的，下面是另一类" */
.fp-menu-group[data-risk="true"]{
  margin-top:5px;padding-top:7px;border-top:1px solid var(--dsw-alias-border-l2);
}
.fp-menu-group[data-risk="true"] .fp-menu-group-note{color:var(--dsw-alias-state-warn-primary);opacity:1}
.fp-menu-row{
  display:flex;align-items:center;gap:6px;width:100%;text-align:left;font:inherit;cursor:pointer;
  padding:3px 6px;border-radius:5px;border:0;background:transparent;color:var(--dsw-alias-label-primary);
}
.fp-menu-row[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover)}
.fp-menu-row[data-on="true"]{font-weight:500}
.fp-menu-glyph{flex:none;color:var(--dsw-alias-label-secondary)}
.fp-menu-name{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fp-menu-tick{flex:none;color:var(--dsw-alias-label-primary)}

/* tab chip 里的标题：图标 + 文字 */
.fp-title-label{display:inline-flex;align-items:center;gap:5px}
.fp-title-glyph{flex:none;color:var(--dsw-alias-label-secondary)}

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
  /* 速查表浮层挂在这一整行上（不是挂那个小按钮）：这样它的百分比宽度有"面板宽度"可依，
     窄面板里才会跟着收缩，而不是定宽溢出被裁。 */
  position:relative;
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
/* 关掉风险提示的 ×：与"快捷键"按钮同一套口径（不抢视觉，但可点区域够大） */
.fp-banner-x{
  flex:none;font:inherit;font-size:13px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:5px;
  border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);
}
.fp-banner-x:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.fp-banner .fp-spacer{flex:1 1 auto}
.fp-toast{
  position:absolute;left:8px;right:8px;bottom:34px;padding:5px 9px;border-radius:7px;font-size:11px;
  background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv3,0 2px 8px rgba(0,0,0,.18));
}
/* 失败提示要一眼分得出来：成功与失败的文案不同、停留时间也不同（5s / 2.6s），
   再给一层颜色，用户才不会把"复制失败"看成"已复制" */
.fp-toast[data-kind="error"]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}

/* 没有文档时的空白页：一张居中的卡片。空面板只有一行小字飘在中间，既看不出是什么、
   也看不出下一步能做什么——所以三种状态（载入中 / 载入失败 / 还没有文档）共用这张卡。 */
.fp-blank{flex:1 1 auto;min-height:0;overflow:auto;display:flex;align-items:center;justify-content:center;padding:16px}
.fp-blank-card{
  width:100%;max-width:400px;display:flex;flex-direction:column;gap:10px;
  padding:14px 16px;border-radius:10px;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);
}
.fp-blank-mark{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary)}
/* 品牌标：鱼形图标放在一块小方瓦里（图标本身用 currentColor，深浅色通吃） */
.fp-blank-glyph{
  width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-primary);
}
.fp-blank-line{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-primary)}
.fp-blank-line code{
  font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Consolas,monospace);
  background:var(--dsw-alias-bg-layer-1);border-radius:4px;padding:0 4px;
}
.fp-blank-actions{display:flex;gap:6px;align-items:center}
.fp-loading-bar{
  height:2px;border-radius:2px;overflow:hidden;background:var(--dsw-alias-bg-layer-1);position:relative;
}
.fp-loading-bar::after{
  content:"";position:absolute;top:0;bottom:0;width:40%;border-radius:2px;
  background:var(--dsw-alias-label-secondary);opacity:.5;
  animation:fp-sweep 1.2s ease-in-out infinite;
}
@keyframes fp-sweep{
  0%{left:-40%}
  100%{left:100%}
}
.fp-doclist{display:flex;flex-direction:column;gap:1px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:8px}
.fp-doclist-head{font-size:11px;color:var(--dsw-alias-label-secondary);padding:0 6px 2px}
.fp-docrow{
  display:flex;align-items:baseline;gap:8px;width:100%;text-align:left;font:inherit;cursor:pointer;
  padding:4px 6px;border-radius:6px;border:1px solid transparent;background:transparent;
  color:var(--dsw-alias-label-primary);
}
.fp-docrow:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}
.fp-docrow-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fp-docrow .fp-spacer{flex:1 1 auto}
.fp-root{position:relative}
.fp-muted{color:var(--dsw-alias-label-secondary)}
.fp-warn{color:var(--dsw-alias-state-warn-primary)}

/* 快捷键速查表：挂在编辑器头上的小按钮 + 一块列表（内容和键盘处理同源） */
/* 注意是 static：浮层的定位上下文交给 .fp-pane-head（整行），见那里的注释。
   （这里是模板字符串里，注释别用反引号——会把字符串闭合掉，实测踩过一次。） */
.fp-keys-wrap{display:inline-flex;flex:none}
.fp-keys-btn{
  font:inherit;font-size:11px;line-height:1;cursor:pointer;padding:3px 6px;border-radius:5px;
  border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);
}
.fp-keys-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.fp-keys-btn[data-on="true"]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.fp-keys{
  position:absolute;top:calc(100% + 4px);right:0;z-index:3;
  /* 宽度**随面板收缩**：以前写死 266px，窄面板里比面板还宽、向左溢出被裁掉，
     表现就是"快捷键标签全被切掉、只剩右边一排键帽"（实测截图）。 */
  width:auto;min-width:min(232px,100%);max-width:calc(100% - 12px);
  max-height:60vh;overflow:auto;
  padding:6px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1);box-shadow:0 8px 24px rgba(0,0,0,.18);
  color:var(--dsw-alias-label-primary);font-size:11.5px;line-height:1.9;text-align:left;
}
.fp-keys-group{padding:2px 4px;color:var(--dsw-alias-label-secondary);font-size:11px}
.fp-keys-row{display:flex;align-items:baseline;gap:8px;padding:0 4px;min-width:0}
/* 标签列要能被压窄（中文按字换行），键帽保持一行不折 */
.fp-keys-row > span:first-child{flex:0 1 auto;min-width:0}
.fp-keys-row .fp-spacer{flex:1 1 auto;min-width:0}
.fp-keys-note{
  margin-top:4px;padding:5px 4px 1px;border-top:1px solid var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-secondary);line-height:1.75;
}
.fp-kbd{
  flex:none;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Consolas,monospace);
  font-size:10.5px;padding:1px 5px;border-radius:4px;white-space:nowrap;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
}
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
