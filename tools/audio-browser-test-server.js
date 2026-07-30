const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = Number(process.env.AUDIO_TEST_PORT) || 8799;
const MAX_REQUEST_LOG_ENTRIES = 500;

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".wav", "audio/wav"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".woff2", "font/woff2"],
]);

function sendJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2));
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": body.length,
    "content-type": "application/json; charset=utf-8",
  });
  response.end(body);
}

function resolveRequestPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname || "/");
  } catch (_error) {
    return null;
  }
  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^[/\\]+/, "");
  const resolvedPath = path.resolve(ROOT_DIR, relativePath);
  const rootPrefix = `${ROOT_DIR}${path.sep}`;
  if (resolvedPath !== ROOT_DIR && !resolvedPath.startsWith(rootPrefix)) return null;
  return resolvedPath;
}

function parseByteRange(rangeHeader, size) {
  const match = String(rangeHeader || "").match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (
      !Number.isSafeInteger(start)
      || !Number.isSafeInteger(end)
      || start < 0
      || end < start
      || start >= size
    ) {
      return null;
    }
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

function createAudioBrowserTestServer(options = {}) {
  const requests = [];
  let audioDelayMs = Math.max(0, Number(options.audioDelayMs) || 0);

  function recordRequest(entry) {
    requests.push({
      at: new Date().toISOString(),
      ...entry,
    });
    if (requests.length > MAX_REQUEST_LOG_ENTRIES) {
      requests.splice(0, requests.length - MAX_REQUEST_LOG_ENTRIES);
    }
  }

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || DEFAULT_HOST}`);

    if (requestUrl.pathname === "/__audio_test__/requests" && request.method === "GET") {
      sendJson(response, 200, { requests });
      return;
    }
    if (requestUrl.pathname === "/__audio_test__/reset" && request.method === "POST") {
      requests.length = 0;
      sendJson(response, 200, { reset: true });
      return;
    }

    const filePath = resolveRequestPath(requestUrl.pathname);
    if (!filePath || !["GET", "HEAD"].includes(request.method || "")) {
      response.writeHead(filePath ? 405 : 403, {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      });
      response.end(filePath ? "Method not allowed" : "Forbidden");
      return;
    }

    let stats;
    try {
      stats = await fsp.stat(filePath);
    } catch (_error) {
      recordRequest({
        method: request.method,
        path: requestUrl.pathname,
        range: request.headers.range || "",
        status: 404,
      });
      response.writeHead(404, {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      });
      response.end("Not found");
      return;
    }
    if (!stats.isFile()) {
      response.writeHead(404, {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      });
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const isAudio = [".mp3", ".ogg", ".wav"].includes(extension);
    const rangeHeader = request.headers.range;
    if (isAudio && audioDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, audioDelayMs));
    }
    const commonHeaders = {
      "cache-control": "no-store",
      "content-type": MIME_TYPES.get(extension) || "application/octet-stream",
    };
    if (requestUrl.pathname === "/service-worker.js") {
      commonHeaders["service-worker-allowed"] = "/";
    }
    if (isAudio) commonHeaders["accept-ranges"] = "bytes";

    let status = 200;
    let start = 0;
    let end = stats.size - 1;
    if (rangeHeader) {
      const range = parseByteRange(rangeHeader, stats.size);
      if (!range) {
        status = 416;
        const contentRange = `bytes */${stats.size}`;
        recordRequest({
          contentRange,
          method: request.method,
          path: requestUrl.pathname,
          range: rangeHeader,
          status,
        });
        response.writeHead(status, {
          ...commonHeaders,
          "content-range": contentRange,
        });
        response.end();
        return;
      }
      ({ start, end } = range);
      status = 206;
      commonHeaders["content-range"] = `bytes ${start}-${end}/${stats.size}`;
    }

    const contentLength = Math.max(0, end - start + 1);
    commonHeaders["content-length"] = contentLength;
    recordRequest({
      contentRange: commonHeaders["content-range"] || "",
      method: request.method,
      path: requestUrl.pathname,
      range: rangeHeader || "",
      status,
    });
    response.writeHead(status, commonHeaders);
    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on("error", error => {
      if (!response.headersSent) {
        response.writeHead(500, {
          "cache-control": "no-store",
          "content-type": "text/plain; charset=utf-8",
        });
      }
      response.destroy(error);
    });
    stream.pipe(response);
  });

  return {
    requests,
    server,
    setAudioDelay(delayMs) {
      audioDelayMs = Math.max(0, Number(delayMs) || 0);
    },
    listen({ host = DEFAULT_HOST, port = 0 } = {}) {
      return new Promise((resolve, reject) => {
        const handleError = error => {
          server.off("listening", handleListening);
          reject(error);
        };
        const handleListening = () => {
          server.off("error", handleError);
          const address = server.address();
          resolve({
            host,
            port: address.port,
            url: `http://${host}:${address.port}`,
          });
        };
        server.once("error", handleError);
        server.once("listening", handleListening);
        server.listen(port, host);
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function runSelfTest() {
  const fixture = createAudioBrowserTestServer();
  const address = await fixture.listen();
  try {
    const manifestResponse = await fetch(`${address.url}/audio/manifest.json`);
    if (manifestResponse.status !== 200) throw new Error(`Manifest returned ${manifestResponse.status}`);
    if (!String(manifestResponse.headers.get("content-type")).startsWith("application/json")) {
      throw new Error("Manifest MIME type is invalid");
    }

    const rangeResponse = await fetch(`${address.url}/audio/music/main_menu_loop.mp3`, {
      headers: { Range: "bytes=0-1023" },
    });
    if (rangeResponse.status !== 206) throw new Error(`Range request returned ${rangeResponse.status}`);
    if (!/^bytes 0-1023\/\d+$/.test(rangeResponse.headers.get("content-range") || "")) {
      throw new Error("Range response has an invalid Content-Range header");
    }
    if (rangeResponse.headers.get("content-type") !== "audio/mpeg") {
      throw new Error("MP3 MIME type is invalid");
    }
    const bytes = await rangeResponse.arrayBuffer();
    if (bytes.byteLength !== 1024) throw new Error(`Range response returned ${bytes.byteLength} bytes`);
    console.log("Audio browser test server validation passed.");
  } finally {
    await fixture.close();
  }
}

if (require.main === module) {
  if (process.argv.includes("--self-test")) {
    runSelfTest().catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  } else {
    const fixture = createAudioBrowserTestServer();
    fixture.listen({ port: DEFAULT_PORT })
      .then(address => {
        console.log(`Crownlands audio browser test server: ${address.url}`);
      })
      .catch(error => {
        console.error(error);
        process.exitCode = 1;
      });
  }
}

module.exports = {
  createAudioBrowserTestServer,
  parseByteRange,
};
