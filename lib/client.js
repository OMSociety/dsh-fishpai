/**
 * 自动生成，请勿手改 —— 源码在 client/，用 `npm run build` 重新生成。
 * 改完记得把本文件一起提交：`dsh plugin add github:` 只安装、不构建。
 */
window.__ModuleLoader__.load({
  id: "dsh-fishpai",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
      var __create = Object.create;
      var __defProp = Object.defineProperty;
      var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
      var __getOwnPropNames = Object.getOwnPropertyNames;
      var __getProtoOf = Object.getPrototypeOf;
      var __hasOwnProp = Object.prototype.hasOwnProperty;
      var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
      var __export = (target, all) => {
        for (var name2 in all)
          __defProp(target, name2, { get: all[name2], enumerable: true });
      };
      var __copyProps = (to, from, except, desc) => {
        if (from && typeof from === "object" || typeof from === "function") {
          for (let key of __getOwnPropNames(from))
            if (!__hasOwnProp.call(to, key) && key !== except)
              __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
        }
        return to;
      };
      var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
        // If the importer is in node compatibility mode or this is not an ESM
        // file that has been converted to a CommonJS file using a Babel-
        // compatible transform (i.e. "__esModule" has not been set), then set
        // "default" to the CommonJS "module.exports" for node compatibility.
        isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
        mod
      ));
      var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
      var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

      // client/index.tsx
      var index_exports = {};
      __export(index_exports, {
        apply: () => apply,
        inject: () => inject,
        name: () => name
      });
      module.exports = __toCommonJS(index_exports);
      var React2 = __toESM(require("react"), 1);

      // client/panel.tsx
      var React = __toESM(require("react"), 1);
      var import_react = require("react");

      // client/api.ts
      var ConflictError = class extends Error {
        constructor(revision, markdown) {
          super(`revision 冲突：服务端是 ${revision}`);
          __publicField(this, "revision", revision);
          __publicField(this, "markdown", markdown);
        }
      };
      var PREFIX = "/fishpai/api";
      async function call(path, init) {
        const res = await fetch(`${PREFIX}${path}`, {
          ...init,
          headers: init?.body ? { "content-type": "application/json", ...init?.headers || {} } : init?.headers
        });
        let payload = null;
        try {
          payload = await res.json();
        } catch {
          payload = null;
        }
        if (res.status === 409 && payload && payload.conflict) {
          throw new ConflictError(Number(payload.revision) || 0, String(payload.markdown ?? ""));
        }
        if (!res.ok || !payload || payload.ok === false) {
          throw new Error(payload && payload.error || `请求失败（HTTP ${res.status}）`);
        }
        return payload;
      }
      var q = (params) => Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
      var api = {
        state: (sessionId) => call(`/state?${q({ sessionId })}`),
        themes: () => call(`/themes`),
        doc: (sessionId, docKey) => call(`/doc?${q({ sessionId, docKey })}`),
        save: (sessionId, docKey, markdown, baseRevision, meta) => call(`/doc`, {
          method: "PUT",
          body: JSON.stringify({ sessionId, docKey, markdown, baseRevision, meta })
        }),
        meta: (sessionId, docKey, meta) => call(`/meta`, { method: "POST", body: JSON.stringify({ sessionId, docKey, meta }) }),
        renderPreview: (sessionId, docKey, markdown, meta) => call(`/render`, {
          method: "POST",
          body: JSON.stringify({ sessionId, docKey, markdown, meta, mode: "preview" })
        }),
        renderPublish: (sessionId, docKey, markdown, meta) => call(`/render`, {
          method: "POST",
          body: JSON.stringify({ sessionId, docKey, markdown, meta, mode: "publish" })
        }),
        notes: (sessionId, docKey, payload) => call(`/notes`, {
          method: "POST",
          body: JSON.stringify({ sessionId, docKey, ...payload })
        }),
        history: (sessionId, docKey, payload) => call(`/history`, {
          method: "POST",
          body: JSON.stringify({ sessionId, docKey, ...payload })
        }),
        tabOpened: (sessionId, docKey) => call(`/tab-opened`, { method: "POST", body: JSON.stringify({ sessionId, docKey }) }),
        assetUrl: (sessionId, docKey, src) => `${PREFIX}/asset?${q({ sessionId, docKey, src })}`
      };

      // client/store.ts
      var DEFAULT_META = {
        theme: "default",
        color: null,
        font: "sans",
        fontSize: "16px",
        footnotes: true,
        macCodeBlock: true,
        mobile: false
      };
      function initialState(sessionId) {
        return {
          status: "loading",
          error: null,
          sessionId,
          docKey: null,
          path: "",
          title: "",
          markdown: "",
          savedMarkdown: "",
          revision: 0,
          meta: { ...DEFAULT_META },
          blocks: [],
          notes: [],
          placeholders: [],
          images: [],
          history: [],
          themes: [],
          presets: [],
          sizes: ["14px", "15px", "16px", "17px", "18px"],
          previewHtml: "",
          previewBlocks: [],
          themeName: "",
          previewing: false,
          saving: false,
          dirty: false,
          conflict: null,
          external: null,
          caretLine: 1,
          toast: null
        };
      }
      function buildSrcdoc(html) {
        return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        html,body{margin:0;padding:0;background:#fff}
        fp-block{display:block;height:0;overflow:hidden}
        img{max-width:100%;height:auto}
      </style></head><body>${html}
      <script>
      (function(){
        var top=null;
        function report(){
          var marks=document.querySelectorAll('fp-block');
          var best=null;
          for(var i=0;i<marks.length;i++){
            var r=marks[i].getBoundingClientRect();
            if(r.top<=8){best=marks[i].getAttribute('data-b')}
            else if(best===null){best=marks[i].getAttribute('data-b');break}
          }
          if(report.last!==best){report.last=best;parent.postMessage({fishpai:'visible',id:best},'*')}
        }
        addEventListener('scroll',report,{passive:true});
        addEventListener('message',function(e){
          var d=e.data;
          if(!d||d.fishpai!=='reveal')return;
          var el=document.querySelector('fp-block[data-b="'+d.id+'"]');
          if(el&&el.nextElementSibling)el.nextElementSibling.scrollIntoView({block:'start'});
          else if(el)el.scrollIntoView({block:'start'});
        });
        report();
      })();
      <\/script></body></html>`;
      }
      function createFishpaiStore(sessionId, onDocLoaded) {
        let state = initialState(sessionId);
        const listeners = /* @__PURE__ */ new Set();
        let toastSeq = 0;
        let saveTimer = null;
        let previewTimer = null;
        const emit = () => {
          for (const fn of listeners) fn();
        };
        const patch = (next) => {
          state = { ...state, ...next };
          emit();
        };
        const toast = (text, kind = "info") => {
          toastSeq += 1;
          const id = toastSeq;
          patch({ toast: { id, text, kind } });
          setTimeout(() => {
            if (state.toast && state.toast.id === id) patch({ toast: null });
          }, kind === "error" ? 5e3 : 2600);
        };
        let previewToken = 0;
        async function refreshPreview(markdown, meta) {
          if (!state.docKey) return;
          const token = ++previewToken;
          patch({ previewing: true });
          try {
            const res = await api.renderPreview(state.sessionId, state.docKey, markdown, meta);
            if (token !== previewToken) return;
            patch({ previewHtml: res.html, previewBlocks: res.blocks, themeName: res.themeName, previewing: false });
          } catch (error) {
            if (token !== previewToken) return;
            patch({ previewing: false, error: `预览渲染失败：${error.message}` });
          }
        }
        const schedulePreview = () => {
          if (previewTimer) clearTimeout(previewTimer);
          previewTimer = setTimeout(() => refreshPreview(state.markdown, state.meta), 300);
        };
        let saveInFlight = false;
        async function saveNow() {
          if (!state.docKey || !state.dirty) return;
          if (state.conflict) return;
          if (saveInFlight) return;
          const snapshotMarkdown = state.markdown;
          saveInFlight = true;
          patch({ saving: true });
          try {
            const res = await api.save(state.sessionId, state.docKey, snapshotMarkdown, state.revision, state.meta);
            patch({
              saving: false,
              revision: res.revision,
              savedMarkdown: snapshotMarkdown,
              dirty: state.markdown !== snapshotMarkdown,
              conflict: null,
              external: null
            });
          } catch (error) {
            if (error instanceof ConflictError) {
              patch({ saving: false, conflict: { revision: error.revision, markdown: error.markdown } });
              return;
            }
            patch({ saving: false, error: `保存失败：${error.message}` });
          } finally {
            saveInFlight = false;
          }
          if (state.dirty && !state.conflict) scheduleSave();
        }
        const scheduleSave = () => {
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(() => void saveNow(), 800);
        };
        async function loadDoc(docKey, opts = {}) {
          if (!docKey) return;
          const res = await api.doc(state.sessionId, docKey);
          const keep = opts.keepLocal && state.dirty && state.docKey === docKey;
          patch({
            status: "ready",
            error: null,
            docKey,
            path: res.doc.path,
            title: res.doc.title,
            markdown: keep ? state.markdown : res.doc.markdown,
            savedMarkdown: res.doc.markdown,
            dirty: keep ? true : false,
            revision: res.doc.revision,
            meta: res.meta,
            blocks: res.blocks,
            notes: res.notes,
            placeholders: res.placeholders,
            images: res.images,
            history: res.history,
            conflict: null,
            external: null
          });
          onDocLoaded?.(docKey);
          void refreshPreview(keep ? state.markdown : res.doc.markdown, res.meta);
        }
        async function init() {
          try {
            const themes = await api.themes().catch(() => null);
            if (themes) patch({ themes: themes.themes, presets: themes.presets, sizes: themes.sizes });
            const st = await api.state(state.sessionId);
            if (!st.active) {
              patch({ status: "empty" });
              return;
            }
            await loadDoc(st.active.key);
          } catch (error) {
            patch({ status: "error", error: error.message });
          }
        }
        const actions = {
          init,
          setMarkdown(text) {
            patch({ markdown: text, dirty: text !== state.savedMarkdown });
            schedulePreview();
            scheduleSave();
          },
          setCaret(line) {
            if (line !== state.caretLine) patch({ caretLine: line });
          },
          /** 光标所在块（加批注、跳预览都用它）。 */
          currentBlock() {
            const line = state.caretLine;
            return state.blocks.find((b) => b.startLine <= line && line <= b.endLine) || state.blocks[0] || null;
          },
          async setMeta(next) {
            const meta = { ...state.meta, ...next };
            patch({ meta });
            if (state.docKey) {
              try {
                await api.meta(state.sessionId, state.docKey, next);
              } catch (error) {
                toast(`设置未保存：${error.message}`, "error");
              }
            }
            void refreshPreview(state.markdown, meta);
          },
          async addNote(text) {
            const block = actions.currentBlock();
            if (!state.docKey || !block) return;
            try {
              const res = await api.notes(state.sessionId, state.docKey, {
                action: "add",
                note: { blockId: block.id, text, author: "human" }
              });
              patch({ notes: res.notes });
              toast("批注已加；模型下次 fishpai_read 就能看到");
            } catch (error) {
              toast(`批注失败：${error.message}`, "error");
            }
          },
          async updateNote(id, next) {
            if (!state.docKey) return;
            try {
              const res = await api.notes(state.sessionId, state.docKey, { action: "update", id, patch: next });
              patch({ notes: res.notes });
            } catch (error) {
              toast(`批注更新失败：${error.message}`, "error");
            }
          },
          async removeNote(id) {
            if (!state.docKey) return;
            try {
              const res = await api.notes(state.sessionId, state.docKey, { action: "remove", id });
              patch({ notes: res.notes });
            } catch (error) {
              toast(`删除失败：${error.message}`, "error");
            }
          },
          async restore(id, label) {
            if (!state.docKey) return;
            try {
              await api.history(state.sessionId, state.docKey, { action: "restore", id });
              await loadDoc(state.docKey);
              toast(`已回滚到 ${label}`);
            } catch (error) {
              if (error instanceof ConflictError) {
                patch({ conflict: { revision: error.revision, markdown: error.markdown } });
                return;
              }
              toast(`回滚失败：${error.message}`, "error");
            }
          },
          /**
           * 冲突处理。
           * - `mine`    ：用我的覆盖（服务端那份留在历史里）
           * - `theirs`  ：采用 AI 的版本——**先把我的草稿存进历史**，绝不静默丢字
           */
          async resolveConflict(choice) {
            if (!state.conflict || !state.docKey) return;
            const conflict = state.conflict;
            const draft = state.markdown;
            if (choice === "theirs") {
              try {
                await api.history(state.sessionId, state.docKey, { action: "stash", markdown: draft, label: "冲突时我的版本" });
              } catch (error) {
                toast(`先把你的稿子存进历史失败：${error.message}`, "error");
                return;
              }
              patch({ markdown: conflict.markdown, savedMarkdown: conflict.markdown, revision: conflict.revision, conflict: null, dirty: false });
              schedulePreview();
              await actions.reload();
              toast("已采用 AI 的版本；你的稿子已存进「历史」，点那一版可回滚取回");
              return;
            }
            patch({ revision: conflict.revision, conflict: null });
            await saveNow();
            toast("已用你的版本覆盖，AI 的版本留在历史里");
          },
          /** 导出/复制用：拿「复制到公众号」形态的 HTML（本地图片已内嵌 base64）。 */
          async publishHtml() {
            if (!state.docKey) throw new Error("还没有打开文档");
            await saveNow();
            const res = await api.renderPublish(state.sessionId, state.docKey, state.markdown, state.meta);
            return res.html;
          },
          /** 轮询发现宿主的当前文档变了（AI 写入 / 换了一篇 / 别的窗口写的）。 */
          async onActiveDoc(key, revision) {
            if (!key) return;
            if (state.docKey && key !== state.docKey) {
              if (state.dirty) {
                patch({ external: { revision, reason: "switch", key } });
                return;
              }
              await loadDoc(key);
              toast("模型打开了另一篇文档");
              return;
            }
            if (!state.docKey) {
              await loadDoc(key);
              return;
            }
            if (revision <= state.revision) return;
            if (state.dirty) {
              patch({ external: { revision, reason: "revision" } });
              return;
            }
            await loadDoc(key);
            toast(`AI 更新了文档（rev ${revision}）`);
          },
          async reload() {
            if (state.docKey) await loadDoc(state.docKey);
          },
          /** 采用外部版本（放弃自己的未保存改动）——换文档时切到新文档。 */
          async acceptExternal() {
            const target = state.external?.key || state.docKey;
            if (!target) return;
            await loadDoc(target);
          },
          toast,
          flush() {
            if (saveTimer) clearTimeout(saveTimer);
            return saveNow();
          }
        };
        return {
          getSnapshot: () => state,
          subscribe: (fn) => {
            listeners.add(fn);
            return () => listeners.delete(fn);
          },
          actions,
          dispose() {
            if (saveTimer) clearTimeout(saveTimer);
            if (previewTimer) clearTimeout(previewTimer);
            listeners.clear();
          }
        };
      }

      // client/panel.tsx
      var import_jsx_runtime = require("react/jsx-runtime");
      var READING_CHARS_PER_MIN = 400;
      function countWords(text) {
        const cjk = (text.match(/[\u3400-\u9fff\u3040-\u30ff]/g) || []).length;
        const latin = (text.match(/[A-Za-z0-9]+/g) || []).length;
        return cjk + latin;
      }
      function readingMinutes(text) {
        return Math.max(1, Math.round(countWords(text) / READING_CHARS_PER_MIN));
      }
      function fmtTime(at) {
        const d = new Date(at);
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
      async function copyRich(html, plain) {
        const ClipboardItemCtor = globalThis.ClipboardItem;
        if (navigator.clipboard && ClipboardItemCtor) {
          await navigator.clipboard.write([
            new ClipboardItemCtor({
              "text/html": new Blob([html], { type: "text/html" }),
              "text/plain": new Blob([plain], { type: "text/plain" })
            })
          ]);
          return;
        }
        const holder = document.createElement("div");
        holder.contentEditable = "true";
        holder.style.position = "fixed";
        holder.style.left = "-9999px";
        holder.innerHTML = html;
        document.body.appendChild(holder);
        try {
          const range = document.createRange();
          range.selectNodeContents(holder);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          document.execCommand("copy");
          selection?.removeAllRanges();
        } finally {
          holder.remove();
        }
      }
      function download(name2, html) {
        const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = name2;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4e3);
      }
      function Btn(props) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: `fp-btn${props.primary ? " fp-btn-primary" : ""}`,
            "data-on": props.on ? "true" : void 0,
            disabled: props.disabled,
            title: props.title,
            onClick: props.onClick,
            children: props.children
          }
        );
      }
      function Panel(props) {
        const { store, sessionId } = props;
        const state = (0, import_react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
        const [mode, setMode] = React.useState("side");
        const [tab, setTab] = React.useState("notes");
        const [noteDraft, setNoteDraft] = React.useState("");
        const [narrow, setNarrow] = React.useState(false);
        const rootRef = React.useRef(null);
        const iframeRef = React.useRef(null);
        const editorRef = React.useRef(null);
        const lastVisible = React.useRef(null);
        React.useEffect(() => {
          void store.actions.init();
        }, [store]);
        React.useEffect(() => {
          const el = rootRef.current;
          if (!el || typeof ResizeObserver === "undefined") return;
          const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 560));
          ro.observe(el);
          setNarrow(el.clientWidth < 560);
          return () => ro.disconnect();
        }, []);
        React.useEffect(() => {
          const onMessage = (event) => {
            if (event.source !== iframeRef.current?.contentWindow) return;
            const data = event.data;
            if (data && data.fishpai === "visible") lastVisible.current = data.id || null;
          };
          window.addEventListener("message", onMessage);
          return () => window.removeEventListener("message", onMessage);
        }, []);
        const restoreScroll = React.useCallback(() => {
          const id = lastVisible.current;
          if (!id) return;
          iframeRef.current?.contentWindow?.postMessage({ fishpai: "reveal", id }, "*");
        }, []);
        const layout = mode === "side" && !narrow ? "side" : "stack";
        const showEditor = mode !== "preview";
        const showPreview = mode !== "edit" || layout === "side";
        const openNotes = state.notes.filter((n) => !n.resolved);
        const onCopy = async () => {
          if (state.placeholders.length) {
            const okToCopy = window.confirm(`还有 ${state.placeholders.length} 处「待补」占位没处理，仍要复制吗？`);
            if (!okToCopy) return;
          }
          try {
            const html = await store.actions.publishHtml();
            await copyRich(html, state.markdown);
            store.actions.toast("已复制到剪贴板：粘进公众号编辑器即可");
          } catch (error) {
            store.actions.toast(`复制失败：${error.message}`, "error");
          }
        };
        const onExport = async () => {
          try {
            const html = await store.actions.publishHtml();
            const base = (state.title || "article").replace(/[\\/:*?"<>|]/g, "");
            download(`${base}.html`, html);
            store.actions.toast(`已导出 ${base}.html`);
          } catch (error) {
            store.actions.toast(`导出失败：${error.message}`, "error");
          }
        };
        const onAddNote = async () => {
          const text = noteDraft.trim();
          if (!text) return;
          await store.actions.addNote(text);
          setNoteDraft("");
        };
        if (state.status === "loading") {
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fp-root", ref: rootRef, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fp-empty", children: "正在打开鱼排…" }) });
        }
        if (state.status === "empty") {
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fp-root", ref: rootRef, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-empty", children: [
            "当前会话还没有鱼排文档。",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
            "让模型调用 ",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "fishpai_open" }),
            "（可以直接给一篇 Markdown），这里就会出现编辑与预览。"
          ] }) });
        }
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-root", ref: rootRef, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-toolbar", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-seg", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { on: mode === "edit", onClick: () => setMode("edit"), title: "只看源码", children: "编辑" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { on: mode === "preview", onClick: () => setMode("preview"), title: "只看公众号效果", children: "预览" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { on: mode === "side", disabled: narrow, onClick: () => setMode("side"), title: narrow ? "栏位太窄，拉宽后可用并排" : "左右并排", children: "并排" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { on: state.meta.mobile, onClick: () => store.actions.setMeta({ mobile: !state.meta.mobile }), title: "按手机宽度预览（375px）", children: "手机" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-spacer" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { title: "重新载入文档", onClick: () => void store.actions.reload(), children: "刷新" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { title: "导出「复制到公众号」形态的 HTML 文件", onClick: () => void onExport(), children: "导出" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { primary: true, title: "复制后直接粘进公众号编辑器（⌘⇧C）", onClick: () => void onCopy(), children: "复制到公众号" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "select",
                {
                  className: "fp-select",
                  value: state.meta.theme,
                  title: "主题",
                  onChange: (e) => void store.actions.setMeta({ theme: e.target.value }),
                  children: state.themes.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: t.key, children: [
                    t.emoji,
                    " ",
                    t.name
                  ] }, t.key))
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-swatches", title: "主题色", children: [
                state.presets.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "fp-swatch",
                    style: { background: p.color },
                    "data-on": state.meta.color === p.color ? "true" : void 0,
                    title: `${p.name} ${p.color}`,
                    onClick: () => void store.actions.setMeta({ color: state.meta.color === p.color ? null : p.color })
                  },
                  p.color
                )),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    className: "fp-color",
                    type: "color",
                    title: "自定义主题色",
                    value: state.meta.color || "#4f6ef7",
                    onChange: (e) => void store.actions.setMeta({ color: e.target.value })
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "select",
                {
                  className: "fp-select",
                  value: state.meta.fontSize,
                  title: "正文字号",
                  onChange: (e) => void store.actions.setMeta({ fontSize: e.target.value }),
                  children: state.sizes.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: s, children: s }, s))
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                Btn,
                {
                  on: state.meta.footnotes,
                  title: "正文外链转文末「参考资料」（微信正文不支持外链）",
                  onClick: () => void store.actions.setMeta({ footnotes: !state.meta.footnotes }),
                  children: "脚注"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                Btn,
                {
                  on: state.meta.macCodeBlock,
                  title: "代码块用 mac 标题栏形态",
                  onClick: () => void store.actions.setMeta({ macCodeBlock: !state.meta.macCodeBlock }),
                  children: "代码框"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                Btn,
                {
                  title: "给光标所在段落留一条批注，模型下次读文档就能看到",
                  onClick: () => {
                    setTab("notes");
                    setNoteDraft("");
                  },
                  children: "＋批注"
                }
              )
            ] })
          ] }),
          state.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-banner", "data-kind": "error", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: state.error }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-spacer" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { onClick: () => void store.actions.reload(), children: "重试" })
          ] }) : null,
          state.external ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-banner", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: state.external.reason === "switch" ? "模型打开了另一篇文档，你这里有没保存的改动。" : `AI 更新了文档（rev ${state.external.revision}），你这里有没保存的改动。` }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-spacer" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { onClick: () => void store.actions.acceptExternal(), children: state.external.reason === "switch" ? "切到新文档" : "看 AI 的版本" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { onClick: () => void store.actions.flush(), children: "保留我的" })
          ] }) : null,
          state.conflict ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-banner", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              "文档已被改动（服务端 rev ",
              state.conflict.revision,
              "），你的编辑还在编辑器里。"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-spacer" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { onClick: () => void store.actions.resolveConflict("theirs"), children: "采用 AI 的（先把我的存进历史）" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { primary: true, onClick: () => void store.actions.resolveConflict("mine"), children: "用我的覆盖" })
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-main", "data-layout": layout, children: [
            showEditor ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              Editor,
              {
                pane: true,
                editorRef,
                value: state.markdown,
                onChange: (text) => store.actions.setMarkdown(text),
                onCaret: (line) => store.actions.setCaret(line),
                onSave: () => void store.actions.flush(),
                onCopy: () => void onCopy(),
                currentBlock: state.blocks.find((b) => b.startLine <= state.caretLine && state.caretLine <= b.endLine) || null
              }
            ) : null,
            showPreview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              Preview,
              {
                pane: true,
                iframeRef,
                html: state.previewHtml,
                mobile: state.meta.mobile,
                previewing: state.previewing,
                themeName: state.themeName,
                onLoad: restoreScroll
              }
            ) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            Drawer,
            {
              tab,
              setTab,
              notes: state.notes,
              placeholders: state.placeholders,
              blocks: state.blocks,
              history: state.history,
              noteDraft,
              setNoteDraft,
              onAddNote: () => void onAddNote(),
              onResolve: (id) => void store.actions.updateNote(id, { resolved: true }),
              onRemove: (id) => void store.actions.removeNote(id),
              onJump: (line) => {
                const el = editorRef.current;
                if (!el) return;
                const lines = state.markdown.split("\n");
                const offset = lines.slice(0, line - 1).reduce((acc, l) => acc + l.length + 1, 0);
                el.focus();
                el.setSelectionRange(offset, offset);
                store.actions.setCaret(line);
                const ratio = offset / Math.max(1, state.markdown.length);
                el.scrollTop = ratio * el.scrollHeight;
              },
              onRestore: (id, label) => void store.actions.restore(id, label)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-status", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              countWords(state.markdown),
              " 字"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              "约 ",
              readingMinutes(state.markdown),
              " 分钟"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              "rev ",
              state.revision
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: state.saving ? "保存中…" : state.dirty ? "未保存" : "已保存" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-spacer" }),
            state.placeholders.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "fp-warn", children: [
              "待补 ",
              state.placeholders.length
            ] }) : null,
            openNotes.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              "批注 ",
              openNotes.length
            ] }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-muted", children: state.themeName })
          ] }),
          state.toast ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fp-toast", children: state.toast.text }) : null
        ] });
      }
      function Editor(props) {
        const { editorRef, value } = props;
        const caretOf = (el) => el.value.slice(0, el.selectionStart || 0).split("\n").length;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-pane", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-pane-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Markdown 源码" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-spacer" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-muted", children: props.currentBlock ? `${props.currentBlock.kind} · 第 ${props.currentBlock.startLine} 行` : "未在块内" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "textarea",
            {
              ref: editorRef,
              className: "fp-editor",
              spellCheck: false,
              value,
              onChange: (e) => {
                props.onChange(e.target.value);
                props.onCaret(caretOf(e.target));
              },
              onClick: (e) => props.onCaret(caretOf(e.currentTarget)),
              onKeyUp: (e) => props.onCaret(caretOf(e.currentTarget)),
              onKeyDown: (e) => {
                const meta = e.metaKey || e.ctrlKey;
                if (meta && e.key.toLowerCase() === "s") {
                  e.preventDefault();
                  props.onSave();
                  return;
                }
                if (meta && e.shiftKey && e.key.toLowerCase() === "c") {
                  e.preventDefault();
                  props.onCopy();
                  return;
                }
                if (e.key === "Tab") {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const start = el.selectionStart;
                  const end = el.selectionEnd;
                  const next = `${value.slice(0, start)}  ${value.slice(end)}`;
                  props.onChange(next);
                  requestAnimationFrame(() => {
                    el.selectionStart = el.selectionEnd = start + 2;
                  });
                }
              }
            }
          )
        ] });
      }
      function Preview(props) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-pane", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-pane-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "公众号预览" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-spacer" }),
            props.previewing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "渲染中…" }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-muted", children: props.themeName })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fp-preview-wrap", children: props.html ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "iframe",
            {
              ref: props.iframeRef,
              className: "fp-preview",
              title: "公众号预览",
              sandbox: "allow-scripts",
              "data-mobile": props.mobile ? "true" : "false",
              srcDoc: buildSrcdoc(props.html),
              onLoad: props.onLoad
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fp-preview-empty", children: "还没有内容" }) })
        ] });
      }
      function Drawer(props) {
        const open = props.notes.filter((n) => !n.resolved);
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-drawer", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-drawer-tabs", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Btn, { on: props.tab === "notes", onClick: () => props.setTab("notes"), children: [
              "批注 ",
              open.length || ""
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Btn, { on: props.tab === "todo", onClick: () => props.setTab("todo"), children: [
              "待补 ",
              props.placeholders.length || ""
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Btn, { on: props.tab === "blocks", onClick: () => props.setTab("blocks"), children: [
              "块 ",
              props.blocks.length
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { on: props.tab === "history", onClick: () => props.setTab("history"), children: "历史" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-drawer-body", children: [
            props.tab === "notes" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-compose", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "textarea",
                  {
                    placeholder: "给光标所在段落留一条批注…（模型下次读文档时会看到）",
                    value: props.noteDraft,
                    onChange: (e) => props.setNoteDraft(e.target.value),
                    onKeyDown: (e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") props.onAddNote();
                    }
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-row", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-muted", children: "⌘/Ctrl + Enter 添加" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-spacer" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { primary: true, disabled: !props.noteDraft.trim(), onClick: props.onAddNote, children: "添加批注" })
                ] })
              ] }),
              props.notes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fp-empty", children: "还没有批注。" }) : null,
              props.notes.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-item", "data-orphan": n.orphan ? "true" : void 0, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-item-head", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: n.orphan ? "锚点已失效" : n.blockIndex === null || n.blockIndex === void 0 ? "第 ? 块" : `第 ${n.blockIndex + 1} 块` }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: fmtTime(n.at) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-spacer" }),
                  n.orphan ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { onClick: () => props.onResolve(n.id), children: n.resolved ? "已解决" : "标记解决" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { onClick: () => props.onRemove(n.id), children: "删除" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fp-item-text", children: n.text }),
                n.quote ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fp-quote", children: n.quote.slice(0, 120) }) : null
              ] }, n.id))
            ] }) : null,
            props.tab === "todo" ? props.placeholders.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-empty", children: [
              "没有待补占位。在正文里写 ",
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "<!-- 鱼排: 这里补一句 -->" }),
              " 即可。"
            ] }) : props.placeholders.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-item", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-item-head", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                  "第 ",
                  p.line,
                  " 行"
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-spacer" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { onClick: () => props.onJump(p.line), children: "定位" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fp-item-text", children: p.text })
            ] }, `${p.line}-${p.text}`)) : null,
            props.tab === "blocks" ? props.blocks.map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-item", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-item-head", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: b.id }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: b.kind }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                  "第 ",
                  b.startLine,
                  " 行"
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-spacer" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { onClick: () => props.onJump(b.startLine), children: "定位" })
              ] }),
              b.preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fp-item-text", children: b.preview }) : null
            ] }, b.id)) : null,
            props.tab === "history" ? props.history.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fp-empty", children: "还没有历史版本。" }) : props.history.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fp-item", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fp-item-head", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                "rev ",
                h.rev
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: h.by === "ai" ? "模型" : h.by === "human" ? "你" : h.by }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: fmtTime(h.at) }),
              h.label ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: h.label }) : null,
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fp-spacer" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, { onClick: () => props.onRestore(h.id, `rev ${h.rev}${h.label ? `（${h.label}）` : ""}`), children: "回滚到这一版" })
            ] }) }, h.id)) : null
          ] })
        ] });
      }

      // client/styles.ts
      var STYLE_TAG_ID = "dsh-fishpai/panel.css";
      var CSS = `
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
      `;
      function ensureStyles(doc = document) {
        const selector = `style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`;
        if (doc.querySelector(selector)) return () => {
        };
        const tag = doc.createElement("style");
        tag.dataset.plugin = "dsh-fishpai";
        tag.dataset.pluginCss = STYLE_TAG_ID;
        tag.textContent = CSS;
        doc.head.appendChild(tag);
        return () => tag.remove();
      }

      // client/index.tsx
      var name = "dsh-fishpai";
      var inject = ["slots", "sessions"];
      var TAB_ID = "dsh-fishpai";
      var TAB_KIND = "fishpai";
      var FALLBACK_TAB_ID = `${TAB_ID}:editor`;
      var POLL_MS = 3e3;
      function pick(injected, key) {
        if (!injected) return void 0;
        try {
          if (typeof injected.get === "function") {
            const value = injected.get(key);
            if (value !== void 0) return value;
          }
        } catch {
        }
        return injected[key];
      }
      function service(ctx, key) {
        try {
          return typeof ctx.get === "function" ? ctx.get(key) : void 0;
        } catch {
          return void 0;
        }
      }
      function currentSessionId(ctx) {
        try {
          const sessions = service(ctx, "sessions");
          const snapshot = sessions?.list?.getSnapshot?.();
          return snapshot?.current || null;
        } catch {
          return null;
        }
      }
      function apply(ctx) {
        const stores = /* @__PURE__ */ new Map();
        const disposeStyles = ensureStyles();
        ctx.effect(() => () => disposeStyles(), "fishpai: 面板样式");
        const storeFor = (sessionId) => {
          let store = stores.get(sessionId);
          if (!store) {
            store = createFishpaiStore(sessionId);
            stores.set(sessionId, store);
          }
          return store;
        };
        function PanelHost(props) {
          const sessionId = props?.sessionId || currentSessionId(ctx);
          const store = React2.useMemo(() => sessionId ? storeFor(sessionId) : null, [sessionId]);
          if (!sessionId || !store) {
            return React2.createElement("div", { className: "fp-root" }, "鱼排：拿不到当前会话，请在一个会话里打开。");
          }
          return React2.createElement(Panel, { store, sessionId, visible: props?.visible });
        }
        function Title() {
          return React2.createElement("span", { className: "fp-title-label" }, "鱼排");
        }
        let openOfficial = null;
        let openFallback = null;
        const openPanel = () => {
          const open = openOfficial || openFallback;
          if (!open) throw new Error("右侧栏通道尚未就绪");
          open();
        };
        const openIfRequested = (sessionId, docKey) => {
          try {
            openPanel?.();
          } catch (error) {
            console.warn("[dsh-fishpai] 打开面板失败，下一次轮询会重试：", error);
            return false;
          }
          storeFor(sessionId);
          void api.tabOpened(sessionId, docKey).catch(() => {
          });
          return true;
        };
        let officialReady = false;
        let disposeFallbackTab = null;
        let seatHandle = null;
        try {
          seatHandle = ctx.inject(["sidebarRightTabs", "sidebarRight"], (injected) => {
            const tabs = pick(injected, "sidebarRightTabs");
            const sidebarRight = pick(injected, "sidebarRight");
            if (!tabs || typeof tabs.register !== "function") return;
            const disposers = [];
            disposers.push(
              tabs.register({
                id: TAB_ID,
                kind: TAB_KIND,
                priority: "extension",
                title: () => "鱼排",
                guide: [
                  {
                    order: 45,
                    title: () => "鱼排排版台",
                    description: () => "公众号排版：Markdown + 实时预览 + 与模型来回改稿"
                  }
                ]
              })
            );
            const slots = ctx.slots;
            if (slots && typeof slots.inject === "function") {
              disposers.push(
                slots.inject(
                  "sidebar.right.pane.tab",
                  () => slots.register({ name: "sidebar.right.pane.tab", key: TAB_ID }, PanelHost)
                )
              );
              disposers.push(
                slots.inject(
                  "sidebar.right.pane.tab.title",
                  () => slots.register({ name: "sidebar.right.pane.tab.title", key: TAB_ID }, Title)
                )
              );
            }
            if (sidebarRight && typeof sidebarRight.openTab === "function") {
              openOfficial = () => sidebarRight.openTab(TAB_KIND);
            }
            officialReady = true;
            if (disposeFallbackTab) {
              try {
                disposeFallbackTab();
              } catch {
              }
              disposeFallbackTab = null;
              openFallback = null;
            }
            const dispose = () => {
              for (const off of disposers.reverse()) {
                try {
                  off();
                } catch {
                }
              }
              officialReady = false;
              openOfficial = null;
            };
            return dispose;
          });
        } catch (error) {
          console.warn("[dsh-fishpai] 官方右侧栏席位注入失败：", error);
        }
        let fallbackHandle = null;
        try {
          fallbackHandle = ctx.inject(["betterSidebar"], (injected) => {
            if (officialReady) return;
            const bs = pick(injected, "betterSidebar");
            if (!bs || typeof bs.registerTab !== "function") return;
            const off = bs.registerTab({
              id: FALLBACK_TAB_ID,
              title: () => "鱼排",
              order: 40,
              single: true,
              component: (props) => React2.createElement(PanelHost, props)
            });
            openFallback = () => bs.openTab({ type: FALLBACK_TAB_ID });
            disposeFallbackTab = () => {
              try {
                off();
              } catch {
              }
            };
            return off;
          });
        } catch (error) {
          console.warn("[dsh-fishpai] better-sidebar 回退注入失败：", error);
        }
        ctx.effect(() => {
          let stopped = false;
          let warned = false;
          let lastRevision = -1;
          let lastKey = null;
          let lastSession = "";
          const tick = async () => {
            if (stopped || typeof document !== "undefined" && document.visibilityState === "hidden") return;
            const sessionId = currentSessionId(ctx);
            if (!sessionId) return;
            try {
              const st = await api.state(sessionId);
              warned = false;
              if (sessionId !== lastSession) {
                lastSession = sessionId;
                lastKey = null;
                lastRevision = -1;
              }
              if (st.openRequest && st.openRequest.key) {
                openIfRequested(sessionId, st.openRequest.key);
              }
              const activeKey = st.active ? st.active.key : null;
              const revision = st.active ? st.active.revision : -1;
              const firstPoll = lastKey === null && lastRevision === -1;
              const switched = activeKey !== lastKey || revision !== lastRevision;
              lastKey = activeKey;
              lastRevision = revision;
              const store = stores.get(sessionId);
              if (store && switched && !firstPoll && activeKey) void store.actions.onActiveDoc(activeKey, revision);
            } catch (error) {
              if (!warned) {
                warned = true;
                console.warn("[dsh-fishpai] 轮询失败（宿主路由可能尚未就绪）：", error);
              }
            }
          };
          const timer = setInterval(() => void tick(), POLL_MS);
          void tick();
          return () => {
            stopped = true;
            clearInterval(timer);
            seatHandle?.dispose?.();
            fallbackHandle?.dispose?.();
            disposeFallbackTab?.();
            for (const store of stores.values()) store.dispose();
            stores.clear();
          };
        }, "fishpai: 轮询与生命周期");
      }

    return module.exports;
  },
});
