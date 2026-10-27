/* 造物集 · 手机浏览器版本
 * 复用 app.js 的数据模型、弹窗、提醒与增删改操作，只重写移动端信息架构。
 */
'use strict';

const mUi = {
  search: { projects: '', clients: '', products: '', inventory: '', tasks: '', staff: '' },
  projectStatus: '',
  clientCredit: '',
  productType: '',
  inventoryFilter: '',
  taskStatus: ''
};

const META = {
  dashboard: {label:'移动工作台', title:'工作台', eyebrow:'TODAY OVERVIEW'},
  projects: {label:'开发进度', title:'开发进度', eyebrow:'DEVELOPMENT PIPELINE'},
  tasks: {label:'员工工作', title:'员工工作', eyebrow:'TEAM TASKS'},
  clients: {label:'客户管理', title:'客户管理', eyebrow:'CLIENT RELATIONSHIP'},
  products: {label:'产品信息', title:'产品信息', eyebrow:'PRODUCT LIBRARY'},
  inventory: {label:'库存管理', title:'库存管理', eyebrow:'INVENTORY CONTROL'},
  staff: {label:'员工管理', title:'员工管理', eyebrow:'TEAM ROSTER'}
};

const mEsc = esc;
const mIcon = icon;
const mMoney = money;

function mBadge(status) {
  const map = {'已完成':'green','进行中':'blue','存在延期':'red','延期':'red','未开始':'','待开始':'','已开票':'green','待开票':'orange','低库存':'red','充足':'green','授信':'green','未授信':''};
  return `<span class="m-badge ${map[status] ?? ''}">${mEsc(status)}</span>`;
}
function mAvatar(name) {
  return `<span class="m-avatar">${mEsc(String(name || '—').slice(0,1))}</span>`;
}
function mProgress(value, orange=false) {
  return `<div class="m-progress-track"><i class="${orange?'orange':''}" style="width:${clamp(value,0,100)}%"></i></div>`;
}
function mEmpty(text='暂无数据') {
  return `<div class="m-empty"><span>${mIcon('search')}</span>${mEsc(text)}</div>`;
}
function mSectionTitle(title, link, action) {
  return `<div class="m-section-head"><div class="m-section-title"><i></i><h2>${title}</h2></div>${link?`<button class="m-section-link" data-action="${action || 'noop'}" ${action==='mnav'?'':''} data-mnav="${action || ''}">${link} ${mIcon('arrow')}</button>`:''}</div>`;
}
function mPageHeader(key, desc, action='') {
  const meta = META[key];
  return `<header class="m-page-header"><div><span class="m-eyebrow">${meta.eyebrow}</span><h1 class="m-page-title">${meta.title}</h1><p>${desc}</p></div>${action}</header>`;
}
function mHeaderAction(action, iconName, title) {
  return `<button class="m-page-action" data-action="${action}" title="${title}">${mIcon(iconName)}</button>`;
}
function mSummary(items) {
  return `<div class="m-summary-strip">${items.map(item=>`<div><strong>${item[0]}</strong><small>${item[1]}</small></div>`).join('')}</div>`;
}
function mSearch(key, placeholder) {
  return `<label class="m-search-box">${mIcon('search')}<input data-msearch="${key}" value="${mEsc(mUi.search[key] || '')}" placeholder="${placeholder}" autocomplete="off"></label>`;
}
function mChip(label, active, attrs) {
  return `<button class="m-filter-chip ${active?'active':''}" ${attrs}>${label}</button>`;
}
function mStageDots(project) {
  return `<div class="m-stages">${project.stages.map(stage=>{
    const delayed = stage.status !== '已完成' && daysFromToday(stage.plan) < 0;
    const state = stage.status === '已完成' ? 'done' : delayed ? 'delay' : stage.status === '进行中' ? 'current' : '';
    return `<div class="m-stage ${state}" title="${mEsc(stage.name)} · ${stage.plan}"><i></i><span>${mEsc(stage.name.replace('确认','').replace('优化','').replace('最终',''))}</span></div>`;
  }).join('')}</div>`;
}
function mProjectCard(project) {
  const client = clientById(project.clientId);
  const status = projectStatus(project);
  const progress = projectProgress(project);
  const delay = projectDelayed(project);
  const remaining = daysFromToday(project.deadline);
  return `<article class="m-project-card" data-action="view-project" data-id="${project.id}" data-mcard="projects" data-mtext="${mEsc(`${project.name}${project.code}${client?.company || ''}${client?.name || ''}${project.manager}`.toLowerCase())}">
    <div class="m-card-top"><div class="m-project-title"><small>${mEsc(project.code)}</small><strong>${mEsc(project.name)}</strong><div class="m-project-client">${mIcon('building')}${mEsc(client?.company || '未关联客户')}</div></div>${mBadge(status)}</div>
    ${mStageDots(project)}
    <div class="m-progress-info"><span>当前：${mEsc(currentStage(project).name)}</span><strong>${progress}%</strong></div>
    ${mProgress(progress, delay)}
    <div class="m-project-meta"><span class="m-owner">${mAvatar(project.manager)}${mEsc(project.manager)}</span><span class="m-deadline ${remaining < 0 || delay ? 'warn' : ''}">${mIcon('calendar')}${remaining < 0 ? '已到期' : `${dateShort(project.deadline)} 交付`}</span></div>
  </article>`;
}
function mTaskRow(task) {
  const overdue = task.status !== '已完成' && daysFromToday(task.due) < 0;
  const done = task.status === '已完成';
  return `<button class="m-task-row" data-action="edit-task" data-id="${task.id}" data-mcard="tasks" data-mtext="${mEsc(`${task.title}${task.owner}${task.role}${projectById(task.projectId)?.name || ''}`.toLowerCase())}">
    <span class="m-task-check ${done?'done':task.status==='进行中'?'doing':''}">${mIcon('check')}</span>
    <span class="m-task-content"><strong>${mEsc(task.title)}</strong><small>${mIcon('route')}${mEsc(projectById(task.projectId)?.name || '未关联项目')} · <em>${mEsc(task.role)}</em></small></span>
    <span class="m-task-tail"><span style="${overdue?'color:var(--m-red)':''}">${overdue?'已逾期':daysFromToday(task.due)===0?'今天截止':dateShort(task.due)}</span>${mIcon('chevron')}</span>
  </button>`;
}
function mClientCard(client) {
  const projects = db.projects.filter(p=>p.clientId===client.id);
  const hasPendingInvoice = db.invoices.some(i=>i.clientId===client.id && i.status==='待开票');
  return `<article class="m-client-card" data-mcard="clients" data-mtext="${mEsc(`${client.name}${client.company}${client.phone}${client.needs}`.toLowerCase())}">
    <div class="m-client-head"><span class="m-client-logo">${mEsc(client.company.slice(0,1))}</span><div class="m-client-info"><strong>${mEsc(client.company)}</strong><small>${mEsc(client.name)} · ${mEsc(client.phone)}</small></div>${mBadge(client.credit?'授信':'未授信')}</div>
    <div class="m-client-stats"><div><span>费用预算</span><strong>${mMoney(client.budget,true)}</strong></div><div><span>关联项目</span><strong>${projects.length} 个</strong></div><div><span>剩余授信</span><strong>${client.credit?mMoney(client.creditLimit-client.creditUsed,true):'—'}</strong></div></div>
    <div class="m-client-foot"><small>${mIcon('receipt')}<span>${hasPendingInvoice?'有待开票 · ':'开票正常 · '}${mEsc(client.needs)}</span></small><button class="m-text-btn" data-action="view-client" data-id="${client.id}">查看 ${mIcon('chevron')}</button></div>
  </article>`;
}
function mProductCard(product, compact=false) {
  const stock = stockOf(product.id);
  const low = stock <= product.minStock;
  const cost = productCost(product);
  const margin = productMargin(product);
  return `<article class="m-product-card" data-mcard="products" data-mtext="${mEsc(`${product.name}${product.code}${product.type}${product.material}`.toLowerCase())}">
    <div class="m-product-code">${mEsc(product.code)}</div>
    <div class="m-product-name-row"><strong>${mEsc(product.name)}</strong><span>${mEsc(product.type)}</span></div>
    <div class="m-cost-grid"><div><span>单件成本</span><strong>${mMoney(cost)}</strong></div><div><span>零售价</span><strong>${mMoney(product.retail)}</strong></div><div><span>毛利率</span><strong class="green">${margin.toFixed(1)}%</strong></div></div>
    <div class="m-product-stock-row"><div class="m-inline-stock"><span>实时库存</span><strong class="${low?'low':''}">${stock}</strong><div class="m-mini-meter"><i class="${low?'low':''}" style="width:${clamp(stock/(product.minStock*3)*100,3,100)}%"></i></div></div>
      <div class="m-stock-actions"><button class="m-stock-btn in" data-action="add-movement" data-id="${product.id}" data-type="in">${mIcon('inbound')}入库</button><button class="m-stock-btn out" data-action="add-movement" data-id="${product.id}" data-type="out">${mIcon('outbound')}出库</button></div>
    </div>
    ${compact?'':`<div style="margin-top:9px;text-align:right"><button class="m-text-btn" data-action="edit-product" data-id="${product.id}">编辑产品成本 ${mIcon('chevron')}</button></div>`}
  </article>`;
}
function mStockCard(product) {
  const stock = stockOf(product.id);
  const low = stock <= product.minStock;
  return `<article class="m-stock-card" data-mcard="inventory" data-mtext="${mEsc(`${product.name}${product.code}${product.type}`.toLowerCase())}">
    <div class="m-stock-top"><div><h3>${mEsc(product.name)}</h3><span class="m-stock-code">${mEsc(product.code)} · ${mEsc(product.type)}</span></div><div class="m-stock-number"><strong style="${low?'color:var(--m-red)':''}">${stock}</strong><small>${low?'低于安全库存':'件可用'}</small></div></div>
    <div class="m-stock-details"><div><span>零售价</span><strong>${mMoney(product.retail)}</strong></div><div><span>综合成本</span><strong>${mMoney(productCost(product))}</strong></div><div><span>折扣率</span><strong>${Math.round(product.discount*100)}%</strong></div></div>
    <div class="m-stock-actions"><button class="m-stock-btn in" data-action="add-movement" data-id="${product.id}" data-type="in">${mIcon('inbound')}入库登记</button><button class="m-stock-btn out" data-action="add-movement" data-id="${product.id}" data-type="out">${mIcon('outbound')}出库登记</button></div>
  </article>`;
}
function mMovementCard(movement) {
  const product = productById(movement.productId);
  const isIn = movement.type === 'in';
  return `<article class="m-movement-card" data-mcard="inventory" data-mtext="${mEsc(`${product?.name || ''}${product?.code || ''}${movement.operator}${movement.note}`.toLowerCase())}">
    <span class="m-movement-icon ${isIn?'':'out'}">${mIcon(isIn?'inbound':'outbound')}</span>
    <div class="m-movement-info"><strong>${mEsc(product?.name || '未知产品')}</strong><small>${movement.date} · ${movement.operator} · ${mEsc(projectById(movement.projectId)?.name || '无关联项目')}${movement.note?` · ${mEsc(movement.note)}`:''}</small></div>
    <span class="m-movement-qty ${isIn?'':'out'}">${isIn?'+':'-'}${movement.quantity}</span>
  </article>`;
}

function renderMobileDashboard() {
  const hour = new Date().getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const active = db.projects.filter(p=>p.status !== '已完成');
  const delayed = active.filter(projectDelayed).length;
  const pendingTasks = db.tasks.filter(t=>t.status !== '已完成');
  const dueSoon = pendingTasks.filter(t=>daysFromToday(t.due) <= 1).length;
  const lowStocks = db.products.filter(p=>stockOf(p.id) <= p.minStock);
  const received = db.projects.reduce((sum,p)=>sum+Number(p.received),0);
  const contract = db.projects.reduce((sum,p)=>sum+Number(p.amount),0);
  const reminders = getReminders();
  const priorityReminder = reminders.find(r=>r.level === 'red') || reminders[0];
  const recentProjects = [...active].sort((a,b)=>a.deadline.localeCompare(b.deadline)).slice(0,3);
  const tasks = [...pendingTasks].sort((a,b)=>a.due.localeCompare(b.due)).slice(0,3);
  const date = new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric'}).format(new Date()).split('/');
  const weekday = new Intl.DateTimeFormat('zh-CN',{weekday:'short'}).format(new Date());
  return `<section class="m-greeting">
      <div class="m-greeting-top"><div><span class="m-eyebrow">MY WORKSPACE · 造物集</span><h1>${greeting}，林然</h1><p>${pendingTasks.length} 项工作待推进，${dueSoon ? `${dueSoon} 项临近截止` : '暂无临期任务'}。</p></div><div class="m-today"><strong>${date[1] || new Date().getDate()}</strong><small>${date[0] ? `${date[0]}月 · ` : ''}${weekday}</small></div></div>
    </section>
    <div class="m-quick-actions">
      <button class="m-quick-action" data-action="add-project"><span>${mIcon('route')}</span>新建项目</button>
      <button class="m-quick-action" data-action="add-task"><span>${mIcon('check')}</span>分配任务</button>
      <button class="m-quick-action" data-action="add-movement" data-type="in"><span>${mIcon('inbound')}</span>登记入库</button>
      <button class="m-quick-action" data-mnav="clients"><span>${mIcon('users')}</span>客户档案</button>
    </div>
    <div class="m-kpis">
      <div class="m-kpi"><div class="m-kpi-head"><span>进行中项目</span><span class="m-kpi-icon">${mIcon('route')}</span></div><div class="m-kpi-value">${active.length}<small>个</small></div><div class="m-kpi-foot"><span class="warn">${delayed} 个延期</span><span>· 共 ${db.projects.length} 个项目</span></div></div>
      <div class="m-kpi"><div class="m-kpi-head"><span>项目回款</span><span class="m-kpi-icon blue">${mIcon('wallet')}</span></div><div class="m-kpi-value">${mMoney(received,true)}</div><div class="m-kpi-foot"><span>回款率 ${Math.round(contract?received/contract*100:0)}%</span></div></div>
      <div class="m-kpi"><div class="m-kpi-head"><span>实时库存</span><span class="m-kpi-icon orange">${mIcon('box')}</span></div><div class="m-kpi-value">${db.products.reduce((sum,p)=>sum+stockOf(p.id),0).toLocaleString()}<small>件</small></div><div class="m-kpi-foot"><span class="warn">${lowStocks.length} 款低库存</span></div></div>
      <div class="m-kpi"><div class="m-kpi-head"><span>团队待办</span><span class="m-kpi-icon red">${mIcon('check')}</span></div><div class="m-kpi-value">${pendingTasks.length}<small>项</small></div><div class="m-kpi-foot"><span class="warn">${dueSoon} 项临近截止</span></div></div>
    </div>
    ${priorityReminder ? `<button class="m-alert-banner" data-action="open-reminders"><span class="m-alert-icon">${mIcon('warning')}</span><div class="m-alert-text"><strong>${mEsc(priorityReminder.title)}</strong><small>${mEsc(priorityReminder.desc)}</small></div>${mIcon('chevron')}</button>` : ''}
    <section class="m-section"><div class="m-section-head"><div class="m-section-title"><i></i><h2>重点项目</h2></div><button class="m-section-link" data-mnav="projects">全部项目 ${mIcon('arrow')}</button></div><div class="m-project-list">${recentProjects.map(mProjectCard).join('') || mEmpty('暂无进行中项目')}</div></section>
    <section class="m-section"><div class="m-section-head"><div class="m-section-title"><i></i><h2>今日待办</h2></div><button class="m-section-link" data-mnav="tasks">全部任务 ${mIcon('arrow')}</button></div><div class="m-task-list">${tasks.map(mTaskRow).join('') || mEmpty('今天的任务已全部完成')}</div></section>
    ${lowStocks.length ? `<section class="m-section"><div class="m-section-head"><div class="m-section-title"><i></i><h2>库存提醒</h2></div><button class="m-section-link" data-mnav="inventory">库存明细 ${mIcon('arrow')}</button></div><div class="m-stock-list">${lowStocks.slice(0,2).map(p=>`<div class="m-stock-warning" data-action="add-movement" data-id="${p.id}" data-type="in"><span class="m-stock-warning-icon">${mIcon('warning')}</span><div><strong>${mEsc(p.name)}库存偏低</strong><small>当前 ${stockOf(p.id)} 件 · 安全库存 ${p.minStock} 件</small></div><b>${stockOf(p.id)}</b></div>`).join('')}</div></section>` : ''}`;
}

function renderMobileProjects() {
  const f = mUi.search.projects.toLowerCase();
  let list = db.projects.filter(p=>{
    const hay = `${p.name}${p.code}${clientById(p.clientId)?.company || ''}${clientById(p.clientId)?.name || ''}${p.manager}`.toLowerCase();
    const status = projectStatus(p);
    return (!f || hay.includes(f)) && (!mUi.projectStatus || (mUi.projectStatus === '存在延期' ? projectDelayed(p) : status === mUi.projectStatus));
  });
  const active = db.projects.filter(p=>p.status !== '已完成');
  const statuses = ['', '进行中', '存在延期', '已完成'];
  return `${mPageHeader('projects','七个关键节点，随时掌握项目节奏。',mHeaderAction('add-project','plus','新建项目'))}
    ${mSummary([[active.length,'进行中'],[db.projects.filter(projectDelayed).length,'存在延期'],[db.projects.filter(p=>p.status==='已完成').length,'已完成']])}
    ${mSearch('projects','搜索项目、编号或客户')}
    <div class="m-filter-chips">${statuses.map(s=>mChip(s || '全部', mUi.projectStatus === s, `data-mproject-status="${s}"`)).join('')}</div>
    <div class="m-project-list">${list.map(mProjectCard).join('') || mEmpty('没有匹配的项目')}</div>`;
}

function renderMobileTasks() {
  let tasks = db.tasks.filter(t=>{
    const hay = `${t.title}${t.owner}${t.role}${projectById(t.projectId)?.name || ''}`.toLowerCase();
    return (!mUi.search.tasks || hay.includes(mUi.search.tasks.toLowerCase())) && (!mUi.taskStatus || t.status === mUi.taskStatus);
  });
  if (ui.taskView === 'personal') tasks = tasks.filter(t=>t.owner === '林然');
  tasks = [...tasks].sort((a,b)=>{
    const order = {'进行中':0,'待开始':1,'已完成':2};
    return order[a.status] - order[b.status] || a.due.localeCompare(b.due);
  });
  const completed = db.tasks.filter(t=>t.status === '已完成').length;
  const pending = db.tasks.filter(t=>t.status !== '已完成');
  return `${mPageHeader('tasks','任务与项目自动关联，个人与团队节奏清楚可见。',mHeaderAction('add-task','plus','分配任务'))}
    <div class="m-segment"><button data-action="task-view" data-view="team" class="${ui.taskView==='team'?'active':''}">团队视图</button><button data-action="task-view" data-view="personal" class="${ui.taskView==='personal'?'active':''}">我的工作</button></div>
    ${mSummary([[ui.taskView==='personal'?db.tasks.filter(t=>t.owner==='林然').length:db.tasks.length,'全部任务'],[pending.length,'待推进'],[`${Math.round(completed/db.tasks.length*100)}%`,'完成率']])}
    ${mSearch('tasks','搜索任务、负责人或项目')}
    <div class="m-filter-chips">${['','待开始','进行中','已完成'].map(s=>mChip(s || '全部状态',mUi.taskStatus===s,`data-mtask-status="${s}"`)).join('')}</div>
    <div class="m-task-list">${tasks.map(mTaskRow).join('') || mEmpty('没有匹配的任务')}</div>`;
}

function renderMobileClients() {
  const list = db.clients.filter(c=>{
    const hay = `${c.name}${c.company}${c.phone}${c.needs}`.toLowerCase();
    return (!mUi.search.clients || hay.includes(mUi.search.clients.toLowerCase())) && (!mUi.clientCredit || (mUi.clientCredit === '授信' ? c.credit : !c.credit));
  });
  return `${mPageHeader('clients','需求、项目与信用账款，集中沉淀在客户档案。',mHeaderAction('add-client','plus','新增客户'))}
    ${mSummary([[db.clients.length,'合作客户'],[db.projects.length,'关联项目'],[db.clients.filter(c=>c.credit).length,'授信客户']])}
    ${mSearch('clients','搜索客户、单位或联系方式')}
    <div class="m-filter-chips">${['','授信','未授信'].map(s=>mChip(s || '全部客户',mUi.clientCredit===s,`data-mclient-credit="${s}"`)).join('')}</div>
    <div class="m-client-list">${list.map(mClientCard).join('') || mEmpty('没有匹配的客户')}</div>`;
}

function renderMobileProducts() {
  const types = [...new Set(db.products.map(p=>p.type))];
  const list = db.products.filter(p=>{
    const hay = `${p.name}${p.code}${p.type}${p.material}`.toLowerCase();
    return (!mUi.search.products || hay.includes(mUi.search.products.toLowerCase())) && (!mUi.productType || p.type === mUi.productType);
  });
  const stockValue = db.products.reduce((sum,p)=>sum+stockOf(p.id)*productCost(p),0);
  const avgMargin = db.products.reduce((sum,p)=>sum+productMargin(p),0) / Math.max(1,db.products.length);
  return `${mPageHeader('products','明确成本、定价与实时库存，掌握每款产品收益。',mHeaderAction('add-product','plus','新增产品'))}
    ${mSummary([[db.products.length,'产品档案'],[mMoney(stockValue,true),'库存成本'],[`${avgMargin.toFixed(1)}%`,'平均毛利']])}
    ${mSearch('products','搜索产品、编号、材质')}
    <div class="m-filter-chips">${['',...types].map(t=>mChip(t || '全部类型',mUi.productType===t,`data-mproduct-type="${mEsc(t)}"`)).join('')}</div>
    <div class="m-product-list">${list.map(p=>mProductCard(p)).join('') || mEmpty('没有匹配的产品')}</div>`;
}

function renderMobileInventory() {
  const tab = ui.inventoryTab === 'movements' ? 'movements' : 'stock';
  const stockList = db.products.filter(p=>{
    const hay = `${p.name}${p.code}${p.type}`.toLowerCase();
    return (!mUi.search.inventory || hay.includes(mUi.search.inventory.toLowerCase())) && (!mUi.inventoryFilter || (mUi.inventoryFilter === '低库存' ? stockOf(p.id) <= p.minStock : stockOf(p.id) > p.minStock));
  });
  const movements = db.movements.filter(m=>{
    const p = productById(m.productId);
    const hay = `${p?.name || ''}${p?.code || ''}${m.operator}${m.note}`.toLowerCase();
    return !mUi.search.inventory || hay.includes(mUi.search.inventory.toLowerCase());
  }).sort((a,b)=>b.date.localeCompare(a.date));
  const totalStock = db.products.reduce((sum,p)=>sum+stockOf(p.id),0);
  return `${mPageHeader('inventory','出入库流水自动更新库存，每一次变动都有据可查。',mHeaderAction('add-movement','inbound','登记入库'))}
    ${mSummary([[totalStock.toLocaleString(),'实时库存'],[db.products.filter(p=>stockOf(p.id)<=p.minStock).length,'低库存'],[db.movements.length,'流水记录']])}
    <div class="m-stock-toolbar"><button class="secondary-btn" data-action="add-movement" data-type="out">${mIcon('outbound')}出库登记</button><button class="primary-btn" data-action="add-movement" data-type="in">${mIcon('inbound')}入库登记</button></div>
    <div class="m-segment"><button data-action="inventory-tab" data-tab="stock" class="${tab==='stock'?'active':''}">库存总览</button><button data-action="inventory-tab" data-tab="movements" class="${tab==='movements'?'active':''}">出入库流水</button></div>
    ${mSearch('inventory',tab==='stock'?'搜索产品编号或名称':'搜索产品、经办人或备注')}
    ${tab === 'stock' ? `<div class="m-filter-chips">${['','充足','低库存'].map(s=>mChip(s || '全部库存',mUi.inventoryFilter===s,`data-minventory-filter="${s}"`)).join('')}</div><div class="m-stock-list">${stockList.map(mStockCard).join('') || mEmpty('没有匹配的库存产品')}</div>` : `<div class="m-stock-list">${movements.map(mMovementCard).join('') || mEmpty('暂无出入库流水')}</div>`}`;
}

function renderMobileStaff() {
  const active = db.staff.filter(s => s.status !== '停用');
  const pending = db.tasks.filter(t => t.status !== '已完成');
  const rows = db.staff;
  const cards = rows.map(s => {
    const w = staffWorkload(s.name);
    const off = s.status === '停用';
    return `<article class="m-staff-card ${off ? 'inactive' : ''}" data-mcard="staff" data-mtext="${mEsc(`${s.name}${s.role}${s.phone || ''}`.toLowerCase())}">
      <div class="m-staff-top">
        ${mAvatar(s.name)}
        <div class="m-staff-name"><strong>${mEsc(s.name)}</strong><small>${mEsc(s.role || '未填岗位')} · ${off ? '已停用' : '在职'}</small></div>
        <span class="m-staff-load ${w.overdue ? 'warn' : ''}">${w.tasks.length + w.stages.length} 项在办</span>
      </div>
      <div class="m-staff-metrics">
        <div><strong>${w.tasks.length}</strong><small>待办任务</small></div>
        <div class="${w.overdue ? 'warn' : ''}"><strong>${w.overdue}</strong><small>已逾期</small></div>
        <div><strong>${w.stages.length}</strong><small>项目节点</small></div>
        <div><strong>${w.managed.length}</strong><small>在管项目</small></div>
      </div>
      <div class="m-staff-actions">
        <button class="m-mini-btn" data-action="handover-staff" data-id="${s.id}">${mIcon('shuffle')}交接</button>
        <button class="m-mini-btn" data-action="edit-staff" data-id="${s.id}">${mIcon('edit')}编辑</button>
        <button class="m-mini-btn" data-action="toggle-staff" data-id="${s.id}">${off ? '恢复' : '停用'}</button>
      </div>
    </article>`;
  }).join('');
  return `${mPageHeader('staff', '维护员工档案，任务与项目节点可一键交接给同事', mHeaderAction('add-staff', 'plus', '新增员工'))}
    ${mSummary([[String(active.length), '在职员工'], [String(pending.length), '待办任务'], [String(new Set(active.map(s => s.role).filter(Boolean)).size), '岗位类别']])}
    ${mSearch('staff', '搜索姓名、岗位或联系方式')}
    <div class="m-staff-list">${cards || mEmpty('暂无员工档案')}</div>`;
}

function updateMobileShell() {
  const meta = META[ui.page] || META.dashboard;
  // 页头副标题优先显示当前公司，便于确认自己在哪家客户的数据里
  $('#mHeaderSub').textContent = window.__companyName || meta.label;
  $('#projectNavCount').textContent = db.projects.filter(p=>p.status !== '已完成').length;
  $('#taskNavCount').textContent = db.tasks.filter(t=>t.status !== '已完成').length;
  $('#notificationDot').classList.toggle('show',getReminders().length > 0);
  $$('.m-bottom-nav [data-mnav]').forEach(btn=>btn.classList.toggle('active',btn.dataset.mnav === ui.page));
}
function applyMobileSearch(key) {
  const query = (mUi.search[key] || '').trim().toLowerCase();
  $$(`[data-mcard="${key}"]`).forEach(card=>{
    card.classList.toggle('m-hide-item',Boolean(query) && !card.dataset.mtext.includes(query));
  });
}
function renderMobile() {
  const pages = {
    dashboard: renderMobileDashboard,
    projects: renderMobileProjects,
    tasks: renderMobileTasks,
    clients: renderMobileClients,
    products: renderMobileProducts,
    inventory: renderMobileInventory,
    staff: renderMobileStaff
  };
  $('#pageContent').innerHTML = (pages[ui.page] || renderMobileDashboard)();
  updateMobileShell();
  Object.keys(mUi.search).forEach(key=>applyMobileSearch(key));
  window.scrollTo({top:0,behavior:'auto'});
}

// 覆盖桌面版渲染入口，业务表单保存后也会自动回到移动端界面。
window.render = renderMobile;
window.navigate = function(page) {
  ui.page = page;
  renderMobile();
};

document.addEventListener('click',event=>{
  const nav = event.target.closest('[data-mnav]');
  if(nav) {
    event.preventDefault();
    event.stopPropagation();
    ui.page = nav.dataset.mnav;
    if(ui.page === 'inventory') ui.inventoryTab = ui.inventoryTab || 'stock';
    renderMobile();
    return;
  }
  const projectStatus = event.target.closest('[data-mproject-status]');
  if(projectStatus) { mUi.projectStatus = projectStatus.dataset.mprojectStatus; renderMobile(); return; }
  const taskStatus = event.target.closest('[data-mtask-status]');
  if(taskStatus) { mUi.taskStatus = taskStatus.dataset.mtaskStatus; renderMobile(); return; }
  const clientCredit = event.target.closest('[data-mclient-credit]');
  if(clientCredit) { mUi.clientCredit = clientCredit.dataset.mclientCredit; renderMobile(); return; }
  const productType = event.target.closest('[data-mproduct-type]');
  if(productType) { mUi.productType = productType.dataset.mproductType; renderMobile(); return; }
  const inventoryFilter = event.target.closest('[data-minventory-filter]');
  if(inventoryFilter) { mUi.inventoryFilter = inventoryFilter.dataset.minventoryFilter; renderMobile(); return; }
});

document.addEventListener('input',event=>{
  const input = event.target.closest('[data-msearch]');
  if(!input) return;
  const key = input.dataset.msearch;
  mUi.search[key] = input.value;
  applyMobileSearch(key);
});

// 与桌面版共享的列表刷新操作要重新套用移动端筛选条件。
const originalTaskViewHandler = null;

$$('[data-micon]').forEach(el=>{ el.innerHTML = mIcon(el.dataset.micon); });
renderMobile();
document.body.classList.remove('mobile-loading');
