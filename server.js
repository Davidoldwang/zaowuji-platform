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

/* 角色：admin 企业管理员 / manager 店长 / staff 员工 */
const ROLE_RANK = { admin: 3, manager: 2, staff: 1 };
const ROLE_LABEL = { admin: '企业管理员', manager: '店长', staff: '员工' };
const rankOf = user => ROLE_RANK[(user && user.role) || 'staff'] || 1;

async function requireSession(req, res, minRank = 1) {
  const session = await currentSession(req);
  if (!session) { fail(res, 401, '登录状态已失效，请重新登录'); return null; }
  if (rankOf(session.user) < minRank) {
    fail(res, 403, minRank >= 3 ? '仅企业管理员可执行该操作' : '当前角色没有该操作权限');
    return null;
  }
  return session;
}

const actorOf = session => session.user.displayName || session.user.username || '未知';
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* 找回密码验证码发送：配置了 SMTP 时发真实邮件，否则降级为演示模式（验证码返回前端显示） */
const SMTP = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE !== 'false',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || ''
};

async function sendEmail(to, subject, text, html) {
  if (!SMTP.host || !SMTP.user || !SMTP.pass) return { ok: false, reason: 'not-configured' };
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch (e) { return { ok: false, reason: 'nodemailer-missing' }; }
  try {
    const transporter = nodemailer.createTransport({
      host: SMTP.host, port: SMTP.port, secure: SMTP.secure,
      auth: { user: SMTP.user, pass: SMTP.pass }
    });
    await transporter.sendMail({ from: SMTP.from || SMTP.user, to, subject, text, html });
    return { ok: true };
  } catch (error) {
    console.error('[smtp] 发送失败：', error && error.message);
    return { ok: false, reason: 'smtp-error' };
  }
}

/* ------------------------------------------------------------------ */
/* 业务接口                                                            */
/* ------------------------------------------------------------------ */

async function handleRegister(req, res) {
  const body = await readBody(req);
  const companyName = str(body.companyName, 60);
  const password = typeof body.password === 'string' ? body.password : '';
  // 公司名称即登录账号：中文、字母、数字、括号等常见写法都可用
  const username = str(body.username, 32) || companyName;
  const email = str(body.email, 120).toLowerCase();
  const phone = str(body.phone, 24);

  if (companyName.length < 2) return fail(res, 400, '请填写公司名称（至少 2 个字）');
  if (/[\u0000-\u001f]/.test(companyName)) return fail(res, 400, '公司名称含有不支持的字符');
  if (username.length < 2 || username.length > 32) return fail(res, 400, '公司名称需为 2-32 个字');
  if (password.length < 6) return fail(res, 400, '密码至少 6 位');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, '邮箱格式不正确');

  const existing = await store.findUserByUsername(username);
  if (existing) return fail(res, 409, '该公司名称已被注册，请直接登录或换一个名称');

  const { companyId, userId } = await store.createAccount({
    company: { name: companyName, email, phone },
    user: { username, passwordHash: hashPassword(password), displayName: '管理员', email, phone },
    payload: store.EMPTY_DB()
  });

  const { token, expiresAt } = await store.createSession(userId, SESSION_TTL_MS);
  json(res, 201, {
    token,
    expiresAt,
    user: { id: userId, username, displayName: '管理员', role: 'admin', email, phone },
    company: { id: companyId, name: companyName }
  });
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const mode = body.mode === 'staff' ? 'staff' : 'company';
  const companyName = str(body.companyName, 60);
  const username = str(body.username, 32);
  const password = typeof body.password === 'string' ? body.password : '';

  if (mode === 'staff') {
    if (!companyName || !username || !password) return fail(res, 400, '请输入公司名称、员工账号和密码');
  } else if (!companyName || !password) {
    return fail(res, 400, '请输入公司名称和密码');
  }

  const ip = req.socket.remoteAddress || 'unknown';
  const key = `${ip}|${mode}|${companyName.toLowerCase()}|${username.toLowerCase()}`;
  if (rateHit(key)) return fail(res, 429, '尝试次数过多，请 10 分钟后再试');

  let user = null;
  if (mode === 'staff') {
    const company = await store.findCompanyByName(companyName);
    if (company) user = await store.findCompanyMember(company.id, username);
  } else {
    user = await store.findCompanyAdmin(companyName);
    // 兼容早期用英文账号注册的公司：公司名查不到时按账号再查一次
    if (!user) {
      const legacy = await store.findUserByUsername(companyName);
      if (legacy && legacy.role === 'admin') user = legacy;
    }
  }

  // 账号不存在时也执行一次同代价校验，避免通过响应时间探测账号
  const ok = verifyPassword(password, user ? user.passwordHash : 'scrypt$00$00');
  if (!user || !ok) {
    return fail(res, 401, mode === 'staff' ? '公司名称、员工账号或密码不正确' : '公司名称或密码不正确');
  }
  if (user.status === 'disabled') return fail(res, 403, '该账号已停用，请联系公司管理员');

  rateClear(key);
  const company = await store.getCompany(user.companyId);
  const { token, expiresAt } = await store.createSession(user.id, SESSION_TTL_MS);
  if (user.role !== 'staff') {
    store.addAuditLogs(user.companyId, [{
      actor: user.displayName || user.username, role: user.role, action: 'login',
      target: ROLE_LABEL[user.role] || user.role, detail: `${mode === 'staff' ? '员工入口' : '企业入口'}登录成功`
    }]).catch(() => {});
  }
  json(res, 200, {
    token,
    expiresAt,
    user: {
      id: user.id, username: user.username, displayName: user.displayName,
      role: user.role, staffId: user.staffId || null,
      email: user.email || '', phone: user.phone || ''
    },
    company: company ? { id: company.id, name: company.name } : { id: user.companyId, name: '未命名公司' }
  });
}

async function handleLogout(req, res) {
  const token = bearer(req);
  const session = await currentSession(req);
  if (session && session.user.role !== 'staff') {
    store.addAuditLogs(session.user.companyId, [{
      actor: actorOf(session), role: session.user.role, action: 'logout',
      target: ROLE_LABEL[session.user.role] || session.user.role, detail: '退出登录'
    }]).catch(() => {});
  }
  if (token) await store.deleteSession(token);
  json(res, 200, { ok: true });
}

async function handleMe(req, res) {
  const session = await currentSession(req);
  if (!session) return fail(res, 401, '登录状态已失效，请重新登录');
  const full = await store.getUserById(session.user.id);
  const company = await store.getCompany(session.user.companyId);
  json(res, 200, {
    user: {
      id: session.user.id, username: session.user.username,
      displayName: session.user.displayName, role: session.user.role,
      staffId: session.user.staffId || null,
      email: (full && full.email) || '', phone: (full && full.phone) || ''
    },
    company: company || { id: session.user.companyId, name: '未命名公司' }
  });
}

/* -------------------------- 账号自助：改密 / 联系方式 / 找回密码 -------------------------- */

async function handleChangePassword(req, res, session) {
  const body = await readBody(req);
  const oldPassword = typeof body.oldPassword === 'string' ? body.oldPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (!oldPassword || !newPassword) return fail(res, 400, '请填写原密码和新密码');
  if (newPassword.length < 6) return fail(res, 400, '新密码至少 6 位');
  if (newPassword.length > 72) return fail(res, 400, '新密码过长');
  const user = await store.getUserById(session.user.id);
  if (!user || !verifyPassword(oldPassword, user.passwordHash)) return fail(res, 400, '原密码不正确');
  await store.changeUserPassword(user.id, hashPassword(newPassword), session.token);
  store.addAuditLogs(user.companyId, [{
    actor: actorOf(session), role: user.role, action: 'account',
    target: `账号 · ${user.username}`, detail: '修改登录密码'
  }]).catch(() => {});
  json(res, 200, { ok: true });
}

async function handleUpdateMe(req, res, session) {
  const body = await readBody(req);
  const patch = {};
  if (body.email !== undefined) {
    const email = str(body.email, 120).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, '邮箱格式不正确');
    patch.email = email;
  }
  if (body.phone !== undefined) patch.phone = str(body.phone, 24);
  if (!Object.keys(patch).length) return fail(res, 400, '没有需要更新的内容');
  await store.updateUserProfile(session.user.id, patch);
  store.addAuditLogs(session.user.companyId, [{
    actor: actorOf(session), role: session.user.role, action: 'account',
    target: `账号 · ${session.user.username}`, detail: '更新找回邮箱 / 手机号'
  }]).catch(() => {});
  json(res, 200, { ok: true });
}

async function handleForgot(req, res) {
  const body = await readBody(req);
  const entry = body.entry === 'staff' ? 'staff' : 'company';
  const companyName = str(body.companyName, 60);
  const username = str(body.username, 32);
  const email = str(body.email, 120).toLowerCase();

  if (!companyName) return fail(res, 400, '请填写公司名称');
  if (!email) return fail(res, 400, '请填写注册时绑定的邮箱');
  if (entry === 'staff' && !username) return fail(res, 400, '请填写员工账号');

  const ip = req.socket.remoteAddress || 'unknown';
  if (rateHit(`forgot|${ip}|${email}`)) return fail(res, 429, '请求过于频繁，请稍后再试');

  let user = null;
  if (entry === 'staff') {
    const company = await store.findCompanyByName(companyName);
    if (company) user = await store.findCompanyMember(company.id, username);
  } else {
    user = await store.findCompanyAdmin(companyName);
  }

  let sent = false;
  let demoCode = null;
  if (user && user.status !== 'disabled' && String(user.email || '').toLowerCase() === email) {
    const code = await store.createResetCode(user.id, email);
    const subject = '造物集 · 找回密码验证码';
    const text = `【造物集】你的找回密码验证码是 ${code}，10 分钟内有效。如非本人操作请忽略本邮件。`;
    const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei';max-width:480px;margin:0 auto;padding:28px;color:#1f2b26">
  <div style="font-size:20px;font-weight:700;color:#18352d">造物集 · 找回密码</div>
  <p style="color:#5a6b62;font-size:14px;line-height:1.8">你正在为「${escapeHtml(companyName)}」的账号找回密码，请输入下面的验证码完成重置：</p>
  <div style="font-size:30px;font-weight:800;letter-spacing:10px;color:#1f3f34;background:#eef4ef;padding:16px;text-align:center;border-radius:10px;margin:18px 0">${code}</div>
  <p style="color:#8a978f;font-size:12px;line-height:1.8">验证码 10 分钟内有效，请勿泄露给他人。如非本人操作请忽略本邮件。</p>
</div>`;
    const send = await sendEmail(email, subject, text, html);
    if (send.ok) sent = true;
    else if (send.reason !== 'smtp-error') demoCode = code;   // 未配置 SMTP 时进入演示模式
  }

  // 无论账号是否存在都返回成功，避免被用于探测账号
  json(res, 200, { ok: true, sent, demo: !!(demoCode && !sent), demoCode: demoCode || null });
}

async function handleResetPassword(req, res) {
  const body = await readBody(req);
  const email = str(body.email, 120).toLowerCase();
  const code = str(body.code, 8);
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (!email || !code) return fail(res, 400, '请填写邮箱和验证码');
  if (newPassword.length < 6) return fail(res, 400, '新密码至少 6 位');
  if (newPassword.length > 72) return fail(res, 400, '新密码过长');
  const result = await store.consumeResetCode(email, code, hashPassword(newPassword));
  if (result.error) return fail(res, 400, result.error);
  json(res, 200, { ok: true });
}

async function handlePutData(req, res, session) {
  const body = await readBody(req);
  const keys = ['clients', 'products', 'projects', 'tasks', 'movements', 'invoices', 'payments', 'staff', 'handovers'];
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

/* -------------------------- 员工账号管理（仅企业管理员） -------------------------- */

const MEMBER_ROLES = ['manager', 'staff'];

async function handleListMembers(req, res, session) {
  const members = await store.listMembers(session.user.companyId);
  json(res, 200, { members });
}

async function handleCreateMember(req, res, session) {
  const body = await readBody(req);
  const username = str(body.username, 32);
  const password = typeof body.password === 'string' ? body.password : '';
  const role = MEMBER_ROLES.includes(body.role) ? body.role : 'staff';
  const displayName = str(body.displayName, 32);
  const staffId = str(body.staffId, 40);
  const email = str(body.email, 120).toLowerCase();
  const phone = str(body.phone, 24);

  if (!/^[A-Za-z0-9_.-]{2,32}$/.test(username)) {
    return fail(res, 400, '员工账号请用 2-32 位字母、数字、下划线或点');
  }
  if (password.length < 6) return fail(res, 400, '初始密码至少 6 位');
  if (!displayName) return fail(res, 400, '请填写员工姓名');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, '邮箱格式不正确');

  const result = await store.createMember({
    companyId: session.user.companyId, username,
    passwordHash: hashPassword(password), displayName, role,
    staffId: staffId || null, email, phone
  });
  if (result.error) return fail(res, 409, result.error);
  store.addAuditLogs(session.user.companyId, [{
    actor: actorOf(session), role: session.user.role, action: 'account',
    target: `账号 · ${username}`, detail: `为「${displayName}」开通${ROLE_LABEL[role]}账号`
  }]).catch(() => {});
  json(res, 201, { id: result.id });
}

async function handleUpdateMember(req, res, session, memberId) {
  const body = await readBody(req);
  const patch = {};
  if (body.password) {
    if (String(body.password).length < 6) return fail(res, 400, '新密码至少 6 位');
    patch.passwordHash = hashPassword(String(body.password));
  }
  if (MEMBER_ROLES.includes(body.role)) patch.role = body.role;
  if (body.status === 'active' || body.status === 'disabled') patch.status = body.status;
  if (body.displayName !== undefined) patch.displayName = str(body.displayName, 32);
  if (body.staffId !== undefined) patch.staffId = str(body.staffId, 40);
  if (body.email !== undefined) {
    const email = str(body.email, 120).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, '邮箱格式不正确');
    patch.email = email;
  }
  if (body.phone !== undefined) patch.phone = str(body.phone, 24);
  if (!Object.keys(patch).length) return fail(res, 400, '没有需要更新的内容');

  await store.updateMember(session.user.companyId, memberId, patch);
  const label = [patch.passwordHash ? '重置密码' : '', patch.role ? `角色改为${ROLE_LABEL[patch.role]}` : '',
    patch.status ? (patch.status === 'disabled' ? '停用账号' : '启用账号') : ''].filter(Boolean).join('、');
  store.addAuditLogs(session.user.companyId, [{
    actor: actorOf(session), role: session.user.role, action: 'account',
    target: `账号 · ${body.username || memberId}`, detail: label
  }]).catch(() => {});
  json(res, 200, { ok: true });
}

async function handleDeleteMember(req, res, session, memberId) {
  await store.deleteMember(session.user.companyId, memberId);
  store.addAuditLogs(session.user.companyId, [{
    actor: actorOf(session), role: session.user.role, action: 'account',
    target: `账号 · ${memberId}`, detail: '删除员工账号'
  }]).catch(() => {});
  json(res, 200, { ok: true });
}

/* -------------------------- 操作记录 -------------------------- */

async function handlePostLogs(req, res, session) {
  const body = await readBody(req);
  const entries = (Array.isArray(body.entries) ? body.entries : []).map(entry => ({
    actor: actorOf(session), role: session.user.role,
    action: entry.action, target: entry.target, detail: entry.detail
  }));
  await store.addAuditLogs(session.user.companyId, entries);
  json(res, 200, { ok: true });
}

async function handleGetLogs(req, res, session, query) {
  const logs = await store.listAuditLogs(session.user.companyId, {
    limit: query.get('limit'), action: query.get('action'), keyword: query.get('keyword')
  });
  json(res, 200, { logs });
}

/* 员工自助更新自己负责的任务进度 */
async function handleTaskProgress(req, res, session, taskId) {
  const body = await readBody(req);
  const result = await store.updateTenantTask(
    session.user.companyId, taskId,
    { status: str(body.status, 12), progress: body.progress },
    session.user.displayName
  );
  if (result.error === 'notfound') return fail(res, 404, '任务不存在');
  if (result.error === 'forbidden') return fail(res, 403, '只能更新自己负责的任务');
  store.addAuditLogs(session.user.companyId, [{
    actor: actorOf(session), role: session.user.role, action: 'update',
    target: `任务 · ${result.task.title}`, detail: `更新为「${result.task.status}」· 进度 ${result.task.progress}%`
  }]).catch(() => {});
  json(res, 200, { task: result.task });
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
      if (route === 'POST /api/forgot') return await handleForgot(req, res);
      if (route === 'POST /api/reset-password') return await handleResetPassword(req, res);
      if (route === 'POST /api/change-password') {
        const session = await requireSession(req, res);
        if (!session) return;
        return await handleChangePassword(req, res, session);
      }
      if (route === 'PATCH /api/me') {
        const session = await requireSession(req, res);
        if (!session) return;
        return await handleUpdateMe(req, res, session);
      }
      if (route === 'GET /api/data') {
        const session = await requireSession(req, res);
        if (!session) return;
        return json(res, 200, await store.getTenantData(session.user.companyId));
      }
      if (route === 'PUT /api/data') {
        // 员工为只读角色，不允许整体覆盖业务数据
        const session = await requireSession(req, res, 2);
        if (!session) return;
        return await handlePutData(req, res, session);
      }
      if (route === 'GET /api/members') {
        const session = await requireSession(req, res, 3);
        if (!session) return;
        return await handleListMembers(req, res, session);
      }
      if (route === 'POST /api/members') {
        const session = await requireSession(req, res, 3);
        if (!session) return;
        return await handleCreateMember(req, res, session);
      }
      if (pathname.startsWith('/api/members/')) {
        const memberId = pathname.slice('/api/members/'.length);
        const session = await requireSession(req, res, 3);
        if (!session) return;
        if (req.method === 'PATCH') return await handleUpdateMember(req, res, session, memberId);
        if (req.method === 'DELETE') return await handleDeleteMember(req, res, session, memberId);
        return fail(res, 405, '不支持的请求方式');
      }
      if (route === 'GET /api/logs') {
        const session = await requireSession(req, res, 2);
        if (!session) return;
        return await handleGetLogs(req, res, session, new URL(req.url, 'http://localhost').searchParams);
      }
      if (route === 'POST /api/logs') {
        const session = await requireSession(req, res);
        if (!session) return;
        return await handlePostLogs(req, res, session);
      }
      if (req.method === 'PATCH' && /^\/api\/tasks\/[^/]+$/.test(pathname)) {
        const session = await requireSession(req, res);
        if (!session) return;
        return await handleTaskProgress(req, res, session, decodeURIComponent(pathname.split('/').pop()));
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
