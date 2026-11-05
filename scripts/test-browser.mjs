import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, mkdtemp, access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { build, createServer, preview } from "vite";

// Run test:package first: this fixture resolves the unpacked npm tarball.
const root = fileURLToPath(new URL("../build/package-test/", import.meta.url));
await access(resolve(root, "node_modules/aidl-parser/dist/wasm/aidl.wasm"));
await mkdir(root, { recursive: true });
await writeFile(
  resolve(root, "index.html"),
  '<script type="module" src="/browser-main.js"></script>',
);
await writeFile(
  resolve(root, "browser-worker.js"),
  `
self.onmessage = async ({data}) => {
  try {
    const {parseAidl} = await import('aidl-parser');
    self.postMessage({id:data.id, result:parseAidl(data.source)});
  } catch (error) { self.postMessage({id:data.id,error:String(error)}); }
};
`,
);
await writeFile(
  resolve(root, "browser-main.js"),
  `
globalThis.result = (async () => {
  const worker = new Worker(new URL('./browser-worker.js', import.meta.url), {type:'module'});
  const replies = new Promise((resolve,reject) => {
    const values=[];
    const timer=setTimeout(()=>reject(new Error('Worker requests hung')),15000);
    worker.onerror=event=>reject(new Error(event.message));
    worker.onmessage=({data})=>{ values.push(data); if(values.length===3) {clearTimeout(timer);resolve(values);} };
  });
  for(let id=0;id<3;id++) worker.postMessage({id,source:'interface I'+id+' {}'});
  let main;
  try {
    const [{parseAidl}, second] = await Promise.all([import('aidl-parser'), import('aidl-parser')]);
    main={same:parseAidl===second.parseAidl,result:parseAidl('interface Main {}')};
  } catch(error) {main={error:String(error)};}
  try {return {main,replies:await replies};} finally {worker.terminate();}
})();
`,
);

let failWasm = false;
let wasmRequests = 0;
const intercept = (server) => {
  server.middlewares.use((req, res, next) => {
    if (!req.url?.split("?")[0].endsWith(".wasm")) return next();
    wasmRequests++;
    res.setHeader("Cache-Control", "no-store");
    setTimeout(() => {
      if (failWasm) {
        res.statusCode = 503;
        res.end("Intentional WASM test failure");
      } else next();
    }, 250);
  });
};
const config = {
  root,
  configFile: false,
  logLevel: "warn",
  // test:package replaces the same package version in place between builds.
  optimizeDeps: { force: true },
  plugins: [
    {
      name: "wasm-test",
      configureServer: intercept,
      configurePreviewServer: intercept,
    },
  ],
  build: { target: "esnext", outDir: "browser-dist" },
  worker: { format: "es" },
  server: {
    host: "127.0.0.1",
    port: 0,
    watch: { ignored: ["**/browser-profile-*/**"] },
  },
  preview: { host: "127.0.0.1", port: 0 },
};
const executable =
  process.env.BROWSER_EXECUTABLE ??
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
await access(executable);
const profile = await mkdtemp(resolve(root, "browser-profile-"));
const browser = spawn(
  executable,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" },
);
let ws;
const pending = new Map();
let id = 0;
function call(method, params = {}) {
  const current = ++id;
  return new Promise((resolve, reject) => {
    pending.set(current, { resolve, reject });
    ws.send(JSON.stringify({ id: current, method, params }));
  });
}
let dev, production;
try {
  let port;
  for (let attempt = 0; attempt < 150; attempt++) {
    const text = await readFile(
      resolve(profile, "DevToolsActivePort"),
      "utf8",
    ).catch(() => null);
    if (text) {
      port = Number(text.split("\n")[0]);
      break;
    }
    await delay(100);
  }
  assert.ok(port, "Browser failed to start");
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(
    tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = ({ data }) => {
    const value = JSON.parse(data);
    const entry = pending.get(value.id);
    if (entry) {
      pending.delete(value.id);
      value.error ? entry.reject(value.error) : entry.resolve(value.result);
    }
  };
  const check = async (server, failure, label) => {
    failWasm = failure;
    const before = wasmRequests;
    await call("Runtime.evaluate", { expression: "delete globalThis.result" });
    await call("Page.navigate", {
      url: server.resolvedUrls.local[0] + "?case=" + Date.now(),
    });
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      const result = await call("Runtime.evaluate", {
        expression: 'typeof globalThis.result !== "undefined"',
        returnByValue: true,
      });
      if (result.result.value) {
        ready = true;
        break;
      }
      await delay(100);
    }
    assert.ok(ready, "Test page did not load");
    const result = await call("Runtime.evaluate", {
      expression: "globalThis.result",
      awaitPromise: true,
      returnByValue: true,
    });
    assert.equal(
      result.exceptionDetails,
      undefined,
      JSON.stringify(result.exceptionDetails),
    );
    const value = result.result.value;
    assert.deepEqual(value.replies.map((r) => r.id).sort(), [0, 1, 2]);
    if (failure) {
      assert.ok(value.main.error);
      assert.ok(value.replies.every((r) => r.error));
    } else {
      assert.equal(value.main.same, true, JSON.stringify(value.main));
      assert.equal(value.main.result.document.declarations[0].name, "Main");
      for (const reply of value.replies)
        assert.equal(
          reply.result.document.declarations[0].name,
          "I" + reply.id,
        );
    }
    assert.ok(wasmRequests > before, "No WASM resource requested");
    console.log(
      `${label}: main thread, immediate/concurrent Worker requests, ${failure ? "load rejection" : "parse"} OK`,
    );
  };
  await call("Network.enable");
  await call("Network.setCacheDisabled", { cacheDisabled: true });
  dev = await createServer(config);
  await dev.listen();
  await check(dev, false, "Vite development");
  await check(dev, true, "Vite development");
  await dev.close();
  dev = null;
  failWasm = false;
  await build(config);
  production = await preview(config);
  await check(production, false, "Vite production");
  await check(production, true, "Vite production");
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ id: ++id, method: "Browser.close" }));
    ws.close();
  } else browser.kill();
  await dev?.close();
  await production?.close();
}
