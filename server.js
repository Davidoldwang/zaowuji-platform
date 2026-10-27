/**
 * 造物集 · 文创产品开发管理平台 —— 服务端
 * 静态站点 + 多租户账号体系（公司注册 / 登录 / 按公司隔离的业务数据）
 * 零第三方依赖（Postgres 模式下使用 pg）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 会话 7 天
const MAX_BODY = 4 * 1024 * 1024;                  // 单次请求体上限 4MB
const MAX_TENANT_BYTES = 3 * 1024 * 1024;          // 单公司数据上限

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'
};

// 只对外开放运行文件，源码与配置不暴露
const PUBLIC_FILES = new Set([
  'index.html', 'styles.css', 'app.js',
  'mobile.html', 'mobile.css', 'mobile.js',
  'login.html', 'login.css', 'login.js'
]);

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

const json = (res, status, data, headers = {}) => {
  const body = JSON.stringify(data);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, headers));
  res.end(body);
};

const fail = (res, status, message) => json(res, status, { error: message });

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${key}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, key] = parts;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('请求内容超过 4MB 上限'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(new Error('请求内容不是合法的 JSON'));
      }
    });
    req.on('error', reject);
  });
}

// 登录失败限流：同一 IP + 账号 10 分钟内最多 10 次
const loginAttempts = new Map();
const RATE_WINDOW = 10 * 60 * 1000;
const RATE_LIMIT = 10;

function rateHit(key) {
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || now > rec.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT;
}

function rateClear(key) { loginAttempts.delete(key); }

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of loginAttempts) if (now > v.resetAt) loginAttempts.delete(k);
}, 5 * 60 * 1000).unref();

const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const bearer = req => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
};

async function currentSession(req) {
  const token = bearer(req);
  if (!token) return null;
  const session = await store.findSession(token);
  return session ? { ...session, token } : null;
}

/* ------------------------------------------------------------------ */
/* 业务接口                                                            */
/* ------------------------------------------------------------------ */

async function handleRegister(req, res) {
  const body = await readBody(req);
  const companyName = str(body.companyName, 60);
  const username = str(body.username, 32);
  const password = typeof body.password === 'string' ? body.password : '';
  const creditCode = str(body.creditCode, 40);
  const contact = str(body.contact, 30);
  const phone = str(body.phone, 20);
  const email = str(body.email, 80);

  if (companyName.length < 2) return fail(res, 400, '请填写公司名称（至少 2 个字符）');
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username))
    return fail(res, 400, '登录账号需为 3-32 位字母、数字、下划线或点');
  if (password.length < 8) return fail(res, 400, '密码至少 8 位');
  if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) return fail(res, 400, '联系电话格式不正确');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, '邮箱格式不正确');

  const existing = await store.findUserByUsername(username);
  if (existing) return fail(res, 409, '该登录账号已被占用，请更换');

  const { companyId, userId } = await store.createAccount({
    company: { name: companyName, creditCode, contact, phone, email },
    user: { username, passwordHash: hashPassword(password), displayName: contact || '管理员' },
    payload: store.EMPTY_DB()
  });

  const { token, expiresAt } = await store.createSession(userId, SESSION_TTL_MS);
  json(res, 201, {
    token,
    expiresAt,
    user: { id: userId, username, displayName: contact || '管理员', role: 'admin' },
    company: { id: companyId, name: companyName }
  });
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const username = str(body.username, 32);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) return fail(res, 400, '请输入账号和密码');

  const ip = req.socket.remoteAddress || 'unknown';
  const key = `${ip}|${username.toLowerCase()}`;
  if (rateHit(key)) return fail(res, 429, '尝试次数过多，请 10 分钟后再试');

  const user = await store.findUserByUsername(username);
  // 账号不存在时也执行一次同代价校验，避免通过响应时间探测账号
  const ok = verifyPassword(password, user ? user.passwordHash : 'scrypt$00$00');
  if (!user || !ok) return fail(res, 401, '账号或密码错误');

  rateClear(key);
  const company = await store.getCompany(user.companyId);
  const { token, expiresAt } = await store.createSession(user.id, SESSION_TTL_MS);
  json(res, 200, {
    token,
    expiresAt,
    user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    company: company ? { id: company.id, name: company.name } : { id: user.companyId, name: '未命名公司' }
  });
}

async function handleLogout(req, res) {
  const token = bearer(req);
  if (token) await store.deleteSession(token);
  json(res, 200, { ok: true });
}

async function handleMe(req, res) {
  const session = await currentSession(req);
  if (!session) return fail(res, 401, '登录状态已失效，请重新登录');
  const company = await store.getCompany(session.user.companyId);
  json(res, 200, {
    user: {
      id: session.user.id, username: session.user.username,
      displayName: session.user.displayName, role: session.user.role
    },
    company: company || { id: session.user.companyId, name: '未命名公司' }
  });
}

async function handlePutData(req, res, session) {
  const body = await readBody(req);
  const keys = ['clients', 'products', 'projects', 'tasks', 'movements', 'invoices', 'payments'];
  for (const key of keys) {
    if (!Array.isArray(body[key])) return fail(res, 400, `数据格式不正确：${key} 应为数组`);
  }
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_TENANT_BYTES) {
    return fail(res, 413, '公司数据超过 3MB 上限');
  }
  const payload = {};
  for (const key of keys) payload[key] = body[key];
  await store.putTenantData(session.user.companyId, payload);
  json(res, 200, { ok: true, savedAt: new Date().toISOString() });
}

/* ------------------------------------------------------------------ */
/* 静态资源                                                            */
/* ------------------------------------------------------------------ */

function notFoundPage() {
  return `<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8">
<title>页面不存在 · 造物集</title>
<div style="font-family:system-ui;padding:60px;text-align:center;color:#1f2b26">
  <h1 style="font-size:22px">页面不存在</h1>
  <p style="color:#6b7a73">请访问 <a href="/">电脑版</a>、<a href="/mobile.html">手机版</a> 或 <a href="/login.html">登录</a></p>
</div></html>`;
}

function serveStatic(req, res, pathname) {
  const fileName = path.basename(pathname);
  const resolved = path.join(ROOT, pathname);
  if (!resolved.startsWith(ROOT) || !PUBLIC_FILES.has(fileName) || pathname.includes('..')) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(notFoundPage());
  }
  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(notFoundPage());
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': fileName.endsWith('.html') ? 'no-cache' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(req.method === 'HEAD' ? '' : data);
  });
}

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return fail(res, 400, '请求地址不合法');
  }

  try {
    if (pathname.startsWith('/api/')) {
      const route = `${req.method} ${pathname}`;
      if (route === 'POST /api/register') return await handleRegister(req, res);
      if (route === 'POST /api/login') return await handleLogin(req, res);
      if (route === 'POST /api/logout') return await handleLogout(req, res);
      if (route === 'GET /api/me') return await handleMe(req, res);
      if (route === 'GET /api/data') {
        const session = await currentSession(req);
        if (!session) return fail(res, 401, '登录状态已失效，请重新登录');
        return json(res, 200, await store.getTenantData(session.user.companyId));
      }
      if (route === 'PUT /api/data') {
        const session = await currentSession(req);
        if (!session) return fail(res, 401, '登录状态已失效，请重新登录');
        return await handlePutData(req, res, session);
      }
      return fail(res, 404, '接口不存在');
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Method Not Allowed');
    }
    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('ok');
    }
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    if (pathname === '/mobile' || pathname === '/m') pathname = '/mobile.html';
    if (pathname === '/login') pathname = '/login.html';
    return serveStatic(req, res, pathname);
  } catch (error) {
    console.error('[request error]', req.method, pathname, error && error.message);
    if (error && /超过 4MB|不是合法的 JSON/.test(error.message)) return fail(res, 400, error.message);
    return fail(res, 500, '服务器处理失败，请稍后重试');
  }
});

(async () => {
  const info = await store.init();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`造物集平台已启动: http://0.0.0.0:${PORT}`);
    console.log(`数据存储: ${info.driver}`);
  });
})().catch(error => {
  console.error('启动失败', error);
  process.exit(1);
});
