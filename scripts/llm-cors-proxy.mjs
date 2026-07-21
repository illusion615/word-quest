/**
 * CORS + Private Network Access proxy for a local OpenAI-compatible LLM.
 *
 * Why this exists:
 *   A deployed HTTPS page (e.g. https://illusion615.github.io/word-quest/) that
 *   calls a model on http://127.0.0.1 is a "public → private network" request.
 *   Chrome/Edge require a Private Network Access (PNA) preflight, and the server
 *   must also send CORS headers allowing the page's origin. Most local model
 *   servers (LM Studio, mlx_lm.server, llama.cpp) do neither, so the browser
 *   blocks the request. This tiny proxy sits in front of the model and adds the
 *   CORS + PNA headers the browser needs. Running the app locally does NOT need
 *   this — only the deployed site does.
 *
 * Usage:
 *   1. Start your local model (example ports below).
 *   2. Start this proxy (defaults: listen 8788 → forward 127.0.0.1:8191):
 *          npm run ai:proxy
 *      Override the model's host/port when needed:
 *          TARGET_PORT=8080 npm run ai:proxy
 *          TARGET_HOST=127.0.0.1 TARGET_PORT=1234 PROXY_PORT=8788 npm run ai:proxy
 *   3. In the app's "AI 连接" settings, set the endpoint to:
 *          http://127.0.0.1:8788/v1
 *
 * Zero npm dependencies — uses only the Node.js built-in http module.
 */
import http from 'node:http';

const PROXY_PORT = Number.parseInt(process.env.PROXY_PORT ?? '', 10) || 8788;
const TARGET_HOST = process.env.TARGET_HOST || '127.0.0.1';
const TARGET_PORT = Number.parseInt(process.env.TARGET_PORT ?? '', 10) || 8191;
const TARGET_API_KEY = process.env.TARGET_API_KEY || '';

/** Adds permissive CORS headers, echoing the caller's origin when present. */
function applyCors(headers, origin) {
  headers['access-control-allow-origin'] = origin || '*';
  headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
  headers['access-control-allow-headers'] = 'Content-Type, Authorization, api-key';
  headers.vary = 'Origin';
}

const server = http.createServer((clientReq, clientRes) => {
  const origin = clientReq.headers.origin;

  // CORS + Private Network Access preflight.
  if (clientReq.method === 'OPTIONS') {
    const headers = { 'access-control-max-age': '86400' };
    applyCors(headers, origin);
    // A public HTTPS page reaching this loopback address needs this header on
    // the preflight, or Chrome/Edge block the follow-up request.
    if (clientReq.headers['access-control-request-private-network'] === 'true') {
      headers['access-control-allow-private-network'] = 'true';
    }
    clientRes.writeHead(204, headers);
    clientRes.end();
    return;
  }

  const forwardHeaders = { ...clientReq.headers };
  delete forwardHeaders.host;
  // Optionally inject a Bearer key for model servers that require one but you
  // do not want to type it into the browser.
  if (TARGET_API_KEY && !forwardHeaders.authorization) {
    forwardHeaders.authorization = `Bearer ${TARGET_API_KEY}`;
  }

  const proxyReq = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers: forwardHeaders,
    },
    (proxyRes) => {
      const outHeaders = {};
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        // Drop upstream CORS headers so ours are authoritative (no duplicates).
        if (key.toLowerCase().startsWith('access-control-allow-')) continue;
        outHeaders[key] = value;
      }
      applyCors(outHeaders, origin);
      clientRes.writeHead(proxyRes.statusCode ?? 502, outHeaders);
      proxyRes.pipe(clientRes, { end: true });
    },
  );

  proxyReq.on('error', (err) => {
    const headers = { 'content-type': 'application/json' };
    applyCors(headers, origin);
    clientRes.writeHead(502, headers);
    clientRes.end(JSON.stringify({
      error: `无法连接本地模型 ${TARGET_HOST}:${TARGET_PORT}（${err.message}）。`
        + '请确认模型服务已启动、端口正确。',
    }));
  });

  clientReq.pipe(proxyReq, { end: true });
});

server.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  WordQuest · 本地 LLM CORS/PNA 代理');
  console.log('  =================================');
  console.log(`  填到 App「AI 连接」的地址： http://127.0.0.1:${PROXY_PORT}/v1`);
  console.log(`  转发到本地模型：           http://${TARGET_HOST}:${TARGET_PORT}`);
  if (TARGET_API_KEY) console.log('  已启用 Bearer key 注入');
  console.log('  改端口示例：               TARGET_PORT=8080 npm run ai:proxy');
  console.log('');
});
