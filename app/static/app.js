"use strict";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const platformNames = {xiaohongshu: "小红书", wechat_article: "公众号", wechat_moments: "门店朋友圈"};
const state = {platform: "xiaohongshu", mode: "demo", current: null, tab: "preview", history: [], status: null};
const historyKey = "pc-workbench.demo-history.v1";
const selection = new Map();
let listingState = null;
let openResource = null;
let retrievalContext = null;
let toastTimer;

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $("#toast").hidden = true; }, 3400);
}

async function api(path, body) {
  const options = body === undefined ? {} : {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)};
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作未完成，请稍后重试");
  return data;
}

async function withBusy(button, action) {
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try { await action(); }
  catch (error) { toast(error.message || "操作未完成"); }
  finally { button.disabled = false; button.removeAttribute("aria-busy"); }
}

function changeView(view) {
  for (const name of ["workspace", "history", "connection"]) $("#" + name + "-view").hidden = name !== view;
  $$("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  $("#page-name").textContent = {workspace: "图文创作", history: "最近任务", connection: "知识库连接"}[view];
  if (view === "history") renderHistory();
  if (view === "connection") refreshStatus();
  window.scrollTo({top: 0, behavior: "smooth"});
}

function selectPlatform(platform) {
  state.platform = platform;
  $$("[data-platform]").forEach(button => {
    button.classList.toggle("selected", button.dataset.platform === platform);
    button.setAttribute("aria-pressed", String(button.dataset.platform === platform));
  });
}

function selectMode(mode) {
  state.mode = mode;
  $$("[data-mode]").forEach(button => button.classList.toggle("selected", button.dataset.mode === mode));
  $("#mode-note").textContent = mode === "demo" ? "◈ 当前使用规则示例，不调用模型或真实产品资料。" : "⌘ 直接检索 ima，可浏览目录、打开原文和图片，选择资料供后续调用。";
  $("#browse-library").hidden = mode !== "live";
  $("#generate-label").textContent = mode === "demo" ? "生成演示预览" : "搜索 ima 资料";
  $("#form-footnote").textContent = mode === "demo" ? "演示稿包含占位内容，需要接入 ima 与模型后才能正式生成。" : "原文与图片实时读取；来源、型号和适用条件仍需分别核实。";
  $("#form-message").hidden = true;
}

function taskFromForm() {
  return {
    request_id: crypto.randomUUID(), product: $("#product").value.trim(), audience: $("#audience").value.trim(),
    scenario: $("#scenario").value.trim(), platform: state.platform, goal: $("#goal").value,
    purchase_stage: $("#purchase-stage").value,
  };
}

function applyTask(task) {
  for (const [id, key] of [["product", "product"], ["audience", "audience"], ["scenario", "scenario"], ["goal", "goal"], ["purchase-stage", "purchase_stage"]]) {
    if (typeof task[key] === "string") $("#" + id).value = task[key];
  }
  selectPlatform(task.platform);
}

function preset(name) {
  const presets = {
    campus: {audience: "大学新生", scenario: "开学购机，兼顾课堂学习、宿舍整理资料和日常携带。", platform: "xiaohongshu", goal: "帮助判断是否适合，引导到店体验"},
    office: {audience: "经常出差的职场用户", scenario: "移动办公，需要在会议、差旅和文档处理之间切换，并确认企业应用和外设适用性。", platform: "wechat_article", goal: "解释使用场景，帮助比较选择"},
    store: {audience: "门店附近准备换机的用户", scenario: "门店到访，用一个可以现场验证的任务，说明值得体验的理由。", platform: "wechat_moments", goal: "提供一个明确的到店体验理由"},
  };
  applyTask(presets[name]);
  $("#form-message").hidden = true;
}

function clearResult() {
  state.current = null;
  $("#result-content").hidden = true;
  $("#search-content").hidden = true;
  $("#empty-state").hidden = false;
  $("#edit-panel").hidden = true;
  $("#review-count").hidden = true;
  $("#result-state").textContent = "等待任务";
  $$(".workflow-step").forEach((node, index) => node.classList.toggle("current", index === 0));
}

function showTab(name) {
  if (!state.current) return;
  state.tab = name;
  $$("[data-tab]").forEach(button => {
    const active = button.dataset.tab === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  for (const tab of ["preview", "strategy", "evidence", "review"]) $("#" + tab + "-tab").hidden = tab !== name;
}

function renderBody(text) {
  const container = $("#article-body");
  container.replaceChildren();
  for (const paragraph of text.split(/\n\n+/)) {
    if (paragraph.startsWith("## ")) {
      const [heading, ...rest] = paragraph.split("\n");
      container.append(element("h3", "", heading.slice(3)));
      if (rest.length) container.append(element("p", "", rest.join("\n")));
    } else container.append(element("p", "", paragraph));
  }
}

function renderArticle() {
  const {task, article} = state.current;
  $("#preview-platform").textContent = platformNames[task.platform] + " · 演示草稿";
  $("#cover-audience").textContent = task.audience + " · 需求先行";
  $("#article-title").textContent = article.title;
  $("#article-lead").textContent = article.lead;
  $("#article-lead").hidden = !article.lead;
  $("#article-cta").textContent = article.cta;
  $("#article-image-count").textContent = article.image_plan.length + " 张构图示意";
  renderBody(article.body);
  $("#article-tags").replaceChildren(...article.tags.map(tag => element("span", "", "#" + tag.replace(/^#/, ""))));
  $("#article-images").replaceChildren(...article.image_plan.slice(1).map((image, index) => {
    const card = element("div", "mini-image");
    card.append(element("b", "", "配图 " + (index + 2)), element("span", "", image.caption));
    return card;
  }));
}

function detailHeader(title, description) {
  return [element("h2", "detail-title", title), element("p", "detail-description", description)];
}

function sectionList(title, items) {
  const section = element("section", "detail-section");
  const list = element("ul", "detail-list");
  items.forEach((text, index) => {
    const li = element("li");
    li.append(element("span", "", String(index + 1).padStart(2, "0")), document.createTextNode(text));
    list.append(li);
  });
  section.append(element("h3", "", title), list);
  return section;
}

function renderStrategy() {
  const {strategy, task} = state.current;
  const grid = element("div", "strategy-grid");
  for (const [label, value] of [["目标人群", task.audience], ["购买阶段", task.purchase_stage || "尚未说明"], ["发布平台", strategy.platform.name], ["配图要求", strategy.platform.min_images + "–" + strategy.platform.max_images + " 张"]]) {
    const card = element("div", "detail-card");
    card.append(element("small", "", label), element("p", "", value)); grid.append(card);
  }
  $("#strategy-tab").replaceChildren(...detailHeader("先确定切入点，再决定怎么说。", "当前策略由场景规则组织；产品卖点需要在真实资料检索后才能确定。"), element("div", "strategy-hero", strategy.angle), grid, sectionList("内容优先级", strategy.priorities), sectionList("平台结构", strategy.platform.structure), sectionList("生成前值得确认", strategy.questions));
}

function renderEvidence() {
  const container = $("#evidence-tab");
  container.replaceChildren(...detailHeader("每一条产品声明，都需要依据。", "当前为开发占位，没有从 ima 提取产品事实。请勿把下列内容当成真实资料。"));
  for (const source of state.current.evidence.sources) {
    const card = element("div", "source-card");
    card.append(element("div", "source-label", "开发占位 · 非 ima 来源"), element("strong", "", source.title), element("p", "", "接入原文后，这里展示资料标题、事实与适用条件。")); container.append(card);
  }
  container.append(sectionList("配图方案 · 全部待替换", state.current.article.image_plan.map(image => image.position + "：" + image.caption + "；" + image.reason)));
}

function renderReview() {
  const report = state.current.review;
  const container = $("#review-tab");
  container.replaceChildren(...detailHeader(report.status === "blocked" ? "发现需要处理的问题" : "结构已检查，内容仍需复核。", "结构通过不等于事实准确或可以发布。来源真实性、正文语义及图片画面需要独立确认。"));
  const names = {fact: "事实与来源", image: "图片与型号", compliance: "营销表达", platform: "平台与结构"};
  for (const check of report.checks) {
    const card = element("div", "check-card " + check.status);
    const text = element("div"); text.append(element("strong", "", names[check.category]), element("p", "", check.detail));
    card.append(element("span", "check-icon", {pass: "✓", pending: "!", fail: "×"}[check.status]), text, element("span", "check-tag", {pass: "结构通过", pending: "待复核", fail: "需处理"}[check.status]));
    container.append(card);
  }
  const pending = report.checks.filter(check => check.status !== "pass").length;
  $("#review-count").textContent = pending;
  $("#review-count").hidden = false;
}

function renderResult(result, save = true) {
  state.current = result;
  $("#empty-state").hidden = true;
  $("#search-content").hidden = true;
  $("#result-content").hidden = false;
  $("#edit-panel").hidden = true;
  $("#result-state").textContent = "演示 · 待复核";
  renderArticle(); renderStrategy(); renderEvidence(); renderReview(); showTab("preview");
  $$(".workflow-step").forEach((node, index) => node.classList.toggle("current", index === 3));
  if (save) saveHistory(result);
}

function renderSearch(result, append = false) {
  if (append && listingState) result = {...result, items: [...listingState.items, ...result.items]};
  listingState = result;
  state.current = null;
  $("#empty-state").hidden = true;
  $("#result-content").hidden = true;
  $("#search-content").hidden = false;
  $("#review-count").hidden = true;
  $("#result-state").textContent = "真实检索";
  $$("[data-tab]").forEach(button => { button.classList.toggle("active", button.dataset.tab === "evidence"); button.setAttribute("aria-selected", String(button.dataset.tab === "evidence")); });
  $$(".workflow-step").forEach((node, index) => node.classList.toggle("current", index === 2));
  const container = $("#search-content");
  container.replaceChildren(...detailHeader("直接查阅 ima 知识库", result.knowledge_base));
  const toolbar = element("div", "knowledge-toolbar");
  const input = element("input"); input.placeholder = "搜索型号、功能或业务场景"; input.value = result.query || ""; input.maxLength = 200; input.setAttribute("aria-label", "知识库关键词");
  const searchButton = element("button", "button primary", "搜索");
  const search = () => withBusy(searchButton, async () => {
    if (!input.value.trim()) return toast("请输入关键词");
    renderSearch(await api("/api/search", {query: input.value.trim(), knowledge_base: knowledgeName()}));
  });
  searchButton.addEventListener("click", search);
  input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); search(); } });
  const root = element("button", "button secondary", "浏览根目录"); root.addEventListener("click", () => browseDirectory());
  toolbar.append(input, searchButton, root); container.append(toolbar);
  const breadcrumbs = element("div", "knowledge-breadcrumbs");
  for (const crumb of result.breadcrumbs || []) {
    const button = element("button", "", crumb.title); button.addEventListener("click", () => browseDirectory(crumb.ref)); breadcrumbs.append(button, element("span", "", "/"));
  }
  container.append(breadcrumbs, element("div", "search-notice", result.note));
  const basket = element("div", "knowledge-basket"); basket.id = "knowledge-basket"; container.append(basket); updateBasket();
  const filters = element("div", "knowledge-filters");
  const list = element("div", "knowledge-list"); list.id = "knowledge-list";
  const types = {all: "全部", document: "资料", image: "图片", folder: "文件夹"};
  function draw(kind = "all") {
    list.replaceChildren();
    const items = result.items.filter(item => kind === "all" || item.kind === kind);
    filters.querySelectorAll("button").forEach(button => button.classList.toggle("selected", button.dataset.filter === kind));
    for (const item of items) {
      const card = element("div", "source-card knowledge-card");
      const content = element("div", "knowledge-card-content");
      content.append(element("div", "source-label real", {folder: "文件夹", image: "真实图片", document: "原始资料"}[item.kind] || "资料"), element("strong", "", item.title));
      if (item.excerpt) content.append(element("p", "", item.excerpt));
      const actions = element("div", "knowledge-card-actions");
      const open = element("button", "small-button", item.kind === "folder" ? "进入目录 →" : item.kind === "image" ? "查看图片" : "查看原文");
      open.addEventListener("click", () => item.kind === "folder" ? browseDirectory(item.ref) : readResource(item)); actions.append(open);
      if (item.kind !== "folder") {
        const add = element("button", "small-button selection-button", selection.has(item.ref) ? "已选择 ✓" : "选择资料");
        add.dataset.ref = item.ref;
        add.addEventListener("click", () => { toggleSelection(item); add.textContent = selection.has(item.ref) ? "已选择 ✓" : "选择资料"; }); actions.append(add);
      }
      card.append(content, actions); list.append(card);
    }
    if (!items.length) list.append(element("p", "detail-description", "此分类没有条目，请更换分类、关键词或进入目录。"));
  }
  for (const [kind, label] of Object.entries(types)) {
    const count = result.items.filter(item => kind === "all" || item.kind === kind).length;
    const button = element("button", "", label + " " + count); button.dataset.filter = kind; button.addEventListener("click", () => draw(kind)); filters.append(button);
  }
  container.append(filters, list); draw();
  if (result.next_page_ref) {
    const more = element("button", "button secondary load-more", "加载下一页");
    more.addEventListener("click", () => withBusy(more, async () => {
      const path = result.mode === "search" ? "/api/search" : "/api/browse";
      renderSearch(await api(path, {knowledge_base: knowledgeName(), query: result.query, page_ref: result.next_page_ref}), true);
    })); container.append(more);
  }
  refreshStatus();
}

function knowledgeName() { return $("#kb-name").value.trim(); }

async function browseDirectory(reference) {
  await withBusy($("#browse-library"), async () => {
    selectMode("live"); changeView("workspace");
    renderSearch(await api("/api/browse", {knowledge_base: knowledgeName(), folder_ref: reference}));
  });
}

function toggleSelection(item) {
  if (selection.has(item.ref)) selection.delete(item.ref);
  else {
    if (selection.size >= 8) return toast("每次最多选择 8 份资料或图片");
    selection.set(item.ref, item);
  }
  updateBasket();
}

function updateBasket() {
  $$(".selection-button").forEach(button => { button.textContent = selection.has(button.dataset.ref) ? "已选择 ✓" : "选择资料"; });
  const basket = $("#knowledge-basket"); if (!basket) return;
  basket.replaceChildren(element("span", "", "已选 " + selection.size + " / 8 份资料"));
  const actions = element("div");
  const clear = element("button", "small-button", "清空"); clear.addEventListener("click", () => { selection.clear(); updateBasket(); if (listingState) renderSearch(listingState); });
  const read = element("button", "small-button", "读取选中资料 →"); read.disabled = !selection.size;
  read.addEventListener("click", () => withBusy(read, async () => {
    const result = await api("/api/retrieve", {knowledge_base: knowledgeName(), references: [...selection.keys()], request_id: crypto.randomUUID()});
    retrievalContext = result; showRetrieved(result);
  }));
  actions.append(clear, read); basket.append(actions);
}

function resourceMeta(source) {
  const path = [...(source.path || [])];
  if (path[0] !== source.knowledge_base) path.unshift(source.knowledge_base);
  return [...path, source.title].join(" / ") + "\n读取时间：" + new Date(source.retrieved_at).toLocaleString("zh-CN");
}

function resourceContents(content) {
  if (content.kind === "image") {
    const image = element("img", "real-resource-image"); image.src = content.asset_url; image.alt = content.source.title; return image;
  }
  return element("pre", "source-original", content.text + (content.truncated ? "\n\n[正文过长，预览已截断]" : ""));
}

async function readResource(item) {
  await withBusy($("#browse-library"), async () => {
    toast(item.kind === "image" ? "正在读取 ima 图片…" : "正在读取 ima 原文…");
    const content = await api("/api/read", {knowledge_base: knowledgeName(), ref: item.ref});
    openResource = {item, content};
    $("#resource-title").textContent = content.source.title;
    $("#resource-source").textContent = resourceMeta(content.source);
    $("#resource-body").replaceChildren(resourceContents(content));
    $("#copy-resource").hidden = content.kind !== "document";
    $("#select-resource").textContent = selection.has(item.ref) ? "移出资料篮" : "加入资料篮";
    $("#resource-dialog").showModal();
  });
}

function showRetrieved(result) {
  const container = $("#search-content");
  container.replaceChildren(...detailHeader("已读取的知识库内容", result.note));
  const toolbar = element("div", "knowledge-toolbar");
  const back = element("button", "button secondary", "← 返回检索结果"); back.addEventListener("click", () => { if (listingState) renderSearch(listingState); else browseDirectory(); });
  const copy = element("button", "button primary", "复制调用结果"); copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(JSON.stringify(retrievalContext, null, 2)); toast("已复制真实检索内容与来源，可供后续模块调用"); } catch { toast("浏览器未允许复制"); } });
  toolbar.append(back, copy); container.append(toolbar);
  container.append(element("div", "search-notice", "已读取 " + result.documents.length + " 份原文、" + result.images.length + " 张图片。内容仅在本机显示，不保存到代码仓库。"));
  for (const warning of result.warnings) container.append(element("p", "retrieval-warning", warning));
  for (const content of [...result.documents, ...result.images]) {
    const details = element("details", "retrieved-item");
    details.append(element("summary", "", content.source.title), element("p", "resource-source", resourceMeta(content.source)), resourceContents(content));
    container.append(details);
  }
}

async function generate() {
  const task = taskFromForm();
  const button = $("#generate");
  $("#form-message").hidden = true;
  await withBusy(button, async () => {
    if (state.mode === "live") {
      if (!task.product) { $("#form-message").textContent = "请先填写需要检索的具体产品型号。"; $("#form-message").hidden = false; return; }
      const query = task.product.replace(/[（(].*?[）)]/g, "").replace(/^HUAWEI\s+/i, "").trim();
      renderSearch(await api("/api/search", {query, knowledge_base: $("#kb-name").value.trim()}));
      toast("真实检索已完成，可打开原文和图片");
      return;
    }
    const result = await api("/api/demo", {task});
    if (!result.article) {
      const preparation = result.preparation;
      $("#form-message").textContent = preparation.questions?.join(" ") || "任务格式不正确，请检查输入。";
      $("#form-message").hidden = false;
      toast("请先补充任务信息");
      return;
    }
    renderResult(result);
    toast("演示预览已生成，事实和图片仍为占位");
  });
}

function articleMarkdown() {
  const {task, article, evidence, review} = state.current;
  return ["> 开发演示 · 未调用大模型 · 事实和图片为占位 · 不可作为正式发布稿或参赛运行证明", "", "# " + article.title, "", "平台：" + platformNames[task.platform] + "；目标人群：" + task.audience, "型号：" + task.product, "场景：" + task.scenario, "", article.lead, "", article.body, "", article.cta, "", article.tags.map(tag => "#" + tag).join(" "), "", "## 配图方案（待替换 ima 真实图片）", ...article.image_plan.map((image, index) => `${index + 1}. ${image.position}：${image.caption}。${image.reason}`), "", "## 来源状态", ...evidence.sources.map(source => "- " + source.title), "", "## 核验结果", ...review.checks.map(check => "- [" + {pass: "结构通过", pending: "待复核", fail: "需处理"}[check.status] + "] " + check.detail)].join("\n");
}

async function copyArticle() {
  if (!state.current) return;
  try {
    await navigator.clipboard.writeText(articleMarkdown());
    toast("已复制，包含演示标记与核验说明");
  } catch { toast("浏览器未允许复制，请使用导出文件"); }
}

function exportArticle() {
  if (!state.current) return;
  const blob = new Blob([articleMarkdown()], {type: "text/markdown;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const link = element("a"); link.href = url;
  link.download = "PC内容草稿_演示_" + Date.now() + ".md";
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("已导出 Markdown，保留演示与待核验标记");
}

function startEdit() {
  if (!state.current) return;
  $("#edit-title").value = state.current.article.title;
  $("#edit-body").value = state.current.article.body;
  $("#edit-cta").value = state.current.article.cta;
  $("#edit-panel").hidden = false;
  $("#edit-panel").scrollIntoView({behavior: "smooth", block: "center"});
}

async function saveEdit() {
  if (!state.current) return;
  await withBusy($("#save-edit"), async () => {
    const article = structuredClone(state.current.article);
    article.title = $("#edit-title").value.trim();
    article.body = $("#edit-body").value.trim();
    article.cta = $("#edit-cta").value.trim();
    const review = await api("/api/review", {task: state.current.task, evidence: state.current.evidence, article});
    const updated = {...state.current, article, review};
    renderResult(updated);
    if (review.status === "blocked") showTab("review");
    toast(review.status === "blocked" ? "修改已保存，请处理核验中发现的问题" : "修改已保存，内容语义仍需复核");
  });
}

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(historyKey) || "[]");
    state.history = Array.isArray(value) ? value.filter(item => item?.result?.mode === "development_only" && item.result.article && item.result.task && item.result.review && item.result.strategy).slice(0, 10) : [];
  } catch { state.history = []; }
  $("#history-count").textContent = state.history.length;
}

function saveHistory(result) {
  state.history = [{time: new Date().toISOString(), result: structuredClone(result)}, ...state.history.filter(item => item.result.task.request_id !== result.task.request_id)].slice(0, 10);
  try { localStorage.setItem(historyKey, JSON.stringify(state.history)); }
  catch { toast("浏览器无法保存历史，当前预览仍可使用"); }
  $("#history-count").textContent = state.history.length;
}

function renderHistory() {
  const container = $("#history-list"); container.replaceChildren();
  if (!state.history.length) return container.append(element("div", "history-empty", "还没有任务。先生成一份演示预览，记录会出现在这里。"));
  for (const item of state.history) {
    const card = element("button", "history-card");
    card.append(element("small", "", platformNames[item.result.task.platform] + " · 开发演示"), element("strong", "", item.result.article.title), element("p", "", item.result.task.audience + " / " + item.result.task.scenario), element("span", "", new Date(item.time).toLocaleString("zh-CN") + "　↗ 打开"));
    card.addEventListener("click", () => { selectMode("demo"); applyTask(item.result.task); renderResult(structuredClone(item.result), false); changeView("workspace"); });
    container.append(card);
  }
}

async function refreshStatus() {
  try {
    const status = await api("/api/status"); state.status = status;
    const prerequisites = status.ima.node_available && status.ima.official_script_available && status.ima.client_id_configured && status.ima.api_key_configured;
    const connected = status.connection.status === "connected";
    $("#top-status").textContent = connected ? "ima 共享库已连接" : prerequisites ? "凭证就绪 · 待检查共享库" : "ima 待配置";
    $("#connection-shortcut .dot").classList.toggle("amber", !connected);
    $("#nav-connection").classList.toggle("connected", connected);
    const rows = [["Node.js 运行环境", status.ima.node_available], ["官方 ima 技能脚本", status.ima.official_script_available], ["Client ID", status.ima.client_id_configured], ["API Key", status.ima.api_key_configured], ["模型配置（未实现生成联调）", status.model_configured]];
    $("#config-checks").replaceChildren(...rows.map(([label, configured]) => {
      const row = element("div", "config-row"); row.append(element("span", "", label), element("span", configured ? "" : "missing", configured ? "已配置" : "待配置")); return row;
    }));
    $("#probe-result").textContent = status.connection.note;
    $("#probe-result").classList.toggle("error", status.connection.status === "not_connected");
  } catch { $("#top-status").textContent = "本地服务未响应"; toast("无法连接本地服务，请检查工作台是否仍在运行"); }
}

async function probeConnection() {
  await withBusy($("#probe-connection"), async () => {
    $("#probe-result").textContent = "正在检查共享库访问权限…";
    try {
      const result = await api("/api/probe", {knowledge_base: $("#kb-name").value.trim()});
      $("#probe-result").textContent = result.knowledge_base + "：连接成功，可继续检索、读取原文和图片。";
      $("#probe-result").classList.remove("error");
      toast("共享知识库连接成功");
      await refreshStatus();
    } catch (error) {
      $("#probe-result").textContent = error.message;
      $("#probe-result").classList.add("error");
      await refreshStatus();
      throw error;
    }
  });
}

$$("[data-view]").forEach(button => button.addEventListener("click", () => changeView(button.dataset.view)));
$$("[data-platform]").forEach(button => button.addEventListener("click", () => selectPlatform(button.dataset.platform)));
$$("[data-mode]").forEach(button => button.addEventListener("click", () => selectMode(button.dataset.mode)));
$$("[data-preset]").forEach(button => button.addEventListener("click", () => preset(button.dataset.preset)));
$$("[data-tab]").forEach(button => button.addEventListener("click", () => { if (!state.current) toast("先生成一份演示预览，即可查看这里"); else showTab(button.dataset.tab); }));
$("#task-form").addEventListener("submit", event => { event.preventDefault(); generate(); });
$("#try-demo").addEventListener("click", () => { selectMode("demo"); preset("campus"); generate(); });
$("#new-task").addEventListener("click", () => { $("#task-form").reset(); selectMode("demo"); selectPlatform("xiaohongshu"); clearResult(); $("#form-message").hidden = true; $("#product").focus(); });
$("#edit-article").addEventListener("click", startEdit);
$("#save-edit").addEventListener("click", saveEdit);
$("#cancel-edit").addEventListener("click", () => { $("#edit-panel").hidden = true; });
$("#copy-article").addEventListener("click", copyArticle);
$("#export-md").addEventListener("click", exportArticle);
$("#connection-shortcut").addEventListener("click", () => changeView("connection"));
$("#refresh-status").addEventListener("click", () => withBusy($("#refresh-status"), refreshStatus));
$("#probe-connection").addEventListener("click", probeConnection);
$("#clear-history").addEventListener("click", () => { state.history = []; try { localStorage.removeItem(historyKey); } catch {} $("#history-count").textContent = "0"; renderHistory(); toast("本浏览器中的演示历史已清空"); });
$("#browse-library").addEventListener("click", () => browseDirectory());
$("#close-resource").addEventListener("click", () => $("#resource-dialog").close());
$("#select-resource").addEventListener("click", () => { if (!openResource) return; toggleSelection(openResource.item); $("#select-resource").textContent = selection.has(openResource.item.ref) ? "移出资料篮" : "加入资料篮"; });
$("#copy-resource").addEventListener("click", async () => { if (!openResource) return; try { await navigator.clipboard.writeText(resourceMeta(openResource.content.source) + "\n\n" + openResource.content.text); toast("已复制原文及来源"); } catch { toast("浏览器未允许复制"); } });
$("#kb-name").addEventListener("change", () => { selection.clear(); listingState = null; retrievalContext = null; clearResult(); });
readHistory(); selectMode("live"); refreshStatus();
