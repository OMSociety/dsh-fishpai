import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';

const projectRoot = path.resolve(import.meta.dirname, '..');

function contentType(filePath) {
  const ext = path.extname(filePath);
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  }[ext] || 'application/octet-stream';
}

async function getFreePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  server.close();
  await once(server, 'close');
  return address.port;
}

async function startStaticServer() {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const safePath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.normalize(path.join(projectRoot, safePath));

    if (!filePath.startsWith(projectRoot)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error('Not a file');
      res.writeHead(200, { 'content-type': contentType(filePath) });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, port: server.address().port };
}

async function waitForJson(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const events = new Map();

  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    const listeners = events.get(message.method) || [];
    listeners.forEach(listener => listener(message.params));
  });

  return {
    async open() {
      await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', reject, { once: true });
      });
    },
    send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    onceEvent(method) {
      return new Promise(resolve => {
        const listener = params => {
          const listeners = events.get(method) || [];
          events.set(method, listeners.filter(item => item !== listener));
          resolve(params);
        };
        events.set(method, [...(events.get(method) || []), listener]);
      });
    },
    close() {
      ws.close();
    },
  };
}

async function main() {
  const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const { server, port: appPort } = await startStaticServer();
  const cdpPort = await getFreePort();
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'mopai-publish-test-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${cdpPort}`,
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`);
    const page = targets.find(target => target.type === 'page');
    assert(page?.webSocketDebuggerUrl, 'Expected a Chrome page target');

    const cdp = createCdpClient(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const loaded = cdp.onceEvent('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/` });
    await loaded;

    await cdp.send('Runtime.evaluate', {
      expression: `
        new Promise((resolve, reject) => {
          const started = Date.now();
          const timer = setInterval(() => {
            if (document.querySelector('#preview-content h1') && document.querySelector('.export-dropdown-wrapper button')) {
              clearInterval(timer);
              resolve(true);
            } else if (Date.now() - started > 10000) {
              clearInterval(timer);
              reject(new Error('MoPai preview did not render'));
            }
          }, 100);
        })
      `,
      awaitPromise: true,
    });

    const result = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          window.__syncPostPayload = null;
          window.__copiedHtml = null;
          window.syncPost = post => { window.__syncPostPayload = post; };
          window.$syncer = {
            getAccounts: cb => cb([{ type: 'weixin', title: '测试公众号', checked: true }]),
            addTask: () => {},
          };
          Object.defineProperty(navigator, 'clipboard', {
            value: {
              write: async items => {
                const htmlBlob = await items[0].getType('text/html');
                window.__copiedHtml = await htmlBlob.text();
              },
              writeText: async text => { window.__copiedText = text; },
            },
            configurable: true,
          });
          document.querySelector('.export-dropdown-wrapper > button').click();
          await new Promise(resolve => setTimeout(resolve, 50));
          Array.from(document.querySelectorAll('.export-dropdown button'))
            .find(button => button.textContent.includes('分发到多平台'))
            .click();
          await new Promise(resolve => setTimeout(resolve, 300));
          return window.__syncPostPayload;
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const payload = result.result.value;
    assert(payload, 'Expected syncToMultiPlatform to call window.syncPost');
    assert.equal(payload.title, 'MoPai 墨排 V3');
    assert.match(payload.content, /<h1\b[^>]*style=/, 'Heading styles should stay inline');
    assert.match(payload.content, /<pre\b[^>]*style=/, 'Code blocks should stay styled inline');
    assert.doesNotMatch(payload.content, /mac-code-header|mac-dot|mac-code-block/, 'WechatSync HTML should not include Mac code chrome');
    assert.doesNotMatch(payload.content, /box-shadow|display:\s*flex/i, 'WechatSync HTML should avoid fragile decorative layout CSS');

    const publishCardResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          window.__syncPostPayload = null;
          window.__openedUrl = null;
          window.__copiedHtml = null;
          window.__syncTask = null;
          window.__syncStatusSeen = null;
          window.syncPost = post => { window.__syncPostPayload = post; };
          window.open = url => { window.__openedUrl = url; };
          window.$syncer = {
            getAccounts: cb => cb([
              { type: 'weixin', title: '测试公众号', checked: true },
              { type: 'toutiao', title: '测试头条', checked: true },
            ]),
            addTask: (task, statusHandler, cb) => {
              window.__syncTask = task;
              statusHandler({
                accounts: [{
                  type: 'weixin',
                  title: '测试公众号',
                  status: 'done',
                  editResp: { draftLink: 'https://mp.weixin.qq.com/draft/test' },
                }],
              });
              window.__syncStatusSeen = true;
              cb?.({ ok: true });
            },
          };
          Object.defineProperty(navigator, 'clipboard', {
            value: {
              write: async items => {
                const htmlBlob = await items[0].getType('text/html');
                window.__copiedHtml = await htmlBlob.text();
              },
              writeText: async text => { window.__copiedText = text; },
            },
            configurable: true,
          });
          Array.from(document.querySelectorAll('.header-btn'))
            .find(button => button.textContent.includes('发布'))
            .click();
          await new Promise(resolve => setTimeout(resolve, 50));
          Array.from(document.querySelectorAll('.publish-card'))
            .find(card => card.textContent.includes('今日头条'))
            .click();
          await new Promise(resolve => setTimeout(resolve, 700));
          const copiedHtml = window.__copiedHtml;
          Array.from(document.querySelectorAll('.publish-card'))
            .find(card => card.textContent.includes('微信公众号'))
            .click();
          await new Promise(resolve => setTimeout(resolve, 700));
          const statusNode = document.querySelector('.publish-status');
          const gridNode = document.querySelector('.publish-grid');
          return {
            syncPostPayload: window.__syncPostPayload,
            syncTask: window.__syncTask,
            syncStatusSeen: window.__syncStatusSeen,
            openedUrl: window.__openedUrl,
            copiedHtml,
            statusBeforeGrid: Boolean(statusNode && gridNode && (statusNode.compareDocumentPosition(gridNode) & Node.DOCUMENT_POSITION_FOLLOWING)),
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    assert.doesNotMatch(publishCardResult.result.value.copiedHtml, /mac-code-header|mac-dot|mac-code-block/, 'HTML platform cards should copy simplified rich HTML');
    assert.doesNotMatch(publishCardResult.result.value.copiedHtml, /box-shadow|display:\s*flex/i, 'HTML platform cards should avoid fragile decorative layout CSS');
    assert.equal(publishCardResult.result.value.syncPostPayload, null, 'WeChat publish card should not use the legacy SDK modal when $syncer is available');
    assert(publishCardResult.result.value.syncTask, 'WeChat publish card should submit through the injected $syncer bridge');
    assert.equal(publishCardResult.result.value.syncTask.accounts.length, 1);
    assert.equal(publishCardResult.result.value.syncTask.accounts[0].type, 'weixin');
    assert.match(publishCardResult.result.value.syncTask.post.content, /<h1\b[^>]*style=/, 'WeChat direct sync should keep simplified rich HTML');
    assert.doesNotMatch(publishCardResult.result.value.syncTask.post.content, /mac-code-header|mac-dot|mac-code-block/, 'WeChat direct sync should not include Mac code chrome');
    assert.equal(publishCardResult.result.value.syncStatusSeen, true);
    assert.equal(publishCardResult.result.value.openedUrl, 'https://mp.weixin.qq.com/draft/test');
    assert.notEqual(publishCardResult.result.value.openedUrl, 'https://mp.weixin.qq.com/');
    assert.equal(publishCardResult.result.value.statusBeforeGrid, true, 'Publish status should be visible above the platform grid after clicking WeChat');

    const missingBridgeResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          window.__syncPostPayload = null;
          window.__copiedHtml = null;
          delete window.$syncer;
          window.syncPost = post => { window.__syncPostPayload = post; };
          Object.defineProperty(navigator, 'clipboard', {
            value: {
              write: async items => {
                const htmlBlob = await items[0].getType('text/html');
                window.__copiedHtml = await htmlBlob.text();
              },
              writeText: async text => { window.__copiedText = text; },
            },
            configurable: true,
          });
          Array.from(document.querySelectorAll('.publish-card'))
            .find(card => card.textContent.includes('微信公众号'))
            .click();
          await new Promise(resolve => setTimeout(resolve, 1800));
          const status = document.querySelector('.publish-status')?.textContent || '';
          return {
            syncPostPayload: window.__syncPostPayload,
            copiedHtml: window.__copiedHtml,
            status,
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    assert.equal(missingBridgeResult.result.value.syncPostPayload, null, 'Missing $syncer should not open the legacy install-extension modal');
    assert.match(missingBridgeResult.result.value.copiedHtml, /<h1\b[^>]*style=/, 'Missing $syncer fallback should copy rich HTML');
    assert.match(missingBridgeResult.result.value.status, /扩展|注入|Chrome/, 'Missing $syncer fallback should explain the browser extension injection problem');

    cdp.close();
  } finally {
    chrome.kill('SIGTERM');
    await Promise.race([
      once(chrome, 'exit'),
      new Promise(resolve => setTimeout(resolve, 2000)),
    ]);
    server.close();
    await new Promise(resolve => server.once('close', resolve));
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
