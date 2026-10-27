/* 造物集 · 登录、员工登录与公司注册逻辑 */
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
    if (!btn) return;
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

  function saveAndEnter(data, message) {
    writeSession({
      token: data.token,
      expiresAt: data.expiresAt,
      user: data.user,
      company: data.company
    });
    showAlert(message, true);
    goWorkspace();
  }

  /* ---------------- 视图切换：企业登录 / 员工登录 / 注册 ---------------- */

  const VIEWS = {
    company: {
      title: '企业登录', desc: '用注册时填写的公司名称和密码进入全公司工作台。',
      form: '#loginForm'
    },
    staff: {
      title: '员工登录', desc: '填写公司名称、管理员开通的员工账号和密码。',
      form: '#staffForm'
    },
    register: {
      title: '注册你的公司', desc: '填一个中文公司名称和密码就能开通，名称即企业登录账号。',
      form: '#registerForm'
    }
  };

  let view = 'company';

  function switchView(next) {
    view = next;
    Object.keys(VIEWS).forEach(key => {
      const form = $(VIEWS[key].form);
      if (form) form.classList.toggle('hidden', key !== next);
    });
    $('#authTitle').textContent = VIEWS[next].title;
    $('#authDesc').textContent = VIEWS[next].desc;
    $('#roleSwitch').classList.toggle('hidden', next === 'register');
    $$('#roleSwitch button').forEach(btn => btn.classList.toggle('active', btn.dataset.role === next));
    $('#toRegister').classList.toggle('hidden', next === 'register');
    $('#toLogin').classList.toggle('hidden', next !== 'register');
    hideAlert();
    const firstInput = $(`${VIEWS[next].form} input`);
    if (firstInput) setTimeout(() => firstInput.focus(), 60);
  }

  $$('#roleSwitch button').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.role));
  });
  $('#toRegister').addEventListener('click', () => switchView('register'));
  $('#toLogin').addEventListener('click', () => switchView('company'));

  /* ---------------- 企业登录 ---------------- */

  $('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    hideAlert();
    const companyName = $('#loginCompany').value.trim();
    const password = $('#loginPassword').value;
    if (!companyName || !password) return showAlert('请输入公司名称和密码');

    setLoading(event.currentTarget, true);
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ mode: 'company', companyName, password })
      });
      saveAndEnter(data, '登录成功，正在进入工作台…');
    } catch (error) {
      showAlert(error.message);
      setLoading(event.currentTarget, false);
    }
  });

  /* ---------------- 员工登录 ---------------- */

  $('#staffForm').addEventListener('submit', async event => {
    event.preventDefault();
    hideAlert();
    const companyName = $('#staffCompany').value.trim();
    const username = $('#staffUsername').value.trim();
    const password = $('#staffPassword').value;
    if (!companyName) return showAlert('请填写所属公司名称');
    if (!username) return showAlert('请填写员工账号');
    if (!password) return showAlert('请输入密码');

    setLoading(event.currentTarget, true);
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ mode: 'staff', companyName, username, password })
      });
      saveAndEnter(data, '登录成功，正在进入员工工作台…');
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
      saveAndEnter(data, '公司创建成功，正在进入工作台…');
    } catch (error) {
      showAlert(error.message);
      setLoading(event.currentTarget, false);
    }
  });

  /* ---------------- 初始化 ---------------- */

  (async function autoEnter() {
    const params = new URLSearchParams(location.search);
    // ?switch=1 表示用户主动切换账号：先清掉本地登录状态，停留在登录页
    if (params.get('switch') === '1') {
      const session = readSession();
      if (session && session.token) {
        api('/api/logout', { method: 'POST' }).catch(() => {});
      }
      clearSession();
      switchView('company');
      showAlert('已退出原账号，请重新登录');
      return;
    }

    const session = readSession();
    if (!session || !session.token) {
      switchView('company');
      return;
    }
    try {
      const me = await api('/api/me');
      writeSession(Object.assign({}, session, { user: me.user, company: me.company }));
      goWorkspace();
    } catch (error) {
      clearSession();
      switchView('company');
    }
  })();
})();
