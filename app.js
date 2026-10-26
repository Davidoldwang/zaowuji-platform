/* 造物集 · 文创产品开发进度管理平台
 * 纯前端本地持久化版本：数据保存在浏览器 localStorage。
 * 业务主键：客户 clientId / 产品 productId / 项目 projectId。
 */
'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const DAY = 86400000;
const now = new Date();
const iso = (offset = 0) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const uid = prefix => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money = (value, compact = false) => {
  const n = Number(value) || 0;
  if (compact && Math.abs(n) >= 10000) return `¥${(n / 10000).toFixed(n % 10000 ? 1 : 0)}万`;
  return `¥${n.toLocaleString('zh-CN', {maximumFractionDigits: 2})}`;
};
const dateShort = value => value ? value.slice(5).replace('-', '/') : '—';
const daysFromToday = value => Math.ceil((new Date(`${value}T00:00:00`) - new Date(`${iso()}T00:00:00`)) / DAY);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  route: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h7a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8"/><path d="m15 14 3 3-3 3"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 12 3 3 7-7"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  box: '<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 8 9 5 9-5M3 8v8l9 5 9-5V8M12 13v8"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  spark: '<path d="m12 3-1.6 4.4L6 9l4.4 1.6L12 15l1.6-4.4L18 9l-4.4-1.6L12 3Z"/><path d="m5 15-.8 2.2L2 18l2.2.8L5 21l.8-2.2L8 18l-2.2-.8L5 15Z"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet: '<path d="M4 6h14a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12"/><path d="M16 11h6v5h-6a2.5 2.5 0 0 1 0-5Z"/>',
  trend: '<path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
  warning: '<path d="M10.3 3.7 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>',
  tag: '<path d="M20 13 13 20l-9-9V4h7l9 9Z"/><circle cx="8.5" cy="8.5" r="1"/>',
  receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  inbound: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 15v5h16v-5"/>',
  outbound: '<path d="M12 15V3m0 0 4 4m-4-4L8 7"/><path d="M4 15v5h16v-5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
  credit: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.box}</svg>`;

const STAGES = ['产品设计', '打样确认', '修改优化', '最终定稿', '产品生产', '包装生产', '物流送货'];
const seed = {
  version: 1,
  clients: [
    {id:'c1',name:'陈婉清',company:'江南博物院',phone:'138 0168 5521',contact:'陈婉清 · 文创部',needs:'宋韵文化系列礼盒，用于秋季馆庆及会员礼赠。',budget:260000,payment:'30% 预付款 + 70% 验收款',credit:true,creditLimit:200000,creditUsed:66000,createdAt:iso(-120)},
    {id:'c2',name:'周明远',company:'山海文化集团',phone:'186 2177 0930',contact:'周明远 · 采购中心',needs:'山海经 IP 潮玩盲盒及主题陈列包装。',budget:480000,payment:'月结 30 天',credit:true,creditLimit:350000,creditUsed:228000,createdAt:iso(-210)},
    {id:'c3',name:'许知夏',company:'城市漫游计划',phone:'135 6440 1288',contact:'许知夏 · 品牌主理人',needs:'城市漫步手账、贴纸与城市路线地图套装。',budget:90000,payment:'全款预付',credit:false,creditLimit:0,creditUsed:0,createdAt:iso(-75)},
    {id:'c4',name:'赵景行',company:'敦煌艺术馆',phone:'139 1986 7302',contact:'赵景行 · 衍生品部',needs:'敦煌壁画主题丝巾、艺术微喷与礼赠包装。',budget:180000,payment:'40% 预付款 + 60% 发货前',credit:true,creditLimit:120000,creditUsed:36000,createdAt:iso(-160)},
    {id:'c5',name:'宋妍',company:'拾光书店',phone:'177 2110 6642',contact:'宋妍 · 联合创始人',needs:'书店十周年纪念冰箱贴及文具周边。',budget:65000,payment:'货到付款',credit:false,creditLimit:0,creditUsed:0,createdAt:iso(-90)}
  ],
  products: [
    {id:'p1',code:'ZW-GIFT-001',name:'宋韵四季礼盒',type:'礼盒套装',material:'特种纸 / 陶瓷 / 棉麻',quantity:1000,designFee:18000,sampleFee:4500,moldFee:0,unitCost:68,retail:198,discount:0.85,initialStock:120,minStock:80},
    {id:'p2',code:'ZW-TEA-002',name:'汝窑天青茶杯',type:'茶器',material:'高温陶瓷',quantity:1200,designFee:12000,sampleFee:2800,moldFee:15000,unitCost:42,retail:129,discount:0.9,initialStock:180,minStock:100},
    {id:'p3',code:'ZW-TOY-003',name:'山海经神兽盲盒',type:'潮玩',material:'PVC / ABS',quantity:5000,designFee:35000,sampleFee:8000,moldFee:68000,unitCost:22,retail:79,discount:0.8,initialStock:860,minStock:300},
    {id:'p4',code:'ZW-BOOK-004',name:'城市漫步手账',type:'文具',material:'环保纸 /  PU 封面',quantity:2000,designFee:9000,sampleFee:1600,moldFee:0,unitCost:16,retail:59,discount:0.88,initialStock:320,minStock:120},
    {id:'p5',code:'ZW-SILK-005',name:'敦煌万象丝巾',type:'服饰',material:'桑蚕丝',quantity:800,designFee:15000,sampleFee:3600,moldFee:0,unitCost:55,retail:239,discount:0.9,initialStock:20,minStock:30},
    {id:'p6',code:'ZW-MAG-006',name:'拾光金属冰箱贴',type:'家居',material:'锌合金 / 珐琅',quantity:1500,designFee:6000,sampleFee:1200,moldFee:8500,unitCost:9,retail:39,discount:0.85,initialStock:260,minStock:100}
  ],
  projects: [
    {id:'j1',code:'PRJ-2026-018',name:'宋韵四季文创礼盒',clientId:'c1',productIds:['p1','p2'],manager:'林然',amount:186000,received:120000,deadline:iso(18),status:'进行中',stages:[
      {name:'产品设计',plan:iso(-42),actual:iso(-41),owner:'顾清',status:'已完成'},
      {name:'打样确认',plan:iso(-30),actual:iso(-29),owner:'顾清',status:'已完成'},
      {name:'修改优化',plan:iso(-23),actual:iso(-22),owner:'顾清',status:'已完成'},
      {name:'最终定稿',plan:iso(-14),actual:iso(-14),owner:'陈婉清',status:'已完成'},
      {name:'产品生产',plan:iso(-2),actual:'',owner:'宋恺',status:'进行中'},
      {name:'包装生产',plan:iso(5),actual:'',owner:'宋恺',status:'未开始'},
      {name:'物流送货',plan:iso(15),actual:'',owner:'赵库',status:'未开始'}]},
    {id:'j2',code:'PRJ-2026-021',name:'山海经神兽盲盒系列',clientId:'c2',productIds:['p3'],manager:'周舟',amount:328000,received:100000,deadline:iso(10),status:'进行中',stages:[
      {name:'产品设计',plan:iso(-48),actual:iso(-48),owner:'江离',status:'已完成'},
      {name:'打样确认',plan:iso(-34),actual:iso(-33),owner:'江离',status:'已完成'},
      {name:'修改优化',plan:iso(-24),actual:iso(-23),owner:'江离',status:'已完成'},
      {name:'最终定稿',plan:iso(-18),actual:iso(-17),owner:'周明远',status:'已完成'},
      {name:'产品生产',plan:iso(-5),actual:iso(-4),owner:'宋恺',status:'已完成'},
      {name:'包装生产',plan:iso(1),actual:'',owner:'宋恺',status:'进行中'},
      {name:'物流送货',plan:iso(8),actual:'',owner:'赵库',status:'未开始'}]},
    {id:'j3',code:'PRJ-2026-025',name:'城市漫游手账计划',clientId:'c3',productIds:['p4'],manager:'林然',amount:76000,received:76000,deadline:iso(30),status:'进行中',stages:[
      {name:'产品设计',plan:iso(-20),actual:iso(-20),owner:'顾清',status:'已完成'},
      {name:'打样确认',plan:iso(-10),actual:iso(-9),owner:'顾清',status:'已完成'},
      {name:'修改优化',plan:iso(2),actual:'',owner:'顾清',status:'进行中'},
      {name:'最终定稿',plan:iso(7),actual:'',owner:'许知夏',status:'未开始'},
      {name:'产品生产',plan:iso(15),actual:'',owner:'宋恺',status:'未开始'},
      {name:'包装生产',plan:iso(21),actual:'',owner:'宋恺',status:'未开始'},
      {name:'物流送货',plan:iso(28),actual:'',owner:'赵库',status:'未开始'}]},
    {id:'j4',code:'PRJ-2026-028',name:'敦煌万象艺术丝巾',clientId:'c4',productIds:['p5'],manager:'周舟',amount:142000,received:56800,deadline:iso(42),status:'进行中',stages:[
      {name:'产品设计',plan:iso(3),actual:'',owner:'江离',status:'进行中'},
      {name:'打样确认',plan:iso(12),actual:'',owner:'江离',status:'未开始'},
      {name:'修改优化',plan:iso(18),actual:'',owner:'江离',status:'未开始'},
      {name:'最终定稿',plan:iso(22),actual:'',owner:'赵景行',status:'未开始'},
      {name:'产品生产',plan:iso(30),actual:'',owner:'宋恺',status:'未开始'},
      {name:'包装生产',plan:iso(35),actual:'',owner:'宋恺',status:'未开始'},
      {name:'物流送货',plan:iso(40),actual:'',owner:'赵库',status:'未开始'}]},
    {id:'j5',code:'PRJ-2026-009',name:'拾光书店十周年周边',clientId:'c5',productIds:['p6'],manager:'林然',amount:58000,received:58000,deadline:iso(-12),status:'已完成',stages:STAGES.map((name,i)=>({name,plan:iso(-55+i*6),actual:iso(-55+i*6),owner:i<4?'顾清':i<6?'宋恺':'赵库',status:'已完成'}))}
  ],
  tasks: [
    {id:'t1',title:'确认宋韵礼盒烫金工艺与生产色差',role:'设计师',owner:'顾清',due:iso(0),progress:70,status:'进行中',projectId:'j1',priority:'紧急'},
    {id:'t2',title:'跟进山海经盲盒外箱印刷排期',role:'商务',owner:'周舟',due:iso(1),progress:55,status:'进行中',projectId:'j2',priority:'高'},
    {id:'t3',title:'整理城市手账内页第二轮修改意见',role:'设计师',owner:'顾清',due:iso(2),progress:30,status:'进行中',projectId:'j3',priority:'普通'},
    {id:'t4',title:'拍摄宋韵四季礼盒产品场景图',role:'新媒体',owner:'夏禾',due:iso(5),progress:0,status:'待开始',projectId:'j1',priority:'普通'},
    {id:'t5',title:'核对冰箱贴到货数量并安排上架',role:'库管',owner:'赵库',due:iso(-1),progress:80,status:'进行中',projectId:'j5',priority:'高'},
    {id:'t6',title:'敦煌丝巾首轮图案方向提案',role:'设计师',owner:'江离',due:iso(3),progress:45,status:'进行中',projectId:'j4',priority:'高'},
    {id:'t7',title:'准备山海文化集团阶段验收资料',role:'商务',owner:'周舟',due:iso(-2),progress:100,status:'已完成',projectId:'j2',priority:'普通'},
    {id:'t8',title:'小红书馆藏文创内容选题排期',role:'新媒体',owner:'夏禾',due:iso(7),progress:0,status:'待开始',projectId:'j1',priority:'普通'},
    {id:'t9',title:'完成宋韵项目首批尾款对账',role:'商务',owner:'林然',due:iso(4),progress:0,status:'待开始',projectId:'j1',priority:'高'},
    {id:'t10',title:'低库存产品补货需求汇总',role:'库管',owner:'赵库',due:iso(0),progress:20,status:'进行中',projectId:'j4',priority:'紧急'}
  ],
  movements: [
    {id:'m1',type:'in',productId:'p1',quantity:300,date:iso(-20),operator:'赵库',projectId:'j1',note:'首批大货验收入库'},
    {id:'m2',type:'out',productId:'p1',quantity:145,date:iso(-7),operator:'赵库',projectId:'j1',note:'馆庆会员礼赠发货'},
    {id:'m3',type:'in',productId:'p2',quantity:500,date:iso(-18),operator:'赵库',projectId:'j1',note:'陶瓷杯验收入库'},
    {id:'m4',type:'out',productId:'p2',quantity:230,date:iso(-5),operator:'赵库',projectId:'j1',note:'线下门店铺货'},
    {id:'m5',type:'in',productId:'p3',quantity:1800,date:iso(-9),operator:'赵库',projectId:'j2',note:'盲盒第一批次'},
    {id:'m6',type:'out',productId:'p3',quantity:640,date:iso(-3),operator:'赵库',projectId:'j2',note:'经销商渠道出货'},
    {id:'m7',type:'in',productId:'p4',quantity:600,date:iso(-15),operator:'赵库',projectId:'j3',note:'手账首批入库'},
    {id:'m8',type:'out',productId:'p4',quantity:180,date:iso(-4),operator:'赵库',projectId:'j3',note:'城市漫游活动'},
    {id:'m9',type:'out',productId:'p5',quantity:12,date:iso(-2),operator:'赵库',projectId:'j4',note:'客户样品寄送'},
    {id:'m10',type:'in',productId:'p6',quantity:1000,date:iso(-30),operator:'赵库',projectId:'j5',note:'十周年大货入库'},
    {id:'m11',type:'out',productId:'p6',quantity:750,date:iso(-12),operator:'赵库',projectId:'j5',note:'书店活动交付'},
    {id:'m12',type:'out',productId:'p6',quantity:85,date:iso(-1),operator:'赵库',projectId:'j5',note:'线上订单发货'}
  ],
  invoices: [
    {id:'i1',clientId:'c1',projectId:'j1',amount:55800,date:iso(-32),number:'INV-2026-0092',status:'已开票'},
    {id:'i2',clientId:'c2',projectId:'j2',amount:98400,date:iso(-28),number:'INV-2026-0105',status:'已开票'},
    {id:'i3',clientId:'c4',projectId:'j4',amount:56800,date:iso(-6),number:'INV-2026-0131',status:'已开票'},
    {id:'i4',clientId:'c3',projectId:'j3',amount:76000,date:'',number:'',status:'待开票'},
    {id:'i5',clientId:'c1',projectId:'j1',amount:64200,date:'',number:'',status:'待开票'}
  ],
  payments: []
};

let db;
try {
  const saved = localStorage.getItem('zaowuji-business-db-v1');
  db = saved ? JSON.parse(saved) : structuredClone(seed);
} catch (error) {
  db = structuredClone(seed);
}
const ui = {page:'dashboard',taskView:'team',inventoryTab:'stock',filters:{},modalDirty:false};
const save = () => localStorage.setItem('zaowuji-business-db-v1', JSON.stringify(db));
const clientById = id => db.clients.find(x => x.id === id);
const productById = id => db.products.find(x => x.id === id);
const projectById = id => db.projects.find(x => x.id === id);
const productCost = p => p.unitCost + (Number(p.designFee) + Number(p.sampleFee) + Number(p.moldFee)) / Math.max(1, Number(p.quantity));
const productMargin = p => p.retail ? (p.retail - productCost(p)) / p.retail * 100 : 0;
const stockOf = id => {
  const p = productById(id);
  return (Number(p?.initialStock) || 0) + db.movements.filter(m => m.productId === id).reduce((sum,m) => sum + (m.type === 'in' ? Number(m.quantity) : -Number(m.quantity)),0);
};
const movementTotal = (id,type) => db.movements.filter(m => m.productId === id && m.type === type).reduce((sum,m)=>sum+Number(m.quantity),0);
const projectProgress = p => Math.round(p.stages.filter(s=>s.status==='已完成').length / p.stages.length * 100);
const projectDelayed = p => p.status !== '已完成' && p.stages.some(s=>s.status!=='已完成' && daysFromToday(s.plan)<0);
const projectStatus = p => p.status === '已完成' ? '已完成' : projectDelayed(p) ? '存在延期' : '进行中';
const currentStage = p => p.stages.find(s=>s.status!=='已完成') || p.stages[p.stages.length-1];
const ownerOptions = ['林然','周舟','顾清','江离','夏禾','宋恺','赵库'];
const roleOptions = ['商务','设计师','新媒体','库管'];
const statusBadge = status => {
  const map = {'已完成':'green','进行中':'blue','存在延期':'red','延期':'red','未开始':'gray','待开始':'gray','已开票':'green','待开票':'orange','低库存':'red','充足':'green'};
  return `<span class="badge ${map[status]||'gray'}">${esc(status)}</span>`;
};
const ownerHtml = name => `<span class="owner"><i class="mini-avatar">${esc(name.slice(0,1))}</i>${esc(name)}</span>`;
const emptyState = (title='暂无匹配数据',text='试试调整搜索词或筛选条件') => `<div class="empty-state"><span>${icon('search')}</span><strong>${title}</strong><p>${text}</p></div>`;
const pageHeading = (eyebrow,title,desc,actions='') => `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${desc}</p></div><div class="heading-actions">${actions}</div></div>`;
const actionButton = (action,id,type='view') => `<button data-action="${action}" data-id="${id}" title="${type==='edit'?'编辑':'查看'}">${icon(type==='edit'?'edit':'eye')}</button>`;
const filterBar = (page,placeholder,options='') => {
  const f = ui.filters[page] || {};
  return `<div class="filter-bar"><label class="filter-search">${icon('search')}<input data-filter-search="${page}" value="${esc(f.search||'')}" placeholder="${placeholder}"></label>${options}<span class="filter-count" id="filterCount"></span></div>`;
};
const selectFilter = (page,key,values,current) => {
  const labels={type:'全部类型',status:'全部状态',role:'全部岗位',client:'全部客户',product:'全部产品',time:'全部时间',manager:'全部负责人'};
  return `<select class="select-control" data-filter-key="${key}" data-filter-page="${page}"><option value="">${labels[key]||'全部'}</option>${values.map(item=>{const value=Array.isArray(item)?item[0]:item,label=Array.isArray(item)?item[1]:item;return `<option value="${esc(value)}" ${current===String(value)?'selected':''}>${esc(label)}</option>`}).join('')}</select>`;
};

function getReminders() {
  const reminders = [];
  db.projects.forEach(p => {
    if (p.status === '已完成') return;
    p.stages.forEach((s,index) => {
      if (s.status === '已完成') return;
      const days = daysFromToday(s.plan);
      if (days < 0) reminders.push({kind:'project',level:'red',icon:'warning',title:`${p.name} · ${s.name}已延期`,desc:`计划 ${dateShort(s.plan)} 完成，已延期 ${Math.abs(days)} 天 · 负责人 ${s.owner}`,page:'projects',id:p.id});
      else if (days <= 3) reminders.push({kind:'project',level:'orange',icon:'clock',title:`${p.name} · ${s.name}`,desc:`${days===0?'今天':`${days} 天后`}到计划节点 · 负责人 ${s.owner}`,page:'projects',id:p.id});
    });
  });
  db.tasks.filter(t=>t.status!=='已完成').forEach(t => {
    const days = daysFromToday(t.due);
    if (days <= 1) reminders.push({kind:'task',level:days<0?'red':'orange',icon:'check',title:t.title,desc:`${days<0?`已逾期 ${Math.abs(days)} 天`:days===0?'今天截止':'明天截止'} · ${t.owner} · ${projectById(t.projectId)?.name||'无关联项目'}`,page:'tasks',id:t.id});
  });
  db.products.forEach(p => {
    if (stockOf(p.id) <= p.minStock) reminders.push({kind:'stock',level:'red',icon:'box',title:`${p.name}库存偏低`,desc:`当前 ${stockOf(p.id)} 件，安全库存 ${p.minStock} 件，请及时安排补货`,page:'inventory',id:p.id});
  });
  db.clients.filter(c=>c.credit && c.creditLimit>0 && c.creditUsed/c.creditLimit>=.6).forEach(c => reminders.push({kind:'credit',level:'orange',icon:'credit',title:`${c.company}授信使用较高`,desc:`已使用 ${money(c.creditUsed)} / ${money(c.creditLimit)}，剩余 ${money(c.creditLimit-c.creditUsed)}`,page:'clients',id:c.id}));
  db.invoices.filter(i=>i.status==='待开票').forEach(i => reminders.push({kind:'invoice',level:'orange',icon:'receipt',title:`${clientById(i.clientId)?.company||'客户'}有待开票记录`,desc:`${projectById(i.projectId)?.name||''} · 待开 ${money(i.amount)}`,page:'clients',id:i.clientId}));
  return reminders;
}

function updateShell() {
  $('#projectNavCount').textContent = db.projects.filter(p=>p.status!=='已完成').length;
  $('#taskNavCount').textContent = db.tasks.filter(t=>t.status!=='已完成').length;
  $('#notificationDot').classList.toggle('show',getReminders().length>0);
  $$('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.nav===ui.page));
  $('#todayLabel').textContent = new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'short'}).format(now);
}

function renderDashboard() {
  const f=ui.filters.dashboard||{};
  const scopedProjects=db.projects.filter(p=>(!f.search||`${p.name}${p.code}${clientById(p.clientId)?.company}`.toLowerCase().includes(f.search.toLowerCase()))&&(!f.client||p.clientId===f.client)&&(!f.product||p.productIds.includes(f.product))&&(!f.manager||p.manager===f.manager)&&(!f.time||(daysFromToday(p.deadline)>=0&&daysFromToday(p.deadline)<=Number(f.time))));
  const projectIds=scopedProjects.map(p=>p.id);
  const scopedProducts=f.product?db.products.filter(p=>p.id===f.product):db.products;
  const scopedClients=f.client?db.clients.filter(c=>c.id===f.client):db.clients;
  const active = scopedProjects.filter(p=>p.status!=='已完成');
  const received = scopedProjects.reduce((s,p)=>s+Number(p.received),0);
  const contract = scopedProjects.reduce((s,p)=>s+Number(p.amount),0);
  const totalStock = scopedProducts.reduce((s,p)=>s+stockOf(p.id),0);
  const pendingTasks = db.tasks.filter(t=>t.status!=='已完成'&&projectIds.includes(t.projectId));
  const totalCredit = scopedClients.reduce((s,c)=>s+Number(c.creditLimit),0);
  const usedCredit = scopedClients.reduce((s,c)=>s+Number(c.creditUsed),0);
  const creditRate = totalCredit ? usedCredit/totalCredit*100 : 0;
  const paymentRate = contract ? received/contract*100 : 0;
  const salesValues = [32,48,43,66,58,82];
  const prevValues = [27,36,40,49,52,61];
  const monthLabels = Array.from({length:6},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-5+i,1);return `${d.getMonth()+1}月`;});
  const focus = getReminders().filter(r=>(r.kind==='project'&&projectIds.includes(r.id))||(r.kind==='task'&&pendingTasks.some(t=>t.id===r.id))).slice(0,4);
  return `${pageHeading('WORKSPACE OVERVIEW','把每一个好创意，稳稳落地。','项目、产品、协作与经营数据，今天也一目了然。',`<span class="date-chip">数据更新于刚刚</span><button class="secondary-btn" data-action="export" data-type="dashboard">${icon('download')}导出经营简报</button>`)}
  ${filterBar('dashboard','快速查询项目、编号或客户…',selectFilter('dashboard','client',db.clients.map(c=>[c.id,c.company]),f.client)+selectFilter('dashboard','product',db.products.map(p=>[p.id,p.name]),f.product)+selectFilter('dashboard','time',[['7','近 7 天交付'],['30','近 30 天交付'],['90','近 90 天交付']],f.time)+selectFilter('dashboard','manager',ownerOptions,f.manager))}
  <section class="stats-grid">
    <div class="stat-card"><div class="stat-top"><span>进行中项目</span><i class="stat-icon">${icon('route')}</i></div><div class="stat-value">${active.length}<small>个</small></div><div class="stat-foot"><span class="trend-warm">${active.filter(projectDelayed).length} 个存在延期</span><span>· 共 ${scopedProjects.length} 个项目</span></div></div>
    <div class="stat-card"><div class="stat-top"><span>累计项目回款</span><i class="stat-icon blue">${icon('wallet')}</i></div><div class="stat-value">${money(received,true)}</div><div class="stat-foot"><span class="trend-up">${Math.round(paymentRate)}%</span><span>合同额 ${money(contract,true)}</span></div></div>
    <div class="stat-card"><div class="stat-top"><span>产品实时库存</span><i class="stat-icon orange">${icon('box')}</i></div><div class="stat-value">${totalStock.toLocaleString()}<small>件</small></div><div class="stat-foot"><span class="trend-warm">${scopedProducts.filter(p=>stockOf(p.id)<=p.minStock).length} 款低于安全库存</span></div></div>
    <div class="stat-card"><div class="stat-top"><span>团队待办任务</span><i class="stat-icon red">${icon('check')}</i></div><div class="stat-value">${pendingTasks.length}<small>项</small></div><div class="stat-foot"><span class="trend-warm">${pendingTasks.filter(t=>daysFromToday(t.due)<=1).length} 项临近截止</span><span>· 今日需关注</span></div></div>
  </section>
  <div class="dashboard-grid">
    <section class="card"><div class="card-header"><div class="card-title"><h3>项目推进概览</h3><p>优先关注延期与临近交付项目</p></div><button class="card-link" data-nav="projects">全部项目 ${icon('arrow')}</button></div><div class="table-wrap"><table><thead><tr><th>项目 / 客户</th><th>当前阶段</th><th>整体进度</th><th>负责人</th><th>交付日期</th></tr></thead><tbody>${active.slice(0,4).map(p=>`<tr data-action="view-project" data-id="${p.id}" style="cursor:pointer"><td><div class="project-cell"><span class="project-code">${esc(p.name.slice(0,1))}</span><div><span class="cell-main">${esc(p.name)}</span><span class="cell-sub">${esc(clientById(p.clientId)?.company)}</span></div></div></td><td>${statusBadge(projectDelayed(p)?'存在延期':currentStage(p).name)}</td><td><div class="progress-cell"><div class="progress-track"><i class="progress-fill ${projectDelayed(p)?'orange':''}" style="width:${projectProgress(p)}%"></i></div><span>${projectProgress(p)}%</span></div></td><td>${ownerHtml(p.manager)}</td><td><span class="cell-main">${dateShort(p.deadline)}</span><span class="cell-sub">${daysFromToday(p.deadline)>=0?`剩 ${daysFromToday(p.deadline)} 天`:'已到期'}</span></td></tr>`).join('')}</tbody></table></div></section>
    <section class="card"><div class="card-header"><div class="card-title"><h3>今日聚焦</h3><p>${getReminders().length} 个关键节点需要关注</p></div><button class="icon-btn" data-action="open-reminders">${icon('more')}</button></div><div class="focus-list">${focus.length?focus.map(r=>{const d=r.kind==='project'?(projectById(r.id)?.stages.find(s=>r.title.includes(s.name))?.plan):db.tasks.find(t=>t.id===r.id)?.due;return `<div class="focus-item ${r.level==='red'?'urgent':''}"><div class="focus-date"><strong>${d?d.slice(-2):'!'}</strong><small>${d?`${Number(d.slice(5,7))}月`:'提醒'}</small></div><div class="focus-info"><strong>${esc(r.title)}</strong><p>${esc(r.desc)}</p></div></div>`}).join(''):emptyState('今日无紧急事项','所有关键节点均在按计划推进')}</div><div class="focus-footer"><button class="secondary-btn" data-action="open-reminders">查看全部提醒 ${icon('arrow')}</button></div></section>
  </div>
  <div class="dashboard-grid equal">
    <section class="card"><div class="card-header"><div class="card-title"><h3>产品销售趋势</h3><p>近 6 个月销售额（万元）</p></div><div class="chart-legend"><span><i></i>本年度</span><span><i></i>去年同期</span></div></div><div class="card-body"><div class="sales-chart"><div class="chart-y"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div><div class="bar-area">${salesValues.map((v,i)=>`<div class="bar-group"><div class="bars"><i class="bar prev" style="height:${prevValues[i]}%"></i><i class="bar" style="height:${v}%"></i></div><span class="bar-label">${monthLabels[i]}</span></div>`).join('')}</div></div></div></section>
    <section class="card"><div class="card-header"><div class="card-title"><h3>库存健康度</h3><p>按实时库存与安全库存监测</p></div><button class="card-link" data-nav="inventory">库存明细 ${icon('arrow')}</button></div><div class="inventory-mini-list">${scopedProducts.slice(0,4).map(p=>{const stock=stockOf(p.id);const low=stock<=p.minStock;return `<div class="inventory-mini"><div><strong>${esc(p.name)}</strong><small>${esc(p.code)}</small></div><div class="progress-cell"><div class="progress-track"><i class="progress-fill ${low?'orange':''}" style="width:${clamp(stock/(p.minStock*3)*100,4,100)}%"></i></div></div><div class="stock-number" style="color:${low?'var(--red)':'var(--ink)'}">${stock}<small> 件</small><small>${low?'需要补货':'库存充足'}</small></div></div>`}).join('')}</div></section>
  </div>
  <div class="dashboard-grid equal">
    <section class="card"><div class="card-header"><div class="card-title"><h3>回款与开票</h3><p>项目资金流与票据状态</p></div><button class="card-link" data-nav="clients">客户账款 ${icon('arrow')}</button></div><div class="card-body"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin-bottom:18px"><div><span class="cell-sub">合同总额</span><strong style="font-size:18px">${money(contract,true)}</strong></div><div><span class="cell-sub">待回款</span><strong style="font-size:18px;color:var(--orange)">${money(contract-received,true)}</strong></div><div><span class="cell-sub">待开票</span><strong style="font-size:18px">${money(db.invoices.filter(i=>i.status==='待开票').reduce((s,i)=>s+i.amount,0),true)}</strong></div></div><div class="progress-track" style="height:8px"><i class="progress-fill" style="width:${paymentRate}%"></i></div><div class="stat-foot" style="justify-content:space-between;margin-top:9px"><span>整体回款率 ${Math.round(paymentRate)}%</span><span>${db.invoices.filter(i=>i.status==='已开票').length} 张已开票</span></div></div></section>
    <section class="card"><div class="card-header"><div class="card-title"><h3>客户授信使用</h3><p>${db.clients.filter(c=>c.credit).length} 家授信客户</p></div><button class="card-link" data-nav="clients">查看详情 ${icon('arrow')}</button></div><div class="card-body credit-body"><div class="donut"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="48"/><circle class="value" cx="60" cy="60" r="48" stroke-dasharray="${creditRate/100*301.6} 301.6"/></svg><div class="donut-text"><strong>${Math.round(creditRate)}%</strong><small>授信使用率</small></div></div><div class="credit-list"><div class="credit-row"><span>授信总额</span><strong>${money(totalCredit)}</strong></div><div class="credit-row"><span>已使用额度</span><strong>${money(usedCredit)}</strong></div><div class="credit-row"><span>剩余可用</span><strong style="color:var(--green)">${money(totalCredit-usedCredit)}</strong></div><div class="credit-row"><span>风险提示</span><strong style="color:var(--orange)">${db.clients.filter(c=>c.creditLimit&&c.creditUsed/c.creditLimit>=.6).length} 家需关注</strong></div></div></div></section>
  </div>`;
}

function renderClients() {
  const f = ui.filters.clients || {};
  const rows = db.clients.filter(c => (!f.search || `${c.name}${c.company}${c.phone}${c.needs}`.toLowerCase().includes(f.search.toLowerCase())) && (!f.status || (f.status==='授信客户'?c.credit:!c.credit)) && (!f.client || c.id===f.client));
  const invoiced = db.invoices.filter(i=>i.status==='已开票').reduce((s,i)=>s+i.amount,0);
  return `${pageHeading('CLIENT RELATIONSHIP','客户管理','沉淀客户需求、项目合作与账款信用的完整档案。',`<button class="secondary-btn" data-action="export" data-type="clients">${icon('download')}导出</button><button class="primary-btn" data-action="add-client">${icon('plus')}新增客户</button>`)}
  <section class="stats-grid"><div class="stat-card"><div class="stat-top"><span>合作客户</span><i class="stat-icon">${icon('users')}</i></div><div class="stat-value">${db.clients.length}<small>家</small></div><div class="stat-foot">${db.clients.filter(c=>c.credit).length} 家授信客户</div></div><div class="stat-card"><div class="stat-top"><span>客户预算总额</span><i class="stat-icon blue">${icon('trend')}</i></div><div class="stat-value">${money(db.clients.reduce((s,c)=>s+c.budget,0),true)}</div><div class="stat-foot">覆盖 ${db.projects.length} 个开发项目</div></div><div class="stat-card"><div class="stat-top"><span>累计已开票</span><i class="stat-icon orange">${icon('receipt')}</i></div><div class="stat-value">${money(invoiced,true)}</div><div class="stat-foot">${db.invoices.filter(i=>i.status==='待开票').length} 笔待开票</div></div><div class="stat-card"><div class="stat-top"><span>剩余授信额度</span><i class="stat-icon red">${icon('credit')}</i></div><div class="stat-value">${money(db.clients.reduce((s,c)=>s+c.creditLimit-c.creditUsed,0),true)}</div><div class="stat-foot">额度使用实时可见</div></div></section>
  ${filterBar('clients','搜索客户姓名、单位、联系方式或需求…',selectFilter('clients','status',['授信客户','非授信客户'],f.status))}
  <section class="table-card"><div class="table-wrap"><table><thead><tr><th>客户 / 单位</th><th>联系方式</th><th>开发需求</th><th>费用预算</th><th>付款方式</th><th>授信 / 剩余额度</th><th>开票状态</th><th>关联项目</th><th>操作</th></tr></thead><tbody>${rows.map(c=>{const ps=db.projects.filter(p=>p.clientId===c.id);const pending=db.invoices.some(i=>i.clientId===c.id&&i.status==='待开票');return `<tr><td><span class="cell-main">${esc(c.company)}</span><span class="cell-sub">${esc(c.name)} · ${esc(c.contact)}</span></td><td>${esc(c.phone)}</td><td><span title="${esc(c.needs)}" style="display:block;max-width:190px;overflow:hidden;text-overflow:ellipsis">${esc(c.needs)}</span></td><td><span class="cell-main">${money(c.budget)}</span></td><td>${esc(c.payment)}</td><td>${c.credit?`<span class="cell-main">${money(c.creditLimit-c.creditUsed)}</span><span class="cell-sub">总额 ${money(c.creditLimit)}</span>`:'<span class="badge gray no-dot">未授信</span>'}</td><td>${statusBadge(pending?'待开票':'已开票')}</td><td><button class="card-link" data-action="view-client" data-id="${c.id}">${ps.length} 个项目 ${icon('chevron')}</button></td><td><div class="table-actions">${actionButton('view-client',c.id)}${actionButton('edit-client',c.id,'edit')}</div></td></tr>`}).join('')}</tbody></table></div>${!rows.length?emptyState():''}</section>`;
}

function renderProducts() {
  const f = ui.filters.products || {};
  const types = [...new Set(db.products.map(p=>p.type))];
  const rows = db.products.filter(p=>(!f.search||`${p.name}${p.code}${p.material}`.toLowerCase().includes(f.search.toLowerCase()))&&(!f.type||p.type===f.type));
  const stockValue = db.products.reduce((s,p)=>s+stockOf(p.id)*productCost(p),0);
  const avgMargin = db.products.reduce((s,p)=>s+productMargin(p),0)/db.products.length;
  return `${pageHeading('PRODUCT LIBRARY','产品信息管理','从成本测算到零售定价，让每一款产品的经营价值清晰可见。',`<button class="secondary-btn" data-action="export" data-type="products">${icon('download')}导出</button><button class="primary-btn" data-action="add-product">${icon('plus')}新增产品</button>`)}
  <section class="stats-grid"><div class="stat-card"><div class="stat-top"><span>产品档案</span><i class="stat-icon">${icon('box')}</i></div><div class="stat-value">${db.products.length}<small>款</small></div><div class="stat-foot">${types.length} 个产品类型</div></div><div class="stat-card"><div class="stat-top"><span>库存成本价值</span><i class="stat-icon blue">${icon('wallet')}</i></div><div class="stat-value">${money(stockValue,true)}</div><div class="stat-foot">按实时库存 × 单件综合成本</div></div><div class="stat-card"><div class="stat-top"><span>平均零售毛利率</span><i class="stat-icon orange">${icon('trend')}</i></div><div class="stat-value">${avgMargin.toFixed(1)}<small>%</small></div><div class="stat-foot">已计入设计与开模摊销</div></div><div class="stat-card"><div class="stat-top"><span>累计出入库</span><i class="stat-icon red">${icon('layers')}</i></div><div class="stat-value">${db.movements.length}<small>笔</small></div><div class="stat-foot">完整流水可追溯</div></div></section>
  ${filterBar('products','搜索产品名称、编号或材质…',selectFilter('products','type',types,f.type))}
  <section class="table-card"><div class="table-wrap"><table><thead><tr><th>产品编号 / 名称</th><th>类型 / 材质</th><th>计划数量</th><th>成本构成</th><th>单件综合成本</th><th>零售价 / 毛利率</th><th>进货 / 出货</th><th>实时库存</th><th>操作</th></tr></thead><tbody>${rows.map(p=>{const cost=productCost(p),margin=productMargin(p),stock=stockOf(p.id);return `<tr><td><span class="cell-sub" style="margin:0 0 4px;color:var(--green)">${esc(p.code)}</span><span class="cell-main">${esc(p.name)}</span></td><td><span class="cell-main" style="font-weight:500">${esc(p.type)}</span><span class="cell-sub">${esc(p.material)}</span></td><td>${Number(p.quantity).toLocaleString()} 件</td><td><span title="设计费 / 打样费 / 开模费 / 采购单价">${money(p.designFee,true)} / ${money(p.sampleFee,true)} / ${money(p.moldFee,true)} / ${money(p.unitCost)}</span></td><td><span class="cell-main">${money(cost)}</span><span class="cell-sub">总投入 ${money(cost*p.quantity,true)}</span></td><td><span class="cell-main">${money(p.retail)}</span><span class="cell-sub" style="color:var(--green)">毛利 ${margin.toFixed(1)}%</span></td><td><span style="color:var(--green)">+${movementTotal(p.id,'in')}</span> / <span style="color:var(--orange)">-${movementTotal(p.id,'out')}</span></td><td><span class="cell-main" style="color:${stock<=p.minStock?'var(--red)':'var(--ink)'}">${stock} 件</span><span class="cell-sub">安全库存 ${p.minStock}</span></td><td><div class="table-actions">${actionButton('edit-product',p.id,'edit')}<button data-action="add-movement" data-id="${p.id}" title="出入库">${icon('inbound')}</button></div></td></tr>`}).join('')}</tbody></table></div>${!rows.length?emptyState():''}</section>`;
}

function renderProjects() {
  const f = ui.filters.projects || {};
  const rows = db.projects.filter(p=>(!f.search||`${p.name}${p.code}${clientById(p.clientId)?.company}`.toLowerCase().includes(f.search.toLowerCase()))&&(!f.status||(f.status==='存在延期'?projectDelayed(p):p.status===f.status))&&(!f.manager||p.manager===f.manager)&&(!f.client||p.clientId===f.client));
  return `${pageHeading('DEVELOPMENT PIPELINE','开发进度管理','从设计到交付，七个关键阶段清晰可见，风险节点提前介入。',`<button class="secondary-btn" data-action="export" data-type="projects">${icon('download')}导出</button><button class="primary-btn" data-action="add-project">${icon('plus')}新建项目</button>`)}
  <section class="stats-grid"><div class="stat-card"><div class="stat-top"><span>全部项目</span><i class="stat-icon">${icon('route')}</i></div><div class="stat-value">${db.projects.length}<small>个</small></div><div class="stat-foot">${db.projects.filter(p=>p.status==='已完成').length} 个已完成交付</div></div><div class="stat-card"><div class="stat-top"><span>按计划推进</span><i class="stat-icon blue">${icon('checkCircle')}</i></div><div class="stat-value">${db.projects.filter(p=>p.status!=='已完成'&&!projectDelayed(p)).length}<small>个</small></div><div class="stat-foot">关键节点运行正常</div></div><div class="stat-card"><div class="stat-top"><span>存在延期</span><i class="stat-icon red">${icon('warning')}</i></div><div class="stat-value">${db.projects.filter(projectDelayed).length}<small>个</small></div><div class="stat-foot">请优先协调相关资源</div></div><div class="stat-card"><div class="stat-top"><span>30 天内交付</span><i class="stat-icon orange">${icon('calendar')}</i></div><div class="stat-value">${db.projects.filter(p=>p.status!=='已完成'&&daysFromToday(p.deadline)<=30).length}<small>个</small></div><div class="stat-foot">做好生产与物流衔接</div></div></section>
  ${filterBar('projects','搜索项目名称、编号或客户…',selectFilter('projects','status',['进行中','存在延期','已完成'],f.status)+selectFilter('projects','client',db.clients.map(c=>[c.id,c.company]),f.client)+selectFilter('projects','manager',ownerOptions,f.manager))}
  <section class="project-grid">${rows.map(p=>`<article class="project-card" data-action="view-project" data-id="${p.id}"><div class="project-card-top"><span class="project-card-code">${esc(p.code)}</span>${statusBadge(projectStatus(p))}</div><h3>${esc(p.name)}</h3><span class="project-client">${icon('building')}${esc(clientById(p.clientId)?.company)}</span><div class="project-stage-preview">${p.stages.map(s=>{const delayed=s.status!=='已完成'&&daysFromToday(s.plan)<0;const cls=s.status==='已完成'?'done':delayed?'delay':s.status==='进行中'?'current':'';return `<div class="stage-dot ${cls}" title="${esc(s.name)} · 计划 ${s.plan}"><i></i><span>${esc(s.name.replace('确认','').replace('优化','').replace('最终',''))}</span></div>`}).join('')}</div><div class="project-progress-line"><span>当前：${esc(currentStage(p).name)}</span><strong>${projectProgress(p)}%</strong></div><div class="progress-track"><i class="progress-fill ${projectDelayed(p)?'orange':''}" style="width:${projectProgress(p)}%"></i></div><div class="project-card-bottom"><span>${ownerHtml(p.manager)}</span><span>${icon('calendar')}${dateShort(p.deadline)} 交付</span></div></article>`).join('')}</section>${!rows.length?emptyState():''}`;
}

function renderTasks() {
  const f = ui.filters.tasks || {};
  let rows = db.tasks.filter(t=>(!f.search||`${t.title}${t.owner}${projectById(t.projectId)?.name}`.toLowerCase().includes(f.search.toLowerCase()))&&(!f.role||t.role===f.role)&&(!f.status||t.status===f.status)&&(!f.manager||t.owner===f.manager));
  if(ui.taskView==='personal') rows=rows.filter(t=>t.owner==='林然');
  const completed=db.tasks.filter(t=>t.status==='已完成').length;
  const columns=['待开始','进行中','已完成'];
  return `${pageHeading('TEAM COLLABORATION','员工工作管理','任务与项目自动关联，个人节奏和团队负载同样清楚。',`<div class="segment-control"><button data-action="task-view" data-view="team" class="${ui.taskView==='team'?'active':''}">团队视图</button><button data-action="task-view" data-view="personal" class="${ui.taskView==='personal'?'active':''}">我的工作</button></div><button class="primary-btn" data-action="add-task">${icon('plus')}分配任务</button>`)}
  <section class="stats-grid"><div class="stat-card"><div class="stat-top"><span>${ui.taskView==='personal'?'我的任务':'团队任务'}</span><i class="stat-icon">${icon('check')}</i></div><div class="stat-value">${ui.taskView==='personal'?db.tasks.filter(t=>t.owner==='林然').length:db.tasks.length}<small>项</small></div><div class="stat-foot">完成率 ${Math.round(completed/db.tasks.length*100)}%</div></div><div class="stat-card"><div class="stat-top"><span>正在推进</span><i class="stat-icon blue">${icon('clock')}</i></div><div class="stat-value">${db.tasks.filter(t=>t.status==='进行中').length}<small>项</small></div><div class="stat-foot">平均进度 ${Math.round(db.tasks.filter(t=>t.status==='进行中').reduce((s,t)=>s+t.progress,0)/Math.max(1,db.tasks.filter(t=>t.status==='进行中').length))}%</div></div><div class="stat-card"><div class="stat-top"><span>临期 / 已逾期</span><i class="stat-icon red">${icon('warning')}</i></div><div class="stat-value">${db.tasks.filter(t=>t.status!=='已完成'&&daysFromToday(t.due)<=1).length}<small>项</small></div><div class="stat-foot">今日请优先处理</div></div><div class="stat-card"><div class="stat-top"><span>参与成员</span><i class="stat-icon orange">${icon('users')}</i></div><div class="stat-value">${new Set(db.tasks.map(t=>t.owner)).size}<small>人</small></div><div class="stat-foot">覆盖 ${new Set(db.tasks.map(t=>t.role)).size} 类岗位</div></div></section>
  ${filterBar('tasks','搜索工作内容、负责人或关联项目…',selectFilter('tasks','role',roleOptions,f.role)+selectFilter('tasks','status',columns,f.status)+selectFilter('tasks','manager',ownerOptions,f.manager))}
  <div class="kanban">${columns.map(col=>{const items=rows.filter(t=>t.status===col);return `<section class="kanban-column ${col==='进行中'?'doing':col==='已完成'?'done':''}"><div class="kanban-header"><strong>${col}</strong><span>${items.length}</span></div>${items.map(t=>{const overdue=t.status!=='已完成'&&daysFromToday(t.due)<0;return `<article class="task-card" data-action="edit-task" data-id="${t.id}"><div class="task-card-top"><span class="role-tag">${esc(t.role)}</span><span class="task-priority">${t.priority==='普通'?'':esc(t.priority)+'优先'}</span></div><h4>${esc(t.title)}</h4><div class="task-project">${icon('route')}${esc(projectById(t.projectId)?.name||'未关联项目')}</div><div class="progress-cell"><div class="progress-track"><i class="progress-fill ${overdue?'orange':''}" style="width:${t.progress}%"></i></div><span>${t.progress}%</span></div><div class="task-card-bottom">${ownerHtml(t.owner)}<span class="task-due ${overdue?'overdue':''}">${icon('calendar')}${overdue?'已逾期':daysFromToday(t.due)===0?'今天截止':dateShort(t.due)}</span></div></article>`}).join('')||'<div class="empty-state" style="padding:30px 10px"><p>暂无任务</p></div>'}</section>`}).join('')}</div>`;
}

function renderInventory() {
  const f=ui.filters.inventory||{};
  const stockRows=db.products.filter(p=>(!f.search||`${p.name}${p.code}${p.type}`.toLowerCase().includes(f.search.toLowerCase()))&&(!f.type||p.type===f.type)&&(!f.status||(f.status==='低库存'?stockOf(p.id)<=p.minStock:stockOf(p.id)>p.minStock)));
  const movementRows=db.movements.filter(m=>{const p=productById(m.productId);return (!f.search||`${p?.name}${p?.code}${m.operator}${m.note}`.toLowerCase().includes(f.search.toLowerCase()))&&(!f.status||m.type===f.status)}).sort((a,b)=>b.date.localeCompare(a.date));
  const inQty=db.movements.filter(m=>m.type==='in').reduce((s,m)=>s+Number(m.quantity),0),outQty=db.movements.filter(m=>m.type==='out').reduce((s,m)=>s+Number(m.quantity),0);
  return `${pageHeading('INVENTORY CONTROL','库存管理','库存随流水自动更新，每一次入库与出库都有据可查。',`<button class="secondary-btn" data-action="export" data-type="movements">${icon('download')}导出流水</button><button class="secondary-btn" data-action="add-movement" data-type="out">${icon('outbound')}出库登记</button><button class="primary-btn" data-action="add-movement" data-type="in">${icon('inbound')}入库登记</button>`)}
  <section class="stats-grid"><div class="stat-card"><div class="stat-top"><span>实时库存总量</span><i class="stat-icon">${icon('layers')}</i></div><div class="stat-value">${db.products.reduce((s,p)=>s+stockOf(p.id),0).toLocaleString()}<small>件</small></div><div class="stat-foot">${db.products.length} 款在售产品</div></div><div class="stat-card"><div class="stat-top"><span>累计入库</span><i class="stat-icon blue">${icon('inbound')}</i></div><div class="stat-value">+${inQty.toLocaleString()}<small>件</small></div><div class="stat-foot">${db.movements.filter(m=>m.type==='in').length} 笔入库流水</div></div><div class="stat-card"><div class="stat-top"><span>累计出库</span><i class="stat-icon orange">${icon('outbound')}</i></div><div class="stat-value">-${outQty.toLocaleString()}<small>件</small></div><div class="stat-foot">${db.movements.filter(m=>m.type==='out').length} 笔出库流水</div></div><div class="stat-card"><div class="stat-top"><span>低库存预警</span><i class="stat-icon red">${icon('warning')}</i></div><div class="stat-value">${db.products.filter(p=>stockOf(p.id)<=p.minStock).length}<small>款</small></div><div class="stat-foot">低于产品安全库存线</div></div></section>
  ${filterBar('inventory',ui.inventoryTab==='stock'?'搜索产品编号、名称或类型…':'搜索产品、经办人或备注…',ui.inventoryTab==='stock'?selectFilter('inventory','status',['充足','低库存'],f.status):selectFilter('inventory','status',[['in','入库'],['out','出库']],f.status))}
  <div class="inventory-tabs"><button data-action="inventory-tab" data-tab="stock" class="${ui.inventoryTab==='stock'?'active':''}">库存总览</button><button data-action="inventory-tab" data-tab="movements" class="${ui.inventoryTab==='movements'?'active':''}">出入库流水（${db.movements.length}）</button></div>
  <section class="table-card" style="border-radius:0 0 13px 13px">${ui.inventoryTab==='stock'?`<div class="table-wrap"><table><thead><tr><th>产品编号 / 名称</th><th>类型</th><th>零售价</th><th>综合成本价</th><th>折扣率</th><th>实时库存</th><th>安全库存</th><th>库存状态</th><th>快捷操作</th></tr></thead><tbody>${stockRows.map(p=>{const stock=stockOf(p.id),low=stock<=p.minStock;return `<tr><td><span class="cell-sub" style="margin:0 0 4px;color:var(--green)">${esc(p.code)}</span><span class="cell-main">${esc(p.name)}</span></td><td>${esc(p.type)}</td><td>${money(p.retail)}</td><td>${money(productCost(p))}</td><td>${Math.round(p.discount*100)}%</td><td><div class="stock-hero ${low?'low':''}"><strong>${stock}</strong><div class="stock-meter"><i style="width:${clamp(stock/(p.minStock*3)*100,3,100)}%"></i></div></div></td><td>${p.minStock} 件</td><td>${statusBadge(low?'低库存':'充足')}</td><td><div class="table-actions"><button data-action="add-movement" data-id="${p.id}" data-type="in" title="入库">${icon('inbound')}</button><button data-action="add-movement" data-id="${p.id}" data-type="out" title="出库">${icon('outbound')}</button></div></td></tr>`}).join('')}</tbody></table></div>${!stockRows.length?emptyState():''}`:`<div class="table-wrap"><table><thead><tr><th>流水类型</th><th>产品编号 / 名称</th><th>数量</th><th>发生时间</th><th>经办人</th><th>关联项目</th><th>备注</th><th>流水号</th></tr></thead><tbody>${movementRows.map(m=>{const p=productById(m.productId);return `<tr><td><span class="movement-type ${m.type}">${icon(m.type==='in'?'inbound':'outbound')}${m.type==='in'?'入库':'出库'}</span></td><td><span class="cell-main">${esc(p?.name)}</span><span class="cell-sub">${esc(p?.code)}</span></td><td><span class="movement-qty">${m.type==='in'?'+':'-'}${m.quantity}</span></td><td>${esc(m.date)}</td><td>${ownerHtml(m.operator)}</td><td>${esc(projectById(m.projectId)?.name||'—')}</td><td>${esc(m.note||'—')}</td><td><span class="cell-sub" style="margin:0">${esc(m.id.toUpperCase())}</span></td></tr>`}).join('')}</tbody></table></div>${!movementRows.length?emptyState():''}`}</section>`;
}

function render() {
  updateShell();
  const pages={dashboard:renderDashboard,clients:renderClients,products:renderProducts,projects:renderProjects,tasks:renderTasks,inventory:renderInventory};
  $('#pageContent').innerHTML=(pages[ui.page]||renderDashboard)();
  const count=$$('.table-card tbody tr').length + $$('.project-card').length + $$('.task-card').length;
  if($('#filterCount')) $('#filterCount').textContent=`共 ${count} 条记录`;
  window.scrollTo({top:0,behavior:'instant'});
}

function navigate(page) {
  ui.page=page;
  render();
  $('#sidebar').classList.remove('show');
  $('#mobileMask').classList.remove('show');
}

function toast(message,error=false) {
  const node=document.createElement('div');
  node.className=`toast${error?' error':''}`;
  node.innerHTML=`${icon(error?'warning':'checkCircle')}<span>${esc(message)}</span>`;
  $('#toastContainer').appendChild(node);
  setTimeout(()=>{node.style.opacity='0';node.style.transform='translateY(5px)';setTimeout(()=>node.remove(),250)},2800);
}

function openModal({title,subtitle='',eyebrow='BUSINESS FORM',body='',wide=false}) {
  $('#modalTitle').textContent=title;
  $('#modalSubtitle').textContent=subtitle;
  $('#modalEyebrow').textContent=eyebrow;
  $('#modalBody').innerHTML=body;
  const businessForm=$('#businessForm');
  if(businessForm)businessForm.addEventListener('submit',handleSubmit);
  $('#modal').classList.toggle('wide',wide);
  $('#modalMask').classList.add('show');
  document.body.style.overflow='hidden';
  setTimeout(()=>$('#modalBody input:not([type=radio]),#modalBody select')?.focus(),150);
}
function closeModal() { $('#modalMask').classList.remove('show');document.body.style.overflow=''; }
function formShell(content,submit='保存',wide=false) { return `<form id="businessForm"><div class="form-body"><div class="form-grid">${content}</div></div><div class="form-footer"><button type="button" class="secondary-btn" data-close="modal">取消</button><button type="submit" class="primary-btn">${icon('check')}${submit}</button></div></form>`; }
const inputField=(label,name,value='',opts={})=>`<div class="form-group ${opts.full?'full':''}"><label>${label}${opts.required?'<em>*</em>':''}</label><input name="${name}" type="${opts.type||'text'}" value="${esc(value)}" ${opts.required?'required':''} ${opts.min!==undefined?`min="${opts.min}"`:''} ${opts.max!==undefined?`max="${opts.max}"`:''} ${opts.step?`step="${opts.step}"`:''} ${opts.placeholder?`placeholder="${opts.placeholder}"`:''} ${opts.disabled?'disabled':''}>${opts.hint?`<span class="form-hint">${opts.hint}</span>`:''}</div>`;
const selectField=(label,name,options,value='',opts={})=>`<div class="form-group ${opts.full?'full':''}"><label>${label}${opts.required?'<em>*</em>':''}</label><select name="${name}" ${opts.required?'required':''}>${options.map(o=>{const val=Array.isArray(o)?o[0]:o,text=Array.isArray(o)?o[1]:o;return `<option value="${esc(val)}" ${String(val)===String(value)?'selected':''}>${esc(text)}</option>`}).join('')}</select></div>`;
const textField=(label,name,value='',full=true)=>`<div class="form-group ${full?'full':''}"><label>${label}</label><textarea name="${name}">${esc(value)}</textarea></div>`;

function openClientForm(id) {
  const c=clientById(id)||{name:'',company:'',phone:'',contact:'',needs:'',budget:'',payment:'30% 预付款 + 70% 验收款',credit:false,creditLimit:0,creditUsed:0};
  openModal({title:id?'编辑客户档案':'新增客户',subtitle:'完整记录需求、预算、付款与授信信息',eyebrow:'CLIENT PROFILE',wide:true,body:formShell(`
    ${inputField('客户姓名','name',c.name,{required:true})}${inputField('单位名称','company',c.company,{required:true})}
    ${inputField('联系方式','phone',c.phone,{required:true})}${inputField('联系人 / 部门','contact',c.contact)}
    ${textField('产品开发需求','needs',c.needs)}<div class="form-section-title">费用与信用</div>
    ${inputField('费用预算（元）','budget',c.budget,{type:'number',min:0,required:true})}${inputField('付款方式','payment',c.payment,{required:true})}
    ${selectField('是否授信','credit',[['false','不授信'],['true','允许授信']],String(c.credit))}${inputField('授信额度（元）','creditLimit',c.creditLimit,{type:'number',min:0})}
    ${inputField('已使用额度（元）','creditUsed',c.creditUsed,{type:'number',min:0,hint:'剩余额度 = 授信额度 - 已使用额度'} )}
    <input type="hidden" name="id" value="${id||''}">`,'保存客户档案')});
}

function openClientDetail(id) {
  const c=clientById(id);if(!c)return;
  const projects=db.projects.filter(p=>p.clientId===id);
  const productIds=[...new Set(projects.flatMap(p=>p.productIds))];
  const invoices=db.invoices.filter(i=>i.clientId===id);
  openModal({title:c.company,subtitle:`客户编号 ${c.id.toUpperCase()} · 建档 ${c.createdAt}`,eyebrow:'CLIENT 360°',wide:true,body:`
    <div class="detail-hero"><div class="detail-hero-top"><div><h3>${esc(c.name)}</h3><p>${esc(c.contact)} · ${esc(c.phone)}</p></div>${statusBadge(c.credit?'授信客户':'非授信客户')}</div><div class="detail-meta-grid"><div><span>费用预算</span><strong>${money(c.budget)}</strong></div><div><span>付款方式</span><strong>${esc(c.payment)}</strong></div><div><span>授信额度</span><strong>${money(c.creditLimit)}</strong></div><div><span>剩余额度</span><strong>${money(c.creditLimit-c.creditUsed)}</strong></div></div></div>
    <div class="detail-section" style="margin-top:20px"><h4>产品开发需求</h4><p style="font-size:11px;line-height:1.8;color:var(--muted);margin:0">${esc(c.needs)}</p></div>
    <div class="detail-section"><h4>关联项目（${projects.length}）</h4>${projects.length?projects.map(p=>`<button class="search-result" data-action="view-project" data-id="${p.id}"><span>${icon('route')}</span><div><strong>${esc(p.name)}</strong><small>${p.code} · ${projectProgress(p)}% · ${money(p.amount)}</small></div></button>`).join(''):'<p class="form-hint">尚未关联项目</p>'}</div>
    <div class="detail-section"><h4>关联产品（${productIds.length}）</h4><div class="detail-list">${productIds.map(pid=>`<div><span>${esc(productById(pid)?.code)}</span><strong>${esc(productById(pid)?.name)}</strong></div>`).join('')||'尚未关联产品'}</div></div>
    <div class="detail-section"><h4>开票记录（${invoices.length}）</h4>${invoices.length?invoices.map(i=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)"><div><strong style="font-size:11px">${money(i.amount)}</strong><span class="cell-sub">${esc(i.number||'尚未生成发票号')} · ${esc(i.date||'待处理')}</span></div>${statusBadge(i.status)}</div>`).join(''):'<p class="form-hint">暂无开票记录</p>'}<button class="secondary-btn" style="margin-top:12px" data-action="add-invoice" data-id="${c.id}">${icon('plus')}新增开票记录</button></div>
    <div class="form-footer"><button class="secondary-btn" data-close="modal">关闭</button><button class="primary-btn" data-action="edit-client" data-id="${c.id}">${icon('edit')}编辑客户</button></div>`});
}

function openProductForm(id) {
  const p=productById(id)||{code:`ZW-NEW-${String(db.products.length+1).padStart(3,'0')}`,name:'',type:'礼盒套装',material:'',quantity:1000,designFee:0,sampleFee:0,moldFee:0,unitCost:0,retail:0,discount:1,initialStock:0,minStock:50};
  openModal({title:id?'编辑产品信息':'新增产品',subtitle:'综合成本 = 采购单价 +（设计 + 打样 + 开模）÷ 计划数量',eyebrow:'PRODUCT COSTING',wide:true,body:formShell(`
    ${inputField('产品编号','code',p.code,{required:true})}${inputField('产品名称','name',p.name,{required:true})}
    ${selectField('产品类型','type',['礼盒套装','茶器','潮玩','文具','服饰','家居','其他'],p.type)}${inputField('材质','material',p.material,{required:true})}
    ${inputField('计划生产数量','quantity',p.quantity,{type:'number',min:1,required:true})}${inputField('安全库存','minStock',p.minStock,{type:'number',min:0,required:true})}
    <div class="form-section-title">成本明细（元）</div>${inputField('设计费','designFee',p.designFee,{type:'number',min:0,step:'0.01'})}${inputField('打样费','sampleFee',p.sampleFee,{type:'number',min:0,step:'0.01'})}
    ${inputField('开模费','moldFee',p.moldFee,{type:'number',min:0,step:'0.01'})}${inputField('采购单价','unitCost',p.unitCost,{type:'number',min:0,step:'0.01',required:true})}
    <div class="form-section-title">定价与库存</div>${inputField('零售价（元）','retail',p.retail,{type:'number',min:0,step:'0.01',required:true})}${inputField('默认折扣率','discount',p.discount,{type:'number',min:0.01,max:1,step:'0.01',hint:'例如 0.85 表示 85 折'})}
    ${inputField('期初库存','initialStock',p.initialStock,{type:'number',min:0,hint:id?'调整期初值会影响实时库存，请谨慎':'仅用于首次建档，后续请通过出入库变更'})}<input type="hidden" name="id" value="${id||''}">
    <div class="calc-panel"><div><span>单件综合成本</span><strong id="calcCost">${money(productCost(p))}</strong></div><div><span>预计零售毛利率</span><strong id="calcMargin">${productMargin(p).toFixed(1)}%</strong></div><div><span>折后毛利率</span><strong id="calcDiscountMargin">${((p.retail*p.discount-productCost(p))/(p.retail*p.discount||1)*100).toFixed(1)}%</strong></div></div>`,'保存产品信息')});
}

function openProjectForm(id) {
  const p=projectById(id)||{code:`PRJ-${now.getFullYear()}-${String(db.projects.length+30).padStart(3,'0')}`,name:'',clientId:db.clients[0]?.id,productIds:[db.products[0]?.id],manager:'林然',amount:0,received:0,deadline:iso(30),status:'进行中'};
  openModal({title:id?'编辑项目':'新建开发项目',subtitle:id?'调整项目基础信息，节点请在项目详情中更新':'创建后自动生成从设计到物流的七个标准阶段',eyebrow:'PROJECT SETUP',wide:true,body:formShell(`
    ${inputField('项目编号','code',p.code,{required:true})}${inputField('项目名称','name',p.name,{required:true})}
    ${selectField('关联客户','clientId',db.clients.map(c=>[c.id,c.company]),p.clientId,{required:true})}${selectField('关联主产品','productId',db.products.map(x=>[x.id,`${x.code} · ${x.name}`]),p.productIds[0],{required:true})}
    ${selectField('项目负责人','manager',ownerOptions,p.manager)}${inputField('计划交付日期','deadline',p.deadline,{type:'date',required:true})}
    ${inputField('项目合同额（元）','amount',p.amount,{type:'number',min:0,required:true})}${inputField('已回款（元）','received',p.received,{type:'number',min:0})}
    ${selectField('项目状态','status',['进行中','已完成'],p.status)}<input type="hidden" name="id" value="${id||''}">`,id?'保存项目':'创建并生成节点')});
}

function openProjectDetail(id) {
  const p=projectById(id);if(!p)return;
  const c=clientById(p.clientId);
  openModal({title:p.name,subtitle:`${p.code} · ${c?.company||''}`,eyebrow:'PROJECT MILESTONES',wide:true,body:`
    <div class="detail-hero"><div class="detail-hero-top"><div><h3>${esc(p.name)}</h3><p>${esc(c?.name)} · ${esc(c?.phone)}</p></div>${statusBadge(projectStatus(p))}</div><div class="detail-meta-grid"><div><span>项目负责人</span><strong>${esc(p.manager)}</strong></div><div><span>计划交付</span><strong>${esc(p.deadline)}</strong></div><div><span>合同金额</span><strong>${money(p.amount)}</strong></div><div><span>已回款 / 待回款</span><strong>${money(p.received)} / ${money(p.amount-p.received)}</strong></div></div><div style="margin-top:18px"><div class="project-progress-line"><span>整体完成度</span><strong>${projectProgress(p)}%</strong></div><div class="progress-track" style="background:rgba(255,255,255,.15)"><i class="progress-fill" style="width:${projectProgress(p)}%;background:#b8d9bd"></i></div></div></div>
    <div class="timeline"><div class="timeline-title"><h4>开发节点</h4><span>点击节点可更新时间与状态</span></div>${p.stages.map((s,i)=>{const delayed=s.status!=='已完成'&&daysFromToday(s.plan)<0;const cls=s.status==='已完成'?'done':delayed?'delay':s.status==='进行中'?'current':'';return `<div class="timeline-item ${cls}"><span class="timeline-marker">${s.status==='已完成'?icon('check'):i+1}</span><div class="timeline-info"><strong>${esc(s.name)}</strong><p>计划 ${s.plan}　·　实际 ${s.actual||'尚未完成'}<br>负责人 ${esc(s.owner)}</p></div><button class="timeline-status ghost-btn" data-action="edit-stage" data-id="${p.id}" data-stage="${i}">${statusBadge(delayed?'延期':s.status)}${icon('edit')}</button></div>`}).join('')}</div>
    <div class="detail-section"><h4>关联产品</h4><div class="detail-list">${p.productIds.map(pid=>{const prod=productById(pid);return `<div><span>${esc(prod?.code)} · 库存 ${stockOf(pid)}</span><strong>${esc(prod?.name)}</strong></div>`}).join('')}</div></div>
    <div class="form-footer"><button class="secondary-btn" data-action="add-payment" data-id="${p.id}">${icon('wallet')}登记回款</button><button class="secondary-btn" data-action="edit-project" data-id="${p.id}">${icon('edit')}编辑项目</button><button class="primary-btn" data-close="modal">完成</button></div>`});
}

function openStageForm(projectId,index) {
  const p=projectById(projectId),s=p?.stages[index];if(!s)return;
  openModal({title:`更新节点 · ${s.name}`,subtitle:`${p.name} / 第 ${Number(index)+1} 阶段`,eyebrow:'MILESTONE UPDATE',body:formShell(`
    ${inputField('负责人','owner',s.owner,{required:true})}${selectField('完成状态','status',['未开始','进行中','已完成'],s.status)}
    ${inputField('计划完成时间','plan',s.plan,{type:'date',required:true})}${inputField('实际完成时间','actual',s.actual,{type:'date',hint:'未完成时可留空'})}
    <input type="hidden" name="projectId" value="${projectId}"><input type="hidden" name="stageIndex" value="${index}">`,'更新节点')});
}

function openTaskForm(id) {
  const t=db.tasks.find(x=>x.id===id)||{title:'',role:'商务',owner:'林然',due:iso(3),progress:0,status:'待开始',projectId:db.projects[0]?.id,priority:'普通'};
  openModal({title:id?'更新工作任务':'分配工作任务',subtitle:'任务将同步到个人视图与关键节点提醒',eyebrow:'TEAM TASK',body:formShell(`
    ${inputField('工作内容','title',t.title,{required:true,full:true})}${selectField('岗位','role',roleOptions,t.role)}${selectField('负责人','owner',ownerOptions,t.owner)}
    ${selectField('关联项目','projectId',db.projects.map(p=>[p.id,p.name]),t.projectId)}${inputField('截止时间','due',t.due,{type:'date',required:true})}
    ${selectField('任务状态','status',['待开始','进行中','已完成'],t.status)}${inputField('完成进度（%）','progress',t.progress,{type:'number',min:0,max:100,required:true})}
    ${selectField('优先级','priority',['普通','高','紧急'],t.priority)}<input type="hidden" name="id" value="${id||''}">`,id?'保存任务':'分配任务')});
}

function openMovementForm(productId,defaultType='in') {
  const selected=productId||db.products[0]?.id;
  openModal({title:'出入库登记',subtitle:'保存后自动更新实时库存，出库数量不可超过可用库存',eyebrow:'STOCK MOVEMENT',body:formShell(`
    <div class="form-group full"><label>流水类型<em>*</em></label><div class="radio-group"><label class="radio-option"><input type="radio" name="type" value="in" ${defaultType==='in'?'checked':''}><span>${icon('inbound')}产品入库</span></label><label class="radio-option out"><input type="radio" name="type" value="out" ${defaultType==='out'?'checked':''}><span>${icon('outbound')}产品出库</span></label></div></div>
    ${selectField('产品','productId',db.products.map(p=>[p.id,`${p.code} · ${p.name}`]),selected,{required:true,full:true})}
    <div class="stock-available"><span>当前实时可用库存</span><strong id="availableStock">${stockOf(selected)} 件</strong></div>
    ${inputField('数量','quantity',1,{type:'number',min:1,required:true})}${inputField('发生时间','date',iso(),{type:'date',required:true})}
    ${selectField('经办人','operator',['赵库','林然','周舟','宋恺'],'赵库')}${selectField('关联项目','projectId',[['','不关联项目'],...db.projects.map(p=>[p.id,p.name])],db.movements[0]?.projectId)}
    ${textField('备注','note','')}`,'确认登记')});
}

function openInvoiceForm(clientId) {
  const projects=db.projects.filter(p=>p.clientId===clientId);
  openModal({title:'新增开票记录',subtitle:clientById(clientId)?.company,eyebrow:'INVOICE RECORD',body:formShell(`
    ${selectField('关联项目','projectId',projects.map(p=>[p.id,p.name]),projects[0]?.id,{required:true})}${inputField('开票金额（元）','amount','',{type:'number',min:0.01,step:'0.01',required:true})}
    ${selectField('开票状态','status',['待开票','已开票'],'待开票')}${inputField('开票日期','date',iso(),{type:'date'})}
    ${inputField('发票号码','number','',{placeholder:'已开票时建议填写'})}<input type="hidden" name="clientId" value="${clientId}">`,'保存开票记录')});
}
function openPaymentForm(projectId) {
  const p=projectById(projectId);
  openModal({title:'登记项目回款',subtitle:`${p.name} · 当前待回款 ${money(p.amount-p.received)}`,eyebrow:'PAYMENT RECORD',body:formShell(`
    ${inputField('本次回款金额（元）','amount',Math.max(0,p.amount-p.received),{type:'number',min:0.01,step:'0.01',required:true})}${inputField('回款日期','date',iso(),{type:'date',required:true})}
    ${inputField('备注','note','项目回款')}<input type="hidden" name="projectId" value="${projectId}">`,'确认回款')});
}

function formObject(form) { return Object.fromEntries(new FormData(form).entries()); }
function numberFields(obj,fields) { fields.forEach(k=>obj[k]=Number(obj[k])||0);return obj; }
function handleSubmit(event) {
  if(event.target.getAttribute('id')!=='businessForm')return;
  event.preventDefault();
  const data=formObject(event.target);
  const title=$('#modalTitle').textContent;
  try {
    if(title.includes('客户档案')||title==='新增客户') {
      numberFields(data,['budget','creditLimit','creditUsed']);data.credit=data.credit==='true';
      if(data.creditUsed>data.creditLimit && data.credit) throw new Error('已使用额度不能超过授信额度');
      if(data.id) Object.assign(clientById(data.id),data);else db.clients.push({...data,id:uid('c'),createdAt:iso()});
      toast(data.id?'客户档案已更新':'客户已创建');
    } else if(title.includes('产品信息')||title==='新增产品') {
      numberFields(data,['quantity','minStock','designFee','sampleFee','moldFee','unitCost','retail','discount','initialStock']);
      if(db.products.some(p=>p.code===data.code&&p.id!==data.id)) throw new Error('产品编号已存在，请更换');
      if(data.id) Object.assign(productById(data.id),data);else db.products.push({...data,id:uid('p')});
      toast(data.id?'产品信息已更新，成本与毛利已重算':'产品已创建');
    } else if(title.includes('开发项目')||title==='新建开发项目'||title==='编辑项目') {
      numberFields(data,['amount','received']);
      if(data.received>data.amount) throw new Error('已回款不能超过项目合同额');
      if(data.id) {const p=projectById(data.id);const oldIds=p.productIds;Object.assign(p,data,{productIds:[data.productId,...oldIds.filter(x=>x!==data.productId)]});delete p.productId;if(data.status==='已完成')p.stages.forEach(s=>{s.status='已完成';s.actual=s.actual||iso()});}
      else {const id=uid('j');db.projects.push({id,code:data.code,name:data.name,clientId:data.clientId,productIds:[data.productId],manager:data.manager,amount:data.amount,received:data.received,deadline:data.deadline,status:data.status,stages:STAGES.map((name,i)=>({name,plan:iso(i*5+3),actual:'',owner:i<4?(i===0?'顾清':'江离'):i<6?'宋恺':'赵库',status:i===0?'进行中':'未开始'}))});}
      toast(data.id?'项目信息已更新':'项目已创建，7 个开发节点已生成');
    } else if(title.startsWith('更新节点')) {
      const p=projectById(data.projectId),s=p.stages[Number(data.stageIndex)];Object.assign(s,{owner:data.owner,status:data.status,plan:data.plan,actual:data.actual});
      if(s.status==='已完成'&&!s.actual)s.actual=iso();if(s.status!=='已完成')s.actual='';
      if(p.stages.every(x=>x.status==='已完成'))p.status='已完成';else if(p.status==='已完成')p.status='进行中';
      toast('项目节点已更新，进度已同步');
      setTimeout(()=>openProjectDetail(p.id),50);
    } else if(title.includes('工作任务')||title==='分配工作任务') {
      numberFields(data,['progress']);data.progress=clamp(data.progress,0,100);if(data.status==='已完成')data.progress=100;
      if(data.id)Object.assign(db.tasks.find(t=>t.id===data.id),data);else db.tasks.push({...data,id:uid('t')});
      toast(data.id?'任务进度已更新':'任务已分配并通知到个人视图');
    } else if(title==='出入库登记') {
      numberFields(data,['quantity']);if(!Number.isInteger(data.quantity)||data.quantity<=0)throw new Error('出入库数量必须为正整数');
      if(data.type==='out'&&data.quantity>stockOf(data.productId))throw new Error(`出库失败：当前仅剩 ${stockOf(data.productId)} 件，库存不可为负`);
      db.movements.push({...data,id:uid('m')});toast(`${data.type==='in'?'入库':'出库'}登记成功，实时库存已更新`);
    } else if(title==='新增开票记录') {
      numberFields(data,['amount']);db.invoices.push({...data,id:uid('i')});toast('开票记录已保存');
    } else if(title==='登记项目回款') {
      numberFields(data,['amount']);const p=projectById(data.projectId);if(p.received+data.amount>p.amount)throw new Error('累计回款不能超过项目合同额');p.received+=data.amount;db.payments.push({id:uid('pay'),projectId:data.projectId,amount:data.amount,date:data.date,note:data.note});toast('回款已登记，看板数据已更新');
      setTimeout(()=>openProjectDetail(p.id),50);
    }
    save();render();if(!title.startsWith('更新节点')&&title!=='登记项目回款')closeModal();
  } catch(error) { toast(error.message,true); }
}

function openReminders() {
  const reminders=getReminders();
  $('#reminderSummary').innerHTML=`<div><strong>${reminders.filter(r=>r.level==='red').length}</strong><small>延期 / 风险</small></div><div><strong>${reminders.filter(r=>r.kind==='task').length}</strong><small>任务提醒</small></div><div><strong>${reminders.filter(r=>['stock','credit','invoice'].includes(r.kind)).length}</strong><small>经营提醒</small></div>`;
  const groups=[['project','项目节点'],['task','工作任务'],['stock','库存预警'],['credit','授信风险'],['invoice','开票事项']];
  $('#reminderList').innerHTML=groups.map(([kind,label])=>{const items=reminders.filter(r=>r.kind===kind);return items.length?`<h4 class="reminder-group-title">${label} · ${items.length}</h4>${items.map(r=>`<div class="reminder-item"><span class="reminder-item-icon ${r.level==='red'?'red':''}">${icon(r.icon)}</span><div><strong>${esc(r.title)}</strong><p>${esc(r.desc)}</p><button data-action="reminder-go" data-page="${r.page}" data-id="${r.id}">前往处理 ${icon('arrow')}</button></div></div>`).join('')}`:''}).join('')||emptyState('暂无提醒','业务运行状态良好');
  $('#drawerMask').classList.add('show');$('#notificationDrawer').classList.add('show');
}
function closeDrawer() {$('#drawerMask').classList.remove('show');$('#notificationDrawer').classList.remove('show');}

function exportCSV(type) {
  let rows=[],name=type;
  if(type==='clients'){name='客户档案';rows=[['客户姓名','单位','联系方式','开发需求','费用预算','付款方式','是否授信','授信额度','已用额度','剩余额度'],...db.clients.map(c=>[c.name,c.company,c.phone,c.needs,c.budget,c.payment,c.credit?'是':'否',c.creditLimit,c.creditUsed,c.creditLimit-c.creditUsed])];}
  else if(type==='products'){name='产品与成本';rows=[['产品编号','名称','类型','材质','计划数量','设计费','打样费','开模费','采购单价','综合成本','零售价','毛利率','进货数','出货数','实时库存'],...db.products.map(p=>[p.code,p.name,p.type,p.material,p.quantity,p.designFee,p.sampleFee,p.moldFee,p.unitCost,productCost(p).toFixed(2),p.retail,productMargin(p).toFixed(2)+'%',movementTotal(p.id,'in'),movementTotal(p.id,'out'),stockOf(p.id)])];}
  else if(type==='projects'){name='项目开发进度';rows=[['项目编号','项目名称','客户','负责人','合同额','已回款','交付日期','项目状态','整体进度','阶段','计划时间','实际时间','阶段负责人','阶段状态'],...db.projects.flatMap(p=>p.stages.map(s=>[p.code,p.name,clientById(p.clientId)?.company,p.manager,p.amount,p.received,p.deadline,projectStatus(p),projectProgress(p)+'%',s.name,s.plan,s.actual,s.owner,s.status]))];}
  else if(type==='movements'){name='库存出入库流水';rows=[['流水号','类型','产品编号','产品名称','数量','时间','经办人','关联项目','备注'],...db.movements.map(m=>[m.id,m.type==='in'?'入库':'出库',productById(m.productId)?.code,productById(m.productId)?.name,m.quantity,m.date,m.operator,projectById(m.projectId)?.name,m.note])];}
  else {name='经营数据简报';rows=[['指标','数值'],['项目总数',db.projects.length],['进行中项目',db.projects.filter(p=>p.status!=='已完成').length],['合同总额',db.projects.reduce((s,p)=>s+p.amount,0)],['累计回款',db.projects.reduce((s,p)=>s+p.received,0)],['实时库存',db.products.reduce((s,p)=>s+stockOf(p.id),0)],['待办任务',db.tasks.filter(t=>t.status!=='已完成').length]];}
  const csv='\ufeff'+rows.map(row=>row.map(cell=>`"${String(cell??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`造物集_${name}_${iso()}.csv`;a.click();URL.revokeObjectURL(url);toast(`${name}已导出为 CSV 文件`);
}

function globalSearch(query) {
  const box=$('#searchResults');
  if(!query.trim()){box.classList.remove('show');return;}
  const q=query.toLowerCase();
  const results=[
    ...db.clients.filter(c=>`${c.company}${c.name}${c.phone}`.toLowerCase().includes(q)).map(c=>({page:'clients',id:c.id,title:c.company,sub:`客户 · ${c.name} · ${c.phone}`,icon:'users'})),
    ...db.products.filter(p=>`${p.name}${p.code}${p.type}`.toLowerCase().includes(q)).map(p=>({page:'products',id:p.id,title:p.name,sub:`产品 · ${p.code} · 库存 ${stockOf(p.id)}`,icon:'box'})),
    ...db.projects.filter(p=>`${p.name}${p.code}`.toLowerCase().includes(q)).map(p=>({page:'projects',id:p.id,title:p.name,sub:`项目 · ${p.code} · ${projectProgress(p)}%`,icon:'route'}))
  ].slice(0,8);
  box.innerHTML=results.length?results.map(r=>`<button class="search-result" data-action="search-go" data-page="${r.page}" data-id="${r.id}"><span>${icon(r.icon)}</span><div><strong>${esc(r.title)}</strong><small>${esc(r.sub)}</small></div></button>`).join(''):'<div class="search-empty">未找到相关客户、产品或项目</div>';
  box.classList.add('show');
}

// 全局交互：统一事件委托，确保动态页面上的按钮始终可用。
document.addEventListener('click',event=>{
  const nav=event.target.closest('[data-nav]');if(nav){navigate(nav.dataset.nav);return;}
  const close=event.target.closest('[data-close]');if(close){close.dataset.close==='modal'?closeModal():closeDrawer();return;}
  const el=event.target.closest('[data-action]');if(!el)return;
  const {action,id}=el.dataset;
  if(action==='add-client')openClientForm();
  if(action==='edit-client')openClientForm(id);
  if(action==='view-client')openClientDetail(id);
  if(action==='add-product')openProductForm();
  if(action==='edit-product')openProductForm(id);
  if(action==='add-project')openProjectForm();
  if(action==='edit-project')openProjectForm(id);
  if(action==='view-project')openProjectDetail(id);
  if(action==='edit-stage')openStageForm(id,el.dataset.stage);
  if(action==='add-task')openTaskForm();
  if(action==='edit-task')openTaskForm(id);
  if(action==='add-movement')openMovementForm(id,el.dataset.type||'in');
  if(action==='add-invoice')openInvoiceForm(id);
  if(action==='add-payment')openPaymentForm(id);
  if(action==='open-reminders')openReminders();
  if(action==='task-view'){ui.taskView=el.dataset.view;render();}
  if(action==='inventory-tab'){ui.inventoryTab=el.dataset.tab;ui.filters.inventory={};render();}
  if(action==='export')exportCSV(el.dataset.type||ui.page);
  if(action==='reminder-go'){closeDrawer();navigate(el.dataset.page);if(el.dataset.page==='projects')setTimeout(()=>openProjectDetail(id),100);if(el.dataset.page==='clients')setTimeout(()=>openClientDetail(id),100);}
  if(action==='search-go'){$('#searchResults').classList.remove('show');$('#globalSearch').value='';navigate(el.dataset.page);if(el.dataset.page==='projects')setTimeout(()=>openProjectDetail(id),100);if(el.dataset.page==='clients')setTimeout(()=>openClientDetail(id),100);if(el.dataset.page==='products')setTimeout(()=>openProductForm(id),100);}
});

document.addEventListener('input',event=>{
  const t=event.target;
  if(t.id==='globalSearch')globalSearch(t.value);
  if(t.dataset.filterSearch){const page=t.dataset.filterSearch;ui.filters[page]={...(ui.filters[page]||{}),search:t.value};clearTimeout(window.filterTimer);window.filterTimer=setTimeout(()=>{render();const input=$(`[data-filter-search="${page}"]`);if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}},180);}
  if(t.closest('#businessForm')&&$('#modalTitle').textContent.includes('产品')) {
    const d=formObject($('#businessForm'));numberFields(d,['designFee','sampleFee','moldFee','quantity','unitCost','retail','discount']);const cost=productCost(d);if($('#calcCost')){$('#calcCost').textContent=money(cost);$('#calcMargin').textContent=`${productMargin(d).toFixed(1)}%`;$('#calcDiscountMargin').textContent=`${((d.retail*d.discount-cost)/(d.retail*d.discount||1)*100).toFixed(1)}%`;}
  }
});
document.addEventListener('change',event=>{
  const t=event.target;
  if(t.dataset.filterKey){ui.filters[t.dataset.filterPage]={...(ui.filters[t.dataset.filterPage]||{}),[t.dataset.filterKey]:t.value};render();}
  if(t.name==='productId'&&t.closest('#businessForm')&&$('#modalTitle').textContent==='出入库登记')$('#availableStock').textContent=`${stockOf(t.value)} 件`;
});
// 表单在打开弹窗时直接绑定 submit，避免原生提交导致页面刷新。
$('#quickAddBtn').addEventListener('click',()=>openProjectForm());
$('#notificationBtn').addEventListener('click',openReminders);
$('#exportBtn').addEventListener('click',()=>exportCSV(ui.page==='inventory'?'movements':ui.page));
$('#drawerMask').addEventListener('click',closeDrawer);
$('#modalMask').addEventListener('click',e=>{if(e.target===$('#modalMask'))closeModal();});
$('#menuToggle').addEventListener('click',()=>{$('#sidebar').classList.add('show');$('#mobileMask').classList.add('show');});
$('#mobileMask').addEventListener('click',()=>{$('#sidebar').classList.remove('show');$('#mobileMask').classList.remove('show');});
$('#profileBtn').addEventListener('click',()=>toast('当前以业务管理员「林然」身份登录'));
document.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('#globalSearch').focus();}
  if(event.key==='Escape'){closeModal();closeDrawer();$('#searchResults').classList.remove('show');}
});
document.addEventListener('click',event=>{if(!event.target.closest('.global-search'))$('#searchResults').classList.remove('show');});

// 初始化图标与首屏。
$$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
render();
