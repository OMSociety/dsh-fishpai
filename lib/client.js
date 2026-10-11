/**
 * 自动生成，请勿手改 —— 源码在 client/，用 `npm run build` 重新生成。
 * 改完记得把本文件一起提交：`dsh plugin add dsh-fishpai` 只安装、不构建。
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
        themes: (sessionId) => call(`/themes?${q({ sessionId })}`),
        doc: (sessionId, docKey) => call(`/doc?${q({ sessionId, docKey })}`),
        save: (sessionId, docKey, markdown, baseRevision, meta) => call(`/doc`, {
          method: "PUT",
          body: JSON.stringify({ sessionId, docKey, markdown, baseRevision, meta })
        }),
        /** 面板上自己起一篇空白文档（不必等模型 fishpai_open）。 */
        createDoc: (sessionId, title) => call(`/doc`, {
          method: "POST",
          body: JSON.stringify({ sessionId, title })
        }),
        /** 面板主题列表里的 ×：删掉工作目录级的那一套「自定义主题」。 */
        clearTheme: (sessionId) => call("/theme", {
          method: "POST",
          body: JSON.stringify({ sessionId, action: "clear" })
        }),
        activate: (sessionId, docKey) => call(`/active`, {
          method: "POST",
          body: JSON.stringify({ sessionId, docKey })
        }),
        meta: (sessionId, docKey, meta) => call(`/meta`, { method: "POST", body: JSON.stringify({ sessionId, docKey, meta }) }),
        /**
         * 面板上粘贴/拖进来的图片：宿主存到**文档同级的 `assets/`**，回一个相对文档目录的 `src`，
         * 客户端把它写成 `![](assets/xxx.png)` 插进正文（正文的修改仍然只走 `/doc`）。
         */
        upload: (sessionId, docKey, payload) => call(`/upload`, {
          method: "POST",
          body: JSON.stringify({ sessionId, docKey, ...payload })
        }),
        /**
         * 预览渲染。宿主回带的 `blocks` / `notes` / `placeholders` / `images` **是跟着传进去的
         * markdown 走的**（不是磁盘上那份），面板据此在打字时就刷新块清单、批注锚点与图片提示。
         *
         * `linkCount` / `hasCode` 同样来自**渲染结果**：面板靠它们决定「脚注」「Mac 代码框」
         * 两个开关该不该置灰，而不是自己拿正则猜正文。
         *
         * `hljsCss` 是 highlight.js 配色：预览 iframe 是沙箱 srcdoc，里面没有它的样式表，
         * 代码块 token 只有 class、没有颜色——宿主把同一份色表（hljs-map.json）生成 CSS 带下来，
         * 客户端注入 srcdoc。发布产物不吃它（走内联），所以 golden 不受影响。
         */
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
      var MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
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
          linkCount: 0,
          hasCode: false,
          imageMap: {},
          history: [],
          docs: [],
          themes: [],
          presets: [],
          fonts: ["sans", "serif", "mono"],
          sizes: ["14px", "15px", "16px", "17px", "18px"],
          previewHtml: "",
          hljsCss: "",
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
      var ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
      function decodeAttr(value) {
        return value.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] || m);
      }
      function inlineImages(html, imageMap) {
        if (!html || !Object.keys(imageMap).length) return html;
        return html.replace(/(<img\b[^>]*?\bsrc=")([^"]*)(")/g, (full, pre, src, post) => {
          const hit = imageMap[src] || imageMap[decodeAttr(src)];
          return hit ? `${pre}${hit}${post}` : full;
        });
      }
      function buildSrcdoc(html, imageMap = {}, hljsCss = "") {
        return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        html,body{margin:0;padding:0;background:#fff}
        fp-block{display:block;height:0;overflow:hidden}
        img{max-width:100%;height:auto}
      ${hljsCss}
      </style></head><body>${inlineImages(html, imageMap)}
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
      function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
          const Reader = globalThis.FileReader;
          if (!Reader) return reject(new Error("这个浏览器不支持本地图片预览"));
          const reader = new Reader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("图片读取失败"));
          reader.readAsDataURL(blob);
        });
      }
      async function fileToBase64(file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        const CHUNK = 32768;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
        }
        return btoa(binary);
      }
      function createFishpaiStore(sessionId, onDocLoaded) {
        let state = initialState(sessionId);
        const listeners = /* @__PURE__ */ new Set();
        let toastSeq = 0;
        let saveTimer = null;
        let previewTimer = null;
        const toastTimers = /* @__PURE__ */ new Set();
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
          const timer = setTimeout(() => {
            toastTimers.delete(timer);
            if (state.toast && state.toast.id === id) patch({ toast: null });
          }, kind === "error" ? 5e3 : 2600);
          toastTimers.add(timer);
        };
        const imageCache = /* @__PURE__ */ new Map();
        async function ensureImages(images, docKey) {
          const bucket = imageCache.get(docKey) || /* @__PURE__ */ new Map();
          imageCache.set(docKey, bucket);
          const wanted = images.filter((img) => img.embed && !bucket.has(img.src));
          if (!wanted.length) return;
          await Promise.all(
            wanted.map(async (img) => {
              try {
                const res = await fetch(api.assetUrl(state.sessionId, docKey, img.src));
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                bucket.set(img.src, await blobToDataUrl(await res.blob()));
              } catch {
                bucket.set(img.src, "");
              }
            })
          );
          if (state.docKey !== docKey) return;
          patch({ imageMap: Object.fromEntries(bucket) });
        }
        let previewToken = 0;
        let loadToken = 0;
        let notesEpoch = 0;
        async function refreshPreview(markdown, meta) {
          if (!state.docKey) return;
          const docKey = state.docKey;
          const token = ++previewToken;
          const epoch = notesEpoch;
          patch({ previewing: true });
          try {
            const res = await api.renderPreview(state.sessionId, state.docKey, markdown, meta);
            if (token !== previewToken) return;
            patch({
              previewHtml: res.html,
              hljsCss: res.hljsCss || "",
              blocks: res.blocks,
              placeholders: res.placeholders,
              images: res.images,
              linkCount: res.linkCount,
              hasCode: res.hasCode,
              ...epoch === notesEpoch ? { notes: res.notes } : {},
              themeName: res.themeName,
              previewing: false,
              // 成功即清掉上一次的失败红条——否则一次瞬时失败会一直挂到点「重试」或重载文档为止
              error: null
            });
            void ensureImages(res.images, docKey);
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
          if (state.external) return;
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
              external: null,
              // 每次写入都会留一份快照，宿主顺手把它回带过来——「历史」抽屉不用再手动刷新
              ...res.history ? { history: res.history } : {}
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
        async function loadDoc(docKey) {
          if (!docKey) return false;
          const token = ++loadToken;
          const dirtyBefore = state.dirty;
          let res;
          try {
            res = await api.doc(state.sessionId, docKey);
          } catch (error) {
            if (token !== loadToken) return false;
            if (docKey === state.docKey) {
              patch({ error: `载入失败：${error.message}` });
              return false;
            }
            throw error;
          }
          if (token !== loadToken) return false;
          const keepTyped = state.dirty && !dirtyBefore;
          notesEpoch += 1;
          patch({
            status: "ready",
            error: null,
            docKey,
            path: res.doc.path,
            title: res.doc.title,
            ...keepTyped ? {} : { markdown: res.doc.markdown, savedMarkdown: res.doc.markdown, dirty: false },
            revision: res.doc.revision,
            meta: res.meta,
            blocks: res.blocks,
            notes: res.notes,
            placeholders: res.placeholders,
            images: res.images,
            // `/doc` 不带渲染信息：置 `null` 表示"还不知道"，开关因此**不会闪一下变灰**。
            // 紧随其后的那次预览会给出真值（`false`/`0` 才是"确实没有"）。
            linkCount: null,
            hasCode: null,
            imageMap: Object.fromEntries(imageCache.get(docKey) || []),
            history: res.history,
            conflict: null,
            external: null
          });
          onDocLoaded?.(docKey);
          void ensureImages(res.images, docKey);
          void refreshPreview(state.markdown, res.meta);
          return true;
        }
        async function switchTo(key) {
          try {
            return await loadDoc(key);
          } catch (error) {
            const message = `打开失败：${error.message}`;
            patch({ error: message });
            toast(message, "error");
            return false;
          }
        }
        async function saveBeforeSwitch() {
          if (!state.dirty || state.conflict || state.external) return true;
          await saveNow();
          return !state.dirty;
        }
        async function refreshThemes() {
          const res = await api.themes(state.sessionId).catch(() => null);
          if (res) patch({ themes: res.themes, presets: res.presets, sizes: res.sizes, fonts: res.fonts });
        }
        async function init() {
          try {
            patch({ status: "loading", error: null });
            await refreshThemes();
            const st = await api.state(state.sessionId);
            patch({ docs: Array.isArray(st.docs) ? st.docs : [] });
            if (!st.active) {
              patch({ status: "empty" });
              return;
            }
            const loaded = await loadDoc(st.active.key);
            if (!loaded && state.error) patch({ status: "error" });
          } catch (error) {
            patch({ status: "error", error: error.message });
          }
        }
        const actions = {
          init,
          /**
           * 面板上自己起一篇（空文档 + 一行标题），不必等模型 `fishpai_open`。
           * 宿主那边会把它落到 `.fishpai/docs/` 下，和模型建的是同一类普通 .md。
           */
          async createDoc() {
            try {
              if (!await saveBeforeSwitch()) {
                toast("保存没成功，已取消新建文档以免丢字", "error");
                return;
              }
              const res = await api.createDoc(state.sessionId);
              if (await switchTo(res.docKey)) toast("新建了一篇空白文档，可以直接在编辑器里写");
            } catch (error) {
              toast(`新建文档失败：${error.message}`, "error");
            }
          },
          /** 从「最近打开」切一篇：只改这个会话的当前文档，不动模型留下的打开请求。 */
          async openDocByKey(key) {
            if (!key || key === state.docKey) return;
            try {
              if (!await saveBeforeSwitch()) {
                toast("保存没成功，已取消切换以免丢字", "error");
                return;
              }
              await api.activate(state.sessionId, key);
              await switchTo(key);
            } catch (error) {
              toast(`打开失败：${error.message}`, "error");
            }
          },
          setMarkdown(text) {
            patch({ markdown: text, dirty: text !== state.savedMarkdown });
            schedulePreview();
            scheduleSave();
          },
          setCaret(line) {
            if (line !== state.caretLine) patch({ caretLine: line });
          },
          /**
           * 把一张粘贴/拖进来的图片存到宿主（文档同级的 `assets/`），回它的相对路径。
           *
           * 这里**只存**、不插正文：插哪里由编辑器按当下的光标决定（上传期间人可能挪了光标），
           * 而且这样"存失败"与"改正文"是两件事——图没存进来，正文一个字都不会被碰。
           */
          async uploadImage(file) {
            if (!state.docKey) throw new Error("还没有打开文档：先让模型 fishpai_open 一篇，或新建一篇");
            if (file.size > MAX_UPLOAD_BYTES) {
              throw new Error(`${(file.size / 1024 / 1024).toFixed(1)}MB 超过 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB 上限，先压缩一下再粘`);
            }
            const data = await fileToBase64(file);
            return api.upload(state.sessionId, state.docKey, { name: file.name, mime: file.type, data });
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
          /**
           * 删掉工作目录级的那一套「自定义主题」（面板主题列表「我的」那一组右边的 ×）。
           * 只有一套，删了那一组就整个消失。宿主已把正用着它的当前文档退回「默认公众号」，
           * 这里把本地的 meta 与预览也同步过去，免得预览还停在已经不存在的主题上。
           */
          async clearCustomTheme() {
            try {
              const res = await api.clearTheme(state.sessionId);
              if (!res.removed) {
                toast("本来就没有自定义主题，什么都没动");
                return;
              }
              await refreshThemes();
              if (state.meta.theme === "custom") {
                const meta = { ...state.meta, theme: "default" };
                patch({ meta });
                void refreshPreview(state.markdown, meta);
              }
              toast(res.reverted ? "已移除自定义主题；当前文档退回「默认公众号」" : "已移除自定义主题");
            } catch (error) {
              toast(`移除失败：${error.message}`, "error");
            }
          },
          /**
           * 加一条批注。**返回是否真的加上了**——调用方据此决定要不要清空输入框：
           * 没加上还把用户刚写的字抹掉，是这类面板最容易咬人的地方。
           *
           * 先落盘再取块：批注靠块 id / 块序号锚定，而宿主是按**磁盘上的正文**解析锚点的。
           * 所以这里等保存完、再用同一次预览的块边界取块，锚点才和宿主看到的是同一份。
           */
          async addNote(text) {
            if (!state.docKey) {
              toast("还没有打开文档：先让模型 fishpai_open 一篇，再留批注", "error");
              return false;
            }
            await saveNow();
            await refreshPreview(state.markdown, state.meta);
            const block = actions.currentBlock();
            if (!block) {
              toast("正文还是空的：先在编辑器里写一段，再把批注挂上去", "error");
              return false;
            }
            try {
              const res = await api.notes(state.sessionId, state.docKey, {
                action: "add",
                note: { blockId: block.id, blockIndex: block.index, text, author: "human" }
              });
              notesEpoch += 1;
              patch({ notes: res.notes });
              toast("批注已加；模型下次 fishpai_read 就能看到");
              return true;
            } catch (error) {
              toast(`批注失败：${error.message}　文字还在输入框里，可以直接重试`, "error");
              return false;
            }
          },
          async updateNote(id, next) {
            if (!state.docKey) return;
            try {
              const res = await api.notes(state.sessionId, state.docKey, { action: "update", id, patch: next });
              notesEpoch += 1;
              patch({ notes: res.notes });
            } catch (error) {
              toast(`批注更新失败：${error.message}`, "error");
            }
          },
          async removeNote(id) {
            if (!state.docKey) return;
            try {
              const res = await api.notes(state.sessionId, state.docKey, { action: "remove", id });
              notesEpoch += 1;
              patch({ notes: res.notes });
            } catch (error) {
              toast(`删除失败：${error.message}`, "error");
            }
          },
          async restore(id, label) {
            if (!state.docKey) return;
            if (state.conflict) {
              toast("先处理上方的冲突再回滚", "error");
              return;
            }
            if (state.dirty) {
              await saveNow();
              if (state.dirty) {
                toast("保存没成功，已取消回滚以免丢字", "error");
                return;
              }
            }
            try {
              await api.history(state.sessionId, state.docKey, { action: "restore", id });
              if (await loadDoc(state.docKey)) toast(`已回滚到 ${label}`);
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
          /** 轮询发现宿主的当前文档变了（AI 写入 / 换了一篇 / 别的窗口写的 / 模型换了主题）。 */
          async onActiveDoc(key, revision, themeKey) {
            if (!key) return;
            if (key === state.docKey && themeKey && themeKey !== state.meta.theme) {
              patch({ meta: { ...state.meta, theme: themeKey } });
              void refreshThemes();
              schedulePreview();
            }
            if (state.docKey && key !== state.docKey) {
              if (state.dirty) {
                patch({ external: { revision, reason: "switch", key } });
                return;
              }
              if (await switchTo(key)) toast("模型打开了另一篇文档");
              return;
            }
            if (!state.docKey) {
              await switchTo(key);
              return;
            }
            if (revision <= state.revision) return;
            if (state.dirty) {
              patch({ external: { revision, reason: "revision" } });
              return;
            }
            if (await loadDoc(key)) toast(`AI 更新了文档（rev ${revision}）`);
          },
          async reload() {
            if (state.docKey) await loadDoc(state.docKey);
          },
          /**
           * 「刷新」按钮走这条路：先落盘再重载。
           * 直接 reload 会把用户还没保存的输入丢掉——这是那个按钮最容易咬人的地方。
           */
          async reloadSafely() {
            if (!state.docKey) return;
            if (state.conflict) {
              toast("先处理上方的冲突再刷新", "error");
              return;
            }
            if (state.dirty) {
              await saveNow();
              if (state.dirty) {
                toast("保存没成功，已取消刷新以免丢字", "error");
                return;
              }
            }
            if (await loadDoc(state.docKey)) toast("已重新载入");
          },
          /** 采用外部版本（放弃自己的未保存改动）——换文档时切到新文档。 */
          async acceptExternal() {
            const target = state.external?.key || state.docKey;
            if (!target) return;
            await switchTo(target);
          },
          toast,
          flush() {
            if (saveTimer) clearTimeout(saveTimer);
            if (state.external) patch({ revision: state.external.revision, external: null });
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
            for (const timer of toastTimers) clearTimeout(timer);
            toastTimers.clear();
            imageCache.clear();
            listeners.clear();
          }
        };
      }

      // client/sanitize.ts
      var DROP_TAGS = /* @__PURE__ */ new Set([
        "SCRIPT",
        "IFRAME",
        "OBJECT",
        "EMBED",
        "LINK",
        "META",
        "STYLE",
        "BASE",
        "TEMPLATE",
        "ANIMATE",
        "ANIMATEMOTION",
        "ANIMATETRANSFORM",
        "SET",
        "DISCARD"
      ]);
      var URL_ATTRS = /* @__PURE__ */ new Set(["href", "src", "xlink:href", "srcset", "poster", "formaction", "action", "data", "background", "dynsrc", "lowsrc"]);
      var RASTER_DATA_URI_RE = /^data:image\/(?:png|jpe?g|gif|webp|bmp)[;,]/i;
      function normalizeUrl(value) {
        return String(value ?? "").replace(/[\u0000-\u0020\u007f-\u009f]+/g, "").toLowerCase();
      }
      function isDangerousUrl(value) {
        const v = normalizeUrl(value);
        if (/^(?:javascript|vbscript):/.test(v)) return true;
        if (v.startsWith("data:")) return !RASTER_DATA_URI_RE.test(v);
        return false;
      }
      function attributeIsDangerous(name2, value) {
        const lower = String(name2 || "").toLowerCase().replace(/^[^a-z]+/, "");
        if (lower.startsWith("on") || lower === "srcdoc") return true;
        if (!URL_ATTRS.has(lower)) return false;
        if (lower === "srcset") {
          return String(value ?? "").split(",").some((candidate) => isDangerousUrl(candidate.trim().split(/\s+/)[0] || ""));
        }
        return isDangerousUrl(value);
      }
      function sanitizeAttributes(el) {
        const attrs = el.attributes;
        if (!attrs || typeof el.removeAttribute !== "function") return;
        for (const attr of Array.from(attrs)) {
          const name2 = String(attr.name || "");
          if (attributeIsDangerous(name2, String(attr.value ?? ""))) el.removeAttribute(name2);
        }
      }
      function walk(node, drop) {
        const kids = node.childNodes;
        if (!kids) return;
        for (let i = 0; i < kids.length; i++) {
          const child = kids[i];
          if (!child) continue;
          if (child.nodeType === 1) {
            const tag = String(child.tagName || "").toUpperCase();
            if (DROP_TAGS.has(tag)) {
              drop.push(child);
              continue;
            }
            sanitizeAttributes(child);
          }
          walk(child, drop);
        }
      }
      function sanitizeTree(root) {
        if (!root) return;
        const drop = [];
        walk(root, drop);
        for (const node of drop) node.remove?.();
      }
      function sanitizeHtmlFragment(html, parser = new DOMParser()) {
        const doc = parser.parseFromString(html, "text/html");
        if (!doc || !doc.body) throw new Error("这段内容没能解析成 HTML，复制已中止");
        sanitizeTree(doc.body);
        const fragment = document.createDocumentFragment();
        for (const node of Array.from(doc.body.childNodes)) fragment.appendChild(node);
        return fragment;
      }

      // client/keys.ts
      function detectMac() {
        try {
          const nav = typeof navigator === "undefined" ? null : navigator;
          if (!nav) return false;
          const declared = String(nav.userAgentData && nav.userAgentData.platform || nav.platform || "");
          if (/mac|iphone|ipad|ipod/i.test(declared)) return true;
          return typeof nav.userAgent === "string" && /mac os x|iphone|ipad/i.test(nav.userAgent);
        } catch {
          return false;
        }
      }
      var IS_MAC = detectMac();
      var MOD_KEY = IS_MAC ? "⌘" : "Ctrl";
      var COPY_HINT = IS_MAC ? "⌘⇧C" : "Ctrl+Shift+C";

      // client/mdedit.ts
      function lineBounds(text, start, end) {
        const from = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        let to;
        if (end > from && text[end - 1] === "\n") to = end - 1;
        else {
          to = text.indexOf("\n", end);
          if (to < 0) to = text.length;
        }
        return { from, to };
      }
      var INDENT_OF = /^[ \t]*/;
      var BLOCK_PREFIX = /^(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/;
      var LINE_SPECS = {
        h1: { match: /^#{1}\s+/, render: () => "# " },
        h2: { match: /^#{2}\s+/, render: () => "## " },
        h3: { match: /^#{3}\s+/, render: () => "### " },
        // 「正文」：把任意级别的标题摘掉
        h0: { match: /^#{1,6}\s+/, render: () => "" },
        quote: { match: /^>\s?/, render: () => "> " },
        ul: { match: /^[-*+]\s+/, render: () => "- " },
        ol: { match: /^\d+[.)]\s+/, render: (i) => `${i + 1}. ` }
      };
      var INLINE = {
        bold: { mark: "**", placeholder: "加粗文字" },
        italic: { mark: "*", placeholder: "斜体文字" },
        strike: { mark: "~~", placeholder: "删除线" },
        code: { mark: "`", placeholder: "代码" }
      };
      function wrapInline(text, start, end, mark, placeholder) {
        const selected = text.slice(start, end);
        const before = text.slice(Math.max(0, start - mark.length), start);
        const after = text.slice(end, end + mark.length);
        if (selected && before === mark && after === mark) {
          const from = start - mark.length;
          return { from, to: end + mark.length, insert: selected, start: from, end: from + selected.length };
        }
        if (selected.length >= mark.length * 2 && selected.startsWith(mark) && selected.endsWith(mark)) {
          const inner = selected.slice(mark.length, selected.length - mark.length);
          return { from: start, to: end, insert: inner, start, end: start + inner.length };
        }
        const body = selected || placeholder;
        const insert = `${mark}${body}${mark}`;
        const bodyStart = start + mark.length;
        return { from: start, to: end, insert, start: bodyStart, end: bodyStart + body.length };
      }
      function insertLink(text, start, end) {
        const selected = text.slice(start, end);
        const label = selected || "文字";
        const href = "链接地址";
        const insert = `[${label}](${href})`;
        const hrefStart = start + label.length + 3;
        if (selected) {
          return { from: start, to: end, insert, start: hrefStart, end: hrefStart + href.length };
        }
        return { from: start, to: end, insert, start: start + 1, end: start + 1 + label.length };
      }
      function withLinePrefix(text, start, end, spec) {
        const { from, to } = lineBounds(text, start, end);
        const block = text.slice(from, to);
        if (!block.trim()) {
          const insert2 = spec.render(0);
          return { from, to, insert: insert2, start: from + insert2.length, end: from + insert2.length };
        }
        const lines = block.split("\n").map((line) => {
          const indent = (INDENT_OF.exec(line) || [""])[0];
          const raw = line.slice(indent.length);
          return { indent, raw, bare: raw.replace(BLOCK_PREFIX, "") };
        });
        const all = lines.every((l) => spec.match.test(l.raw));
        const insert = lines.map((l, i) => all ? l.indent + l.bare : l.indent + spec.render(i) + l.bare).join("\n");
        return { from, to, insert, start: from, end: from + insert.length };
      }
      var LIST_OR_INDENT = /^(?:[ \t]+|[-*+]\s+|\d+[.)]\s+)/;
      function indentSelection(text, start, end, step = "  ") {
        const { from, to } = lineBounds(text, start, end);
        const line = text.slice(from, to);
        const inList = LIST_OR_INDENT.test(line);
        const multi = end > start;
        if (!inList && !multi) {
          return { from: start, to: end, insert: step + text.slice(start, end), start: start + step.length, end: end + step.length };
        }
        const lines = text.slice(from, to).split("\n");
        const insert = lines.map((l) => step + l).join("\n");
        return { from, to, insert, start: start + step.length, end: end + step.length * lines.length };
      }
      function outdentSelection(text, start, end, step = "  ") {
        const { from, to } = lineBounds(text, start, end);
        const lines = text.slice(from, to).split("\n");
        let deltaHead = 0;
        let deltaAll = 0;
        const out = lines.map((line, i) => {
          const indent = (INDENT_OF.exec(line) || [""])[0];
          if (!indent) return line;
          const cut = indent.length >= step.length ? step.length : indent.length;
          if (i === 0) deltaHead = cut;
          deltaAll += cut;
          return line.slice(cut);
        });
        if (!deltaAll) return null;
        const insert = out.join("\n");
        const nextStart = Math.max(from, start - deltaHead);
        return { from, to, insert, start: nextStart, end: Math.max(nextStart, end - deltaAll) };
      }
      var LINE_MARKER = /^([ \t]*)([-*+]|\d+[.)]|>)\s+(.*)$/;
      function continueList(text, start, end) {
        const { from, to } = lineBounds(text, start, end);
        const raw = text.slice(from, to);
        const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
        const lineEnd = from + line.length;
        const m = LINE_MARKER.exec(line);
        if (!m) return null;
        const [full, indent, marker, rest] = m;
        const restStart = from + full.length - rest.length;
        if (start < restStart) return null;
        if (!rest.trim() && start >= lineEnd) {
          const cut = Math.min(to, lineEnd);
          if (indent.length >= 2) {
            const insert2 = `${indent.slice(0, -2)}${marker} `;
            return { from, to: cut, insert: insert2, start: from + insert2.length, end: from + insert2.length };
          }
          return { from, to: cut, insert: "", start: from, end: from };
        }
        const nextMarker = marker === ">" ? ">" : /^\d/.test(marker) ? `${parseInt(marker, 10) + 1}.` : marker;
        const insert = `
      ${indent}${nextMarker} `;
        return { from: start, to: end, insert, start: start + insert.length, end: start + insert.length };
      }
      function applyAction(id, text, start, end) {
        switch (id) {
          case "bold":
          case "italic":
          case "strike":
          case "code": {
            const spec = INLINE[id];
            return wrapInline(text, start, end, spec.mark, spec.placeholder);
          }
          case "link":
            return insertLink(text, start, end);
          default:
            return withLinePrefix(text, start, end, LINE_SPECS[id]);
        }
      }
      var SHORTCUTS = [
        { id: "bold", label: "加粗", group: "编辑", key: "b", mod: true, scope: "editor" },
        { id: "italic", label: "斜体", group: "编辑", key: "i", mod: true, scope: "editor" },
        { id: "code", label: "行内代码", group: "编辑", key: "e", mod: true, scope: "editor" },
        { id: "link", label: "链接", group: "编辑", key: "k", mod: true, scope: "editor" },
        { id: "strike", label: "删除线", group: "编辑", key: "x", mod: true, shift: true, scope: "editor" },
        { id: "h1", label: "一级标题", group: "编辑", code: "Digit1", keyLabel: "1", mod: true, alt: true, scope: "editor" },
        { id: "h2", label: "二级标题", group: "编辑", code: "Digit2", keyLabel: "2", mod: true, alt: true, scope: "editor" },
        { id: "h3", label: "三级标题", group: "编辑", code: "Digit3", keyLabel: "3", mod: true, alt: true, scope: "editor" },
        { id: "h0", label: "正文（去掉标题）", group: "编辑", code: "Digit0", keyLabel: "0", mod: true, alt: true, scope: "editor" },
        { id: "quote", label: "引用", group: "编辑", code: "Period", fallbackKey: ".", keyLabel: ".", mod: true, shift: true, scope: "editor" },
        { id: "ul", label: "无序列表", group: "编辑", code: "Digit8", fallbackKey: "8", keyLabel: "8", mod: true, shift: true, scope: "editor" },
        { id: "ol", label: "有序列表", group: "编辑", code: "Digit7", fallbackKey: "7", keyLabel: "7", mod: true, shift: true, scope: "editor" },
        { id: "save", label: "保存", group: "面板", key: "s", mod: true, scope: "editor" },
        { id: "copy", label: "复制到公众号", group: "面板", key: "c", mod: true, shift: true, scope: "editor" },
        // 批注框有自己的键盘处理，这里只做速查
        { id: "note", label: "添加批注", group: "面板", key: "enter", keyLabel: "Enter", mod: true, scope: "panel" }
      ];
      function keyMatches(spec, event) {
        if (spec.code) {
          if (event.code) return event.code === spec.code;
          return spec.fallbackKey ? String(event.key).toLowerCase() === spec.fallbackKey : false;
        }
        if (!spec.key) return false;
        return String(event.key).toLowerCase() === spec.key;
      }
      function matchShortcut(event, scope = "editor") {
        const mod = !!(event.metaKey || event.ctrlKey);
        for (const spec of SHORTCUTS) {
          if (scope !== "all" && spec.scope !== scope) continue;
          if (!!spec.mod !== mod) continue;
          if (!!spec.alt !== !!event.altKey) continue;
          if (!!spec.shift !== !!event.shiftKey) continue;
          if (keyMatches(spec, event)) return spec;
        }
        return null;
      }
      function shortcutHint(spec, isMac) {
        const key = spec.keyLabel || (spec.key ? spec.key.toUpperCase() : "");
        if (isMac) return `${spec.mod ? "⌘" : ""}${spec.alt ? "⌥" : ""}${spec.shift ? "⇧" : ""}${key}`;
        const parts = [];
        if (spec.mod) parts.push("Ctrl");
        if (spec.alt) parts.push("Alt");
        if (spec.shift) parts.push("Shift");
        parts.push(key);
        return parts.join("+");
      }

      // client/theme-icons.tsx
      var import_jsx_runtime = require("react/jsx-runtime");
      function AgentPresetGlyph({ size = 16, className, strokeWidth = 1 }) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "svg",
          {
            width: size,
            height: size,
            className,
            viewBox: "0 0 16 16",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            "aria-hidden": "true",
            strokeWidth,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6.51867 12.3282C7.29816 12.6011 8.16475 12.6514 9.02269 12.4216C9.57879 12.2726 10.0784 12.0185 10.5087 11.6888C10.7819 12.0555 11.1606 12.3304 11.5913 12.4805C10.9688 13.029 10.2149 13.4478 9.35911 13.6771C8.13946 14.0038 6.90632 13.8971 5.82126 13.4533C6.15821 13.1562 6.4021 12.7652 6.51867 12.3282ZM9.17629 2.89409C11.1101 3.34433 12.739 4.81872 13.2889 6.87043C13.4219 7.3665 13.4811 7.8649 13.4774 8.35466C13.0924 8.13213 12.6422 8.01837 12.1741 8.05276L12.1711 8.05257C12.1539 7.77199 12.109 7.48889 12.0334 7.20684C11.6363 5.72533 10.5048 4.6372 9.13549 4.22844C9.25559 3.87667 9.29214 3.49087 9.22309 3.09892C9.2108 3.02922 9.19451 2.96108 9.17629 2.89409ZM4.7311 3.89107L4.78302 4.11879C4.87648 4.4488 5.04146 4.74263 5.25579 4.98896C3.98078 6.01355 3.35848 7.72904 3.8089 9.41059C3.81828 9.44559 3.82866 9.48025 3.83885 9.51479C3.38217 9.61268 2.98548 9.84137 2.68107 10.1556C2.63414 10.022 2.5897 9.88632 2.55244 9.74726C1.93301 7.43489 2.86717 5.07173 4.71504 3.76697L4.7311 3.89107Z", fill: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M7.99136 5.28105C8.87501 5.28105 9.59136 4.56471 9.59136 3.68105C9.59136 2.7974 8.87501 2.08105 7.99136 2.08105C7.1077 2.08105 6.39136 2.7974 6.39136 3.68105C6.39136 4.56471 7.1077 5.28105 7.99136 5.28105Z", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M3.94009 12.9417C4.82374 12.9417 5.54009 12.2254 5.54009 11.3417C5.54009 10.458 4.82374 9.7417 3.94009 9.7417C3.05643 9.7417 2.34009 10.458 2.34009 11.3417C2.34009 12.2254 3.05643 12.9417 3.94009 12.9417Z", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12.0851 12.9417C12.9688 12.9417 13.6851 12.2254 13.6851 11.3417C13.6851 10.458 12.9688 9.7417 12.0851 9.7417C11.2015 9.7417 10.4851 10.458 10.4851 11.3417C10.4851 12.2254 11.2015 12.9417 12.0851 12.9417Z", stroke: "currentColor" })
            ]
          }
        );
      }
      function BranchGlyph({ size = 16, className, strokeWidth = 1 }) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "svg",
          {
            width: size,
            height: size,
            className,
            viewBox: "0 0 16 16",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            "aria-hidden": "true",
            strokeWidth,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M1.01503 8.0001L5.6964 8.0001C6.41913 8.0001 6.78049 8.0001 7.12115 7.91951C7.4232 7.84804 7.71233 7.73014 7.97821 7.57C8.27809 7.38939 8.5364 7.13669 9.05303 6.63129L11.3281 4.40564", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M1.01221 7.9999L5.6964 7.9999C6.41913 7.9999 6.78049 7.9999 7.12115 8.08049C7.4232 8.15196 7.71233 8.26986 7.97821 8.43C8.27809 8.61061 8.5364 8.86331 9.05303 9.36871L11.3281 11.5944", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12.4502", cy: "3.3079", r: "1.56962", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12.4502", cy: "12.6921", r: "1.56962", stroke: "currentColor" })
            ]
          }
        );
      }
      function BrowseGlyph({ size = 16, className, strokeWidth = 1 }) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "svg",
          {
            width: size,
            height: size,
            className,
            viewBox: "0 0 16 16",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            "aria-hidden": "true",
            strokeWidth,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4.9375 5.90295H11.0625", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4.9375 9.02991H8.27841", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V13.2246C13.9996 14.0489 13.3036 14.6738 12.5 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5ZM3.5 2.32617C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H12.5C12.8004 13.6738 12.9996 13.4489 13 13.2246V2.77637C13 2.55186 12.8007 2.32617 12.5 2.32617H3.5Z", fill: "currentColor" })
            ]
          }
        );
      }
      function CheckGlyph({ size = 16, className, strokeWidth = 1 }) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "svg",
          {
            width: size,
            height: size,
            className,
            viewBox: "0 0 16 16",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            "aria-hidden": "true",
            strokeWidth,
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4", stroke: "currentColor" })
          }
        );
      }
      function ChevronDownGlyph({ size = 16, className, strokeWidth = 1 }) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "svg",
          {
            width: size,
            height: size,
            className,
            viewBox: "0 0 16 16",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            "aria-hidden": "true",
            strokeWidth,
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6", stroke: "currentColor" })
          }
        );
      }
      function CodeGlyph({ size = 16, className, strokeWidth = 1 }) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "svg",
          {
            width: size,
            height: size,
            className,
            viewBox: "0 0 16 16",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            "aria-hidden": "true",
            strokeWidth,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6.27612 1.5L4.52612 14.5", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M11.4739 1.5L9.72388 14.5", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M2.39868 5.5H14.0681", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M1.93188 10.5H13.6013", stroke: "currentColor" })
            ]
          }
        );
      }
      function DarkGlyph({ size = 16, className, strokeWidth = 1 }) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "svg",
          {
            width: size,
            height: size,
            className,
            viewBox: "0 0 16 16",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            "aria-hidden": "true",
            strokeWidth,
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M14.1127 8.70663C14.2576 8.60602 14.4627 8.71355 14.4386 8.88834C14.2901 9.96567 13.8731 10.9912 13.2229 11.8692C12.479 12.8735 11.4613 13.6421 10.2917 14.0829C9.1222 14.5236 7.85038 14.6179 6.62865 14.3543C5.40692 14.0907 4.28709 13.4805 3.40332 12.5967C2.51955 11.7129 1.90931 10.5931 1.64572 9.37135C1.38212 8.14962 1.47635 6.87779 1.91711 5.70825C2.35787 4.5387 3.12647 3.52103 4.13083 2.77714C5.00878 2.12689 6.03433 1.70994 7.11166 1.5614C7.28645 1.5373 7.39397 1.74238 7.29337 1.88734C6.68703 2.76099 6.37885 3.81241 6.42313 4.88345C6.47392 6.11194 6.98471 7.27645 7.85413 8.14587C8.72355 9.01529 9.88805 9.52608 11.1166 9.57687C12.1876 9.62114 13.239 9.31296 14.1127 8.70663Z", stroke: "currentColor" })
          }
        );
      }
      function EditGlyph({ size = 16, className, strokeWidth = 1 }) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "svg",
          {
            width: size,
            height: size,
            className,
            viewBox: "0 0 16 16",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            "aria-hidden": "true",
            strokeWidth,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8.85596 2.69971H4.19971C3.37141 2.69971 2.69992 3.37146 2.69971 4.19971V11.8003C2.69992 12.6285 3.37141 13.3003 4.19971 13.3003H11.8003C12.6283 13.2999 13.3001 12.6283 13.3003 11.8003V7.89893H14.3003V11.8003C14.3001 13.1806 13.1806 14.2999 11.8003 14.3003H4.19971C2.81913 14.3003 1.69992 13.1808 1.69971 11.8003V4.19971C1.69992 2.81918 2.81913 1.69971 4.19971 1.69971H8.85596V2.69971Z", fill: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M7.7849 8.23878L13.888 2.13574", stroke: "currentColor" })
            ]
          }
        );
      }
      function EnhanceGlyph({ size = 16, className, strokeWidth = 1 }) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "svg",
          {
            width: size,
            height: size,
            className,
            viewBox: "0 0 16 16",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            "aria-hidden": "true",
            strokeWidth,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M1.98486 2.95374H14.0151", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M1.98486 6.31787H14.0151", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M1.98486 9.68213H14.0151", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M1.98486 13.0463H8.4627", stroke: "currentColor" })
            ]
          }
        );
      }
      function LightGlyph({ size = 16, className, strokeWidth = 1 }) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "svg",
          {
            width: size,
            height: size,
            className,
            viewBox: "0 0 16 16",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            "aria-hidden": "true",
            strokeWidth,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8.00007 11.8117C10.1052 11.8117 11.8117 10.1052 11.8117 8.00007C11.8117 5.89499 10.1052 4.18848 8.00007 4.18848C5.89499 4.18848 4.18848 5.89499 4.18848 8.00007C4.18848 10.1052 5.89499 11.8117 8.00007 11.8117Z", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M13.3899 8H15.1499", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M11.8115 11.8115L13.0556 13.0556", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 13.3901V15.1501", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4.18868 11.8115L2.94458 13.0556", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M2.6101 8H0.850098", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4.18868 4.18856L2.94458 2.94446", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 2.6101V0.850098", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M11.8115 4.18856L13.0556 2.94446", stroke: "currentColor" })
            ]
          }
        );
      }
      function ListPenGlyph({ size = 16, className, strokeWidth = 1 }) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "svg",
          {
            width: size,
            height: size,
            className,
            viewBox: "0 0 16 16",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            "aria-hidden": "true",
            strokeWidth,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4.9375 5.90295H11.0625", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4.9375 9.02991H8.27841", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V7.61328L13 8.68164V2.77637C13 2.55186 12.8007 2.32617 12.5 2.32617H3.5C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H8.32812L7.39258 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5Z", fill: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8.97212 14.3693C9.17511 14.5723 9.37811 14.7753 9.5811 14.9783C9.67012 14.8953 9.75914 14.8123 9.84815 14.7293C11.4505 13.2352 13.0528 11.7411 14.6551 10.247C14.7441 10.164 14.8331 10.081 14.9221 9.99803C14.5989 9.6748 14.2756 9.35157 13.9524 9.02834C13.8694 9.11736 13.7864 9.20637 13.7034 9.29539C12.2093 10.8977 10.7152 12.5 9.22113 14.1023C9.13813 14.1913 9.05513 14.2803 8.97212 14.3693Z", fill: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M11.6323 13.7841C11.6323 14.0395 11.6323 14.295 11.6323 14.5504C11.6812 14.5523 11.7301 14.5543 11.779 14.5562C12.659 14.5913 13.539 14.6263 14.419 14.6614C14.4679 14.6633 14.5168 14.6653 14.5657 14.6672C14.5657 14.3339 14.5657 14.0006 14.5657 13.6672C14.5168 13.6692 14.4679 13.6711 14.419 13.6731C13.539 13.7081 12.659 13.7432 11.779 13.7783C11.7301 13.7802 11.6812 13.7821 11.6323 13.7841Z", fill: "currentColor" })
            ]
          }
        );
      }
      function PersonalizationGlyph({ size = 16, className, strokeWidth = 1 }) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "svg",
          {
            width: size,
            height: size,
            className,
            viewBox: "0 0 16 16",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            "aria-hidden": "true",
            strokeWidth,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M3.25 7.16357C3.20417 7.32247 3.17778 7.48993 3.17773 7.66357C3.17773 7.83698 3.20336 8.00486 3.24902 8.16357H1.85742V7.16357H3.25ZM14.1426 8.16357H6.71484C6.76052 8.00485 6.78613 7.837 6.78613 7.66357C6.78609 7.48991 6.75971 7.32249 6.71387 7.16357H14.1426V8.16357Z", fill: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9.1377 11.9092C9.08596 12.0666 9.05668 12.2344 9.05664 12.4092C9.05664 12.5838 9.08606 12.7518 9.1377 12.9092H1.85742V11.9092H9.1377ZM14.1426 12.9092H12.1816C12.2332 12.7519 12.2617 12.5838 12.2617 12.4092C12.2617 12.2345 12.2333 12.0666 12.1816 11.9092H14.1426V12.9092Z", fill: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9.1123 3.09106C9.06138 3.24865 9.03324 3.41653 9.0332 3.59106C9.0332 3.76549 9.06148 3.93355 9.1123 4.09106H1.85742V3.09106H9.1123ZM14.1426 4.09106H12.207C12.2578 3.93358 12.2861 3.76545 12.2861 3.59106C12.2861 3.41657 12.2579 3.24862 12.207 3.09106H14.1426V4.09106Z", fill: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "4.97065", cy: "7.66401", r: "1.35151", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "10.6596", cy: "12.4091", r: "1.35151", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "10.6596", cy: "3.59101", r: "1.35151", stroke: "currentColor" })
            ]
          }
        );
      }
      function SparkleGlyph({ size = 16, className, strokeWidth = 1 }) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "svg",
          {
            width: size,
            height: size,
            className,
            viewBox: "0 0 16 16",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            "aria-hidden": "true",
            strokeWidth,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5.875 3C5.875 6.33333 7.54167 8 10.875 8C7.54167 8 5.875 9.66667 5.875 13C5.875 9.66667 4.20833 8 0.875 8C4.20833 8 5.875 6.33333 5.875 3Z", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12.375 1.55823C12.375 3.39156 13.2917 4.30823 15.125 4.30823C13.2917 4.30823 12.375 5.22489 12.375 7.05823C12.375 5.22489 11.4583 4.30823 9.625 4.30823C11.4583 4.30823 12.375 3.39156 12.375 1.55823Z", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12.375 10.4418C12.375 11.7751 13.0417 12.4418 14.375 12.4418C13.0417 12.4418 12.375 13.1084 12.375 14.4418C12.375 13.1084 11.7083 12.4418 10.375 12.4418C11.7083 12.4418 12.375 11.7751 12.375 10.4418Z", stroke: "currentColor" })
            ]
          }
        );
      }
      function ThinkGlyph({ size = 16, className, strokeWidth = 1 }) {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "svg",
          {
            width: size,
            height: size,
            className,
            viewBox: "0 0 16 16",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            "aria-hidden": "true",
            strokeWidth,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10.2854 5.71481C12.9673 8.39663 14.1182 11.5938 12.8562 12.8559C11.5942 14.1179 8.39706 12.9669 5.71518 10.2851C3.03333 7.60323 1.88236 4.40608 3.14441 3.14403C4.40644 1.882 7.6036 3.03297 10.2854 5.71481Z", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10.2854 10.2851C7.6036 12.9669 4.40644 14.1179 3.14441 12.8559C1.88236 11.5938 3.03333 8.39663 5.71518 5.71481C8.39706 3.03297 11.5942 1.882 12.8562 3.14403C14.1182 4.40608 12.9673 7.60323 10.2854 10.2851Z", stroke: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8.86291 8.0002C8.86291 8.47549 8.47762 8.86087 8.00224 8.86087C7.52694 8.86087 7.1416 8.47549 7.1416 8.0002C7.1416 7.52485 7.52694 7.13953 8.00224 7.13953C8.47762 7.13953 8.86291 7.52485 8.86291 8.0002Z", fill: "currentColor" })
            ]
          }
        );
      }

      // client/icons.tsx
      var import_jsx_runtime2 = require("react/jsx-runtime");
      function FishMark({ size = 16, className }) {
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { width: size, height: size, viewBox: "0 0 36 36", fill: "none", "aria-hidden": "true", className, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("linearGradient", { id: "dsh-fishpai-mark", x1: "7", y1: "10", x2: "29", y2: "26", gradientUnits: "userSpaceOnUse", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("stop", { stopColor: "#7FA0FF" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("stop", { offset: "1", stopColor: "#3B54C9" })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("g", { transform: "translate(18 18) scale(1.3) translate(-18 -18)", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "path",
              {
                d: "M7.5 18C9.348 13.56 13.044 10.785 17.748 10.785C20.94 10.785 23.292 12.45 24.804 14.67L28.5 11.34L26.316 18L28.5 24.66L24.804 21.33C23.292 23.55 20.94 25.215 17.748 25.215C13.044 25.215 9.348 22.44 7.5 18Z",
                stroke: "url(#dsh-fishpai-mark)",
                strokeWidth: "2",
                strokeLinejoin: "round",
                strokeLinecap: "round"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "12.2", cy: "16.5", r: "1.3", fill: "url(#dsh-fishpai-mark)" })
          ] })
        ] });
      }
      var THEME_GLYPH = {
        default: ListPenGlyph,
        // 排版：默认公众号就是给微信做的那套
        elegant: SparkleGlyph,
        // 优雅简约
        deep_read: ThinkGlyph,
        // 深度阅读
        nyt: BrowseGlyph,
        // 纽约时报（版面）
        apple: LightGlyph,
        // Apple 极简（明亮、留白）
        claude: AgentPresetGlyph,
        // Claude（对话助手）
        sspai: PersonalizationGlyph,
        // 少数派（个性）
        bamboo: BranchGlyph,
        // 竹林（枝叶）
        tech: CodeGlyph,
        // 技术风格（代码）
        dark_night: DarkGlyph,
        // 暗夜模式
        gradient: EnhanceGlyph,
        // 渐变彩虹（增色）
        // 「自定义主题」：工作目录里那**一套**模型生成的主题，图标固定这一个。
        custom: EditGlyph
      };
      function ThemeGlyph({ themeKey, size = 16, className }) {
        const Icon = THEME_GLYPH[themeKey];
        if (!Icon) return null;
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, { size, className });
      }
      function CaretGlyph({ size = 14, className }) {
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ChevronDownGlyph, { size, className });
      }
      function TickGlyph({ size = 14, className }) {
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CheckGlyph, { size, className });
      }

      // client/panel.tsx
      var import_jsx_runtime3 = require("react/jsx-runtime");
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
      var KIND_LABEL = {
        heading: "标题",
        paragraph: "正文",
        list: "列表",
        blockquote: "引用",
        table: "表格",
        code: "代码块",
        card: "信息卡片",
        hr: "分隔线",
        html: "原始 HTML"
      };
      function kindLabel(kind, fallback = "块") {
        if (!kind) return fallback;
        return KIND_LABEL[kind] || kind;
      }
      var FONT_LABEL = { sans: "黑体", serif: "衬线", mono: "等宽" };
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
        holder.replaceChildren(sanitizeHtmlFragment(html));
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
      function imageFiles(data) {
        if (!data) return [];
        const out = [];
        const items = data.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind !== "file" || !/^image\//i.test(item.type)) continue;
            const file = item.getAsFile();
            if (file) out.push(file);
          }
        }
        if (!out.length && data.files) {
          for (let i = 0; i < data.files.length; i++) {
            const file = data.files[i];
            if (/^image\//i.test(file.type)) out.push(file);
          }
        }
        return out;
      }
      function Btn(props) {
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
      function BlankMark() {
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-blank-mark", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-blank-glyph", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(FishMark, { size: 15 }) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "鱼排编辑器" })
        ] });
      }
      function ThemePicker(props) {
        const { themes, value } = props;
        const [open, setOpen] = React.useState(false);
        const [active, setActive] = React.useState(0);
        const wrapRef = React.useRef(null);
        const menuRef = React.useRef(null);
        const btnRef = React.useRef(null);
        const customGroup = React.useMemo(() => {
          const custom = themes.filter((t) => t.key === "custom");
          if (!custom.length) return [];
          return [
            {
              key: "custom",
              label: "我的",
              note: custom[0].wechatSafe ? "" : "微信可能掉样式",
              risk: !custom[0].wechatSafe,
              items: custom
            }
          ];
        }, [themes]);
        const groups = React.useMemo(
          () => [
            ...customGroup,
            { key: "safe", label: "适合公众号", note: "", risk: false, items: themes.filter((t) => t.key !== "custom" && t.wechatSafe) },
            { key: "risky", label: "其它风格", note: "微信可能掉样式", risk: true, items: themes.filter((t) => t.key !== "custom" && !t.wechatSafe) }
          ],
          [themes, customGroup]
        );
        const flat = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);
        const current = flat.find((t) => t.key === value) || null;
        React.useEffect(() => {
          if (!open) return;
          const onDown = (event) => {
            if (!wrapRef.current || !wrapRef.current.contains(event.target)) setOpen(false);
          };
          document.addEventListener("mousedown", onDown);
          return () => document.removeEventListener("mousedown", onDown);
        }, [open]);
        const openMenu = () => {
          const index = flat.findIndex((t) => t.key === value);
          setActive(index < 0 ? 0 : index);
          setOpen(true);
        };
        const closeMenu = (refocus = false) => {
          setOpen(false);
          if (refocus) btnRef.current?.focus();
        };
        const commit = (key) => {
          if (key) props.onPick(key);
          closeMenu(true);
        };
        React.useEffect(() => {
          if (open) menuRef.current?.focus();
        }, [open]);
        const activeKey = flat[active] ? flat[active].key : void 0;
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-picker", ref: wrapRef, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "button",
            {
              ref: btnRef,
              type: "button",
              className: "fp-picker-btn",
              "aria-haspopup": "listbox",
              "aria-expanded": open,
              "aria-label": "主题",
              title: "主题：默认公众号是给微信做的；其它风格更适合导出 HTML",
              onClick: () => open ? setOpen(false) : openMenu(),
              onKeyDown: (event) => {
                if (open) return;
                if (event.key === "Escape" || event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openMenu();
                }
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ThemeGlyph, { themeKey: value, size: 14, className: "fp-picker-glyph" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-picker-label", children: current ? current.name : value }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(CaretGlyph, { className: "fp-picker-caret" })
              ]
            }
          ),
          open ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "div",
            {
              className: "fp-menu",
              role: "listbox",
              "aria-label": "主题",
              ref: menuRef,
              tabIndex: -1,
              "aria-activedescendant": activeKey ? `fp-theme-opt-${activeKey}` : void 0,
              onKeyDown: (event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeMenu(true);
                  return;
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const step = event.key === "ArrowDown" ? 1 : -1;
                  setActive((index) => flat.length ? (index + step + flat.length) % flat.length : 0);
                  return;
                }
                if (event.key === "Home" || event.key === "End") {
                  event.preventDefault();
                  setActive(event.key === "Home" ? 0 : Math.max(0, flat.length - 1));
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit(activeKey);
                }
              },
              children: groups.map((group) => (
                // role="presentation"：分组标题是排版用的，`<div>` 直接坐在 role="listbox" 里
                // 属于非法子节点（listbox 只允许 option 与分组）
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { role: "presentation", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-menu-group", role: "presentation", "data-risk": group.risk ? "true" : void 0, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-menu-group-title", children: group.label }),
                    group.note ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-menu-group-note", children: group.note }) : null,
                    group.key === "custom" && props.onDeleteCustom ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                      "button",
                      {
                        type: "button",
                        className: "fp-menu-x",
                        "aria-label": "删除自定义主题",
                        title: "删掉这一套自定义主题（当前文档会退回「默认公众号」）",
                        onClick: (event) => {
                          event.stopPropagation();
                          if (window.confirm("删掉「自定义主题」？当前文档会退回「默认公众号」。")) {
                            props.onDeleteCustom?.();
                          }
                        },
                        children: "×"
                      }
                    ) : null
                  ] }),
                  group.items.map((theme) => {
                    const index = flat.indexOf(theme);
                    const on = theme.key === value;
                    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
                      "button",
                      {
                        id: `fp-theme-opt-${theme.key}`,
                        type: "button",
                        role: "option",
                        tabIndex: -1,
                        "aria-selected": on,
                        className: "fp-menu-row",
                        "data-on": on ? "true" : void 0,
                        "data-active": index === active ? "true" : void 0,
                        title: theme.desc,
                        onMouseEnter: () => setActive(index),
                        onClick: () => commit(theme.key),
                        children: [
                          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ThemeGlyph, { themeKey: theme.key, size: 14, className: "fp-menu-glyph" }),
                          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-menu-name", children: theme.name }),
                          on ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(TickGlyph, { className: "fp-menu-tick" }) : null
                        ]
                      },
                      theme.key
                    );
                  })
                ] }, group.key)
              ))
            }
          ) : null
        ] });
      }
      function FontPicker(props) {
        const { fonts, value } = props;
        const [open, setOpen] = React.useState(false);
        const [active, setActive] = React.useState(0);
        const wrapRef = React.useRef(null);
        const menuRef = React.useRef(null);
        const btnRef = React.useRef(null);
        const groups = React.useMemo(() => {
          const safe = fonts.filter((f) => f === "sans");
          const exportOnly = fonts.filter((f) => f !== "sans");
          return [
            { key: "safe", label: "", note: "", risk: false, items: safe },
            { key: "export", label: "", note: "仅用于导出 HTML", risk: true, items: exportOnly }
          ].filter((g) => g.items.length);
        }, [fonts]);
        const flat = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);
        const current = flat.includes(value) ? value : flat[0];
        React.useEffect(() => {
          if (!open) return;
          const onDown = (event) => {
            if (!wrapRef.current || !wrapRef.current.contains(event.target)) setOpen(false);
          };
          document.addEventListener("mousedown", onDown);
          return () => document.removeEventListener("mousedown", onDown);
        }, [open]);
        const openMenu = () => {
          const index = flat.indexOf(current);
          setActive(index < 0 ? 0 : index);
          setOpen(true);
        };
        const closeMenu = (refocus = false) => {
          setOpen(false);
          if (refocus) btnRef.current?.focus();
        };
        const commit = (font) => {
          if (font) props.onPick(font);
          closeMenu(true);
        };
        React.useEffect(() => {
          if (open) menuRef.current?.focus();
        }, [open]);
        const activeFont = flat[active];
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-picker", ref: wrapRef, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "button",
            {
              ref: btnRef,
              type: "button",
              className: "fp-picker-btn",
              "aria-haspopup": "listbox",
              "aria-expanded": open,
              "aria-label": "字体",
              title: "正文字体：公众号编辑器只认黑体（iOS 设备上才是苹方），衬线/等宽只在「导出 HTML」里有效；它会覆盖主题自带的字体栈（站点既有行为，不是 bug）",
              onClick: () => open ? setOpen(false) : openMenu(),
              onKeyDown: (event) => {
                if (open) return;
                if (event.key === "Escape" || event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openMenu();
                }
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-picker-label", children: FONT_LABEL[current] || current }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(CaretGlyph, { className: "fp-picker-caret" })
              ]
            }
          ),
          open ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "div",
            {
              className: "fp-menu",
              role: "listbox",
              "aria-label": "字体",
              ref: menuRef,
              tabIndex: -1,
              "aria-activedescendant": activeFont ? `fp-font-opt-${activeFont}` : void 0,
              onKeyDown: (event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeMenu(true);
                  return;
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const step = event.key === "ArrowDown" ? 1 : -1;
                  setActive((index) => flat.length ? (index + step + flat.length) % flat.length : 0);
                  return;
                }
                if (event.key === "Home" || event.key === "End") {
                  event.preventDefault();
                  setActive(event.key === "Home" ? 0 : Math.max(0, flat.length - 1));
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit(activeFont);
                }
              },
              children: groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { role: "presentation", children: [
                group.label || group.note ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-menu-group", role: "presentation", "data-risk": group.risk ? "true" : void 0, children: [
                  group.label ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-menu-group-title", children: group.label }) : null,
                  group.note ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-menu-group-note", children: group.note }) : null
                ] }) : null,
                group.items.map((font) => {
                  const index = flat.indexOf(font);
                  const on = font === value;
                  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
                    "button",
                    {
                      id: `fp-font-opt-${font}`,
                      type: "button",
                      role: "option",
                      tabIndex: -1,
                      "aria-selected": on,
                      className: "fp-menu-row",
                      "data-on": on ? "true" : void 0,
                      "data-active": index === active ? "true" : void 0,
                      title: font === "sans" ? "公众号编辑器里能正常显示" : "只在「导出 HTML」里有效，粘进公众号会退回黑体",
                      onMouseEnter: () => setActive(index),
                      onClick: () => commit(font),
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-menu-name", children: FONT_LABEL[font] || font }),
                        on ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(TickGlyph, { className: "fp-menu-tick" }) : null
                      ]
                    },
                    font
                  );
                })
              ] }, group.key))
            }
          ) : null
        ] });
      }
      function Panel(props) {
        const { store, sessionId } = props;
        const state = (0, import_react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
        const [mode, setMode] = React.useState("side");
        const [tab, setTab] = React.useState("notes");
        const [noteDraft, setNoteDraft] = React.useState("");
        const [narrow, setNarrow] = React.useState(false);
        const [riskDismissed, setRiskDismissed] = React.useState(null);
        const rootRef = React.useRef(null);
        const iframeRef = React.useRef(null);
        const editorRef = React.useRef(null);
        const lastVisible = React.useRef(null);
        const noteInputRef = React.useRef(null);
        React.useEffect(() => {
          void store.actions.init();
        }, [store]);
        React.useEffect(() => {
          setRiskDismissed(null);
        }, [state.meta.theme]);
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
        const [pendingJump, setPendingJump] = React.useState(null);
        const applyJump = React.useCallback(
          (target) => {
            const el = editorRef.current;
            if (!el) return false;
            el.focus();
            el.setSelectionRange(target.start, target.end);
            store.actions.setCaret(target.line);
            el.scrollTop = target.start / Math.max(1, state.markdown.length) * el.scrollHeight;
            return true;
          },
          [store, state.markdown.length]
        );
        const jumpTo = React.useCallback(
          (target) => {
            if (applyJump(target)) return;
            setPendingJump(target);
            setMode((current) => current === "preview" ? narrow ? "edit" : "side" : current);
          },
          [applyJump, narrow]
        );
        React.useEffect(() => {
          if (!pendingJump) return;
          if (applyJump(pendingJump)) setPendingJump(null);
        }, [pendingJump, mode, applyJump]);
        const lineOffset = (line) => {
          const lines = state.markdown.split("\n");
          return lines.slice(0, Math.max(0, line - 1)).reduce((acc, l) => acc + l.length + 1, 0);
        };
        const jumpToLine = (line) => {
          const offset = lineOffset(line);
          jumpTo({ start: offset, end: offset, line });
        };
        const jumpToNote = (note) => {
          const markdown = state.markdown;
          const quote = note.quote || "";
          const start = quote ? markdown.indexOf(quote) : -1;
          if (start >= 0) {
            jumpTo({ start, end: start + quote.length, line: markdown.slice(0, start).split("\n").length });
            return;
          }
          const block = note.blockIndex === null || note.blockIndex === void 0 ? null : state.blocks.find((b) => b.index === note.blockIndex) || state.blocks[note.blockIndex] || null;
          if (block) {
            jumpToLine(block.startLine);
            store.actions.toast("引用片段已被改写，已定位到它原来所在的块");
            return;
          }
          store.actions.toast("这条批注引用的文字已经不在正文里了", "error");
        };
        const layout = mode === "side" && !narrow ? "side" : "stack";
        const showEditor = mode !== "preview";
        const showPreview = mode !== "edit" || layout === "side";
        const openNotes = state.notes.filter((n) => !n.resolved);
        const currentTheme = state.themes.find((t) => t.key === state.meta.theme) || null;
        const docHasLinks = state.linkCount !== 0;
        const docHasCode = state.hasCode !== false;
        const manualImages = state.images.filter((i) => !i.embed);
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
            store.actions.toast(`复制失败：${error.message}　可以改用旁边的「导出 HTML」拿文件`, "error");
          }
        };
        const onExport = async () => {
          try {
            const html = await store.actions.publishHtml();
            const base = (state.title || "article").replace(/[\\/:*?"<>|]/g, "");
            download(`${base}.html`, html);
            store.actions.toast(`已导出 ${base}.html`);
          } catch (error) {
            store.actions.toast(`导出失败：${error.message}　可以改用「复制到公众号」`, "error");
          }
        };
        const onAddNote = async () => {
          const text = noteDraft.trim();
          if (!text) return;
          const added = await store.actions.addNote(text);
          if (added) setNoteDraft("");
        };
        if (state.status === "loading") {
          return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-root", ref: rootRef, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-blank", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-blank-card", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(BlankMark, {}),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-blank-line fp-muted", children: "正在打开文档…" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-loading-bar" })
          ] }) }) });
        }
        if (state.status === "error" && !state.docKey) {
          return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-root", ref: rootRef, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-blank", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-blank-card", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(BlankMark, {}),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-blank-line", children: [
              "面板没能载入：",
              state.error
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-blank-actions", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { primary: true, onClick: () => void store.actions.init(), children: "重试" }) })
          ] }) }) });
        }
        if (state.status === "empty" || !state.docKey) {
          return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-root", ref: rootRef, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-blank", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-blank-card", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(BlankMark, {}),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-blank-line fp-muted", children: [
              "这个会话还没有鱼排文档。可以让模型调用 ",
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { children: "fishpai_open" }),
              " 打开一篇 Markdown， 也可以自己先起一篇："
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-blank-actions", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { primary: true, onClick: () => void store.actions.createDoc(), children: "新建空白文档" }) }),
            state.docs.length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-doclist", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-doclist-head", children: "最近打开" }),
              state.docs.slice(0, 6).map((d) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
                "button",
                {
                  type: "button",
                  className: "fp-docrow",
                  title: d.path,
                  onClick: () => void store.actions.openDocByKey(d.key),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-docrow-title", children: d.title || "未命名" }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-spacer" }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-muted", children: fmtTime(d.updatedAt) })
                  ]
                },
                d.key
              ))
            ] }) : null
          ] }) }) });
        }
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-root", "data-narrow": narrow ? "true" : "false", ref: rootRef, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-toolbar", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-seg", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { on: mode === "edit", onClick: () => setMode("edit"), title: "只看源码", children: "编辑" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { on: mode === "preview", onClick: () => setMode("preview"), title: "只看公众号效果", children: "预览" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { on: mode === "side", disabled: narrow, onClick: () => setMode("side"), title: narrow ? "栏位太窄，拉宽后可用并排" : "左右并排", children: "并排" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                Btn,
                {
                  on: state.meta.mobile,
                  disabled: mode === "edit",
                  onClick: () => store.actions.setMeta({ mobile: !state.meta.mobile }),
                  title: mode === "edit" ? "现在是「编辑」视图，看不到预览；切到「预览」或「并排」才看得出手机宽度的效果" : "按手机宽度预览（375px）",
                  children: "手机"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-spacer" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "fp-actions", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { title: "重新载入文档（有未保存的改动会先保存，不会丢字）", onClick: () => void store.actions.reloadSafely(), children: "刷新" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { primary: true, title: "下载「复制到公众号」形态的自包含 HTML 文件（本地图片已内嵌 base64）", onClick: () => void onExport(), children: "导出 HTML" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { primary: true, title: `复制后直接粘进公众号编辑器（${COPY_HINT}）`, onClick: () => void onCopy(), children: "复制到公众号" })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                ThemePicker,
                {
                  themes: state.themes,
                  value: state.meta.theme,
                  onPick: (key) => void store.actions.setMeta({ theme: key }),
                  onDeleteCustom: () => void store.actions.clearCustomTheme()
                }
              ),
              currentTheme?.usesAccent ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-swatches", title: "主题色", children: [
                state.presets.map((p) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  "input",
                  {
                    className: "fp-color",
                    type: "color",
                    title: "自定义主题色",
                    value: state.meta.color || "#4f6ef7",
                    onChange: (e) => void store.actions.setMeta({ color: e.target.value })
                  }
                )
              ] }) : null,
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                FontPicker,
                {
                  fonts: state.fonts,
                  value: state.meta.font,
                  onPick: (font) => void store.actions.setMeta({ font })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "select",
                {
                  className: "fp-select",
                  value: state.meta.fontSize,
                  title: "正文字号",
                  onChange: (e) => void store.actions.setMeta({ fontSize: e.target.value }),
                  children: state.sizes.map((s) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: s, children: s }, s))
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                Btn,
                {
                  on: state.meta.footnotes,
                  disabled: !docHasLinks,
                  title: docHasLinks ? "正文外链转文末「参考资料」（微信正文不支持外链）" : "正文里没有外链，这个开关现在不影响效果；它的作用是：把正文外链转成文末「参考资料」（微信正文不支持外链）",
                  onClick: () => void store.actions.setMeta({ footnotes: !state.meta.footnotes }),
                  children: "脚注"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                Btn,
                {
                  on: state.meta.macCodeBlock,
                  disabled: !docHasCode,
                  title: docHasCode ? "代码块用 mac 标题栏形态（红黄绿圆点 + 语言标签）" : "正文里没有代码块，这个开关现在不影响效果；它的作用是：给代码块加 mac 标题栏形态",
                  onClick: () => void store.actions.setMeta({ macCodeBlock: !state.meta.macCodeBlock }),
                  children: "Mac 代码框"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                Btn,
                {
                  title: "在下方「批注」里写一句给模型的话（会挂在光标所在段落上）",
                  onClick: () => {
                    setTab("notes");
                    requestAnimationFrame(() => noteInputRef.current?.focus());
                  },
                  children: "＋批注"
                }
              )
            ] })
          ] }),
          currentTheme && !currentTheme.wechatSafe && riskDismissed !== currentTheme.key ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-banner", "data-kind": "warn", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
              currentTheme.gradientText ? `「${currentTheme.name}」用渐变文字（background-clip: text + 透明字色），微信编辑器可能丢掉渐变导致标题异常。` : `「${currentTheme.name}」是深色底，粘进公众号会是一整块深色。`,
              "建议用「导出」拿 HTML，或换回「默认公众号」。"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-spacer" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "button",
              {
                type: "button",
                className: "fp-banner-x",
                "aria-label": "关掉这条提示",
                title: "关掉这条提示（切回这套主题时会再出现）",
                onClick: () => setRiskDismissed(currentTheme.key),
                children: "×"
              }
            )
          ] }) : null,
          state.error ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-banner", "data-kind": "error", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: state.error }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-spacer" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { onClick: () => void store.actions.reloadSafely(), children: "重试" })
          ] }) : null,
          state.external ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-banner", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: state.external.reason === "switch" ? "模型打开了另一篇文档，你这里有没保存的改动。" : `AI 更新了文档（rev ${state.external.revision}），你这里有没保存的改动。` }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-spacer" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { onClick: () => void store.actions.acceptExternal(), children: state.external.reason === "switch" ? "切到新文档" : "看 AI 的版本" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { onClick: () => void store.actions.flush(), children: "保留我的" })
          ] }) : null,
          state.conflict ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-banner", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
              "文档已被改动（服务端 rev ",
              state.conflict.revision,
              "），你的编辑还在编辑器里。"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-spacer" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { onClick: () => void store.actions.resolveConflict("theirs"), children: "采用 AI 的（先把我的存进历史）" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { primary: true, onClick: () => void store.actions.resolveConflict("mine"), children: "用我的覆盖" })
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-main", "data-layout": layout, children: [
            showEditor ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              Editor,
              {
                pane: true,
                editorRef,
                value: state.markdown,
                onChange: (text) => store.actions.setMarkdown(text),
                onCaret: (line) => store.actions.setCaret(line),
                onSave: () => void store.actions.flush(),
                onCopy: () => void onCopy(),
                upload: (file) => store.actions.uploadImage(file),
                toast: (text, kind) => store.actions.toast(text, kind),
                currentBlock: state.blocks.find((b) => b.startLine <= state.caretLine && state.caretLine <= b.endLine) || null
              }
            ) : null,
            showPreview ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              Preview,
              {
                pane: true,
                iframeRef,
                html: state.previewHtml,
                imageMap: state.imageMap,
                hljsCss: state.hljsCss,
                mobile: state.meta.mobile,
                previewing: state.previewing,
                themeName: state.themeName,
                onLoad: restoreScroll
              }
            ) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
              noteInputRef,
              onAddNote: () => void onAddNote(),
              onResolve: (id) => void store.actions.updateNote(id, { resolved: true }),
              onRemove: (id) => void store.actions.removeNote(id),
              onJump: jumpToLine,
              onJumpNote: jumpToNote,
              onRestore: (id, label) => void store.actions.restore(id, label)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-status", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
              countWords(state.markdown),
              " 字"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
              "约 ",
              readingMinutes(state.markdown),
              " 分钟"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
              "rev ",
              state.revision
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: state.saving ? "保存中…" : state.dirty ? "未保存" : "已保存" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-spacer" }),
            state.images.length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
              "span",
              {
                className: manualImages.length ? "fp-warn" : void 0,
                title: manualImages.length ? `这些图不会被内嵌，粘进公众号后要在编辑器里手动上传：
      ${manualImages.map((i) => i.src).join("\n")}` : "本地图会内嵌成 base64，复制到公众号时跟着一起过去，不用手动重传",
                children: [
                  "图片 ",
                  state.images.length,
                  manualImages.length ? `（${manualImages.length} 需手动上传）` : ""
                ]
              }
            ) : null,
            state.placeholders.length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "fp-warn", children: [
              "待补 ",
              state.placeholders.length
            ] }) : null,
            openNotes.length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
              "批注 ",
              openNotes.length
            ] }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "fp-muted", title: currentTheme ? currentTheme.desc : void 0, children: [
              state.themeName,
              currentTheme ? ` · ${currentTheme.wechatSafe && state.meta.font === "sans" ? "适合微信" : "导出 HTML 更稳"}` : ""
            ] })
          ] }),
          state.toast ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-toast", "data-kind": state.toast.kind, children: state.toast.text }) : null
        ] });
      }
      function KeySheet(props) {
        const { wrapRef, onClose } = props;
        React.useEffect(() => {
          const onDown = (event) => {
            if (!wrapRef.current || !wrapRef.current.contains(event.target)) onClose();
          };
          const onKey = (event) => {
            if (event.key === "Escape") onClose();
          };
          document.addEventListener("mousedown", onDown);
          document.addEventListener("keydown", onKey);
          return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
          };
        }, [wrapRef, onClose]);
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-keys", role: "dialog", "aria-label": "快捷键", children: [
          ["编辑", "面板"].map((group) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-keys-group", children: group }),
            SHORTCUTS.filter((s) => s.group === group).map((spec) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-keys-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: spec.label }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-spacer" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("kbd", { className: "fp-kbd", children: shortcutHint(spec, IS_MAC) })
            ] }, spec.id))
          ] }, group)),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-keys-note", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("kbd", { className: "fp-kbd", children: "Tab" }),
              " / ",
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("kbd", { className: "fp-kbd", children: IS_MAC ? "⇧Tab" : "Shift+Tab" }),
              " 缩进、反缩进（列表里正好用）"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("kbd", { className: "fp-kbd", children: "Enter" }),
              " 在列表或引用里自动接着写下一项；空条目再按一次就退出"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
              "截图或图片文件直接 ",
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("kbd", { className: "fp-kbd", children: IS_MAC ? "⌘V" : "Ctrl+V" }),
              " 粘进来，也可以拖进编辑器"
            ] })
          ] })
        ] });
      }
      function Editor(props) {
        const { editorRef } = props;
        const [sheet, setSheet] = React.useState(false);
        const keysRef = React.useRef(null);
        const closeSheet = React.useCallback(() => setSheet(false), []);
        const caretOf = (el) => el.value.slice(0, el.selectionStart || 0).split("\n").length;
        const applyEdit = (edit) => {
          const el = editorRef.current;
          if (!el) return;
          const current = el.value;
          const slice = current.slice(edit.from, edit.to);
          if (edit.insert === slice && edit.start === edit.from && edit.end === edit.to) return;
          el.focus();
          el.setSelectionRange(edit.from, edit.to);
          let handled = false;
          try {
            handled = document.execCommand("insertText", false, edit.insert);
          } catch {
            handled = false;
          }
          if (!handled) props.onChange(current.slice(0, edit.from) + edit.insert + current.slice(edit.to));
          requestAnimationFrame(() => {
            if (editorRef.current !== el) return;
            el.setSelectionRange(edit.start, edit.end);
            props.onCaret(caretOf(el));
          });
        };
        const insertImages = async (files) => {
          const el = editorRef.current;
          if (!el) return;
          let saved = 0;
          for (const file of files) {
            try {
              const { src } = await props.upload(file);
              const snippet = `![](${src})`;
              const at = el.selectionStart;
              applyEdit({ from: at, to: el.selectionEnd, insert: snippet, start: at + snippet.length, end: at + snippet.length });
              saved += 1;
            } catch (error) {
              props.toast(`图片没能存进来：${error.message}`, "error");
            }
          }
          if (saved) props.toast(`已插入 ${saved} 张图片（存在文档同级的 assets/ 里）`);
        };
        const onKeyDown = (event) => {
          const el = event.currentTarget;
          if (event.key === "Tab") {
            event.preventDefault();
            const edit = event.shiftKey ? outdentSelection(el.value, el.selectionStart, el.selectionEnd) : indentSelection(el.value, el.selectionStart, el.selectionEnd);
            if (edit) applyEdit(edit);
            return;
          }
          if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
            const edit = continueList(el.value, el.selectionStart, el.selectionEnd);
            if (edit) {
              event.preventDefault();
              applyEdit(edit);
            }
            return;
          }
          const hit = matchShortcut(event);
          if (!hit) return;
          event.preventDefault();
          if (hit.id === "save") {
            props.onSave();
            return;
          }
          if (hit.id === "copy") {
            props.onCopy();
            return;
          }
          applyEdit(applyAction(hit.id, el.value, el.selectionStart, el.selectionEnd));
        };
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-pane", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-pane-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "Markdown 源码" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-spacer" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-muted", children: props.currentBlock ? `${kindLabel(props.currentBlock.kind)} · 第 ${props.currentBlock.startLine} 行` : "未在块内" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "fp-keys-wrap", ref: keysRef, children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "button",
                {
                  type: "button",
                  className: "fp-keys-btn",
                  "data-on": sheet ? "true" : void 0,
                  "aria-expanded": sheet,
                  title: "快捷键：加粗、标题、列表、粘贴图片…",
                  onClick: () => setSheet((open) => !open),
                  children: "快捷键"
                }
              ),
              sheet ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(KeySheet, { wrapRef: keysRef, onClose: closeSheet }) : null
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "textarea",
            {
              ref: editorRef,
              className: "fp-editor",
              spellCheck: false,
              value: props.value,
              onChange: (e) => {
                props.onChange(e.target.value);
                props.onCaret(caretOf(e.target));
              },
              onClick: (e) => props.onCaret(caretOf(e.currentTarget)),
              onKeyUp: (e) => props.onCaret(caretOf(e.currentTarget)),
              onKeyDown,
              onPaste: (e) => {
                const files = imageFiles(e.clipboardData);
                if (!files.length) return;
                if ((e.clipboardData?.getData("text/plain") || "") !== "") return;
                e.preventDefault();
                void insertImages(files);
              },
              onDragOver: (e) => {
                if (e.dataTransfer) e.preventDefault();
              },
              onDrop: (e) => {
                const files = imageFiles(e.dataTransfer);
                if (!files.length) return;
                e.preventDefault();
                void insertImages(files);
              }
            }
          )
        ] });
      }
      function Preview(props) {
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-pane", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-pane-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "公众号预览" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-spacer" }),
            props.previewing ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "渲染中…" }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-muted", children: props.themeName })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-preview-wrap", children: props.html ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "iframe",
            {
              ref: props.iframeRef,
              className: "fp-preview",
              title: "公众号预览",
              sandbox: "allow-scripts",
              "data-mobile": props.mobile ? "true" : "false",
              srcDoc: buildSrcdoc(props.html, props.imageMap, props.hljsCss),
              onLoad: props.onLoad
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-preview-empty", children: "还没有内容" }) })
        ] });
      }
      function Drawer(props) {
        const open = props.notes.filter((n) => !n.resolved);
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-drawer", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-drawer-tabs", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Btn, { on: props.tab === "notes", onClick: () => props.setTab("notes"), children: [
              "批注 ",
              open.length || ""
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Btn, { on: props.tab === "todo", onClick: () => props.setTab("todo"), children: [
              "待补 ",
              props.placeholders.length || ""
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Btn, { on: props.tab === "blocks", onClick: () => props.setTab("blocks"), children: [
              "块 ",
              props.blocks.length
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { on: props.tab === "history", onClick: () => props.setTab("history"), children: "历史" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-drawer-body", children: [
            props.tab === "notes" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-compose", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  "textarea",
                  {
                    ref: props.noteInputRef,
                    placeholder: "给光标所在段落留一条批注…（模型下次读文档时会看到）",
                    value: props.noteDraft,
                    onChange: (e) => props.setNoteDraft(e.target.value),
                    onKeyDown: (e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") props.onAddNote();
                    }
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-row", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "fp-muted", children: [
                    MOD_KEY,
                    " + Enter 添加"
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-spacer" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { primary: true, disabled: !props.noteDraft.trim(), onClick: props.onAddNote, children: "添加批注" })
                ] })
              ] }),
              props.notes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-empty", children: "还没有批注。" }) : null,
              props.notes.map((n) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-item", "data-orphan": n.orphan ? "true" : void 0, children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-item-head", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: n.orphan ? "锚点已失效" : n.blockIndex === null || n.blockIndex === void 0 ? "第 ? 块" : `第 ${n.blockIndex + 1} 块` }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: fmtTime(n.at) }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-spacer" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { onClick: () => props.onJumpNote(n), title: "跳到引用它的那段并选中", children: "定位" }),
                  n.orphan ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { onClick: () => props.onResolve(n.id), children: n.resolved ? "已解决" : "标记解决" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { onClick: () => props.onRemove(n.id), children: "删除" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-item-text", children: n.text }),
                n.quote ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-quote", children: n.quote.slice(0, 120) }) : null
              ] }, n.id))
            ] }) : null,
            props.tab === "todo" ? props.placeholders.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-empty", children: [
              "没有待补占位。在正文里写 ",
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { children: "<!-- 鱼排: 这里补一句 -->" }),
              " 即可。"
            ] }) : props.placeholders.map((p) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-item", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-item-head", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
                  "第 ",
                  p.line,
                  " 行"
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-spacer" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { onClick: () => props.onJump(p.line), children: "定位" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-item-text", children: p.text })
            ] }, `${p.line}-${p.col}`)) : null,
            props.tab === "blocks" ? props.blocks.map((b) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-item", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-item-head", title: `block_id: ${b.id}`, children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
                  "第 ",
                  b.index + 1,
                  " 块"
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: kindLabel(b.kind) }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
                  "第 ",
                  b.startLine,
                  " 行"
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-spacer" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { onClick: () => props.onJump(b.startLine), children: "定位" })
              ] }),
              b.preview ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-item-text", children: b.preview }) : null
            ] }, b.id)) : null,
            props.tab === "history" ? props.history.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-empty", children: "还没有历史版本。" }) : props.history.map((h) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fp-item", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fp-item-head", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
                "rev ",
                h.rev
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: h.by === "ai" ? "模型" : h.by === "human" ? "你" : h.by }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: fmtTime(h.at) }),
              h.label ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: h.label }) : null,
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fp-spacer" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Btn, { onClick: () => props.onRestore(h.id, `rev ${h.rev}${h.label ? `（${h.label}）` : ""}`), children: "回滚到这一版" })
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
        position:relative;
        display:flex;flex-direction:column;gap:1px;
        padding:6px 6px 3px;font-size:11px;line-height:1.45;color:var(--dsw-alias-label-secondary);
      }
      .fp-menu-group-title{font-weight:500}
      .fp-menu-group-note{font-size:10px;color:var(--dsw-alias-label-secondary);opacity:.8}
      /* 「我的」那一组右边的删除按钮：只有这一组能删（自定义主题只有一套） */
      .fp-menu-x{
        position:absolute;top:4px;right:4px;font:inherit;font-size:12px;line-height:1;
        padding:2px 5px;cursor:pointer;color:var(--dsw-alias-label-secondary);
        background:transparent;border:0;border-radius:4px;
      }
      .fp-menu-x:hover{color:var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-interactive-bg-hover)}
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
      /* 品牌标：鱼形图标放在一块小方瓦里。标自带渐变（与侧边栏、插件列表磁贴同一份图），
         方瓦的底色与描边只用令牌，深浅色通吃 */
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
         （这里是模板字符串里，注释别用反引号——会把字符串闭合掉。） */
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
           表现就是"快捷键标签全被切掉、只剩右边一排键帽"。 */
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
      function currentSessionId(ctx, readMounted) {
        try {
          const sessions = service(ctx, "sessions");
          const snapshot = sessions?.list?.getSnapshot?.();
          if (snapshot?.current) return snapshot.current;
          const mounted = readMounted?.() || null;
          if (mounted) return mounted;
          if (Array.isArray(snapshot?.ids) && snapshot.ids.length === 1) return snapshot.ids[0];
          return null;
        } catch {
          return null;
        }
      }
      function apply(ctx) {
        const stores = /* @__PURE__ */ new Map();
        const disposeStyles = ensureStyles();
        ctx.effect(() => () => disposeStyles(), "fishpai: 面板样式");
        let getMountedSession = null;
        const readMounted = () => {
          try {
            return getMountedSession ? getMountedSession() : null;
          } catch {
            return null;
          }
        };
        const storeFor = (sessionId) => {
          let store = stores.get(sessionId);
          if (!store) {
            store = createFishpaiStore(sessionId);
            stores.set(sessionId, store);
          }
          return store;
        };
        function PanelHost(props) {
          const sessionId = props?.sessionId || currentSessionId(ctx, readMounted);
          const store = React2.useMemo(() => sessionId ? storeFor(sessionId) : null, [sessionId]);
          if (!sessionId || !store) {
            return React2.createElement("div", { className: "fp-root" }, "鱼排：拿不到当前会话，请在一个会话里打开。");
          }
          return React2.createElement(Panel, { store, sessionId });
        }
        function Title() {
          return React2.createElement(
            "span",
            { className: "fp-title-label" },
            React2.createElement(FishMark, { size: 14, className: "fp-title-glyph" }),
            "鱼排编辑器"
          );
        }
        let openOfficial = null;
        const openPanel = () => {
          if (!openOfficial) throw new Error("官方右侧栏尚未就绪");
          openOfficial();
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
        let seatHandle = null;
        try {
          seatHandle = ctx.inject(["sidebarRightTabs", "sidebarRight"], (injected) => {
            const tabs = pick(injected, "sidebarRightTabs");
            const sidebarRight = pick(injected, "sidebarRight");
            getMountedSession = () => {
              try {
                return sidebarRight?.mounted?.getSnapshot?.() || null;
              } catch {
                return null;
              }
            };
            if (!tabs || typeof tabs.register !== "function") return;
            const disposers = [];
            disposers.push(
              tabs.register({
                id: TAB_ID,
                kind: TAB_KIND,
                priority: "extension",
                title: () => "鱼排编辑器",
                guide: [
                  {
                    // 0.1.7 起 guide 条目契约要求稳定 id（注册时的唯一性检查与渲染 key 都按它走）；
                    // 旧版注册处不读这个字段，多了无害。
                    id: "editor",
                    order: 45,
                    title: () => "鱼排编辑器",
                    description: () => "公众号排版：Markdown + 实时预览 + 与模型来回改稿",
                    // 不给 icon 的话，新标签页的引导列表画一个默认的立方体占位（就是"看着像缺图标"的那个）
                    icon: FishMark
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
            const dispose = () => {
              for (const off of disposers.reverse()) {
                try {
                  off();
                } catch {
                }
              }
              openOfficial = null;
              getMountedSession = null;
            };
            return dispose;
          });
        } catch (error) {
          console.warn("[dsh-fishpai] 官方右侧栏席位注入失败：", error);
        }
        ctx.effect(() => {
          let stopped = false;
          let warned = false;
          let lastRevision = -1;
          let lastKey = null;
          let lastTheme = "";
          let lastSession = "";
          const seenSessions = /* @__PURE__ */ new Set();
          const tick = async () => {
            if (stopped || typeof document !== "undefined" && document.visibilityState === "hidden") return;
            const sessionId = currentSessionId(ctx, readMounted);
            if (!sessionId) return;
            try {
              const st = await api.state(sessionId);
              warned = false;
              if (sessionId !== lastSession) {
                lastSession = sessionId;
                lastKey = null;
                lastRevision = -1;
                lastTheme = "";
              }
              if (st.openRequest && st.openRequest.key) {
                openIfRequested(sessionId, st.openRequest.key);
              }
              const activeKey = st.active ? st.active.key : null;
              const revision = st.active ? st.active.revision : -1;
              const themeKey = st.active ? st.active.theme : "";
              const firstPoll = !seenSessions.has(sessionId);
              seenSessions.add(sessionId);
              const switched = activeKey !== lastKey || revision !== lastRevision || themeKey !== lastTheme;
              lastKey = activeKey;
              lastRevision = revision;
              lastTheme = themeKey;
              const store = stores.get(sessionId);
              if (store && switched && !firstPoll && activeKey) void store.actions.onActiveDoc(activeKey, revision, themeKey);
            } catch (error) {
              if (!warned) {
                warned = true;
                console.warn("[dsh-fishpai] 轮询失败（宿主路由可能尚未就绪）：", error);
              }
            }
          };
          const timer = setInterval(() => void tick(), POLL_MS);
          void tick();
          return async () => {
            stopped = true;
            clearInterval(timer);
            try {
              await seatHandle?.dispose?.();
            } catch {
            }
            for (const store of stores.values()) store.dispose();
            stores.clear();
          };
        }, "fishpai: 轮询与生命周期");
      }

    return module.exports;
  },
});
