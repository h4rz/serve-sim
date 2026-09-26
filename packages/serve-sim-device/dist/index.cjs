var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// src/index.ts
var exports_src = {};
__export(exports_src, {
  WdaSession: () => WdaSession,
  WdaSetupError: () => WdaSetupError,
  defaultWdaConfig: () => defaultWdaConfig,
  detectRealDevice: () => detectRealDevice,
  findPymobiledevice3: () => findPymobiledevice3,
  listRealDevices: () => listRealDevices,
  resolveTeamId: () => resolveTeamId,
  startDeviceServer: () => startDeviceServer
});
module.exports = __toCommonJS(exports_src);

// src/wda.ts
var import_child_process = require("child_process");
var import_fs = require("fs");
var import_os = require("os");
var import_path = require("path");
var debugDevice = (message, ...values) => {
  if (process.env.SERVE_SIM_DEBUG_DEVICE === "1")
    console.debug(message, ...values);
};
var DEFAULT_WDA_DIR = import_path.join(import_os.homedir(), ".serve-sim-device", "WebDriverAgent");
var WDA_DEVICE_CONTROL_PORT = 8100;
var WDA_DEVICE_MJPEG_PORT = 9100;
function findPymobiledevice3() {
  const candidates = [
    import_path.join(import_os.homedir(), ".local", "bin", "pymobiledevice3"),
    "/opt/homebrew/bin/pymobiledevice3",
    "/usr/local/bin/pymobiledevice3"
  ];
  for (const c of candidates) {
    if (import_fs.existsSync(c))
      return c;
  }
  try {
    const found = import_child_process.execFileSync("command", ["-v", "pymobiledevice3"], {
      encoding: "utf-8",
      shell: "/bin/bash"
    }).trim();
    if (found)
      return found;
  } catch {}
  return null;
}
function listRealDevices() {
  const pmd = findPymobiledevice3();
  if (!pmd)
    return [];
  try {
    const out = import_child_process.execFileSync(pmd, ["usbmux", "list"], {
      encoding: "utf-8",
      timeout: 8000,
      stdio: ["ignore", "pipe", "ignore"]
    });
    const data = JSON.parse(out);
    return data.filter((d) => (d.ConnectionType ?? "USB") === "USB").map((d) => ({
      udid: d.UniqueDeviceID ?? d.Identifier ?? "",
      name: d.DeviceName ?? "iPhone",
      productType: d.ProductType ?? "",
      productVersion: d.ProductVersion ?? ""
    })).filter((d) => d.udid.length > 0);
  } catch (err) {
    debugDevice("listRealDevices failed: %s", err.message);
    return [];
  }
}
function detectRealDevice() {
  return listRealDevices()[0] ?? null;
}
function resolveTeamId() {
  if (process.env.SERVE_SIM_WDA_TEAM)
    return process.env.SERVE_SIM_WDA_TEAM;
  try {
    const list = import_child_process.execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], {
      encoding: "utf-8",
      timeout: 5000
    });
    const match = /"Apple Development:[^"]+\(([A-Z0-9]{10})\)"/.exec(list);
    return match?.[1] ?? null;
  } catch (err) {
    debugDevice("resolveTeamId failed: %s", err.message);
    return null;
  }
}
function defaultWdaConfig() {
  return {
    wdaDir: process.env.SERVE_SIM_WDA_DIR ?? DEFAULT_WDA_DIR,
    teamId: resolveTeamId() ?? undefined,
    bundleId: process.env.SERVE_SIM_WDA_BUNDLE_ID ?? "com.serve-sim.wda.runner",
    controlPort: WDA_DEVICE_CONTROL_PORT,
    mjpegPort: WDA_DEVICE_MJPEG_PORT
  };
}

class WdaSetupError extends Error {
  instructions;
  constructor(message, instructions) {
    super(message);
    this.instructions = instructions;
    this.name = "WdaSetupError";
  }
}

class WdaSession {
  runner;
  forwards = [];
  sessionId;
  windowSize;
  stopped = false;
  device;
  config;
  constructor(device, config) {
    this.device = device;
    this.config = config;
  }
  get controlBase() {
    return `http://127.0.0.1:${this.config.controlPort}`;
  }
  get mjpegUrl() {
    return `http://127.0.0.1:${this.config.mjpegPort}/`;
  }
  getWindowSize() {
    return this.windowSize;
  }
  get runnerProductPath() {
    return import_path.join(this.config.wdaDir, "build", "Build", "Products", "Debug-iphoneos", "WebDriverAgentRunner-Runner.app");
  }
  commonBuildArgs() {
    const args = [
      "-project",
      import_path.join(this.config.wdaDir, "WebDriverAgent.xcodeproj"),
      "-scheme",
      "WebDriverAgentRunner",
      "-destination",
      `id=${this.device.udid}`,
      "-derivedDataPath",
      import_path.join(this.config.wdaDir, "build"),
      "-allowProvisioningUpdates",
      `PRODUCT_BUNDLE_IDENTIFIER=${this.config.bundleId}`,
      "CODE_SIGN_STYLE=Automatic"
    ];
    if (this.config.teamId)
      args.push(`DEVELOPMENT_TEAM=${this.config.teamId}`);
    return args;
  }
  async ensureBuilt() {
    if (import_fs.existsSync(this.runnerProductPath)) {
      debugDevice("WDA runner product already built at %s", this.runnerProductPath);
      return;
    }
    if (!import_fs.existsSync(import_path.join(this.config.wdaDir, "WebDriverAgent.xcodeproj"))) {
      throw new WdaSetupError(`WebDriverAgent checkout not found at ${this.config.wdaDir}`, [
        "Set up WebDriverAgent once:",
        `  git clone --depth 1 https://github.com/appium/WebDriverAgent.git "${this.config.wdaDir}"`,
        "Then re-run serve-sim device (it will build + sign the runner).",
        "Override the location with SERVE_SIM_WDA_DIR."
      ].join(`
`));
    }
    if (!this.config.teamId) {
      throw new WdaSetupError("No Apple Developer Team ID found to sign WebDriverAgent.", [
        "Open Xcode once and sign in with your Apple ID (Settings → Accounts),",
        "then set your team id explicitly:",
        "  export SERVE_SIM_WDA_TEAM=XXXXXXXXXX",
        "(find it under Apple Developer → Membership, or via your signing cert)."
      ].join(`
`));
    }
    debugDevice("building WDA runner (team=%s bundle=%s)", this.config.teamId, this.config.bundleId);
    await new Promise((resolve, reject) => {
      const child = import_child_process.spawn("xcodebuild", ["build-for-testing", ...this.commonBuildArgs()], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let tail = "";
      const collect = (d) => {
        tail = (tail + d.toString()).slice(-4000);
      };
      child.stdout?.on("data", collect);
      child.stderr?.on("data", collect);
      child.once("exit", (code) => {
        if (code === 0 && import_fs.existsSync(this.runnerProductPath))
          resolve();
        else
          reject(new WdaSetupError(`WebDriverAgent build failed (exit ${code}).
${tail}`));
      });
      child.once("error", reject);
    });
  }
  launchRunner() {
    return new Promise((resolve, reject) => {
      const child = import_child_process.spawn("xcodebuild", ["test-without-building", ...this.commonBuildArgs()], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      this.runner = child;
      let settled = false;
      const onLine = (buf) => {
        const text = buf.toString();
        if (!settled && text.includes("ServerURLHere->")) {
          settled = true;
          debugDevice("WDA runner reported server URL on device");
          resolve();
        }
        if (/Test Suite '.*' (failed|did not run)|TEST EXECUTE FAILED|Testing failed/.test(text)) {
          if (!settled) {
            settled = true;
            reject(new WdaSetupError(`WebDriverAgent runner failed to launch.
${text.slice(-2000)}`));
          }
        }
      };
      child.stdout?.on("data", onLine);
      child.stderr?.on("data", onLine);
      child.once("exit", (code) => {
        if (!settled) {
          settled = true;
          reject(new WdaSetupError(`WebDriverAgent runner exited early (code ${code}).`));
        }
      });
      child.once("error", (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
      setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new WdaSetupError("Timed out waiting for WebDriverAgent to start on the device."));
        }
      }, 90000);
    });
  }
  startForward(localPort, devicePort) {
    const pmd = findPymobiledevice3();
    if (!pmd)
      throw new WdaSetupError("pymobiledevice3 not found (needed for usbmux port forwarding).");
    const child = import_child_process.spawn(pmd, ["usbmux", "forward", String(localPort), String(devicePort), "--serial", this.device.udid], { stdio: ["ignore", "ignore", "ignore"] });
    this.forwards.push(child);
    return child;
  }
  async pollStatusReady(timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    let lastErr = "";
    while (Date.now() < deadline) {
      try {
        const res = await wdaFetch(`${this.controlBase}/status`, {}, 2000);
        if (res.ok) {
          const body = await res.json();
          if (body.value?.ready)
            return;
        }
      } catch (err) {
        lastErr = err.message;
      }
      await delay(300);
    }
    throw new WdaSetupError(`WebDriverAgent /status never became ready. ${lastErr}`);
  }
  async openSession() {
    const res = await wdaFetch(`${this.controlBase}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capabilities: { alwaysMatch: {} } })
    });
    const body = await res.json();
    this.sessionId = body.value?.sessionId ?? body.sessionId;
    if (!this.sessionId)
      throw new WdaSetupError("Failed to create a WebDriverAgent session.");
    await this.refreshWindowSize();
    await this.configurePreviewStream();
  }
  async configurePreviewStream() {
    if (!this.sessionId)
      return;
    try {
      const response = await wdaFetch(`${this.controlBase}/session/${this.sessionId}/appium/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { mjpegServerFramerate: 20, mjpegScalingFactor: 75 } })
      });
      if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      debugDevice("Could not tune WDA preview stream: %s", error.message);
    }
  }
  async refreshWindowSize() {
    if (!this.sessionId)
      return;
    try {
      const res = await wdaFetch(`${this.controlBase}/session/${this.sessionId}/window/size`);
      const body = await res.json();
      if (body.value)
        this.windowSize = body.value;
    } catch (err) {
      debugDevice("window/size failed: %s", err.message);
    }
    return this.windowSize;
  }
  async start() {
    await this.ensureBuilt();
    await this.launchRunner();
    this.startForward(this.config.controlPort, WDA_DEVICE_CONTROL_PORT);
    this.startForward(this.config.mjpegPort, WDA_DEVICE_MJPEG_PORT);
    await this.pollStatusReady();
    await this.openSession();
    debugDevice("WDA session ready: device=%s window=%o", this.device.udid, this.windowSize);
  }
  async tap(xPoints, yPoints) {
    if (!this.sessionId)
      throw new Error("WebDriverAgent has no active session.");
    const response = await wdaFetch(`${this.controlBase}/session/${this.sessionId}/wda/tap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x: xPoints, y: yPoints })
    });
    if (!response.ok)
      throw new Error(`WebDriverAgent tap failed (${response.status}).`);
  }
  async drag(fromX, fromY, toX, toY, durationSec = 0.2) {
    if (!this.sessionId)
      throw new Error("WebDriverAgent has no active session.");
    const response = await wdaFetch(`${this.controlBase}/session/${this.sessionId}/wda/dragfromtoforduration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromX,
        fromY,
        toX,
        toY,
        duration: durationSec
      })
    });
    if (!response.ok)
      throw new Error(`WebDriverAgent drag failed (${response.status}).`);
  }
  async pressButton(name) {
    if (!this.sessionId)
      throw new Error("WebDriverAgent has no active session.");
    const response = await wdaFetch(`${this.controlBase}/session/${this.sessionId}/wda/pressButton`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    if (!response.ok)
      throw new Error(`WebDriverAgent button failed (${response.status}).`);
  }
  async stop() {
    if (this.stopped)
      return;
    this.stopped = true;
    for (const f of this.forwards) {
      try {
        f.kill("SIGTERM");
      } catch {}
    }
    this.forwards = [];
    if (this.runner) {
      try {
        this.runner.kill("SIGTERM");
      } catch {}
      this.runner = undefined;
    }
  }
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function wdaFetch(url, init = {}, timeoutMs = 8000) {
  const headers = new Headers(init.headers);
  headers.set("Connection", "close");
  return fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
}
// src/device-server.ts
var import_http = require("http");
var import_http2 = require("http");
var debugDevice2 = (message, ...values) => {
  if (process.env.SERVE_SIM_DEBUG_DEVICE === "1")
    console.debug(message, ...values);
};
async function startDeviceServer(opts) {
  const { session, port } = opts;
  const host = opts.host ?? "127.0.0.1";
  const server = import_http.createServer((req, res) => handle(req, res, session, opts.token));
  server.keepAliveTimeout = 0;
  server.headersTimeout = 0;
  server.requestTimeout = 0;
  server.timeout = 0;
  await new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Physical device server has no port.");
  return {
    url: `http://${host}:${address.port}/?token=${opts.token}`,
    stop: () => new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    })
  };
}
function handle(req, res, session, token) {
  const requested = new URL(req.url ?? "/", "http://127.0.0.1");
  if (requested.searchParams.get("token") !== token) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }
  const url = requested.pathname;
  if (url === "/health") {
    return json(res, 200, { status: "ok", device: session.device.udid });
  }
  if (url === "/config") {
    const size = session.getWindowSize();
    return json(res, 200, {
      width: size?.width ?? 0,
      height: size?.height ?? 0,
      orientation: "portrait",
      device: session.device.name,
      productType: session.device.productType,
      productVersion: session.device.productVersion
    });
  }
  if (url === "/stream.mjpeg") {
    return proxyMjpeg(res, session);
  }
  if (url === "/input" && req.method === "POST") {
    return handleInput(req, res, session);
  }
  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(viewerHtml(session, token));
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}
function proxyMjpeg(res, session) {
  const upstream = import_http2.get(session.mjpegUrl, (up) => {
    const contentType = up.headers["content-type"] ?? "multipart/x-mixed-replace; boundary=--BoundaryString";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive"
    });
    up.pipe(res);
    res.on("close", () => up.destroy());
  });
  upstream.on("error", (err) => {
    debugDevice2("mjpeg upstream error: %s", err.message);
    if (!res.headersSent)
      res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("MJPEG upstream unavailable");
  });
}
function handleInput(req, res, session) {
  let raw = "";
  let tooLarge = false;
  req.on("data", (chunk) => {
    if (tooLarge)
      return;
    raw += chunk;
    if (raw.length > 4096) {
      tooLarge = true;
      json(res, 413, { error: "payload_too_large" });
      req.destroy();
    }
  });
  req.on("end", () => {
    if (tooLarge)
      return;
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(res, 400, { error: "invalid_json" });
    }
    const size = session.getWindowSize();
    if (!size)
      return json(res, 503, { error: "no_window_size" });
    const toPoints = (n, axis) => clamp01(n ?? 0) * (axis === "x" ? size.width : size.height);
    (async () => {
      try {
        if (body.type === "button") {
          await session.pressButton(body.name ?? "home");
        } else if (body.type === "drag") {
          await session.drag(toPoints(body.x, "x"), toPoints(body.y, "y"), toPoints(body.x2, "x"), toPoints(body.y2, "y"));
        } else {
          await session.tap(toPoints(body.x, "x"), toPoints(body.y, "y"));
        }
        json(res, 200, { ok: true });
      } catch (err) {
        json(res, 500, { error: err.message });
      }
    })();
  });
}
function clamp01(n) {
  if (Number.isNaN(n))
    return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store"
  });
  res.end(body);
}
function viewerHtml(session, token) {
  const name = escapeHtml(session.device.name);
  const subtitle = escapeHtml(`${session.device.productType} · iOS ${session.device.productVersion}`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<title>${name} · serve-sim</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #0b0b0d; color: #e7e7ea;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  body { display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 12px; padding: 16px; overflow: hidden; }
  header { text-align: center; }
  header h1 { margin: 0; font-size: 14px; font-weight: 600; }
  header p { margin: 2px 0 0; font-size: 11px; color: #8a8a90; }
  .stage { position: relative; flex: 0 1 auto; display: flex; }
  img#screen { max-height: calc(100vh - 120px); max-width: 100%;
    border-radius: 28px; box-shadow: 0 10px 40px rgba(0,0,0,.5);
    touch-action: none; user-select: none; -webkit-user-drag: none;
    background: #000; display: block; }
  .bar { display: flex; gap: 8px; }
  button { background: #1c1c22; color: #e7e7ea; border: 1px solid #2c2c34;
    border-radius: 8px; padding: 6px 14px; font-size: 12px; cursor: pointer; }
  button:active { background: #2a2a32; }
  .status { font-size: 11px; color: #6f6f76; min-height: 14px; }
</style>
</head>
<body>
  <header>
    <h1>${name}</h1>
    <p>${subtitle}</p>
  </header>
  <div class="stage">
    <img id="screen" src="/stream.mjpeg?token=${token}" alt="device screen" draggable="false" />
  </div>
  <div class="bar">
    <button id="home">Home</button>
  </div>
  <div class="status" id="status"></div>
<script>
(function () {
  var img = document.getElementById("screen");
  var statusEl = document.getElementById("status");
  var MOVE_THRESHOLD = 0.02; // normalized; below this a press is a tap
  var start = null;

  function setStatus(t) { statusEl.textContent = t; }

  function norm(ev) {
    var r = img.getBoundingClientRect();
    var x = (ev.clientX - r.left) / r.width;
    var y = (ev.clientY - r.top) / r.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  function send(payload) {
    return fetch("/input?token=${token}", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(function () {});
  }

  img.addEventListener("pointerdown", function (ev) {
    ev.preventDefault();
    img.setPointerCapture(ev.pointerId);
    start = norm(ev);
  });
  img.addEventListener("pointerup", function (ev) {
    if (!start) return;
    var end = norm(ev);
    var dx = end.x - start.x, dy = end.y - start.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < MOVE_THRESHOLD) {
      send({ type: "tap", x: start.x, y: start.y });
      setStatus("tap " + start.x.toFixed(2) + ", " + start.y.toFixed(2));
    } else {
      send({ type: "drag", x: start.x, y: start.y, x2: end.x, y2: end.y });
      setStatus("drag → " + end.x.toFixed(2) + ", " + end.y.toFixed(2));
    }
    start = null;
  });
  img.addEventListener("pointercancel", function () { start = null; });
  img.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  document.getElementById("home").addEventListener("click", function () {
    send({ type: "button", name: "home" });
    setStatus("home");
  });

  img.addEventListener("error", function () { setStatus("stream disconnected — reconnecting…");
    setTimeout(function () { img.src = "/stream.mjpeg?token=${token}&t=" + Date.now(); }, 1000); });
})();
</script>
</body>
</html>`;
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
