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
    },
    forgot: {
      title: '找回密码', desc: '凭注册时绑定的邮箱接收验证码，重置登录密码。',
      form: '#forgotForm'
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
    const isAuthOnly = next === 'register' || next === 'forgot';
    $('#roleSwitch').classList.toggle('hidden', isAuthOnly);
    $$('#roleSwitch button').forEach(btn => btn.classList.toggle('active', btn.dataset.role === next));
    $('#toRegister').classList.toggle('hidden', isAuthOnly);
    $('#toForgot').classList.toggle('hidden', isAuthOnly);
    $('#toLogin').classList.toggle('hidden', !isAuthOnly);
    hideAlert();
    const firstInput = $(`${VIEWS[next].form} input`);
    if (firstInput) setTimeout(() => firstInput.focus(), 60);
  }

  $$('#roleSwitch button').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.role));
  });
  $('#toRegister').addEventListener('click', () => switchView('register'));
  $('#toLogin').addEventListener('click', () => switchView('company'));
  $('#toForgot').addEventListener('click', () => switchView('forgot'));

  /* 找回密码：企业账号 / 员工账号切换 */
  let forgotEntry = 'company';
  $$('#forgotEntry button').forEach(btn => {
    btn.addEventListener('click', () => {
      forgotEntry = btn.dataset.forgot;
      $$('#forgotEntry button').forEach(b => b.classList.toggle('active', b === btn));
      $('#fgUsernameWrap').classList.toggle('hidden', forgotEntry !== 'staff');
    });
  });

  /* 发送验证码 + 60 秒倒计时 */
  let codeCountdown = 0;
  async function sendCode() {
    const companyName = $('#fgCompany').value.trim();
    const username = $('#fgUsername').value.trim();
    const email = $('#fgEmail').value.trim();
    if (!companyName) return showAlert('请填写公司名称');
    if (forgotEntry === 'staff' && !username) return showAlert('请填写员工账号');
    if (!email) return showAlert('请填写绑定邮箱');
    hideAlert();
    const btn = $('#sendCodeBtn');
    btn.disabled = true;
    try {
      const data = await api('/api/forgot', {
        method: 'POST',
        body: JSON.stringify({ entry: forgotEntry, companyName, username, email })
      });
      if (data.demoCode) {
        showAlert(`演示模式：验证码 ${data.demoCode}（10 分钟内有效）`, true);
      } else if (data.sent) {
        showAlert('验证码已发送到你的邮箱，请查收（10 分钟内有效）', true);
      } else {
        showAlert('如果该邮箱已绑定账号，验证码已发送；未收到请检查邮箱或联系管理员', true);
      }
      codeCountdown = 60;
      tickCode();
    } catch (error) {
      showAlert(error.message);
      btn.disabled = false;
    }
  }
  function tickCode() {
    const btn = $('#sendCodeBtn');
    if (codeCountdown <= 0) { btn.disabled = false; btn.textContent = '重新获取'; return; }
    btn.textContent = `${codeCountdown}s 后重发`;
    codeCountdown -= 1;
    setTimeout(tickCode, 1000);
  }
  $('#sendCodeBtn').addEventListener('click', sendCode);

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
    const email = $('#regEmail').value.trim();
    const phone = $('#regPhone').value.trim();

    if (companyName.length < 2) return showAlert('请填写公司名称（至少 2 个字）');
    if (companyName.length > 32) return showAlert('公司名称请控制在 32 个字以内');
    if (password.length < 6) return showAlert('密码至少 6 位');
    if (password !== password2) return showAlert('两次输入的密码不一致');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showAlert('邮箱格式不正确');

    setLoading(event.currentTarget, true);
    try {
      const data = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({ companyName, password, email, phone })
      });
      saveAndEnter(data, '公司创建成功，正在进入工作台…');
    } catch (error) {
      showAlert(error.message);
      setLoading(event.currentTarget, false);
    }
  });

  /* ---------------- 忘记密码 ---------------- */

  $('#forgotForm').addEventListener('submit', async event => {
    event.preventDefault();
    hideAlert();
    const email = $('#fgEmail').value.trim();
    const code = $('#fgCode').value.trim();
    const newPassword = $('#fgNewPassword').value;
    const newPassword2 = $('#fgNewPassword2').value;

    if (!email || !code) return showAlert('请填写邮箱和验证码');
    if (newPassword.length < 6) return showAlert('新密码至少 6 位');
    if (newPassword !== newPassword2) return showAlert('两次输入的新密码不一致');

    setLoading(event.currentTarget, true);
    try {
      await api('/api/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code, newPassword })
      });
      showAlert('密码已重置，请用新密码登录', true);
      setTimeout(() => switchView('company'), 1200);
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
