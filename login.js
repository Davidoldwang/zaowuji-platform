/* 造物集 · 登录与公司注册逻辑 */
(function () {
  'use strict';

  const SESSION_KEY = 'zwj_session_v1';
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  /* ---------------- 会话存储（与 app.js 保持一致） ---------------- */

  function readSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeSession(payload) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  /* ---------------- 请求封装 ---------------- */

  async function api(path, options = {}) {
    const session = readSession();
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (session && session.token) headers.Authorization = `Bearer ${session.token}`;
    const res = await fetch(path, Object.assign({}, options, { headers }));
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const message = (data && data.error) || `请求失败（${res.status}）`;
      const error = new Error(message);
      error.status = res.status;
      throw error;
    }
    return data;
  }

  /* ---------------- UI 辅助 ---------------- */

  const alertBox = $('#authAlert');

  function showAlert(message, ok = false) {
    alertBox.textContent = message;
    alertBox.classList.toggle('ok', ok);
    alertBox.classList.add('show');
  }

  function hideAlert() {
    alertBox.classList.remove('show', 'ok');
    alertBox.textContent = '';
  }

  function setLoading(form, loading, label) {
    const btn = form.querySelector('.auth-submit');
    btn.classList.toggle('loading', loading);
    btn.disabled = loading;
    if (label) btn.querySelector('.label').textContent = label;
  }

  function redirectTarget() {
    const next = new URLSearchParams(location.search).get('next');
    if (next && /^[a-zA-Z0-9_-]+\.html$/.test(next) && next !== 'login.html') return next;
    return 'index.html';
  }

  function goWorkspace() {
    location.replace(redirectTarget());
  }

  /* ---------------- 标签切换 ---------------- */

  const copy = {
    login: { title: '欢迎回来', desc: '输入公司名称和密码，进入你所在公司的工作台。' },
    register: { title: '注册你的公司', desc: '填一个中文公司名称和密码就能开通，名称即登录账号。' }
  };

  function switchTab(tab) {
    $$('.auth-tabs button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    $('#loginForm').classList.toggle('hidden', tab !== 'login');
    $('#registerForm').classList.toggle('hidden', tab !== 'register');
    $('#authTitle').textContent = copy[tab].title;
    $('#authDesc').textContent = copy[tab].desc;
    hideAlert();
    const first = tab === 'login' ? $('#loginUsername') : $('#regCompany');
    if (first) first.focus();
  }

  $$('.auth-tabs button').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  /* ---------------- 登录 ---------------- */

  $('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    hideAlert();
    const username = $('#loginUsername').value.trim();
    const password = $('#loginPassword').value;
    if (!username || !password) return showAlert('请输入公司名称和密码');

    setLoading(event.currentTarget, true);
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      writeSession({
        token: data.token,
        expiresAt: data.expiresAt,
        user: data.user,
        company: data.company
      });
      showAlert('登录成功，正在进入工作台…', true);
      goWorkspace();
    } catch (error) {
      showAlert(error.message);
      setLoading(event.currentTarget, false);
    }
  });

  /* ---------------- 注册 ---------------- */

  $('#registerForm').addEventListener('submit', async event => {
    event.preventDefault();
    hideAlert();

    const companyName = $('#regCompany').value.trim();
    const password = $('#regPassword').value;
    const password2 = $('#regPassword2').value;

    if (companyName.length < 2) return showAlert('请填写公司名称（至少 2 个字）');
    if (companyName.length > 32) return showAlert('公司名称请控制在 32 个字以内');
    if (password.length < 6) return showAlert('密码至少 6 位');
    if (password !== password2) return showAlert('两次输入的密码不一致');

    setLoading(event.currentTarget, true);
    try {
      const data = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({ companyName, password })
      });
      writeSession({
        token: data.token,
        expiresAt: data.expiresAt,
        user: data.user,
        company: data.company
      });
      showAlert('公司创建成功，正在进入工作台…', true);
      goWorkspace();
    } catch (error) {
      showAlert(error.message);
      setLoading(event.currentTarget, false);
    }
  });

  /* ---------------- 已登录则直接进入 ---------------- */

  (async function autoEnter() {
    const session = readSession();
    if (!session || !session.token) {
      $('#loginUsername').focus();
      return;
    }
    try {
      const me = await api('/api/me');
      writeSession(Object.assign({}, session, { user: me.user, company: me.company }));
      goWorkspace();
    } catch (error) {
      clearSession();
      $('#loginUsername').focus();
    }
  })();
})();
