// 造物集 · 文创产品开发管理平台 —— 静态站点服务
// 零依赖实现，Railway 直接以 `npm start` 启动；监听平台注入的 PORT
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

// 只暴露允许访问的运行文件，避免源码/测试脚本被公开下载
const PUBLIC_FILES = new Set([
  'index.html', 'styles.css', 'app.js',
  'mobile.html', 'mobile.css', 'mobile.js'
]);

function send(res, status, body, headers = {}) {
  res.writeHead(status, Object.assign({
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  }, headers));
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return send(res, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  // 健康检查
  if (pathname === '/healthz') {
    return send(res, 200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  if (pathname === '/' || pathname === '') pathname = '/index.html';
  if (pathname === '/mobile' || pathname === '/m') pathname = '/mobile.html';

  const fileName = path.basename(pathname);
  const resolved = path.join(ROOT, pathname);

  // 阻断目录穿越与未授权文件
  if (!resolved.startsWith(ROOT) || !PUBLIC_FILES.has(fileName) || pathname.includes('..')) {
    return send(res, 404, notFoundPage(), { 'Content-Type': 'text/html; charset=utf-8' });
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      return send(res, 404, notFoundPage(), { 'Content-Type': 'text/html; charset=utf-8' });
    }
    const mime = MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream';
    send(res, 200, req.method === 'HEAD' ? '' : data, { 'Content-Type': mime });
  });
});

function notFoundPage() {
  return `<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8">
<title>页面不存在 · 造物集</title>
<div style="font-family:system-ui;padding:60px;text-align:center;color:#1f2b26">
  <h1 style="font-size:22px">页面不存在</h1>
  <p style="color:#6b7a73">请访问 <a href="/">电脑版</a> 或 <a href="/mobile.html">手机版</a></p>
</div></html>`;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`造物集平台已启动: http://0.0.0.0:${PORT}`);
  console.log(`电脑版 /  手机版 /mobile.html`);
});
