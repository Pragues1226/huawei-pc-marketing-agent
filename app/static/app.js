"use strict";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const platformNames = {xiaohongshu: "小红书", wechat_article: "公众号", wechat_moments: "门店朋友圈"};
const state = {platform: "xiaohongshu", mode: "demo", adFormat: "editorial", adGame: {step: 0, scene: null, mission: null, feedback: null, round: 0, answers: [], seed: 0}, current: null, tab: "preview", history: [], status: null};
const historyKey = "pc-workbench.demo-history.v1";
const taskDraftKey = "pc-workbench.task-draft.v1";
const selection = new Map();
let listingState = null;
let openResource = null;
let retrievalContext = null;
let toastTimer;

function emptyGameProgress() {
  return {step: 0, scene: null, mission: null, feedback: null, round: 0, answers: [], seed: newGameSeed()};
}

function newGameSeed() {
  return Math.floor(Math.random() * 2147483647);
}

function nextGameSeed(seed = 0) {
  return (Number.isInteger(seed) ? seed : 0) + 1;
}

function loadGameTitleCollection() {
  try {
    const saved = JSON.parse(localStorage.getItem("pc-workbench.game-title-collection.v1") || "[]");
    return new Set(Array.isArray(saved) ? saved.filter(value => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

const unlockedGameEvents = loadGameTitleCollection();

function unlockGameTitle(eventName) {
  if (!eventName) return;
  unlockedGameEvents.add(eventName);
  try { localStorage.setItem("pc-workbench.game-title-collection.v1", JSON.stringify([...unlockedGameEvents])); }
  catch { /* Keep the current page collection usable when storage is unavailable. */ }
}

function gameTitleCollection(makeElement, scene, mission, unlockedEvents, currentEvent) {
  const events = gameIncidentVariants(scene, mission);
  const unlockedCount = events.filter(event => unlockedEvents.has(event.name)).length;
  const section = makeElement("section", "game-title-collection");
  section.setAttribute("aria-label", `${scene}事件图鉴`);
  const heading = makeElement("div", "game-title-collection-head");
  heading.append(makeElement("strong", "game-title-collection-title", "事件图鉴"), makeElement("span", "game-title-collection-count", `${unlockedCount} / ${events.length} 已解锁`));
  section.append(heading);
  const hint = unlockedCount === events.length
    ? "本场景称号已集齐，换条路线继续探索。"
    : unlockedEvents.has(currentEvent)
      ? "本局称号已收录，再挑战另一事件继续收集。"
      : "本局满分可解锁称号；另一事件也有自己的称号。";
  section.append(makeElement("p", "game-title-collection-hint", hint));
  const list = makeElement("div", "game-title-collection-list");
  events.forEach(event => {
    const unlocked = unlockedEvents.has(event.name);
    const current = event.name === currentEvent;
    const item = makeElement("div", "game-title-collection-item" + (unlocked ? " unlocked" : current ? " current" : ""));
    item.append(makeElement("strong", "game-title-collection-name", gamePerfectTitle(scene, event.name)));
    item.append(makeElement("span", "game-title-collection-event", event.name));
    item.append(makeElement("small", "game-title-collection-status", unlocked ? "已解锁" : current ? "本局待解锁" : "待挑战"));
    list.append(item);
  });
  section.append(list);
  return section;
}

function gameTitleCollectionOverview(makeElement, unlockedEvents) {
  const scenarios = [
    {name: "课堂学习", mission: "带一份课程资料"},
    {name: "会议准备", mission: "整理一份会议材料"},
    {name: "创作交付", mission: "整理一组创作素材"},
    {name: "到店实测", mission: "带真实任务体验样机"},
    {name: "日常任务", mission: "整理一份常用资料"},
  ];
  const entries = scenarios.flatMap(scene => gameIncidentVariants(scene.name, scene.mission).map(event => ({scene: scene.name, event})));
  const unlockedCount = entries.filter(item => unlockedEvents.has(item.event.name)).length;
  const details = makeElement("details", "game-title-library");
  const summary = makeElement("summary", "game-title-library-summary");
  summary.append(makeElement("strong", "game-title-library-title", "事件图鉴"), makeElement("span", "game-title-library-count", `${unlockedCount} / ${entries.length} 已解锁`));
  details.append(summary);
  details.append(makeElement("p", "game-title-library-hint", unlockedCount ? "已收录的称号会保存在本机，继续完成场景挑战即可补全。" : "完成场景挑战并拿到满分，收下属于你的事件称号。"));
  const list = makeElement("div", "game-title-library-list");
  entries.forEach(({scene, event}) => {
    const unlocked = unlockedEvents.has(event.name);
    const item = makeElement("div", "game-title-library-item" + (unlocked ? " unlocked" : ""));
    item.append(makeElement("strong", "", gamePerfectTitle(scene, event.name)));
    item.append(makeElement("span", "", `${scene} · ${event.name}`));
    item.append(makeElement("small", "", unlocked ? "已解锁" : "待挑战"));
    list.append(item);
  });
  details.append(list);
  return details;
}

function rotateGameRounds(rounds, seed = 0) {
  const normalizedSeed = Math.abs(Math.trunc(Number(seed) || 0));
  return rounds.map((round, index) => {
    const shift = (normalizedSeed + index * 7) % round.options.length;
    return {...round, options: [...round.options.slice(shift), ...round.options.slice(0, shift)]};
  });
}

function gameProgressMeter(makeElement, total, completed, active) {
  const track = makeElement("div", "game-round-track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", "三题闯关进度");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", String(total));
  track.setAttribute("aria-valuenow", String(completed));
  const label = makeElement("span", "game-round-track-label", `挑战进度 ${completed} / ${total}`);
  const marks = makeElement("div", "game-round-track-marks");
  marks.setAttribute("aria-hidden", "true");
  for (let index = 0; index < total; index += 1) {
    const status = index < completed ? " complete" : index === active && completed < total ? " active" : "";
    marks.append(makeElement("span", "game-round-pip" + status));
  }
  track.append(label, marks);
  return track;
}

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function isLiveResult(result = state.current) {
  return result?.mode === "live" || result?.mode === "local";
}

function syncGenerateLabel() {
  const label = $("#generate-label");
  if (!label) return;
  if (state.mode === "demo") {
    label.textContent = state.adFormat === "game" ? "生成演示稿 + 可玩小游戏" : "生成演示预览";
    return;
  }
  label.textContent = selection.size
    ? state.adFormat === "game" ? "生成图文 + 互动小游戏" : "生成并核验图文"
    : "搜索 ima 资料";
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

function saveTaskDraft() {
  const draft = {
    product: $("#product").value,
    audience: $("#audience").value,
    scenario: $("#scenario").value,
    platform: state.platform,
    purchase_stage: $("#purchase-stage").value,
    goal: $("#goal").value,
    mode: state.mode,
    ad_format: state.adFormat,
  };
  try { localStorage.setItem(taskDraftKey, JSON.stringify(draft)); } catch { /* Keep editing available when storage is unavailable. */ }
}

function restoreTaskDraft() {
  let draft;
  try { draft = JSON.parse(localStorage.getItem(taskDraftKey) || "null"); } catch { return; }
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return;
  for (const [id, key, maxLength] of [["product", "product", 160], ["audience", "audience", 100], ["scenario", "scenario", 1000]]) {
    if (typeof draft[key] === "string") $("#" + id).value = draft[key].slice(0, maxLength);
  }
  for (const [selector, key] of [["#purchase-stage", "purchase_stage"], ["#goal", "goal"]]) {
    const select = $(selector);
    if (typeof draft[key] === "string" && [...select.options].some(option => option.value === draft[key])) select.value = draft[key];
  }
  selectPlatform(["xiaohongshu", "wechat_article", "wechat_moments"].includes(draft.platform) ? draft.platform : "xiaohongshu");
  selectMode(draft.mode === "live" ? "live" : "demo");
  selectAdFormat(draft.ad_format === "game" ? "game" : "editorial");
}

function selectPlatform(platform) {
  state.platform = platform;
  $("#form-message").hidden = true;
  $$("[data-platform]").forEach(button => {
    button.classList.toggle("selected", button.dataset.platform === platform);
    button.setAttribute("aria-pressed", String(button.dataset.platform === platform));
  });
  syncTaskStaleNotice();
  saveTaskDraft();
  syncCreationTrace();
}

function selectMode(mode) {
  if (state.mode !== mode) state.adGame = emptyGameProgress();
  state.mode = mode;
  $('[data-format="game"]').disabled = false;
  $$("[data-mode]").forEach(button => button.classList.toggle("selected", button.dataset.mode === mode));
  $("#mode-note").textContent = mode === "demo" ? "◈ 当前使用规则示例，不调用模型或真实产品资料。" : "⌘ 先检索 ima，选择原文和同型号图片，再生成并核验图文。";
  $("#browse-library").hidden = mode !== "live";
  syncGenerateLabel();
  $("#form-footnote").textContent = mode === "demo" ? "演示稿包含占位内容，需要接入 ima 与模型后才能正式生成。任务草稿仅保存在当前浏览器。" : "原文与图片实时读取；来源、型号和适用条件仍需分别核实。任务草稿仅保存在当前浏览器。";
  $("#form-message").hidden = true;
  $("#format-note").textContent = mode === "live"
    ? state.adFormat === "game" ? "真实图文按 ima 资料核验；小游戏按场景规则生成，不加入未核实的产品主张。" : "场景图文使用实时资料与模型生成，并独立核验。"
    : state.adFormat === "game" ? "互动玩法原型 · 只引导真实体验，不编造产品事实或奖励。" : "标准图文草稿";
  if (state.current) renderGameAd();
  syncTaskStaleNotice();
  saveTaskDraft();
  syncCreationTrace();
}

function selectAdFormat(format) {
  state.adFormat = format;
  state.adGame = emptyGameProgress();
  $$('[data-format]').forEach(button => {
    const active = button.dataset.format === format;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#format-note").textContent = format === "game"
    ? state.mode === "live" ? "真实图文按 ima 资料核验；小游戏按场景规则生成，不加入未核实的产品主张。" : "互动玩法原型 · 只引导真实体验，不编造产品事实或奖励。"
    : "标准图文草稿";
  syncGenerateLabel();
  if (state.current) renderGameAd();
  syncTaskStaleNotice();
  saveTaskDraft();
  syncCreationTrace();
}

function taskFromForm() {
  return {
    request_id: crypto.randomUUID(), product: $("#product").value.trim(), audience: $("#audience").value.trim(),
    scenario: $("#scenario").value.trim(), platform: state.platform, goal: $("#goal").value,
    purchase_stage: $("#purchase-stage").value,
  };
}

function syncCreationTrace() {
  const trace = $("#creation-trace");
  const detail = $("#creation-trace-detail");
  if (!trace || !detail) return;
  const short = (value, fallback, limit = 20) => {
    const text = String(value || "").trim().replace(/\s+/g, " ");
    const chars = Array.from(text);
    return !text ? fallback : chars.length > limit ? `${chars.slice(0, limit).join("")}…` : text;
  };
  const product = short($("#product").value, "产品型号待补充", 18);
  const audience = short($("#audience").value, "目标人群待补充");
  const scenario = short($("#scenario").value, "使用场景待补充", 24);
  const platform = platformNames[state.platform] || "当前平台";
  const format = state.adFormat === "game" ? "互动小游戏" : "场景图文";
  const inputBasis = `依据：${short(audience, "人群待补充", 8)} × ${short(scenario, "场景待补充", 10)} → ${platform}`;
  const sourceStatus = state.mode === "demo"
    ? "演示内容仅作规则示例，产品资料与图片为占位。"
    : selection.size
      ? `已选 ${selection.size} 项 ima 资料；生成后可查看来源与核验结果。`
      : "真实模式需先检索 ima 并选择资料，再生成。";
  const gameBoundary = state.adFormat === "game" ? "小游戏只引导实际体验，不补造产品结论。" : "";
  trace.textContent = inputBasis;
  detail.textContent = [`产品：${product} · 创作形式：${format}。`, sourceStatus, gameBoundary].filter(Boolean).join(" ");
}
function syncTaskStaleNotice() {
  const notice = $("#task-stale-notice");
  if (!notice) return;
  if (!state.current?.task) { notice.hidden = true; notice.replaceChildren(); return; }
  const task = state.current.task;
  const currentValues = {
    product: $("#product").value.trim(), audience: $("#audience").value.trim(),
    scenario: $("#scenario").value.trim(), purchase_stage: $("#purchase-stage").value,
    goal: $("#goal").value, platform: state.platform,
  };
  const labels = {product: "产品型号", audience: "目标人群", scenario: "使用场景", purchase_stage: "购买阶段", goal: "内容目标", platform: "发布平台"};
  const changed = Object.keys(labels).filter(key => String(currentValues[key] || "").trim() !== String(task[key] || "").trim()).map(key => labels[key]);
  const currentMode = state.current.mode === "development_only" ? "demo" : "live";
  if (state.mode !== currentMode) changed.push("工作模式");
  if (state.adFormat !== (state.current.adFormat || "editorial")) changed.push("创意形式");
  const stale = changed.length > 0;
  notice.hidden = !stale;
  if (stale && !$("#toast").hidden) {
    clearTimeout(toastTimer);
    $("#toast").hidden = true;
  }
  const notReady = currentMode === "live" && state.current.status !== "ready";
  $("#copy-article").disabled = stale || notReady;
  $("#export-md").disabled = stale || notReady;
  $("#edit-article").disabled = stale;
  $("#copy-game-script").disabled = stale;
  $$("#game-ad-preview button").forEach(button => {
    if (stale) {
      if (button.dataset.staleWasDisabled === undefined) button.dataset.staleWasDisabled = String(button.disabled);
      button.disabled = true;
    } else if (button.dataset.staleWasDisabled !== undefined) {
      button.disabled = button.dataset.staleWasDisabled === "true";
      delete button.dataset.staleWasDisabled;
    }
  });
  const scoreCardLink = $("#game-ad-preview [data-score-card]");
  if (scoreCardLink) {
    scoreCardLink.setAttribute("aria-disabled", String(stale || !scoreCardLink.href));
    scoreCardLink.tabIndex = stale || !scoreCardLink.href ? -1 : 0;
  }
  if (!stale) { notice.replaceChildren(); return; }
  const text = element("p", "", `当前输入已变更：${[...new Set(changed)].join("、")}。右侧仍是上次结果，请重新生成后再使用。`);
  const refresh = element("button", "button secondary task-stale-action", state.mode === "live" ? "按当前需求搜索 / 生成" : "按当前需求重新生成");
  refresh.type = "button";
  refresh.addEventListener("click", () => generate());
  const existingText = notice.querySelector("p")?.textContent;
  const existingAction = notice.querySelector(".task-stale-action");
  if (existingText !== text.textContent || existingAction?.textContent !== refresh.textContent) {
    notice.replaceChildren(text, refresh);
  }
}

function invalidateLibraryEvidence() {
  if (!selection.size && !listingState && !retrievalContext) return;
  selection.clear();
  listingState = null;
  retrievalContext = null;
  updateBasket();
  const results = $("#search-content");
  if (results && !results.hidden && !state.current) {
    const message = element("div", "search-notice", "目标型号已更改，旧检索结果和已选资料已清除。请按新型号重新搜索。 ");
    const search = element("button", "button secondary", "重新搜索");
    search.type = "button";
    search.addEventListener("click", () => generate());
    message.append(search);
    results.replaceChildren(message);
  }
  syncTaskStaleNotice();
  toast("产品型号已更改，旧检索结果与已选资料已清除");
}

function applyTask(task) {
  const previousProduct = $("#product").value.trim();
  for (const [id, key] of [["product", "product"], ["audience", "audience"], ["scenario", "scenario"], ["goal", "goal"], ["purchase-stage", "purchase_stage"]]) {
    if (typeof task[key] === "string") $("#" + id).value = task[key];
  }
  selectPlatform(task.platform);
  if (previousProduct !== $("#product").value.trim()) invalidateLibraryEvidence();
  syncTaskStaleNotice();
}

function preset(name) {
  const presets = {
    campus: {audience: "大学新生", scenario: "开学购机，兼顾课堂学习、宿舍整理资料和日常携带。", platform: "xiaohongshu", goal: "帮助判断是否适合，引导到店体验"},
    office: {audience: "经常出差的职场用户", scenario: "移动办公，需要在会议、差旅和文档处理之间切换，并确认企业应用和外设适用性。", platform: "wechat_article", goal: "解释使用场景，帮助比较选择"},
    store: {audience: "门店附近准备换机的用户", scenario: "门店到访，用一个可以现场验证的任务，说明值得体验的理由。", platform: "wechat_moments", goal: "提供一个明确的到店体验理由"},
    creator: {audience: "设计、摄影与视频创作者", scenario: "需要在外出拍摄、素材整理和创作交付之间切换；只说明知识库能确认的屏幕、性能与素材能力。", platform: "xiaohongshu", goal: "解释使用场景，帮助比较选择"},
    family: {audience: "准备全家共用电脑的家庭用户", scenario: "旧机换新，希望了解家庭成员日常使用、数据迁移和长期使用时需要确认什么。", platform: "wechat_article", goal: "建立产品认知，吸引进一步咨询"},
    enterprise: {audience: "中小企业团队采购负责人", scenario: "为团队评估设备，重点确认部署、管理、稳定性和服务资料；资料没有说明的政策不作承诺。", platform: "wechat_article", goal: "解释使用场景，帮助比较选择"},
    launch: {audience: "关注新品变化的用户", scenario: "了解新品与已有产品的差异、适合人群和购买前应确认的信息；价格与权益必须有资料依据。", platform: "xiaohongshu", goal: "帮助判断是否适合，引导到店体验"},
    holiday: {audience: "正在为家人挑选电脑的送礼用户", scenario: "节日送礼，希望结合收礼人的使用场景给出选择建议；不假设优惠、补贴或库存。", platform: "wechat_moments", goal: "提供一个明确的到店体验理由"},
  };
  applyTask(presets[name]);
  $("#form-message").hidden = true;
}

function clearResult() {
  state.current = null;
  $("#task-stale-notice").hidden = true;
  $("#task-stale-notice").replaceChildren();
  $("#game-ad-preview").hidden = true;
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
  $("#copy-game-script").hidden = !(state.current.adFormat === "game" && (state.current.mode === "development_only" || isLiveResult(state.current) && state.current.status === "ready"));
  renderGameAd();
}

function gameRoutes(task) {
  if (/学生|校园|课堂|开学/.test(task.audience + task.scenario)) return [
    {name: "课堂学习", mission: "带一份课程资料，试着找到重点并整理成一页复习提纲。"},
    {name: "宿舍整理", mission: "带上你常用的文件，试一次分类、查找和继续编辑。"},
    {name: "社团协作", mission: "选一份正在协作的文档，确认常用应用和协作方式是否适合。"},
  ];
  if (/出差|差旅|移动办公|会议/.test(task.audience + task.scenario)) return [
    {name: "会议准备", mission: "带一份会议材料，试着完成查阅、修改和展示准备。"},
    {name: "途中整理", mission: "模拟一次移动办公，留意常用应用和文件是否顺手。"},
    {name: "外设适配", mission: "列出你会带的外设，到店确认接口与实际使用方式。"},
  ];
  if (/创作|设计|摄影|视频|素材/.test(task.audience + task.scenario)) return [
    {name: "素材整理", mission: "带一组自己的素材，试试导入、分类和查找的流程。"},
    {name: "内容制作", mission: "选一个正在做的小任务，现场体验常用创作应用。"},
    {name: "交付检查", mission: "准备一份待交付文件，检查导出、保存和后续打开是否合用。"},
  ];
  if (/到店|门店|体验店|线下体验|导购/.test(task.audience + task.scenario)) return [
    {name: "到店实测", mission: "带一项自己常用的任务，到店用准确型号的样机实际跑一遍。"},
    {name: "应用核对", mission: "列出常用应用与版本，到店按目标型号逐项确认并实际打开。"},
    {name: "同任务比较", mission: "选一项固定任务，用相同条件体验并记录不同方案的差异。"},
  ];
  return [
    {name: "资料整理", mission: "带一份常用资料，试试整理、查找和继续编辑的过程。"},
    {name: "日常任务", mission: "选一个每天都会做的小任务，亲自体验完整操作流程。"},
    {name: "适配确认", mission: "列出常用应用和外设，到店逐项确认是否适合你的需要。"},
  ];
}

function gameChallenges(task, scene) {
  const route = gameRoutes(task).find(item => item.name === scene) || gameRoutes(task)[0];
  return [
    {name: "带一份真实资料", mission: route.mission},
    {name: "试一次常用应用", mission: "打开你每天会用的应用，完成一项真实操作，留意流程是否顺手。"},
    {name: "核对适用条件", mission: "列出必须满足的配置、外设或环境要求，到店逐项确认。"},
  ];
}

function gameFeedbackOptions() {
  return [
    {key: "fit", label: "体验顺手", detail: "记下具体顺手的步骤，再核对资料中的型号和应用条件。"},
    {key: "check", label: "还需核对", detail: "列出待确认的应用版本、配置、接口或环境，再以官方资料和现场体验核实。"},
    {key: "mismatch", label: "不适合这项任务", detail: "记录卡住的环节，作为比较其他方案的依据。"},
  ];
}

function sceneGameTitle(task, scene) {
  const context = task.audience + task.scenario;
  if (/学生|校园|课堂|开学/.test(context)) return /社团/.test(scene) ? "社团交付：文件别开盲盒" : /宿舍/.test(scene) ? "宿舍资料：别让文件玩捉迷藏" : "DDL 急救：别让作业过夜";
  if (/出差|差旅|移动办公|会议/.test(context)) return /会议/.test(scene) ? "会议前五分钟：救场挑战" : "移动办公：别让转接头当主角";
  if (/创作|设计|摄影|视频|素材/.test(context)) return /素材/.test(scene) ? "素材去哪了：找回交付线索" : "创作交付：别让版本打起来";
  if (/到店|门店|体验店|线下体验|导购/.test(context)) return "到店实战：别只摸摸看";
  return `今日任务救援：${scene || "不立 Flag"}`;
}

function gamePerfectTitle(scene, eventName = "") {
  const incidentTitles = {
    "最终稿分身术": "版本分身捕手",
    "群聊艾特风暴": "群聊收口官",
    "转接头迷雾": "接口侦察员",
    "会议室瞬移事件": "五分钟救场队长",
    "格式幽灵出没": "格式幽灵捕手",
    "素材分身现场": "素材鉴定官",
    "样机体验迷雾": "实机侦察员",
    "十分钟试玩冲刺": "十分钟任务官",
    "兼容性问号怪": "条件核对员",
    "评论区回音室": "评论区破局人",
  };
  if (incidentTitles[eventName]) return incidentTitles[eventName];
  if (/课堂|宿舍|社团|校园|学习/.test(scene || "")) return "DDL 终结者";
  if (/会议|途中|移动|外设|差旅/.test(scene || "")) return "会议救火队长";
  if (/素材|创作|内容|交付|设计/.test(scene || "")) return "交付守门员";
  if (/到店|门店|体验店|线下/.test(scene || "")) return "到店体验侦察员";
  return "小P现场验证派";
}

function escapeSvgText(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"}[char]));
}

function wrapSvgText(value, maxCharacters = 26, maxLines = 3) {
  const characters = Array.from(String(value || ""));
  const lines = [];
  while (characters.length && lines.length < maxLines) lines.push(characters.splice(0, maxCharacters).join(""));
  if (characters.length && lines.length) lines[lines.length - 1] = Array.from(lines[lines.length - 1]).slice(0, maxCharacters - 1).join("") + "…";
  return lines.map((line, index) => `<tspan x="92" dy="${index ? 42 : 0}">${escapeSvgText(line)}</tspan>`).join("");
}

function gameScoreCardSvg(data) {
  const missionLines = wrapSvgText(data.mission, 25, 3);
  const productLines = wrapSvgText(data.product, 44, 2);
  const scene = escapeSvgText(data.scene);
  const event = escapeSvgText(data.event || "");
  const title = escapeSvgText(data.title);
  const score = escapeSvgText(`${data.score} / ${data.total}`);
  const combo = escapeSvgText(`${data.combo} 连击`);
  const stamp = data.score === data.total ? "事件满分称号" : "通关战绩";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500"><rect width="1200" height="1500" fill="#f1f1e8"/><path d="M0 0h1200v555c-190 70-360 90-600 38C350 530 180 550 0 610V0Z" fill="#294638"/><rect x="94" y="91" width="80" height="80" rx="24" fill="#d7b56c"/><text x="134" y="147" text-anchor="middle" fill="#294638" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="43" font-weight="800">P</text><text x="198" y="126" fill="#f5f1df" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="31" font-weight="700">小P任务补给站</text><text x="198" y="165" fill="#d9e2d8" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="21">INTERACTIVE EXPERIENCE QUEST</text><circle cx="1013" cy="136" r="68" fill="#3c5e49"/><circle cx="1013" cy="136" r="43" fill="#f1e9d3"/><circle cx="999" cy="131" r="4" fill="#294638"/><circle cx="1027" cy="131" r="4" fill="#294638"/><path d="M1000 151q13 12 26 0" fill="none" stroke="#b66d48" stroke-width="5" stroke-linecap="round"/><text x="92" y="257" fill="#d7c58f" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="24" font-weight="700" letter-spacing="3">${stamp}</text><text x="92" y="350" fill="#fffdf5" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="64" font-weight="750">${title}</text><text x="92" y="490" fill="#f2dfaa" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="126" font-weight="800">${score}</text><text x="504" y="476" fill="#e4e9df" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="28">任务徽章</text><text x="504" y="522" fill="#e4e9df" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="25">${combo}</text><rect x="72" y="637" width="1056" height="550" rx="30" fill="#fff"/><text x="112" y="718" fill="#627765" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="22" font-weight="700" letter-spacing="2">本局场景 · 突发事件</text><text x="112" y="782" fill="#263b30" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="36" font-weight="700">${scene} · ${event}</text><text x="112" y="851" fill="#627765" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="22" font-weight="700" letter-spacing="2">现实任务</text><text x="112" y="912" fill="#384b3f" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="28">${missionLines}</text><path d="M112 1060h976" stroke="#e2e7df" stroke-width="2"/><text x="112" y="1112" fill="#294638" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="25" font-weight="700">带上真实任务，到现场跑一轮。</text><text x="92" y="1272" fill="#617166" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="21">${productLines}</text><text x="92" y="1365" fill="#617166" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="19">战绩仅记录小游戏选择，不代表产品性能或购买建议。</text><text x="92" y="1405" fill="#617166" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="19">不含玩家身份与选择明细 · 原创互动向导“小P”</text><text x="92" y="1455" fill="#294638" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="21" font-weight="700">HUAWEI PC · 场景体验挑战</text></svg>`;
}

async function createGameScoreCardPng(data) {
  const svgBlob = new Blob([gameScoreCardSvg(data)], {type: "image/svg+xml;charset=utf-8"});
  const objectUrl = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1500;
    canvas.getContext("2d").drawImage(image, 0, 0);
    const png = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("无法生成 PNG 图片");
    return png;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function prepareGameScoreCardLink(link, data) {
  link.setAttribute("aria-disabled", "true");
  link.tabIndex = -1;
  link.textContent = "正在制作战绩卡…";
  const png = await createGameScoreCardPng(data);
  if (!link.isConnected) return;
  const url = URL.createObjectURL(png);
  link.href = url;
  link.dataset.scoreCardUrl = url;
  link.download = `小P挑战战绩卡_${Date.now()}.png`;
  link.removeAttribute("aria-disabled");
  link.tabIndex = 0;
  link.textContent = "保存通关战绩卡 PNG";
}

function gameIncidentVariants(scene, mission) {
  const sceneLabel = scene || "你选的场景";
  const missionLabel = String(mission || "这项体验任务").replace(/[。.!！?？]+$/, "");
  if (/课堂|宿舍|社团|校园|学习/.test(sceneLabel)) {
    return [{
      name: "最终稿分身术",
      prompt: "群里同时出现「最终版」「最终版2」「真最终版」。小P只给你一回合，怎么找回正确版本？",
      options: [
        {key: "confirm-version", label: "找协作者确认，再核对内容", note: "问清当前负责人和交付要求，打开文件检查后再继续", correct: true, feedback: "版本怪退散！先确认人和内容，文件名不再当预言。"},
        {key: "trust-timestamp", label: "直接选修改时间最新的", note: "时间戳看着最像答案", correct: false, feedback: "时间新不一定内容对。版本怪最爱给文件名和时间戳下幻术。"},
        {key: "overwrite-all", label: "把旧稿全删了再说", note: "清理现场，顺便清理证据", correct: false, feedback: "先别开清理大招。确认可交付版本后再整理，留住回退线索。"},
      ],
    }, {
      name: "群聊艾特风暴",
      prompt: "提交前一分钟，群里跳出 17 条新消息，三个人都说“我改好了”。小P提醒你先抓哪条线索？",
      options: [
        {key: "confirm-owner", label: "确认负责人和最终提交位置", note: "对齐谁收口、交到哪里，再打开文件核对内容", correct: true, feedback: "消息风暴暂停！先对齐负责人和交付位置，别把群聊当版本管理器。"},
        {key: "merge-all", label: "把每个人的改动直接拼一起", note: "先合并再说，冲突交给未来的自己", correct: false, feedback: "合并前先确认哪份是底稿、谁负责收口，避免把冲突一起打包。"},
        {key: "send-first", label: "谁先发就交谁的", note: "抢到第一条消息，抢到最终稿", correct: false, feedback: "消息先后不能证明内容正确。对齐负责人，再检查实际文件。"},
      ],
    }];
  } else if (/会议|途中|移动|外设|差旅/.test(sceneLabel)) {
    return [{
      name: "转接头迷雾",
      prompt: "离会议开始还有五分钟，现场接口和投屏方式还没确认。小P的救场路线是？",
      options: [
        {key: "check-setup", label: "核对设备接口和现场方案", note: "按准确型号、会议室设备和可用线材逐项确认", correct: true, feedback: "救场成功！先把设备、接口和现场条件对上，迷雾就散了。"},
        {key: "assume-wireless", label: "默认肯定能无线投屏", note: "把“应该可以”当作会议预案", correct: false, feedback: "“应该可以”不是预案。先核对现场支持方式和所需配件。"},
        {key: "blame-device", label: "现场连不上就怪电脑", note: "先给设备判刑，线索以后再找", correct: false, feedback: "先查连接方式、线材和设置，再判断卡在哪一步。"},
      ],
    }, {
      name: "会议室瞬移事件",
      prompt: "刚接好线，会议室临时换了；新房间的屏幕、线材和接入口都不一样。还剩 5 分钟，你先？",
      options: [
        {key: "check-new-room", label: "确认新房间设备和可用连接方式", note: "核对屏幕输入、线材与准确设备接口，再做一次短测试", correct: true, feedback: "空间跳转成功！先重新核对新房间条件，旧方案不能自动传送过去。"},
        {key: "reuse-old-plan", label: "照搬上一间房的连接方案", note: "房间换了，假设也跟着通用", correct: false, feedback: "场地变化就要重看接口和线材；沿用旧方案前先确认条件。"},
        {key: "start-without-check", label: "直接开会，投不上再说", note: "把演示环节变成现场盲盒", correct: false, feedback: "先做快速连接测试，能给会议留出调整时间。"},
      ],
    }];
  } else if (/素材|创作|内容|交付|设计/.test(sceneLabel + missionLabel)) {
    return [{
      name: "格式幽灵出没",
      prompt: "交付前发现文件格式或字体显示不对。小P说先别召唤玄学，你该做什么？",
      options: [
        {key: "verify-export", label: "核对要求，再导出并重新打开", note: "确认目标格式、应用版本和交付规范，检查导出结果", correct: true, feedback: "格式幽灵现形！交付文件重新打开检查，才算真正过关。"},
        {key: "upload-random", label: "随便找个在线转换网站", note: "把项目文件交给陌生网站抽盲盒", correct: false, feedback: "先别把素材交给未知网站。核对应用和格式要求，再用可信流程处理。"},
        {key: "screenshot-it", label: "截图当成最终文件", note: "能看见就算交付，后续编辑随缘", correct: false, feedback: "截图不一定满足交付要求。先确认文件格式和后续编辑需求。"},
      ],
    }, {
      name: "素材分身现场",
      prompt: "素材文件夹里出现“最终”“最终新”“最终新新”。离交付还有十分钟，怎样避免把旧版送出门？",
      options: [
        {key: "verify-final-file", label: "按交付清单核对内容和导出结果", note: "确认文件位置、目标格式，再重新打开检查一遍", correct: true, feedback: "分身识破！让交付清单和文件内容作证，文件名不再冒充本人。"},
        {key: "rename-random", label: "给看起来最新的文件加“最终”", note: "命名气势拉满，内容先不看", correct: false, feedback: "名字改得再像最终版，也得核对内容与交付要求。"},
        {key: "send-folder", label: "整个文件夹都发给对方挑", note: "把版本选择题外包给收件人", correct: false, feedback: "先确认一份符合要求的交付文件，再清楚地交出去。"},
      ],
    }];
  } else if (/到店|门店|体验店|线下|样机|实机/.test(sceneLabel + missionLabel)) {
    return [{
      name: "样机体验迷雾",
      prompt: "到店只有十分钟，怎么避免只摸摸外观就匆忙下结论？",
      options: [
        {key: "run-real-task", label: "带真实任务，按准确型号实测", note: "先确认型号，再用常用应用跑完一项任务并记下条件", correct: true, feedback: "侦察成功！小P把“看起来不错”升级成了可复盘的实测路线。"},
        {key: "judge-touch", label: "摸摸键盘、看看屏幕就走", note: "三秒钟体验，立刻替整天使用作结论", correct: false, feedback: "手感可以记，整天任务还得跑。别让三秒钟替你写结论。"},
        {key: "trust-claim", label: "听一句“全系列都支持”就算了", note: "型号、应用版本和条件暂时略过", correct: false, feedback: "先把具体型号和应用条件问清，再用自己的任务验证。"},
      ],
    }, {
      name: "十分钟试玩冲刺",
      prompt: "店员说样机很适合你，但你马上要走。怎么把这十分钟用在刀刃上？",
      options: [
        {key: "prioritize-task", label: "先挑最重要的一项真实任务实测", note: "问清准确型号，用自己的应用跑完关键步骤并记下条件", correct: true, feedback: "试玩冲刺完成！先验证最重要的任务，剩下的待确认项也记下来。"},
        {key: "browse-everything", label: "每个功能都点一下", note: "十分钟内完成全宇宙探索", correct: false, feedback: "时间有限时先测最重要的任务，再列出没来得及确认的内容。"},
        {key: "decide-on-spot", label: "现场直接决定，不用再查资料", note: "把短试玩升级成万能结论", correct: false, feedback: "试玩只能回答这次任务。购买决定还要核对型号、条件和预算。"},
      ],
    }];
  } else {
    return [{
      name: "兼容性问号怪",
      prompt: "常用应用能不能在这台设备上顺利完成任务还没把握。小P把放大镜递给你：",
      options: [
        {key: "check-requirements", label: "核对准确型号和应用要求", note: "查官方支持条件，再在目标设备上完成真实操作", correct: true, feedback: "问号怪被证据照亮了！先核对条件，再用真实任务验证。"},
        {key: "trust-reviews", label: "只看评论区说“能用”", note: "别人一次体验替你覆盖所有版本", correct: false, feedback: "评论能给线索，不能替代型号、版本和你的实际任务验证。"},
        {key: "guess-model", label: "同系列应该都一样", note: "具体配置先交给想象力", correct: false, feedback: "同系列也要看准确型号和条件。别让猜测替证据上场。"},
      ],
    }, {
      name: "评论区回音室",
      prompt: "评论区一半说“完全没问题”，另一半说“根本不能用”。小P让你先找哪份通关线索？",
      options: [
        {key: "match-conditions", label: "对照型号、版本和自己的使用条件", note: "先查官方要求，再用目标设备完成关键操作", correct: true, feedback: "回音室安静了！把体验条件对齐，评论才会变成线索。"},
        {key: "follow-majority", label: "选点赞最多的一边相信", note: "把人气当作与你相同的使用环境", correct: false, feedback: "点赞不能替你覆盖型号和应用版本；先对照自己的条件。"},
        {key: "assume-universal", label: "只要别人能用，我也一定能用", note: "把不同任务压成同一个答案", correct: false, feedback: "使用条件因人而异。先核实你的应用与任务，再形成判断。"},
      ],
    }];
  }
}

function gameChallengeRounds(scene, mission, runSeed = 0) {
  const sceneLabel = scene || "你选的场景";
  const missionLabel = String(mission || "这项体验任务").replace(/[。.!！?？]+$/, "");
  const baseSeed = [...sceneLabel + missionLabel].reduce((total, char) => total + char.codePointAt(0), 0);
  const incidents = gameIncidentVariants(sceneLabel, missionLabel);
  const variantSeed = Math.abs(Math.trunc(Number(runSeed) || 0) + baseSeed);
  const incident = incidents[variantSeed % incidents.length];
  const rounds = [
    {
      prompt: `「${sceneLabel}」开局要完成「${missionLabel}」，带什么最有用？`,
      options: [
        {key: "real-material", label: "自己的真实资料", note: "用课程文件、项目素材或会议稿跑一遍任务", correct: true, feedback: "命中任务！真实资料才是这局的主线。"},
        {key: "many-tabs", label: "先开 30 个网页", note: "让标签页开个年会", correct: false, feedback: "标签页年会先暂停。先拿自己的资料，才能知道流程合不合手。"},
        {key: "guess-spec", label: "凭感觉猜参数", note: "玄学抽卡，来源先放一边", correct: false, feedback: "这局不拼玄学。要核对参数，就回到官方资料和实际设备。"},
      ],
    },
    incident,
    {
      prompt: "通关后发体验结论，怎样不把 flag 插满地图？",
      options: [
        {key: "bounded-result", label: "只说本次实测", note: "写清型号、应用和使用条件", correct: true, feedback: "漂亮收尾！把结论限定在本次设备和条件里。"},
        {key: "all-users", label: "所有人都无脑冲", note: "一次体验，替全世界做决定", correct: false, feedback: "flag 收一收。一次体验只能说明这次任务，不代表所有人。"},
        {key: "invent-fact", label: "把听来的参数写成实测", note: "来源？先假装没看见", correct: false, feedback: "这个结局会翻车。事实要有来源，体验要写明条件。"},
      ],
    },
  ];
  return rotateGameRounds(rounds, baseSeed + (Number(runSeed) || 0));
}

function gameScriptMarkdown(task, developmentOnly = true) {
  const routes = gameRoutes(task);
  const sections = [
    "## 互动广告玩法脚本：小P任务补给站",
    developmentOnly
      ? "> 开发演示玩法；未调用知识库或模型，不代表真实产品功能、性能、优惠或奖励。"
      : "> 规则生成的互动补充，不包含未经核验的产品功能、性能、价格或权益主张；产品事实以随稿核验依据为准。",
    "",
    "角色：小P任务补给员（本项目原创虚拟向导，不代表华为官方角色）",
    "产品：" + task.product,
    "目标人群：" + task.audience,
    "发布平台：" + platformNames[task.platform],
    "本次内容目标：" + task.goal,
    "",
    "### 玩家流程与开场",
    "小P：‘今天要救哪一局？选一个最像你日常的场景。’",
  ];
  routes.forEach(route => {
    sections.push("", `#### 场景：${route.name}`, `**关卡标题：** ${sceneGameTitle(task, route.name)}`);
    gameChallenges(task, route.name).forEach(challenge => sections.push(`- **${challenge.name}：** ${challenge.mission}`));
  });
  sections.push("", "选定场景和主线任务后，自动进入对应的任务题与场景突发事件；结尾挑战提醒玩家基于证据表达体验。", "", "### 第 1 题：任务出发准备");
  const appendOptions = round => round.options.forEach(option => sections.push(`- ${option.correct ? "正确路线" : "干扰路线"}「${option.label}」：${option.note}；小P反馈：${option.feedback}`));
  routes.forEach(route => gameChallenges(task, route.name).forEach(challenge => {
    const round = gameChallengeRounds(route.name, challenge.mission)[0];
    sections.push("", `**${route.name} × ${challenge.name}**`, round.prompt);
    appendOptions(round);
  }));
  const sharedRounds = gameChallengeRounds("{体验场景}", "{主线任务}");
  sections.push("", "### 第 2 题：场景突发事件", "每局抽取一种场景事件；再次挑战会轮换到另一事件，选项顺序也会变化：");
  routes.forEach(route => {
    const incidents = gameIncidentVariants(route.name, gameChallenges(task, route.name)[0].mission);
    incidents.forEach(incident => {
      sections.push("", `**${route.name} · ${incident.name}**`, incident.prompt);
      appendOptions(incident);
    });
  });
  sections.push("", "### 第 3 题：通关后，怎样表达体验结论？", sharedRounds[2].prompt);
  appendOptions(sharedRounds[2]);
  sections.push("", "### 计分与结局", "每题答对获得 1 枚徽章；连续答对累计连击。答错不扣徽章，但连击清零，展示对应的小P提示后进入下一题。每次开局会重新轮换选项顺序，正确路线不会固定在同一位置。", "- 3 枚徽章：解锁本局突发事件专属称号；不同事件对应不同称号", "- 未满 3 枚且最佳连击为 2：连续观察员", "- 2 枚徽章：稳妥体验观察员", "- 其他成绩：体验补给新手", "以上称号只评价本局选择，不评价产品或购买决定。挑战结束后提示玩家带上真实任务去体验；体验前不预填结果。", "", "### 通关后的现实行动", `**行动引导：** ${task.goal}。带上游戏中选定的主线任务完成实际体验，并核对常用应用、配置与外设条件。`);
  sections.push("", "### 体验后的真实记录", "完成实际体验后，按这次设备、应用和使用条件选择一项：");
  gameFeedbackOptions().forEach(option => sections.push("- **" + option.label + "：** " + option.detail));
  return sections.join("\n");
}

function playableGameHtml(task, developmentOnly = true) {
  const routes = gameRoutes(task).map(route => ({
    name: route.name,
    title: sceneGameTitle(task, route.name),
    perfectTitle: gamePerfectTitle(route.name),
    missions: gameChallenges(task, route.name).map(mission => ({...mission})),
  }));
  const payload = JSON.stringify({product: task.product, audience: task.audience, platform: platformNames[task.platform], routes, feedback: gameFeedbackOptions()})
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const mascot = '<svg viewBox="0 0 96 96" fill="none" aria-hidden="true"><path d="M31 17c0-7 5-12 12-12h10c7 0 12 5 12 12v9H31v-9Z" fill="#d7b56c"/><path d="M18 39c0-13 10-23 23-23h15c13 0 23 10 23 23v28c0 13-10 23-23 23H41c-13 0-23-10-23-23V39Z" fill="#294638"/><path d="M28 46c0-8 6-14 14-14h13c8 0 14 6 14 14v14c0 8-6 14-14 14H42c-8 0-14-6-14-14V46Z" fill="#f2e9cf"/><path d="M40 50h2m13 0h2" stroke="#294638" stroke-width="5" stroke-linecap="round"/><path d="M43 61c3 3 8 3 11 0" stroke="#b66d48" stroke-width="3" stroke-linecap="round"/><path d="M8 52c-4 2-6 6-4 10 2 4 7 5 11 3m66-13c4 2 6 6 4 10-2 4-7 5-11 3" stroke="#294638" stroke-width="6" stroke-linecap="round"/><path d="M67 58h18c4 0 7 3 7 7v15c0 4-3 7-7 7H66" fill="#d9b76f" stroke="#294638" stroke-width="3" stroke-linejoin="round"/><path d="M73 66h8v12h-8z" fill="#294638"/><path d="M75 69h4v6h-4z" fill="#f2e9cf"/></svg>';
  const cardRuntime = [newGameSeed.toString(), nextGameSeed.toString(), rotateGameRounds.toString(), gameProgressMeter.toString(), gameIncidentVariants.toString(), gameChallengeRounds.toString(), gamePerfectTitle.toString(), loadGameTitleCollection.toString(), unlockGameTitle.toString(), gameTitleCollection.toString(), gameTitleCollectionOverview.toString(), escapeSvgText.toString(), wrapSvgText.toString(), gameScoreCardSvg.toString(), createGameScoreCardPng.toString(), prepareGameScoreCardLink.toString()].join("\n");
  const runtime = `"use strict";
${cardRuntime}
const data=JSON.parse(document.getElementById("game-data").textContent),root=document.getElementById("game"),s={step:0,route:-1,mission:-1,round:0,answers:[],feeling:null,seed:newGameSeed()},unlockedGameEvents=loadGameTitleCollection();
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;}function focusGame(selector){requestAnimationFrame(()=>{const n=root.querySelector(selector);if(!n)return;if(!n.matches("button,a,input,select,textarea,[tabindex]"))n.tabIndex=-1;n.focus({preventScroll:true});});}
function button(label,cls,handler){const b=el("button",cls,label);b.type="button";b.addEventListener("click",handler);return b;}
function pickedRoute(){return data.routes[s.route];}function pickedMission(){return pickedRoute().missions[s.mission];}
function frame(){root.querySelectorAll("a[data-score-card-url]").forEach(a=>URL.revokeObjectURL(a.dataset.scoreCardUrl));root.replaceChildren();const head=el("header","head");const mark=el("div","mascot");mark.innerHTML=${JSON.stringify(mascot)};head.append(mark);const brand=el("div","brand");brand.append(el("small","","原创互动向导 · 小P"),el("strong","","任务补给站"),el("span","product","体验设备 · "+data.product));head.append(brand,el("span","platform",data.platform));root.append(head);
const stage=s.step===0?0:s.step===1?1:2,labels=["选场景","选挑战","三连闯关"],nav=el("div","steps");labels.forEach((label,i)=>{const item=el("span","step"+(stage===i?" active":stage>i?" done":""),String(i+1).padStart(2,"0")+"　"+label);nav.append(item);});root.append(nav);const bar=el("div","progress");bar.append(el("span","",""));bar.firstChild.style.width=((stage+1)/3*100)+"%";root.append(bar);}
function choice(title,copy,onClick,selected){return button("","choice"+(selected?" chosen":""),onClick).append(title,copy);}
function render(){frame();if(s.step===0){root.append(el("p","eyebrow","今天的任务救援"),el("h1","","今天要救哪一局？"),el("p","intro","挑一个熟悉的场景，小P给你发任务。答题攒徽章，答错不扣分。"));const list=el("div","choices");data.routes.forEach((route,i)=>{const b=button("","choice",()=>{s.route=i;s.mission=-1;s.round=0;s.answers=[];s.feeling=null;s.seed=newGameSeed();s.step=1;render();focusGame("h1");});b.append(el("strong","",route.name),el("span","",route.title));list.append(b);});root.append(list,gameTitleCollectionOverview(el,unlockedGameEvents));return;}
if(s.step===1){root.append(el("p","eyebrow","路线 · "+pickedRoute().name),el("h1","","选一项主线任务"),el("p","intro","带自己的资料去体验，别让小P靠猜参数通关。"));const list=el("div","choices");pickedRoute().missions.forEach((mission,i)=>{const b=button("","choice",()=>{s.mission=i;s.round=0;s.answers=[];s.feeling=null;s.seed=newGameSeed();s.step=2;render();focusGame(".question");});b.append(el("strong","",mission.name),el("span","",mission.mission));list.append(b);});root.append(list,button("← 返回场景","text-button",()=>{s.step=0;render();focusGame("h1");}));return;}
const route=pickedRoute(),mission=pickedMission(),rounds=gameChallengeRounds(route.name,mission.mission,s.seed),score=s.answers.filter(a=>a.correct).length,title=el("section","game-title"),tiny=el("div","mascot small");tiny.innerHTML=${JSON.stringify(mascot)};title.append(tiny);const titleCopy=el("div","","");titleCopy.append(el("small","eyebrow","原创 IP · "+route.name),el("h1","",route.title));title.append(titleCopy);root.append(title,gameProgressMeter(el,rounds.length,s.answers.filter(Boolean).length,s.round));
if(s.round<rounds.length){const round=rounds[s.round],answer=s.answers[s.round];let streak=0;for(let i=s.round-1;i>=0&&s.answers[i]&&s.answers[i].correct;i--)streak++;const current=answer?(answer.correct?streak+1:0):streak;root.append(el("p","round-meta","第 "+(s.round+1)+" / 3 题　·　徽章 "+score+"　·　连击 "+current));if(round.name)root.append(el("p","game-event-badge","突发事件 · "+round.name));else if(s.round===0)root.append(el("p","game-event-badge","下一题即将遭遇 · "+rounds[1].name));root.append(el("h2","question",round.prompt),el("p","game-key-hint","按 1 / 2 / 3 快速出招"));const choices=el("div","quiz-options");round.options.forEach((option,index)=>{const b=button("","answer"+(answer&&option.correct?" right":"")+(answer&&answer.key===option.key&&!option.correct?" wrong":""),()=>{s.answers[s.round]={key:option.key,correct:option.correct};render();focusGame(".primary");});b.disabled=Boolean(answer);b.setAttribute("aria-pressed",String(answer&&answer.key===option.key));b.append(el("span","choice-key",String(index+1)),el("strong","",option.label),el("span","",option.note));choices.append(b);});root.append(choices);if(answer){const selected=round.options.find(o=>o.key===answer.key);const reaction=answer.correct?(current>1?"　小P跟上节奏！"+current+" 连击":"　+1 枚任务徽章"):"　连击中断，不扣徽章，下一题追回来。";const feedback=el("p","feedback "+(answer.correct?"good":"retry"),selected.feedback+reaction);feedback.setAttribute("role","status");root.append(feedback,button(s.round===2?"查看通关战绩 →":"下一题 →","primary",()=>{s.round++;render();focusGame(s.round>=rounds.length?".result h1":".question");}));}return;}
let best=0,running=0;s.answers.forEach(a=>{running=a.correct?running+1:0;best=Math.max(best,running);});const rank=score===3?(gamePerfectTitle(pickedRoute().name,rounds[1].name)):best===2?"连续观察员":score===2?"稳妥体验观察员":"体验补给新手";if(score===rounds.length)unlockGameTitle(rounds[1].name);const result=el("section","result");result.tabIndex=-1;result.append(el("small","eyebrow",score===rounds.length?"事件满分称号":"通关战绩"),el("h1","",rank),el("strong","score",score+" / 3"),el("p","result-event","本局遭遇 · "+rounds[1].name),el("p","","最佳连击 "+best+"　·　只记录小游戏选择，不代表产品性能或购买结论。"));result.querySelector("h1").tabIndex=-1;root.append(result,gameTitleCollection(el,route.name,mission.mission,unlockedGameEvents,rounds[1].name),el("h2","","现实任务，等你来验证"),el("p","intro","完成实际体验后，再记录这次设备、应用和条件下的感受。"));const feedback=el("div","feedback-list");data.feedback.forEach((item,i)=>{const b=button("","choice"+(s.feeling===item.key?" chosen":""),()=>{s.feeling=item.key;render();focusGame(".feedback-list .chosen");});b.append(el("strong","",item.label),el("span","",item.detail));b.setAttribute("aria-pressed",String(s.feeling===item.key));feedback.append(b);});root.append(feedback);if(s.feeling){const item=data.feedback.find(f=>f.key===s.feeling);root.append(el("p","feedback good",item.detail));}const cardData={product:data.product,title:rank,score,total:rounds.length,combo:best,scene:route.name,event:rounds[1].name,mission:mission.mission};const shareCard=el("a","secondary","正在制作战绩卡…");shareCard.dataset.scoreCard="true";prepareGameScoreCardLink(shareCard,cardData).catch(()=>{shareCard.textContent="战绩卡生成失败";});const actions=el("div","actions");actions.append(shareCard,button("挑战另一事件","secondary",()=>{s.round=0;s.answers=[];s.feeling=null;s.seed=nextGameSeed(s.seed);render();focusGame(".question");}),button("换个任务","secondary",()=>{s.step=1;s.round=0;s.answers=[];s.feeling=null;s.seed=newGameSeed();render();focusGame("h1");}));root.append(actions);}
render();
document.addEventListener("keydown",event=>{if(event.repeat||event.altKey||event.ctrlKey||event.metaKey||!/[1-3]/.test(event.key)||s.step!==2||s.round>=gameChallengeRounds(pickedRoute().name,pickedMission().mission,s.seed).length)return;if(event.target&&event.target.closest&&event.target.closest("input,textarea,select,[contenteditable=true]"))return;root.querySelectorAll(".answer:not(:disabled)")[Number(event.key)-1]?.click();});`;
  const disclosure = developmentOnly
    ? "开发演示 · 玩法按任务表单规则生成，不调用模型或知识库。"
    : "互动规则按任务表单生成，不调用模型或知识库，不添加未经核验的产品主张；产品事实请以随稿核验材料为准。";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f3f2ea"><title>小P任务补给站 · 互动小游戏</title><style>
:root{color-scheme:light;--ink:#263b30;--muted:#617166;--green:#294638;--green2:#426d50;--paper:#f4f2e9;--line:#dce4da;--gold:#d7b56c;--white:#fff}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}.shell{width:min(100% - 28px,680px);margin:30px auto 70px;padding:clamp(18px,5vw,38px);border:1px solid #e0e3d8;border-radius:20px;background:var(--white);box-shadow:0 18px 48px #273e3012}.head{display:flex;align-items:center;gap:12px;padding-bottom:20px;border-bottom:1px solid var(--line)}.mascot{width:54px;height:54px;flex:0 0 auto}.mascot svg{display:block;width:100%;height:100%}.brand{display:grid;gap:1px;min-width:0;flex:1}.brand small,.eyebrow{color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.04em}.brand strong{font-size:18px}.brand .product{color:var(--muted);font-size:12px;overflow-wrap:anywhere}.platform{margin-left:auto;color:#775f34;font-size:12px;white-space:nowrap;flex:0 0 auto}.steps{display:flex;justify-content:space-between;gap:5px;margin:20px 0 9px}.step{color:#68766c;font-size:12px}.step.active{color:var(--green);font-weight:750}.step.done{color:var(--green2)}.progress{height:4px;overflow:hidden;border-radius:9px;background:#e9eee8}.progress span{display:block;height:100%;border-radius:inherit;background:var(--green2);transition:width .3s ease}.eyebrow{margin:22px 0 6px}h1{margin:0;color:var(--green);font-size:clamp(25px,6vw,34px);line-height:1.25;letter-spacing:-.025em}.intro{margin:9px 0 18px;color:var(--muted);font-size:14px;line-height:1.65}.choices,.quiz-options,.feedback-list{display:grid;gap:10px}.choice,.answer{width:100%;display:grid;gap:4px;padding:14px 15px;border:1px solid var(--line);border-radius:12px;background:#fff;text-align:left;color:var(--ink);cursor:pointer;transition:border-color .14s ease,background .14s ease,transform .14s ease}.choice:hover,.answer:hover:not(:disabled){border-color:#8ea58f;background:#f7faf6;transform:translateY(-1px)}.choice strong,.answer strong{font-size:14px}.choice span,.answer span{color:var(--muted);font-size:12px;line-height:1.55}.chosen,.answer.right{border-color:#719276;background:#eff6ee}.answer.wrong{border-color:#c99776;background:#fbf3eb}.answer:disabled{cursor:default;opacity:1}.choice:focus-visible,.answer:focus-visible,.primary:focus-visible,.secondary:focus-visible,.text-button:focus-visible{outline:3px solid #397b61;outline-offset:2px}.text-button{margin-top:12px;padding:8px 0;border:0;background:transparent;color:var(--muted);cursor:pointer}.game-title{display:flex;align-items:center;gap:12px;margin:20px 0 12px;padding:14px;border:1px solid #dce5d8;border-radius:14px;background:linear-gradient(115deg,#f0f6ed,#fbf6e9)}.game-title .eyebrow{margin:0 0 3px}.game-title h1{font-size:20px}.round-meta{margin:0 0 8px;color:#5f7164;font-size:12px;font-weight:700}.game-event-badge{display:table;margin:0 0 7px;padding:4px 9px;border:1px solid #e5d8b7;border-radius:999px;background:#fffaf0;color:#725b32;font-size:12px;font-weight:650;line-height:1.45}.question{margin:0 0 14px;font-size:19px;line-height:1.45}.feedback{margin:12px 0;padding:12px 14px;border-radius:10px;background:#f0f5ed;color:#405b45;font-size:13px;line-height:1.6}.feedback.retry{background:#fbf3eb;color:#765b40}.primary,.secondary{width:100%;min-height:46px;margin-top:12px;padding:11px 14px;border:0;border-radius:10px;font:inherit;font-weight:700;cursor:pointer}.primary{background:var(--green);color:#fff}.secondary{border:1px solid var(--line);background:#fff;color:var(--green)}.result{display:grid;grid-template-columns:1fr auto;gap:4px 10px;margin:20px 0;padding:17px;border:1px solid #dce5d8;border-radius:14px;background:linear-gradient(115deg,#f0f6ed,#fffaf1)}.result>*{grid-column:1}.result .score{grid-column:2;grid-row:1/3;align-self:center;color:var(--green2);font-size:28px}.result .eyebrow{margin:0}.result h1{font-size:21px}.result p{margin:6px 0 0;color:var(--muted);font-size:12px}.result+h2{margin-top:20px;font-size:18px}.actions{display:grid;gap:8px;margin-top:12px}.actions>a{display:block;text-align:center;text-decoration:none}.foot{margin:22px 0 0;padding-top:14px;border-top:1px solid var(--line);color:#5f6f65;font-size:12px;line-height:1.6}.copy-note{width:100%;min-height:100px;margin-top:10px;padding:10px;border:1px solid var(--line);border-radius:8px;font:12px/1.5 inherit}@media(min-width:600px){.quiz-options{grid-template-columns:repeat(3,minmax(0,1fr))}.answer{min-height:120px}}.choice-key{display:grid;width:21px;height:21px;place-items:center;border:1px solid #d7e0d7;border-radius:6px;background:#f5f7f2;color:#526858;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}.game-key-hint{margin:-5px 0 10px;color:#64746a;font-size:11px;line-height:1.4}.game-round-track{display:flex;align-items:center;gap:11px;margin:0 0 12px}.game-round-track-label{flex:0 0 auto;color:#53685a;font-size:11px;font-weight:650;font-variant-numeric:tabular-nums}.result-event{grid-column:1/-1;color:#52675a;font-size:12px;font-weight:650}.game-title-collection{margin:10px 0 18px;padding:13px 14px;border:1px solid #dce5d8;border-radius:10px;background:#fbfcf8}.game-title-collection-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.game-title-collection-title{color:#294638;font-size:14px;font-weight:700}.game-title-collection-count{color:#596b5e;font-size:12px;font-variant-numeric:tabular-nums}.game-title-collection-hint{margin:4px 0 10px;color:#657267;font-size:12px;line-height:1.5}.game-title-collection-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.game-title-collection-item{display:grid;min-width:0;gap:3px;padding:9px 10px;border:1px solid #e4e9e1;border-radius:7px;background:#fff}.game-title-collection-item.unlocked{border-color:#cadaca;background:#f3f7f1}.game-title-collection-item.current{border-color:#e5d8b7;background:#fffaf0}.game-title-collection-name{overflow-wrap:anywhere;color:#334b3a;font-size:13px;line-height:1.4}.game-title-collection-event{overflow-wrap:anywhere;color:#657267;font-size:11px;line-height:1.4}.game-title-collection-status{color:#647166;font-size:11px}.game-title-collection-item.unlocked .game-title-collection-status{color:#3d6848;font-weight:650}.game-title-collection-item.current .game-title-collection-status{color:#806739;font-weight:650}.game-title-library{margin-top:13px;border-top:1px solid #dce5d8}.game-title-library-summary{display:flex;align-items:baseline;gap:8px;padding:11px 2px 9px;color:#405347;cursor:pointer;list-style:none}.game-title-library-summary::-webkit-details-marker{display:none}.game-title-library-summary:focus-visible{outline:2px solid #397b61;outline-offset:2px}.game-title-library-title{flex:1;font-size:13px;font-weight:700}.game-title-library-count,.game-title-library-summary::after{color:#617166;font-size:11px}.game-title-library-summary::after{content:"查看"}.game-title-library[open] .game-title-library-summary::after{content:"收起"}.game-title-library-hint{margin:0 0 9px;color:#657267;font-size:11px;line-height:1.5}.game-title-library-list{display:grid;max-height:270px;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px;overflow-y:auto}.game-title-library-item{display:grid;min-width:0;gap:2px;padding:7px 0;border-top:1px solid #e7ebe5}.game-title-library-item strong{overflow-wrap:anywhere;color:#47594b;font-size:12px;font-weight:650;line-height:1.4}.game-title-library-item span,.game-title-library-item small{overflow-wrap:anywhere;color:#68766b;font-size:11px;line-height:1.4}.game-title-library-item.unlocked strong,.game-title-library-item.unlocked small{color:#3d6848}@media(max-width:600px){.game-title-library-list{grid-template-columns:1fr}}.game-round-track-marks{display:grid;width:min(190px,50%);grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.game-round-pip{height:5px;border-radius:99px;background:#e4ebe5}.game-round-pip.active{background:#d7b56c}.game-round-pip.complete{background:#426d50}.feedback.good{animation:game-badge-confirm 240ms cubic-bezier(.16,1,.3,1) both;transform-origin:left center}@keyframes game-badge-confirm{from{opacity:.7;transform:translateY(4px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}@media(prefers-reduced-motion:reduce){.feedback.good{animation:none}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important}}
 @media (hover:none) and (pointer:coarse) { .game-key-hint { display: none; } }
 </style></head><body><main class="shell" id="game" aria-live="polite"></main><p class="foot" style="max-width:680px;margin:0 auto 30px;padding:0 18px">${disclosure} 原创虚拟向导“小P”不代表华为官方形象；本小游戏离线运行，不回传答案。游戏不代表真实产品能力，体验结论以本人实际条件为准。</p><script id="game-data" type="application/json">${payload}</script><script>${runtime}</script></body></html>`;
}

function exportPlayableGame() {
  const result = state.current;
  if (!$("#task-stale-notice").hidden) return toast("任务条件已变更，请重新生成后再导出小游戏。");
  if (!result?.task || isLiveResult(result) && result.status !== "ready") return toast("请先生成可用结果，再导出互动小游戏。");
  const html = playableGameHtml(result.task, !isLiveResult(result));
  const url = URL.createObjectURL(new Blob([html], {type: "text/html;charset=utf-8"}));
  const link = element("a"); link.href = url; link.download = "HUAWEI_PC_互动小游戏_小P_" + Date.now() + ".html";
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("已导出可离线试玩的互动小游戏 HTML。");
}

function focusGameAd(selector) {
  requestAnimationFrame(() => {
    const target = $(`#game-ad-preview ${selector}`);
    if (!target) return;
    if (!target.matches("button, a, input, select, textarea, [tabindex]")) target.tabIndex = -1;
    target.focus({preventScroll: true});
  });
}

function renderGameAd() {
  const panel = $("#game-ad-preview");
  panel.querySelectorAll("a[data-score-card-url]").forEach(link => URL.revokeObjectURL(link.dataset.scoreCardUrl));
  panel.replaceChildren();
  const enabled = state.current?.adFormat === "game" && (state.current.mode === "development_only" || isLiveResult(state.current) && state.current.status === "ready");
  panel.hidden = !enabled;
  if (!enabled) return;
  const game = state.adGame;
  const routes = gameRoutes(state.current.task);
  const top = element("div", "game-ad-head");
  top.append(element("div", "game-ad-label", "小P任务补给站"), element("span", "game-ad-progress", `体验进度 · ${game.step + 1} / 3`));
  panel.append(top);
  const stages = ["选场景", "选挑战", "三连闯关"];
  const stageNav = element("div", "game-ad-steps");
  stageNav.setAttribute("role", "group");
  stageNav.setAttribute("aria-label", "小P互动挑战步骤");
  stages.forEach((label, index) => {
    const available = index === 0 || (index === 1 && Boolean(game.scene)) || (index === 2 && Boolean(game.scene && game.mission));
    const button = element("button", "game-ad-step" + (game.step === index ? " current" : game.step > index ? " complete" : ""));
    button.type = "button";
    button.disabled = !available;
    if (game.step === index) button.setAttribute("aria-current", "step");
    button.append(element("span", "game-ad-step-number", String(index + 1).padStart(2, "0")), element("span", "game-ad-step-label", label));
    button.addEventListener("click", () => { game.step = index; renderGameAd(); focusGameAd(index === 2 ? ".game-quiz" : "h3"); });
    stageNav.append(button);
  });
  panel.append(stageNav);
  const progress = element("div", "game-ad-progress-track");
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-label", `小P互动挑战进度：第 ${game.step + 1} 步，共 3 步`);
  progress.setAttribute("aria-valuemin", "1");
  progress.setAttribute("aria-valuemax", "3");
  progress.setAttribute("aria-valuenow", String(game.step + 1));
  const progressFill = element("span", "game-ad-progress-fill");
  progressFill.style.width = `${((game.step + 1) / 3) * 100}%`;
  progress.append(progressFill);
  panel.append(progress);
  if (game.step === 0) {
    panel.append(element("h3", "", "今天的任务，最像哪种节奏？"), element("p", "game-ad-copy", "选一个熟悉的场景，小P会为你生成体验任务和三连挑战。"));
    const choices = element("div", "game-ad-choices");
    routes.forEach(route => {
      const selected = game.scene === route.name;
      const button = element("button", "game-ad-choice" + (selected ? " selected" : ""));
      button.type = "button";
      button.setAttribute("aria-pressed", String(selected));
      button.append(element("strong", "", route.name), element("span", "", route.mission));
      button.addEventListener("click", () => { game.scene = route.name; game.mission = null; game.feedback = null; game.round = 0; game.answers = []; game.seed = newGameSeed(); saveGameProgress(); game.step = 1; renderGameAd(); focusGameAd("h3"); });
      choices.append(button);
    });
    panel.append(choices);
    panel.append(gameTitleCollectionOverview(element, unlockedGameEvents));
    return;
  }
  if (game.step === 1) {
    panel.append(element("h3", "", `为「${game.scene}」选一项主线任务`), element("p", "game-ad-copy", "选你真的会做的事。接下来小P会用 3 道选择题，看看你会不会把体验玩成玄学。"));
    const choices = element("div", "game-ad-choices");
    gameChallenges(state.current.task, game.scene).forEach(route => {
      const selected = game.mission === route.mission;
      const button = element("button", "game-ad-choice" + (selected ? " selected" : ""));
      button.type = "button";
      button.setAttribute("aria-pressed", String(selected));
      button.append(element("strong", "", route.name), element("span", "", route.mission));
      button.addEventListener("click", () => { game.mission = route.mission; game.feedback = null; game.round = 0; game.answers = []; game.seed = newGameSeed(); game.step = 2; saveGameProgress(); renderGameAd(); focusGameAd(".game-quiz"); });
      choices.append(button);
    });
    const back = element("button", "game-ad-back", "返回选择场景");
    back.type = "button";
    back.addEventListener("click", () => { game.step = 0; game.scene = null; renderGameAd(); focusGameAd("h3"); });
    panel.append(choices, back);
    return;
  }
  const task = state.current.task;
  const rounds = gameChallengeRounds(game.scene, game.mission, game.seed);
  const answers = Array.isArray(game.answers) ? game.answers : [];
  const score = answers.filter(answer => answer.correct).length;
  const hero = element("div", "game-ip-hero");
  const avatar = element("img", "game-ip-avatar");
  const mascot = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none"><path d="M31 17c0-7 5-12 12-12h10c7 0 12 5 12 12v9H31v-9Z" fill="#d7b56c"/><path d="M18 39c0-13 10-23 23-23h15c13 0 23 10 23 23v28c0 13-10 23-23 23H41c-13 0-23-10-23-23V39Z" fill="#294638"/><path d="M28 46c0-8 6-14 14-14h13c8 0 14 6 14 14v14c0 8-6 14-14 14H42c-8 0-14-6-14-14V46Z" fill="#f2e9cf"/><path d="M40 50h2m13 0h2" stroke="#294638" stroke-width="5" stroke-linecap="round"/><path d="M43 61c3 3 8 3 11 0" stroke="#b66d48" stroke-width="3" stroke-linecap="round"/><path d="M8 52c-4 2-6 6-4 10 2 4 7 5 11 3m66-13c4 2 6 6 4 10-2 4-7 5-11 3" stroke="#294638" stroke-width="6" stroke-linecap="round"/><path d="M67 58h18c4 0 7 3 7 7v15c0 4-3 7-7 7H66" fill="#d9b76f" stroke="#294638" stroke-width="3" stroke-linejoin="round"/><path d="M73 66h8v12h-8z" fill="#294638"/><path d="M75 69h4v6h-4z" fill="#f2e9cf"/></svg>';
  avatar.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(mascot);
  avatar.alt = "";
  avatar.setAttribute("aria-hidden", "true");
  const intro = element("div", "game-ip-intro");
  intro.append(element("span", "game-ip-kicker", "原创互动向导 · 小P"), element("strong", "", sceneGameTitle(task, game.scene)), element("p", "", "三题闯关，答对一题领一枚任务徽章。梗可以有，产品结论要有依据。"));
  hero.append(avatar, intro, element("span", "game-ip-stamp", "开玩"));
  panel.append(hero);
  panel.append(gameProgressMeter(element, rounds.length, answers.filter(Boolean).length, game.round));

  if (game.round < rounds.length) {
    const round = rounds[game.round];
    const answer = answers[game.round];
    const roundHead = element("div", "game-round-head");
    let streak = 0;
    for (let index = game.round - 1; index >= 0 && answers[index]?.correct; index--) streak += 1;
    const currentStreak = answer ? (answer.correct ? streak + 1 : 0) : streak;
    roundHead.append(element("span", "game-round-count", `第 ${game.round + 1} / ${rounds.length} 题`), element("span", "game-round-score", `徽章 ${score} 枚 · 连击 ${currentStreak}`));
    const quiz = element("section", "game-quiz");
    quiz.setAttribute("aria-label", `小P挑战第 ${game.round + 1} 题`);
    quiz.append(roundHead);
    if (round.name) quiz.append(element("p", "game-event-badge", `突发事件 · ${round.name}`));
    else if (game.round === 0) quiz.append(element("p", "game-event-badge", `下一题即将遭遇 · ${rounds[1].name}`));
    quiz.append(element("h3", "", round.prompt), element("p", "game-key-hint", "按 1 / 2 / 3 快速出招"));
    const options = element("div", "game-quiz-options");
    round.options.forEach((option, index) => {
      const selected = answer?.key === option.key;
      const button = element("button", "game-quiz-option" + (answer && option.correct ? " correct" : "") + (selected && !option.correct ? " incorrect" : ""));
      button.type = "button";
      button.disabled = Boolean(answer);
      button.setAttribute("aria-pressed", String(selected));
      button.append(element("span", "game-quiz-key", String(index + 1)), element("strong", "", option.label), element("span", "", option.note));
      button.addEventListener("click", () => {
        game.answers = [...answers.slice(0, game.round), {key: option.key, correct: option.correct}];
        saveGameProgress();
        renderGameAd();
        focusGameAd(".game-quiz-next");
      });
      options.append(button);
    });
    quiz.append(options);
    if (answer) {
      const picked = round.options.find(option => option.key === answer.key);
      const reaction = answer.correct
        ? currentStreak > 1 ? `　小P跟上节奏！${currentStreak} 连击` : "　+1 枚任务徽章"
        : `　连击中断，不扣徽章；下一题追回来。`;
      const feedback = element("p", "game-quiz-feedback" + (answer.correct ? " success" : " retry"), `${picked.feedback}${reaction}`);
      feedback.setAttribute("role", "status");
      quiz.append(feedback);
      const next = element("button", "button primary game-quiz-next", game.round === rounds.length - 1 ? "查看通关战绩 →" : "下一题 →");
      next.type = "button";
      next.addEventListener("click", () => { game.round += 1; saveGameProgress(); renderGameAd(); focusGameAd(game.round >= rounds.length ? ".game-score-rank" : ".game-quiz"); });
      quiz.append(next);
    }
    panel.append(quiz);
    return;
  }

  let bestStreak = 0;
  let runningStreak = 0;
  answers.forEach(answer => {
    runningStreak = answer.correct ? runningStreak + 1 : 0;
    bestStreak = Math.max(bestStreak, runningStreak);
  });
  const rank = score === 3 ? gamePerfectTitle(game.scene, rounds[1]?.name) : bestStreak === 2 ? "连续观察员" : score === 2 ? "稳妥体验观察员" : "体验补给新手";
  if (score === rounds.length) unlockGameTitle(rounds[1]?.name);
  const resultCard = element("div", "game-score-card");
  resultCard.append(element("span", "game-score-stamp", score === rounds.length ? "事件满分称号" : "通关战绩"), element("strong", "game-score-rank", rank), element("span", "game-score-number", `${score} / ${rounds.length}`), element("span", "game-score-combo", `最佳连击 ${bestStreak}`), element("span", "game-score-event", `本局遭遇 · ${rounds[1]?.name || "场景事件"}`), element("p", "", score === rounds.length ? "满徽章！带上真实任务，去现场验证你关心的流程。" : "答错不扣分。这份战绩只记录小游戏选择，不代表设备性能或购买结论。"));
  panel.append(resultCard, gameTitleCollection(element, game.scene, game.mission, unlockedGameEvents, rounds[1]?.name));
  panel.append(element("h3", "game-review-title", game.feedback ? "体验记录" : "现实任务，等你来验证"), element("p", "game-ad-copy", game.feedback ? "记录只代表你这次的设备、应用和使用条件。" : `小游戏通关了。下一步带上「${game.mission}」，完成后再记录真实感受。`));
  const feedbackList = element("div", "game-ad-choices game-ad-feedback");
  gameFeedbackOptions().forEach(option => {
    const button = element("button", "game-ad-choice");
    button.type = "button";
    button.setAttribute("aria-pressed", String(game.feedback === option.key));
    button.append(element("strong", "", option.label), element("span", "", option.detail));
    button.addEventListener("click", () => { game.feedback = option.key; saveGameProgress(); renderGameAd(); focusGameAd('.game-ad-feedback button[aria-pressed="true"]'); });
    feedbackList.append(button);
  });
  panel.append(element("p", "game-ad-feedback-prompt", game.feedback ? "你的实际感受" : "体验完成后，选择一项实际感受"), feedbackList);
  if (game.feedback) {
    const selected = gameFeedbackOptions().find(item => item.key === game.feedback);
    panel.append(element("p", "game-ad-feedback-result", selected.detail));
  }
  const actions = element("div", "game-ad-actions");
  const canShare = typeof navigator.share === "function";
  const copy = element("button", "button primary", canShare ? game.feedback ? "分享挑战战报与体验记录" : "分享挑战战报" : game.feedback ? "复制战绩分享文案与体验记录" : "复制战绩分享文案");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    const selected = gameFeedbackOptions().find(item => item.key === game.feedback);
    const note = [
      "小P任务补给站 · 一局挑战战报（本项目演示原型）",
      `我在「${game.scene}」遇到“${rounds[1]?.name || "场景事件"}”，拿到 ${score} / ${rounds.length} 枚任务徽章，称号：${rank}，最佳连击 ${bestStreak}。`,
      "要不要也来一局？再挑战会切换到同场景的另一种突发事件。",
      "产品：" + task.product,
      "体验场景：" + game.scene,
      "体验任务：" + game.mission,
      `小游戏战绩：${score} / ${rounds.length} 枚任务徽章（不代表设备性能或购买结论）`,
      game.feedback ? "实际感受：" + selected.label : "",
      game.feedback ? "后续建议：" + selected.detail : "",
      "体验结论只代表本次设备、应用和使用条件；产品事实以官方资料为准。",
    ].filter(Boolean).join("\n");
    if (typeof navigator.share === "function") {
      try { await navigator.share({title: "小P挑战战报", text: note}); toast("分享面板已打开"); return; }
      catch (error) { if (error?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(note); toast(game.feedback ? "战报与体验记录已复制" : "战报已复制"); }
    catch { toast("无法分享或复制；可保存战绩卡后分享"); }
  });
  const replay = element("button", "button secondary", "挑战另一事件");
  replay.type = "button";
  replay.addEventListener("click", () => { game.round = 0; game.answers = []; game.feedback = null; game.seed = nextGameSeed(game.seed); saveGameProgress(); renderGameAd(); focusGameAd(".game-quiz"); });
  const change = element("button", "button secondary", "换个任务");
  change.type = "button";
  change.addEventListener("click", () => { game.step = 1; game.round = 0; game.answers = []; game.feedback = null; game.seed = newGameSeed(); saveGameProgress(); renderGameAd(); focusGameAd("h3"); });
  const exportGame = element("button", "button secondary", "下载可玩小游戏 ↓");
  exportGame.type = "button";
  exportGame.addEventListener("click", exportPlayableGame);
  const scoreCard = element("a", "button secondary game-score-card-link", "正在制作战绩卡…");
  scoreCard.dataset.scoreCard = "true";
  scoreCard.addEventListener("click", event => {
    if (!$("#task-stale-notice").hidden) {
      event.preventDefault();
      toast("任务条件已变更，请重新生成后再保存战绩卡。");
      return;
    }
    if (!scoreCard.href || scoreCard.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
      return;
    }
    toast("战绩卡已保存，可以分享这次挑战");
  });
  prepareGameScoreCardLink(scoreCard, {product: task.product, title: rank, score, total: rounds.length, combo: bestStreak, scene: game.scene, event: rounds[1]?.name || "场景事件", mission: game.mission})
    .then(() => { syncTaskStaleNotice(); })
    .catch(() => { scoreCard.textContent = "战绩卡生成失败"; });
  actions.append(copy, scoreCard, exportGame, replay, change);
  panel.append(actions);
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

function renderDemandContract(task) {
  const fields = [
    {key: "product", label: "目标型号", value: task.product, required: true, input: "#product", needsConfirm: /待确认|不确定|轻薄本|随便/.test(task.product || "")},
    {key: "audience", label: "目标人群", value: task.audience, required: true, input: "#audience"},
    {key: "scenario", label: "使用场景", value: task.scenario, required: true, input: "#scenario"},
    {key: "purchase_stage", label: "购买阶段", value: task.purchase_stage, required: false, input: "#purchase-stage"},
    {key: "goal", label: "内容目标", value: task.goal, required: true, input: "#goal"},
    {key: "platform", label: "发布平台", value: platformNames[task.platform] || "未选择", required: true, input: "[data-platform]"},
  ];
  const filledRequired = fields.filter(field => field.required && String(field.value || "").trim() && !field.needsConfirm).length;
  const requiredTotal = fields.filter(field => field.required).length;
  const missing = fields.find(field => field.required && (!String(field.value || "").trim() || field.needsConfirm));
  const section = element("section", "demand-contract");
  section.dataset.ui = "demand-contract";
  const heading = element("div", "demand-contract-heading");
  const title = element("div");
  title.append(element("span", "demand-contract-kicker", "任务输入 · 来源：当前任务表单"), element("h3", "", "需求契约"));
  const count = element("span", "demand-contract-count" + (missing ? " incomplete" : ""), `${filledRequired}/${requiredTotal} 项必填`);
  heading.append(title, count);
  const list = element("dl", "demand-contract-fields");
  list.setAttribute("aria-label", "当前任务需求契约字段");
  fields.forEach(field => {
    const filled = Boolean(String(field.value || "").trim());
    const needsAttention = field.required && (!filled || field.needsConfirm);
    const row = element("div", "demand-contract-field" + (needsAttention ? " missing" : ""));
    const dt = element("dt", "", field.label);
    const dd = element("dd", "", filled ? field.value : field.required ? "待补充" : "未填写（选填）");
    const status = element("span", "demand-contract-status", field.needsConfirm ? "需确认" : filled ? "已填写" : field.required ? "待补充" : "选填");
    row.append(dt, dd, status);
    list.append(row);
  });
  const note = element("p", "demand-contract-note", "契约只整理表单里明确填写的信息；不推断未提供的偏好或产品事实。修改任务后需重新生成策略与内容。");
  const edit = element("button", "small-button demand-contract-edit", missing ? missing.needsConfirm ? "确认目标型号" : "补全必填项" : "回到任务设置");
  edit.type = "button";
  edit.addEventListener("click", () => {
    changeView("workspace");
    const target = $(missing?.input || "#product");
    target?.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center"});
    target?.focus({preventScroll: true});
  });
  section.append(heading, list, note, edit);
  return section;
}

function renderStrategy() {
  const {strategy, task} = state.current;
  const grid = element("div", "strategy-grid");
  for (const [label, value] of [["目标人群", task.audience], ["购买阶段", task.purchase_stage || "尚未说明"], ["发布平台", strategy.platform.name], ["配图要求", strategy.platform.min_images + "–" + strategy.platform.max_images + " 张"]]) {
    const card = element("div", "detail-card");
    card.append(element("small", "", label), element("p", "", value)); grid.append(card);
  }
  const comparison = state.current.mode === "development_only" ? renderScenarioComparison(task, strategy, state.current.article) : null;
  const platformComparison = state.current.mode === "development_only" ? renderPlatformComparison(task, strategy, state.current.adFormat) : null;
  const stressTest = state.current.mode === "development_only" ? renderStressTests(task, state.current.evidence, state.current.article) : null;
  const taskReplay = state.current.mode === "development_only" ? renderTaskReplay(state.current) : null;
  const anglePicker = state.current.mode === "development_only" ? renderContentAngles(task, strategy, state.current.content_angles) : null;
  $("#strategy-tab").replaceChildren(...detailHeader("先确定切入点，再决定怎么说。", "当前策略由场景规则组织；产品卖点需要在真实资料检索后才能确定。"), renderDemandContract(task), element("div", "strategy-hero", strategy.angle), grid, ...(anglePicker ? [anglePicker] : []), ...(comparison ? [comparison, platformComparison, taskReplay, stressTest] : []), sectionList("内容优先级", strategy.priorities), sectionList("平台结构", strategy.platform.structure), sectionList("生成前值得确认", strategy.questions));
}

function renderContentAngles(task, strategy, options) {
  if (!Array.isArray(options) || !options.length) return null;
  const section = element("section", "content-angle-picker");
  section.append(element("h3", "", "同一任务，试三种内容切入"), element("p", "content-angle-intro", "固定产品、人群、场景和平台，只改变叙事顺序。选择一个方向会重新生成规则演示；产品事实与图片仍待 ima 核验。"));
  const cards = element("div", "content-angle-grid");
  options.forEach((option, index) => {
    const selected = option.id === strategy.angle_id;
    const card = element("article", "content-angle-card" + (selected ? " selected" : ""));
    card.dataset.angleId = option.id;
    const top = element("div", "content-angle-card-top");
    top.append(element("span", "content-angle-index", `方向 0${index + 1}`));
    if (selected) top.append(element("span", "content-angle-current", "当前方向"));
    card.append(top, element("h4", "", option.name), element("p", "content-angle-description", option.angle));
    const lead = element("div", "content-angle-lead");
    lead.append(element("small", "", "开场线索"), element("p", "", option.lead));
    card.append(lead);
    const button = element("button", "button secondary content-angle-apply", selected ? "当前方向" : "按此方向重跑");
    button.type = "button";
    button.disabled = selected;
    button.setAttribute("aria-label", selected ? `当前使用${option.name}` : `按${option.name}重新生成演示稿`);
    if (!selected) button.addEventListener("click", () => applyContentAngle(task, option, button));
    card.append(button);
    cards.append(card);
  });
  section.append(cards);
  return section;
}

async function applyContentAngle(task, option, button) {
  const previous = state.current;
  await withBusy(button, async () => {
    const nextTask = {...task, request_id: crypto.randomUUID()};
    const result = await api("/api/demo", {task: nextTask, angle_id: option.id});
    if (!result.article) {
      const questions = result.preparation?.questions || ["请补充任务信息后重试。"];
      throw new Error(questions.join(" "));
    }
    result.adFormat = previous.adFormat || "editorial";
    renderResult(result);
    showTab("preview");
    toast(`已按“${option.name}”重跑演示；产品事实仍待核验`);
  });
}

function renderStressTests(task, evidence, article) {
  const section = element("details", "stress-tests");
  section.dataset.ui = "stress-tests";
  const summary = element("summary", "", "边界压力测试 · 4 个本地规则用例");
  const content = element("div", "stress-tests-content");
  content.append(element("p", "stress-tests-note", "开发演示 · 不调用 ima 或模型，不修改当前草稿。检查结果只反映本地确定性规则，不能证明模型语义或法律合规。"));
  const cases = [
    {title: "缺少具体型号", description: "清空产品型号，确认生成前会先追问。", run: async () => {
      const scenario = {...task, request_id: crypto.randomUUID(), product: ""};
      const result = await api("/api/prepare", {task: scenario});
      return {status: result.status, lines: result.questions || []};
    }},
    {title: "型号描述含糊", description: "用“轻薄本”代替具体型号，确认不会直接进入检索。", run: async () => {
      const scenario = {...task, request_id: crypto.randomUUID(), product: "轻薄本"};
      const result = await api("/api/prepare", {task: scenario});
      return {status: result.status, lines: result.questions || []};
    }},
    {title: "无依据的宣传与补贴", description: "加入绝对化表述和价格权益，查看规则如何标记。", run: async () => {
      const draft = structuredClone(article);
      draft.body += "\n\n本机型全国第一，补贴后到手价 6999 元。";
      const result = await api("/api/review", {task, evidence, article: draft});
      return {status: result.status, lines: result.checks.filter(check => check.category === "compliance" && check.status !== "pass").map(check => `${check.category} · ${check.status}：${check.detail}`)};
    }},
    {title: "图片与型号不匹配", description: "将演示图片标为其他型号，确认该配图会被拦下。", run: async () => {
      const supplied = structuredClone(evidence);
      if (!supplied.images.length) return {status: "无法演练", lines: ["当前演示样本没有图片。"]};
      supplied.images[0].product = "其他型号（演练用）";
      const result = await api("/api/review", {task, evidence: supplied, article});
      return {status: result.status, lines: result.checks.filter(check => check.category === "image" && check.status !== "pass").map(check => `${check.category} · ${check.status}：${check.detail}`)};
    }},
  ];
  const results = new Array(cases.length).fill(null);
  const caseButtons = [];
  let running = false;
  const toolbar = element("div", "stress-tests-toolbar");
  const runAll = element("button", "button secondary stress-tests-run-all", "依次运行全部 4 项");
  runAll.type = "button";
  const exportReport = element("button", "button secondary stress-tests-export", "导出演练报告");
  exportReport.type = "button";
  exportReport.hidden = true;
  const runStatus = element("p", "stress-tests-run-status", "尚未运行");
  runStatus.setAttribute("role", "status");
  const setRunning = value => {
    running = value;
    [...caseButtons, runAll, exportReport].forEach(button => { button.disabled = value; });
    runAll.setAttribute("aria-busy", String(value));
  };
  const renderResult = (index, result) => {
    results[index] = {title: cases[index].title, ...result, recorded_at: new Date().toISOString()};
    const lines = result.lines.length ? result.lines : ["未发现待处理项。"];
    outputs[index].replaceChildren(element("strong", "stress-test-status", `结果：${result.status}`), ...lines.slice(0, 4).map(line => element("span", "", line)));
    exportReport.hidden = false;
    const completed = results.filter(Boolean).length;
    runStatus.textContent = `已完成 ${completed}/${cases.length} 项；演练结果来自本地确定性规则。`;
  };
  const outputs = [];
  const executeCase = async index => {
    outputs[index].textContent = "正在运行本地规则…";
    try {
      renderResult(index, await cases[index].run());
    } catch (error) {
      renderResult(index, {status: "error", lines: ["本次演练未完成：" + (error.message || "本地规则暂不可用")]});
    }
  };
  for (const [index, testCase] of cases.entries()) {
    const button = element("button", "stress-test-run", testCase.title);
    button.type = "button";
    button.addEventListener("click", async () => {
      if (running) return;
      setRunning(true);
      try { await executeCase(index); }
      finally { setRunning(false); }
    });
    caseButtons.push(button);
  }
  runAll.addEventListener("click", async () => {
    if (running) return;
    setRunning(true);
    runStatus.textContent = "正在依次运行 4 项本地规则…";
    try {
      for (const index of cases.keys()) await executeCase(index);
      runStatus.textContent = `全部 ${cases.length} 项演练已完成；查看各项返回结果后再导出。`;
    } finally { setRunning(false); }
  });
  exportReport.addEventListener("click", () => {
    const completed = results.map((result, index) => result ? {result, testCase: cases[index]} : null).filter(Boolean);
    if (!completed.length) return;
    const lines = [
      "> 开发规则演练 · 不调用大模型或 ima · 不构成产品事实、法律合规或真实运行证明",
      "",
      "# 华为 PC Agent 边界压力演练",
      "",
      `运行时间：${new Date().toLocaleString("zh-CN")}`,
      `已完成：${completed.length}/${cases.length} 项。`,
      "",
    ];
    for (const {result, testCase} of completed) lines.push(`## ${testCase.title}`, "", `执行时间：${new Date(result.recorded_at).toLocaleString("zh-CN")}`, `结果：${result.status}`, "", ...result.lines.map(line => "- " + line), "");
    const blob = new Blob([lines.join("\n")], {type: "text/markdown;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = element("a"); link.href = url;
    link.download = "边界压力演练_规则演示_" + Date.now() + ".md";
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("已导出本地规则演练报告");
  });
  toolbar.append(runAll, exportReport, runStatus);
  const grid = element("div", "stress-tests-grid");
  for (const [index, testCase] of cases.entries()) {
    const card = element("div", "stress-test-case");
    const output = element("div", "stress-test-output", testCase.description);
    output.setAttribute("role", "status");
    outputs.push(output);
    card.append(caseButtons[index], output);
    grid.append(card);
  }
  content.append(toolbar, grid);
  section.append(summary, content);
  return section;
}

function renderTaskReplay(current) {
  const section = element("details", "task-replay");
  section.dataset.ui = "task-replay";
  section.append(element("summary", "", "演示版本回放"), element("p", "task-replay-intro", "对照一条历史演示，查看更换需求或内容方向后哪些实际字段发生变化。"));
  const previous = state.history.filter(item => item.result.task.request_id !== current.task.request_id);
  if (!previous.length) {
    section.append(element("p", "task-replay-empty", "再完成一项开发演示后，这里会出现可对照的历史任务。"));
    return section;
  }
  const picker = element("div", "task-replay-picker");
  const label = element("label", "", "对照历史任务");
  const select = element("select");
  select.setAttribute("aria-label", "选择用于需求变化回放的历史任务");
  for (const item of previous) {
    const option = element("option", "", `${platformNames[item.result.task.platform]} · ${item.result.task.audience} · ${new Date(item.time).toLocaleDateString("zh-CN")}`);
    option.value = item.result.task.request_id;
    select.append(option);
  }
  label.append(select);
  const comparison = element("div", "task-replay-result");
  const paint = () => {
    const item = previous.find(entry => entry.result.task.request_id === select.value);
    if (!item) return;
    const old = item.result;
    const values = [
      ["产品型号", old.task.product, current.task.product],
      ["目标人群", old.task.audience, current.task.audience],
      ["使用场景", old.task.scenario, current.task.scenario],
      ["发布平台", platformNames[old.task.platform], platformNames[current.task.platform]],
      ["内容目标", old.task.goal, current.task.goal],
      ["切入方向", old.strategy.angle_name || old.strategy.angle, current.strategy.angle_name || current.strategy.angle],
      ["策略切入", old.strategy.angle, current.strategy.angle],
      ["内容优先级", old.strategy.priorities.join("；"), current.strategy.priorities.join("；")],
      ["标题", old.article.title, current.article.title],
      ["开场导语", old.article.lead || "（无）", current.article.lead || "（无）"],
      ["正文结构", articleBodyOutline(old.article.body), articleBodyOutline(current.article.body)],
      ["行动引导", old.article.cta, current.article.cta],
      ["配图数量", `${old.article.image_plan.length} 张`, `${current.article.image_plan.length} 张`],
    ];
    const changed = values.filter(([, before, after]) => before !== after);
    const summary = element("p", "task-replay-summary", changed.length ? `与所选任务相比，${changed.length} 项记录字段发生变化。` : "所选历史任务与当前记录字段相同。");
    const table = element("div", "task-replay-table");
    table.setAttribute("role", "table");
    const header = element("div", "task-replay-row task-replay-head");
    header.setAttribute("role", "row");
    for (const title of ["变化字段", "历史记录", "当前任务"]) {
      const cell = element("span", "task-replay-column-head", title);
      cell.setAttribute("role", "columnheader");
      header.append(cell);
    }
    table.append(header);
    for (const [name, before, after] of changed) {
      const row = element("div", "task-replay-row");
      row.setAttribute("role", "row");
      const field = element("strong", "task-replay-field", name);
      field.setAttribute("role", "rowheader");
      const beforeCell = element("div", "task-replay-cell");
      beforeCell.setAttribute("role", "cell");
      beforeCell.append(element("span", "task-replay-mobile-label", "历史记录"), element("p", "task-replay-value", before));
      const afterCell = element("div", "task-replay-cell current");
      afterCell.setAttribute("role", "cell");
      afterCell.append(element("span", "task-replay-mobile-label", "当前任务"), element("p", "task-replay-value", after));
      row.append(field, beforeCell, afterCell);
      table.append(row);
    }
    const open = element("button", "button secondary task-replay-open", "打开这条历史演示");
    open.type = "button";
    open.addEventListener("click", () => {
      selectMode("demo");
      applyTask(old.task);
      selectAdFormat(old.adFormat === "game" ? "game" : "editorial");
      renderResult(structuredClone(old), false);
      changeView("workspace");
      showTab("preview");
    });
    comparison.replaceChildren(summary, table, open);
  };
  select.addEventListener("change", paint);
  picker.append(label);
  section.append(picker, comparison);
  paint();
  return section;
}

function articleBodyOutline(body) {
  const lines = String(body || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const headings = lines.filter(line => /^#{1,3}\s+/.test(line) || /^[①②③]\s*/.test(line));
  if (headings.length) return headings.map(line => line.replace(/^#{1,3}\s+/, "")).join("；");
  const excerpt = lines.join(" ").replace(/\[待补：[^\]]+\]/g, "[待补真实资料]");
  return excerpt.length > 150 ? excerpt.slice(0, 150) + "…" : excerpt || "（空）";
}

function renderScenarioComparison(task, strategy, article) {
  const alternatives = [
    {key: "campus", name: "校园学习", audience: "大学新生", scenario: "课堂资料整理、宿舍文件查找与日常携带。", angle: "从课程资料整理和学习任务切入；不预设任何功能已支持。", action: "带一份课程资料完成一次真实体验。", goal: "帮助判断是否适合，引导到店体验"},
    {key: "office", name: "差旅办公", audience: "经常出差的职场用户", scenario: "会议材料准备、途中整理与常用应用适配。", angle: "从会议材料的查阅、修改和交付流程切入；把适用条件留给核验。", action: "带一份会议材料现场试做。", goal: "解释使用场景，帮助比较选择"},
    {key: "creator", name: "内容创作", audience: "设计、摄影与视频创作者", scenario: "自有素材整理、制作流程与文件交付。", angle: "围绕素材到交付的真实任务组织内容；具体能力以资料和现场体验为准。", action: "带一组自己的素材体验常用应用。", goal: "解释使用场景，帮助比较选择"},
    {key: "family", name: "家庭共用", audience: "准备全家共用电脑的家庭用户", scenario: "不同成员的日常任务、资料迁移和长期使用要求。", angle: "先分别列出家庭成员的任务和迁移需求；不预设工具、服务或权益。", action: "带上常用软件清单，逐项确认适用条件。", goal: "建立产品认知，吸引进一步咨询"},
    {key: "enterprise", name: "团队采购", audience: "中小企业团队采购负责人", scenario: "部署管理要求、常用软件和团队外设清单。", angle: "从团队的应用与管理约束切入；兼容、服务与政策逐项核实。", action: "带着软件和外设清单向官方渠道确认。", goal: "解释使用场景，帮助比较选择"},
  ];
  const currentText = task.audience + task.scenario;
  const currentKey = /学生|校园|课堂|开学/.test(currentText) ? "campus" : /出差|差旅|移动办公|会议/.test(currentText) ? "office" : /创作|设计|摄影|视频|素材/.test(currentText) ? "creator" : /家庭|共用|换新|送礼/.test(currentText) ? "family" : /企业|团队|采购/.test(currentText) ? "enterprise" : null;
  const choices = alternatives.filter(item => item.key !== currentKey);
  let selected = choices.find(item => item.key === (currentKey === "campus" ? "office" : currentKey === "office" ? "creator" : "campus")) || choices[0];
  const section = element("section", "scenario-compare");
  section.dataset.ui = "scenario-compare";
  section.append(
    element("h3", "", "同一产品，换个场景会怎么讲？"),
    element("p", "scenario-compare-intro", "固定产品型号与发布平台，只切换目标人群和使用任务。以下是规则策划示意，不含产品事实；所有卖点仍需当前型号资料支持。"),
    element("p", "scenario-compare-scope", "当前对照：" + task.product + " · " + platformNames[task.platform])
  );
  const picker = element("div", "scenario-compare-options");
  picker.setAttribute("role", "group");
  picker.setAttribute("aria-label", "选择要对照的使用场景");
  const comparison = element("div", "scenario-compare-grid");
  const paint = () => {
    picker.replaceChildren(...choices.map(item => {
      const button = element("button", "scenario-compare-option" + (item.key === selected.key ? " selected" : ""), item.name);
      button.type = "button";
      button.setAttribute("aria-pressed", String(item.key === selected.key));
      button.addEventListener("click", () => { selected = item; paint(); });
      return button;
    }));
    const current = element("section", "scenario-compare-side");
    current.append(element("span", "scenario-compare-label", "当前任务"), element("h4", "", task.audience), element("p", "scenario-compare-scene", task.scenario));
    current.append(element("b", "", "内容切入点"), element("p", "", strategy.angle), element("b", "", "行动引导"), element("p", "", article.cta));
    const next = element("section", "scenario-compare-side alternative");
    next.append(element("span", "scenario-compare-label", "切换后 · " + selected.name), element("h4", "", selected.audience), element("p", "scenario-compare-scene", selected.scenario));
    next.append(element("b", "", "内容切入点"), element("p", "", selected.angle), element("b", "", "行动引导"), element("p", "", selected.action));
    const apply = element("button", "button secondary scenario-compare-apply", "将此场景填入任务");
    apply.type = "button";
    apply.addEventListener("click", () => {
      applyTask({...task, audience: selected.audience, scenario: selected.scenario, goal: selected.goal, platform: task.platform});
      $("#form-message").hidden = true;
      changeView("workspace");
      toast("场景已填入任务设置；确认后重新生成演示稿");
    });
    comparison.replaceChildren(current, next, apply);
  };
  section.append(picker, comparison);
  paint();
  return section;
}

function renderPlatformComparison(task, strategy, adFormat = "editorial") {
  const angleId = strategy.angle_id;
  const angleName = strategy.angle_name || "按场景规则选择";
  const section = element("section", "platform-comparison");
  section.dataset.ui = "platform-comparison";
  section.append(
    element("h3", "", "同一任务，三个平台分别怎么表达？"),
    element("p", "platform-comparison-intro", "固定产品、人群、场景和内容方向，只切换发布平台。点击生成后，各出一版结构示例。"),
    element("p", "platform-comparison-angle", "本次内容方向：" + angleName),
    element("p", "platform-comparison-scope", "规则演示 · 不调用真实资料或模型，不能作为发布稿或平台效果证明。")
  );
  const actions = element("div", "platform-comparison-actions");
  const generate = element("button", "button secondary", "生成三平台对照");
  generate.type = "button";
  const copy = element("button", "small-button platform-comparison-copy", "复制对照摘要");
  copy.type = "button";
  copy.hidden = true;
  const exportResult = element("button", "small-button platform-comparison-export", "导出对照 Markdown");
  exportResult.type = "button";
  exportResult.hidden = true;
  const status = element("p", "platform-comparison-status", "结果会对照标题、结构、语气、配图数量和行动引导。");
  status.setAttribute("role", "status");
  const selector = element("div", "platform-comparison-selectors");
  selector.hidden = true;
  selector.setAttribute("role", "group");
  selector.setAttribute("aria-label", "切换查看平台草稿");
  const output = element("div", "platform-comparison-grid");
  const differences = element("section", "platform-comparison-differences");
  differences.hidden = true;
  const platforms = Object.keys(platformNames);
  const resultsByPlatform = new Map();
  let activePlatform = task.platform;
  let comparisonBusy = false;

  const runPlatforms = async (baseTask, targets, trigger) => {
    if (comparisonBusy) return;
    comparisonBusy = true;
    generate.disabled = true;
    section.querySelectorAll(".platform-comparison-retry").forEach(button => { button.disabled = true; });
    try {
      await withBusy(trigger, async () => {
      status.textContent = resultsByPlatform.size === 0
        ? "正在按三平台规则组织示例…"
        : `正在重试 ${targets.map(platform => platformNames[platform]).join("、")}，已完成的草稿会保留…`;
      const requests = await Promise.allSettled(targets.map(platform => {
        const comparisonTask = {...baseTask, request_id: crypto.randomUUID(), platform};
        return api("/api/demo", {task: comparisonTask, ...(angleId ? {angle_id: angleId} : {})});
      }));
      if (state.current?.task.request_id !== baseTask.request_id) return;
      requests.forEach((request, index) => {
        const platform = targets[index];
        resultsByPlatform.set(platform, request.status === "fulfilled"
          ? request.value
          : {task: {...baseTask, platform}, error: true});
      });
      paintResults(baseTask);
      const successfulCount = platforms.filter(platform => {
        const result = resultsByPlatform.get(platform);
        return result?.article && result?.strategy?.platform;
      }).length;
      const pendingCount = platforms.length - successfulCount;
      status.textContent = successfulCount === 3
        ? "已生成三版规则示例；产品事实与图片仍待真实资料核验。"
        : `已生成 ${successfulCount}/3 个平台版本；已完成稿已保留，可点击“重试未完成平台（${pendingCount}）”。`;
      });
    } finally {
      comparisonBusy = false;
      generate.disabled = false;
      section.querySelectorAll(".platform-comparison-retry").forEach(button => { button.disabled = false; });
    }
  };

  const paintResults = (baseTask) => {
    const results = platforms.map(platform => resultsByPlatform.get(platform) || {task: {...baseTask, platform}});
    const cards = results.map(result => renderPlatformComparisonCard(result, baseTask, adFormat, (platform, trigger) => {
      runPlatforms(baseTask, [platform], trigger);
    }));
    const successful = results.filter(result => result?.article && result?.strategy?.platform);
    const pendingCount = platforms.length - successful.length;
    const changedFields = platformComparisonDifferences(successful);
    differences.replaceChildren(
      element("strong", "", successful.length === 3 ? `三平台规则中，${changedFields.length} 项表达要素发生变化` : `${successful.length}/3 个平台已生成，可只重试未完成平台`),
      element("p", "", successful.length < 2
        ? "至少需要两版草稿才能比较差异。"
        : changedFields.length ? changedFields.join("　·　") : "已生成版本的规则字段相同；可检查任务信息是否足以区分平台策略。")
    );
    differences.hidden = false;
    copy.hidden = successful.length === 0;
    exportResult.hidden = successful.length === 0;
    const markdown = platformComparisonMarkdown(results, baseTask, angleName);
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(markdown); toast("三平台对照摘要已复制"); }
      catch { toast("浏览器未允许复制，请导出 Markdown 保存"); }
    };
    exportResult.onclick = () => {
      const blob = new Blob([markdown], {type: "text/markdown;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const link = element("a"); link.href = url;
      link.download = "三平台内容对照_演示_" + Date.now() + ".md";
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("已导出三平台规则对照，保留演示与待核验标记");
    };
    selector.replaceChildren(...Object.entries(platformNames).map(([platform, name]) => {
      const button = element("button", "platform-comparison-select" + (platform === activePlatform ? " selected" : ""), name);
      button.type = "button";
      button.setAttribute("aria-pressed", String(platform === activePlatform));
      button.addEventListener("click", () => { activePlatform = platform; paintResults(baseTask); });
      return button;
    }));
    cards.forEach(card => card.classList.toggle("mobile-selected", card.dataset.platform === activePlatform));
    output.replaceChildren(...cards);
    selector.hidden = false;
    generate.textContent = pendingCount
      ? `重试未完成平台（${pendingCount}）`
      : "重新生成三平台对照";
  };

  generate.addEventListener("click", () => {
    const baseTask = structuredClone(task);
    const previous = platforms.map(platform => resultsByPlatform.get(platform));
    const hasIncomplete = previous.some(result => !result?.article || !result?.strategy?.platform);
    const retrying = resultsByPlatform.size > 0 && hasIncomplete;
    const targets = retrying
      ? platforms.filter(platform => {
        const result = resultsByPlatform.get(platform);
        return !result?.article || !result?.strategy?.platform;
      })
      : platforms;
    runPlatforms(baseTask, targets, generate);
  });
  actions.append(generate, copy, exportResult, status);
  section.append(actions, differences, selector, output);
  return section;
}

function platformComparisonDifferences(results) {
  results = results.filter(result => result?.article && result?.strategy?.platform);
  if (results.length < 2) return [];
  const dimensions = [
    ["内容结构", result => result?.strategy?.platform?.structure?.join(" / ")],
    ["表达语气", result => result?.strategy?.platform?.tone],
    ["标题与正文", result => [result?.article?.title, result?.article?.lead, result?.article?.body].join(" / ")],
    ["配图数量", result => result?.article?.image_plan?.length],
    ["行动引导", result => result?.article?.cta],
    ["话题标签", result => result?.article?.tags?.join(" / ")],
  ];
  return dimensions.filter(([, value]) => new Set(results.map(result => value(result) ?? "")).size > 1).map(([label]) => label);
}

function platformComparisonMarkdown(results, baseTask, angleName = "按场景规则选择") {
  const changedFields = platformComparisonDifferences(results);
  const lines = [
    "> 开发规则演示 · 未调用大模型或 ima · 产品事实、图片和平台效果均待核验 · 不可直接发布或作为真实运行证明",
    "",
    "# 同一任务的三平台表达对照",
    "",
    `产品：${baseTask.product}；目标人群：${baseTask.audience}；场景：${baseTask.scenario}；内容目标：${baseTask.goal}`,
    `固定内容方向：${angleName}`,
    "",
    `本次规则对照中发生变化的表达要素（${changedFields.length} 项）：${changedFields.length ? changedFields.join("、") : "无"}`,
    "",
  ];
  for (const result of results) {
    const platform = platformNames[result?.task?.platform] || "平台";
    if (!result?.article || !result?.strategy?.platform) {
      lines.push(`## ${platform}`, "", result?.error ? "本次请求未完成；可在工作台单独重试此平台或批量重试未完成平台，已完成稿会保留。" : "当前任务信息不足，无法生成对照草稿。", "");
      continue;
    }
    const {article} = result;
    const policy = result.strategy.platform;
    lines.push(
      `## ${platform}${result.task.platform === baseTask.platform ? " · 当前平台" : ""}`,
      "",
      `### ${article.title}`,
      "",
      ...(article.lead ? [article.lead, ""] : []),
      article.body,
      "",
      `- 内容方向：${result.strategy.angle_name || "未记录"}`,
      `- 内容结构：${policy.structure.join(" · ")}`,
      `- 表达语气：${policy.tone}`,
      `- 配图数量：${article.image_plan.length} 张`,
      `- 行动引导：${article.cta}`,
      `- 话题标签：${article.tags.length ? article.tags.map(tag => "#" + tag).join(" ") : "规则未要求"}`,
      "",
    );
  }
  return lines.join("\n");
}

function renderPlatformComparisonCard(result, baseTask, adFormat = "editorial", onRetry = null) {
  if (!result?.article || !result?.strategy?.platform) {
    const failed = element("section", "platform-comparison-card");
    failed.dataset.platform = result?.task?.platform || "";
    failed.append(element("h4", "", platformNames[result?.task?.platform] || "平台规则"), element("p", "", result?.error ? "此平台暂时未返回结果。可单独重试，也可用上方按钮批量重试未完成平台。" : "当前任务信息不足，无法生成对照草稿。"));
    if (result?.error && onRetry) {
      const retry = element("button", "small-button platform-comparison-retry", "只重试此平台");
      retry.type = "button";
      retry.addEventListener("click", () => onRetry(result.task.platform, retry));
      failed.append(retry);
    }
    return failed;
  }
  const {task, article, strategy} = result;
  const policy = strategy.platform;
  const card = element("section", "platform-comparison-card" + (task.platform === baseTask.platform ? " current" : ""));
  card.dataset.platform = task.platform;
  const heading = element("div", "platform-comparison-heading");
  heading.append(element("h4", "", platformNames[task.platform]), element("span", "platform-comparison-badge", task.platform === baseTask.platform ? "当前平台" : "规则对照"));
  const title = element("strong", "platform-comparison-title", article.title);
  const lead = article.lead ? element("p", "platform-comparison-lead", article.lead) : null;
  const bodyText = article.body.replace(/^##\s.+$/gm, "").trim();
  const body = element("p", "platform-comparison-body", bodyText.slice(0, 105) + (bodyText.length > 105 ? "…" : ""));
  const details = element("dl", "platform-comparison-details");
  for (const [label, value] of [
    ["内容结构", policy.structure.join(" · ")],
    ["表达语气", policy.tone],
    ["配图数量", article.image_plan.length + " 张"],
  ]) {
    details.append(element("dt", "", label), element("dd", "", value));
  }
  const cta = element("p", "platform-comparison-cta", "行动引导 · " + article.cta);
  const tags = element("p", "platform-comparison-tags", article.tags.length ? article.tags.map(tag => "#" + tag).join(" ") : "此平台规则未要求话题标签");
  const use = element("button", "button secondary platform-comparison-use", task.platform === baseTask.platform ? "打开这版草稿" : "采用此平台草稿");
  use.type = "button";
  use.addEventListener("click", () => {
    selectMode("demo");
    applyTask(task);
    selectAdFormat(adFormat === "game" ? "game" : "editorial");
    renderResult({...structuredClone(result), adFormat: state.adFormat});
    $("#form-message").hidden = true;
    changeView("workspace");
    toast("已打开" + platformNames[task.platform] + "草稿，保留本次内容方向");
  });
  card.append(heading, title);
  if (lead) card.append(lead);
  card.append(element("span", "platform-comparison-body-label", "正文片段"), body, details, cta, tags, use);
  return card;
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
  const failedCount = report.checks.filter(check => check.status === "fail").length;
  const pendingCount = report.checks.filter(check => check.status === "pending").length;
  const nextStep = element("section", "review-next-step");
  const nextTitle = failedCount || pendingCount
    ? [failedCount ? `${failedCount} 项需处理` : "", pendingCount ? `${pendingCount} 项待确认` : ""].filter(Boolean).join(" · ")
    : report.checks.length && report.checks.every(check => check.status === "pass") ? (state.current.mode === "live" ? "本次自动核验项均已通过" : "本次结构规则均已通过") : "当前还没有可展示的检查结论";
  nextStep.append(element("strong", "", nextTitle));
  nextStep.append(element("p", "", "自动检查可能遗漏语义问题；完成修改后重新核验，发布前仍需人工复核。"));
  if (failedCount || pendingCount) {
    const revise = element("button", "button secondary review-revise", "回到草稿并修改");
    revise.type = "button";
    revise.addEventListener("click", () => {
      showTab("preview");
    if (isLiveResult()) {
        const editor = $("#revision-input");
        $("#live-revision")?.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center"});
        setTimeout(() => editor?.focus({preventScroll: true}), 80);
      } else startEdit();
    });
    nextStep.append(revise);
  }
  container.append(nextStep);
  const names = {fact: "事实与来源", image: "图片与型号", compliance: "营销表达", platform: "平台与结构"};
  for (const check of report.checks) {
    const card = element("div", "check-card " + check.status);
    const text = element("div"); text.append(element("strong", "", names[check.category]), element("p", "", check.detail));
    card.append(element("span", "check-icon", {pass: "通过", pending: "待核", fail: "处理"}[check.status]), text, element("span", "check-tag", {pass: "结构通过", pending: "待复核", fail: "需处理"}[check.status]));
    const factIds = state.current.mode === "live" && check.category === "fact"
      ? (check.evidence_ids || []).filter(id => state.current.evidence.facts.some(fact => fact.fact_id === id))
      : [];
    if (factIds.length) {
      const viewEvidence = element("button", "check-evidence-link", factIds.length > 1 ? `查看 ${factIds.length} 条事实依据` : "查看事实依据");
      viewEvidence.type = "button";
      viewEvidence.addEventListener("click", () => openFactEvidence(factIds));
      text.append(viewEvidence);
    }
    const imageIds = state.current.mode === "live" && check.category === "image"
      ? (check.evidence_ids || []).filter(id => state.current.evidence.images.some(image => image.image_id === id))
      : [];
    if (imageIds.length) {
      const viewImages = element("button", "check-evidence-link", imageIds.length > 1 ? `查看 ${imageIds.length} 张图片` : "查看对应图片");
      viewImages.type = "button";
      viewImages.addEventListener("click", () => openImageEvidence(imageIds));
      text.append(viewImages);
    }
    container.append(card);
  }
  if (state.current.mode === "live") container.append(renderHumanReview());
  const pending = report.checks.filter(check => check.status !== "pass").length;
  $("#review-count").textContent = pending;
  $("#review-count").hidden = false;
}

function renderHumanReview() {
  const record = state.current.human_review || {status: "pending", note: "", recorded_at: ""};
  const panel = element("section", "human-review");
  panel.append(element("h3", "", "人工复核记录"), element("p", "human-review-intro", "这是团队成员的单独记录，不会改变模型核验状态；本次页面关闭后不保存在浏览器，导出时会写入文件。"));
  const label = element("label", "", "人工结论");
  const select = element("select");
  select.setAttribute("aria-label", "选择人工复核结论");
  for (const [value, text] of [["pending", "暂未复核"], ["approved", "人工复核通过"], ["needs_changes", "需修改后再复核"]]) {
    const option = element("option", "", text); option.value = value; select.append(option);
  }
  select.value = record.status;
  label.append(select);
  const noteLabel = element("label", "human-review-note-label", "复核备注");
  const note = element("textarea");
  note.rows = 3; note.maxLength = 1000;
  note.placeholder = "记录仍需确认的事实、条件或修改原因；无需填写个人信息。";
  note.value = record.note || "";
  noteLabel.append(note);
  const save = element("button", "button secondary human-review-save", record.recorded_at ? "更新人工复核记录" : "保存人工复核记录");
  save.type = "button";
  const result = element("p", "human-review-result", record.recorded_at
    ? `${{pending: "暂未复核", approved: "人工复核通过", needs_changes: "需修改后再复核"}[record.status] || "已记录"} · ${new Date(record.recorded_at).toLocaleString("zh-CN")}`
    : "尚未记录人工结论。");
  result.setAttribute("role", "status");
  save.addEventListener("click", () => {
    if (select.value === "needs_changes" && !note.value.trim()) {
      result.textContent = "请写明需要调整的内容，再保存复核记录。";
      note.focus();
      return;
    }
    const humanReview = {status: select.value, note: note.value.trim(), recorded_at: new Date().toISOString()};
    state.current.human_review = humanReview;
    result.textContent = `${{pending: "暂未复核", approved: "人工复核通过", needs_changes: "需修改后再复核"}[humanReview.status]} · ${new Date(humanReview.recorded_at).toLocaleString("zh-CN")}`;
    save.textContent = "更新人工复核记录";
    toast("人工复核记录已写入本次运行；导出后可随稿复查");
  });
  panel.append(label, noteLabel, save, result);
  return panel;
}

function openFactEvidence(factIds) {
  showTab("evidence");
  const targets = factIds.map(id => [...document.querySelectorAll(".fact-source-card")].find(node => node.dataset.factId === id)).filter(Boolean);
  targets.forEach(node => node.classList.add("fact-source-highlight"));
  const first = targets[0];
  if (first) {
    first.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center"});
    first.focus({preventScroll: true});
  }
  setTimeout(() => targets.forEach(node => node.classList.remove("fact-source-highlight")), 2200);
}

function openImageEvidence(imageIds) {
  showTab("evidence");
  const targets = imageIds.map(id => [...document.querySelectorAll("#evidence-tab .image-evidence-card")].find(node => node.dataset.imageId === id)).filter(Boolean);
  targets.forEach(node => node.classList.add("image-evidence-highlight"));
  const first = targets[0];
  if (first) {
    first.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center"});
    first.focus({preventScroll: true});
  }
  setTimeout(() => targets.forEach(node => node.classList.remove("image-evidence-highlight")), 2200);
}

function renderResult(result, save = true) {
  if (isLiveResult(result)) return renderLiveResult(result);
  state.current = result;
  state.adGame = emptyGameProgress();
  $(".cover-preview img").src = "/static/illustration.svg";
  $(".cover-text").hidden = false;
  $(".article-meta small").textContent = "工作台演示 · 非真实体验";
  $("#demo-banner").replaceChildren(element("div", "", "演示预览 · 规则示例与构图示意，不可发布。"));
  $("#live-revision")?.remove();
  $("#copy-article").disabled = false; $("#export-md").disabled = false;
  $("#empty-state").hidden = true;
  $("#search-content").hidden = true;
  $("#result-content").hidden = false;
  $("#edit-panel").hidden = true;
  $("#result-state").textContent = "演示 · 待复核";
  renderArticle(); renderStrategy(); renderEvidence(); renderReview(); showTab("preview");
  $$(".workflow-step").forEach((node, index) => node.classList.toggle("current", index === 3));
  if (save) saveHistory(result);
  syncTaskStaleNotice();
}

function renderSearch(result, append = false) {
  if (append && listingState) result = {...result, items: [...listingState.items, ...result.items]};
  listingState = result;
  state.current = null;
  syncTaskStaleNotice();
  $("#empty-state").hidden = true;
  $("#result-content").hidden = true;
  $("#search-content").hidden = false;
  $("#review-count").hidden = true;
  const resultCount = result.items?.length || 0;
  $("#result-state").textContent = resultCount ? `真实检索 · ${resultCount} 项` : "真实检索 · 无匹配";
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
  const searchSummary = resultCount ? `本页共 ${resultCount} 项。` : "本次没有匹配资料。";
  container.append(breadcrumbs, element("div", "search-notice", [result.note, searchSummary].filter(Boolean).join(" ")));
  const basket = element("div", "knowledge-basket"); basket.id = "knowledge-basket"; container.append(basket); updateBasket();
  const filters = element("div", "knowledge-filters");
  filters.setAttribute("role", "group"); filters.setAttribute("aria-label", "按资料类型筛选");
  const list = element("div", "knowledge-list"); list.id = "knowledge-list";
  const types = {all: "全部", document: "资料", image: "图片", folder: "文件夹"};
  function draw(kind = "all") {
    list.replaceChildren();
    const items = result.items.filter(item => kind === "all" || item.kind === kind);
    filters.querySelectorAll("button").forEach(button => {
      const selected = button.dataset.filter === kind;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    for (const item of items) {
      const card = element("div", "source-card knowledge-card");
      const content = element("div", "knowledge-card-content");
      content.append(element("div", "source-label real", {folder: "文件夹", image: "真实图片", document: "原始资料"}[item.kind] || "资料"), element("strong", "", item.title));
      if (item.excerpt) content.append(element("p", "", item.excerpt));
      const actions = element("div", "knowledge-card-actions");
      const open = element("button", "small-button", item.kind === "folder" ? "进入目录 →" : item.kind === "image" ? "查看图片" : "查看原文");
      open.addEventListener("click", () => item.kind === "folder" ? browseDirectory(item.ref) : readResource(item)); actions.append(open);
      if (item.kind !== "folder") {
        const add = element("button", "small-button selection-button", selection.has(item.ref) ? "已选择" : "选择资料");
        add.dataset.ref = item.ref;
        add.addEventListener("click", () => { toggleSelection(item); add.textContent = selection.has(item.ref) ? "已选择" : "选择资料"; }); actions.append(add);
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
  syncGenerateLabel();
  syncCreationTrace();
  $$(".selection-button").forEach(button => { button.textContent = selection.has(button.dataset.ref) ? "已选择" : "选择资料"; });
  const basket = $("#knowledge-basket"); if (!basket) return;
  basket.replaceChildren(element("span", "", "已选 " + selection.size + " / 8 份资料"));
  const actions = element("div");
  const clear = element("button", "small-button", "清空"); clear.addEventListener("click", () => { selection.clear(); updateBasket(); if (listingState) renderSearch(listingState); });
  const read = element("button", "small-button", "读取选中资料 →"); read.disabled = !selection.size;
  read.addEventListener("click", () => withBusy(read, async () => {
    const result = await api("/api/retrieve", {knowledge_base: knowledgeName(), references: [...selection.keys()], request_id: crypto.randomUUID()});
    retrievalContext = result; showRetrieved(result);
  }));
  const create = element("button", "button primary", "用这些资料生成"); create.disabled = !selection.size;
  create.addEventListener("click", () => createLive(create));
  actions.append(clear, read, create); basket.append(actions);
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
  const create = element("button", "button primary", "用这些资料生成");
  create.addEventListener("click", () => createLive(create));
  toolbar.append(back, copy, create); container.append(toolbar);
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
      if (selection.size) return createLive(button);
      if (!task.product) { $("#form-message").textContent = "请先填写需要检索的具体产品型号。"; $("#form-message").hidden = false; return; }
      const query = task.product.replace(/[（(].*?[）)]/g, "").replace(/^HUAWEI\s+/i, "").trim();
      renderSearch(await api("/api/search", {query, knowledge_base: $("#kb-name").value.trim()}));
      return;
    }
    const result = await api("/api/demo", {task});
    if (!result.article) {
      const preparation = result.preparation;
      $("#form-message").replaceChildren(element("p", "form-message-copy", preparation.questions?.join(" ") || "任务格式不正确，请检查输入。"), renderDemandContract(task));
      $("#form-message").hidden = false;
      toast("请先补充任务信息");
      return;
    }
    result.adFormat = state.adFormat;
    state.adGame = emptyGameProgress();
    renderResult(result);
    if ($("#task-stale-notice").hidden && result.adFormat !== "game") toast("演示预览已生成，事实和图片仍为占位");
  });
}

function taskContractMarkdown(task, strategy) {
  const value = input => String(input || "").replace(/[\r\n\t]+/g, " ").trim() || "未填写";
  const platform = platformNames[task.platform] || task.platform || "未选择";
  const purchaseStage = String(task.purchase_stage || "").trim();
  const direction = strategy.angle_name || strategy.angle || "真实资料策略分析";
  const rationale = strategy.angle || strategy.model_strategy || strategy.analysis || "未提供策略说明";
  return [
    "## 本次任务契约",
    "- 信息来源：当前任务表单；未保存原始自然语言需求。",
    `- 目标型号：${value(task.product)}`,
    `- 目标人群：${value(task.audience)}`,
    `- 使用场景：${value(task.scenario)}`,
    `- 购买阶段：${purchaseStage ? value(purchaseStage) : "未填写（选填）"}`,
    `- 内容目标：${value(task.goal)}`,
    `- 发布平台：${value(platform)}`,
    `- 内容方向：${value(direction)}`,
    `- 策略说明：${value(rationale)}`,
  ];
}

function articleMarkdown() {
  if (isLiveResult()) return liveMarkdown();
  const {task, article, evidence, review, strategy} = state.current;
  const content = ["> 开发演示 · 未调用大模型 · 事实和图片为占位 · 不可作为正式发布稿或参赛运行证明", "", "# " + article.title, "", ...taskContractMarkdown(task, strategy), "", "## 图文内容", "", article.lead, "", article.body, "", article.cta, "", article.tags.map(tag => "#" + tag).join(" "), "", "## 配图方案（待替换 ima 真实图片）", ...article.image_plan.map((image, index) => `${index + 1}. ${image.position}：${image.caption}。${image.reason}`), "", "## 来源状态", ...evidence.sources.map(source => "- " + source.title), "", "## 核验结果", ...review.checks.map(check => "- [" + {pass: "结构通过", pending: "待复核", fail: "需处理"}[check.status] + "] " + check.detail)];
  if (state.current.adFormat === "game") content.push("", gameScriptMarkdown(task));
  return content.join("\n");
}

async function copyGameScript() {
  if (!$("#task-stale-notice").hidden) return toast("任务条件已变更，请重新生成后再复制玩法脚本。");
  if (state.current?.adFormat !== "game" || isLiveResult() && state.current.status !== "ready") return;
  try {
    await navigator.clipboard.writeText(gameScriptMarkdown(state.current.task, !isLiveResult()));
    toast("完整玩法脚本已复制，含全部路线与分支");
  } catch { toast("浏览器未允许复制，请用“导出”保存完整脚本"); }
}

async function copyArticle() {
  if (!state.current) return;
  if (isLiveResult() && state.current.status !== "ready") return toast("核验尚未全部通过，请先处理问题后复制交付稿。");
  try {
    await navigator.clipboard.writeText(articleMarkdown());
    toast(isLiveResult() ? "已复制真实文案、来源与核验说明" : "已复制，包含演示标记与核验说明");
  } catch { toast("浏览器未允许复制，请使用导出文件"); }
}

function exportArticle() {
  if (!state.current) return;
  if (isLiveResult()) return withBusy($("#export-md"), exportLiveHTML);
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
    if (isLiveResult()) {
      toast("正在对修改后的全文重新核验…");
      const adFormat = state.current.adFormat || "editorial";
      const revised = await api("/api/revise", {run_ref: state.current.run_ref, article});
      revised.adFormat = adFormat;
      renderLiveResult(revised);
      return;
    }
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
    state.history = Array.isArray(value) ? value.filter(item => item?.result?.mode === "development_only" && item.result.article && item.result.task && item.result.review && item.result.strategy).map(item => ({...item, revisions: Array.isArray(item.revisions) ? item.revisions.filter(revision => revision?.article && typeof revision.article === "object").slice(0, 5) : []})).slice(0, 10) : [];
  } catch { state.history = []; }
  $("#history-count").textContent = state.history.length;
}

function saveHistory(result) {
  const requestId = result.task.request_id;
  const existing = state.history.find(item => item.result.task.request_id === requestId);
  const revisions = Array.isArray(existing?.revisions) ? [...existing.revisions] : [];
  if (existing && JSON.stringify(existing.result.article) !== JSON.stringify(result.article)) {
    revisions.unshift({time: new Date().toISOString(), article: structuredClone(existing.result.article)});
  }
  state.history = [{time: new Date().toISOString(), result: structuredClone(result), revisions: revisions.slice(0, 5)}, ...state.history.filter(item => item.result.task.request_id !== requestId)].slice(0, 10);
  try { localStorage.setItem(historyKey, JSON.stringify(state.history)); }
  catch { toast("浏览器无法保存历史，当前预览仍可使用"); }
  $("#history-count").textContent = state.history.length;
  if (!$("#history-view").hidden) renderHistory();
}

function saveGameProgress() {
  if (state.current?.mode !== "development_only") return;
  const taskId = state.current.task.request_id;
  const progress = state.adGame.scene && state.adGame.mission ? {
    scene: state.adGame.scene,
    mission: state.adGame.mission,
    outcome: state.adGame.feedback || null,
    round: state.adGame.round || 0,
    answers: Array.isArray(state.adGame.answers) ? state.adGame.answers : [],
    score: Array.isArray(state.adGame.answers) ? state.adGame.answers.filter(answer => answer.correct).length : 0,
    seed: Number.isInteger(state.adGame.seed) ? state.adGame.seed : 0,
  } : null;
  state.history = state.history.map(item => {
    if (item.result.task.request_id !== taskId) return item;
    const updated = {...item};
    if (progress) updated.game = progress;
    else delete updated.game;
    return updated;
  });
  try { localStorage.setItem(historyKey, JSON.stringify(state.history)); }
  catch { toast("体验记录暂时无法保存在此浏览器"); }
  if (!$("#history-view").hidden) renderHistory();
}

function renderHistory() {
  const container = $("#history-list"); container.replaceChildren();
  if (!state.history.length) {
    const empty = element("div", "history-empty");
    empty.append(element("strong", "history-empty-title", "还没有演示任务"));
    empty.append(element("p", "history-empty-copy", "生成一份演示预览后，任务和小游戏进度会保存在这里，方便下次接着用。"));
    const action = element("button", "button primary history-empty-action", "去创作演示稿 →");
    action.type = "button";
    action.addEventListener("click", () => {
      changeView("workspace");
      const target = $("#generate");
      target.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center"});
      target.focus({preventScroll: true});
    });
    empty.append(action);
    return container.append(empty);
  }
  for (const item of state.history) {
    const card = element("article", "history-card");
    card.append(element("small", "", platformNames[item.result.task.platform] + " · 开发演示"), element("strong", "", item.result.article.title), element("p", "", item.result.task.audience + " / " + item.result.task.scenario));
    if (item.game?.scene && item.game?.mission) {
      const label = item.game.outcome
        ? gameFeedbackOptions().find(option => option.key === item.game.outcome)?.label || "已记录实际感受"
        : "已选路线 · 尚未记录体验";
      const score = Number.isInteger(item.game.score) ? item.game.score : Array.isArray(item.game.answers) ? item.game.answers.filter(answer => answer.correct).length : null;
      const challenge = Array.isArray(item.game.answers) && item.game.answers.length === 3 ? `小P三连 ${score} / 3` : "小P挑战进行中";
      card.append(element("span", "history-game-note", `${item.game.scene} · ${item.game.mission} · ${challenge} · ${label}`));
    }
    const actions = element("div", "history-actions");
    const hasGameProgress = Boolean(item.game?.scene && item.game?.mission);
    const gameFinished = Array.isArray(item.game?.answers) && item.game.answers.length >= 3;
    const openLabel = hasGameProgress ? gameFinished ? "查看挑战战绩 ↗" : "继续小P挑战 ↗" : "打开任务 ↗";
    const open = element("button", "button secondary history-open", openLabel);
    open.type = "button";
    open.addEventListener("click", () => {
      selectMode("demo");
      applyTask(item.result.task);
      selectAdFormat(item.result.adFormat === "game" ? "game" : "editorial");
      renderResult(structuredClone(item.result), false);
      if (item.game && item.result.adFormat === "game") {
        state.adGame = {step: 2, scene: item.game.scene, mission: item.game.mission, feedback: item.game.outcome, round: Number.isInteger(item.game.round) ? item.game.round : 0, answers: Array.isArray(item.game.answers) ? item.game.answers : [], seed: Number.isInteger(item.game.seed) ? item.game.seed : newGameSeed()};
        renderGameAd();
      }
      changeView("workspace");
    });
    actions.append(open, element("span", "history-recorded-at", new Date(item.time).toLocaleString("zh-CN")));
    card.append(actions);
    const revisions = Array.isArray(item.revisions) ? item.revisions.filter(revision => revision?.article && typeof revision.article === "object").slice(0, 5) : [];
    if (revisions.length) {
      const toggle = element("button", "small-button history-diff-toggle", `查看改稿记录 · ${revisions.length} 次`);
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", "false");
      const diff = element("div", "history-diff");
      diff.hidden = true;
      const pickerLabel = element("label", "history-diff-picker-label", "选择一次修改");
      const picker = element("select", "history-diff-picker");
      picker.setAttribute("aria-label", "选择要查看的改稿版本");
      revisions.forEach((revision, index) => {
        const option = element("option", "", `版本 ${revisions.length - index} · ${new Date(revision.time || item.time).toLocaleString("zh-CN")}`);
        option.value = String(index);
        picker.append(option);
      });
      pickerLabel.append(picker);
      const comparison = element("div", "history-diff-comparison");
      const paintDiff = () => {
        const index = Number(picker.value) || 0;
        const before = revisions[index].article;
        const after = index === 0 ? item.result.article : revisions[index - 1].article;
        const changed = [
          ["标题", before.title, after.title],
          ["正文", before.body, after.body],
          ["行动引导", before.cta, after.cta],
        ].filter(([, oldValue, newValue]) => oldValue !== newValue);
        const afterLabel = index === 0 ? "当前版本" : `版本 ${revisions.length - index + 1}`;
        const parts = [element("p", "history-diff-time", `对照：版本 ${revisions.length - index} → ${afterLabel}`)];
        if (!changed.length) parts.push(element("p", "", "这次记录没有标题、正文或行动引导的变化。"));
        for (const [label, oldValue, newValue] of changed) {
          const row = element("section", "history-diff-row");
          row.append(element("strong", "", label), element("span", "history-diff-label", "修改前"), element("p", "history-diff-before", oldValue || "（空）"), element("span", "history-diff-label", "修改后"), element("p", "history-diff-after", newValue || "（空）"));
          parts.push(row);
        }
        comparison.replaceChildren(...parts);
      };
      picker.addEventListener("change", paintDiff);
      paintDiff();
      diff.append(pickerLabel, comparison);
      toggle.addEventListener("click", () => {
        diff.hidden = !diff.hidden;
        toggle.setAttribute("aria-expanded", String(!diff.hidden));
        toggle.textContent = `${diff.hidden ? "查看" : "收起"}改稿记录 · ${revisions.length} 次`;
      });
      card.append(toggle, diff);
    }
    container.append(card);
  }
}

async function refreshStatus() {
  try {
    const status = await api("/api/status"); state.status = status;
    const prerequisites = status.ima.node_available && status.ima.official_script_available && status.ima.client_id_configured && status.ima.api_key_configured;
    const connected = status.connection.status === "connected";
    const missingRuntime = !status.ima.node_available ? "Node.js 待配置" : !status.ima.official_script_available ? "ima 脚本待配置" : "ima 凭证待配置";
    $("#top-status").textContent = connected ? "ima 共享库已连接" : prerequisites ? "凭证就绪 · 待检查共享库" : missingRuntime;
    $("#connection-shortcut .dot").classList.toggle("amber", !connected);
    $("#nav-connection").classList.toggle("connected", connected);
    $("#probe-connection").disabled = !prerequisites;
    const imaNote = $("#ima-probe-note");
    imaNote.hidden = prerequisites;
    imaNote.textContent = !status.ima.node_available
      ? "请先安装 Node.js 18 或更新版本。"
      : !status.ima.official_script_available
        ? "请先配置 IMA_SKILL_SCRIPT 指向已安装的官方 ima_api.cjs。"
        : "填写本机 ima Client ID 和 API Key 后，才能检查共享库访问权限。";
    const rows = [
      ["Node.js 运行环境", status.ima.node_available],
      ["官方 ima 技能脚本", status.ima.official_script_available],
      ["ima Client ID", status.ima.client_id_configured],
      ["ima API Key", status.ima.api_key_configured],
      ["图文模型 API Key", status.model?.key_configured],
      ["图文模型 HTTPS 接口地址", status.model?.base_configured],
      ["图文模型名称", status.model?.model_configured],
    ];
    $("#probe-model").disabled = !status.model_configured;
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

async function probeModel() {
  const result = $("#model-probe-result");
  await withBusy($("#probe-model"), async () => {
    result.textContent = "正在发送最小 JSON 连通测试…不会附带任务、资料或图片。";
    result.classList.remove("error");
    try {
      const response = await api("/api/model/probe", {});
      result.textContent = `模型连通，JSON 响应有效（${response.model}）。`;
      toast("图文模型连通测试通过");
    } catch (error) {
      result.textContent = error.message;
      result.classList.add("error");
      await refreshStatus();
      throw error;
    }
  });
}

document.addEventListener("keydown", event => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || !/^[1-3]$/.test(event.key) || state.current?.adFormat !== "game" || state.adGame.step !== 2) return;
  if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
  const option = $$("#game-ad-preview .game-quiz-option:not(:disabled)")[Number(event.key) - 1];
  if (option) { event.preventDefault(); option.click(); }
});

$$("[data-view]").forEach(button => button.addEventListener("click", () => changeView(button.dataset.view)));
$$("[data-platform]").forEach(button => button.addEventListener("click", () => selectPlatform(button.dataset.platform)));
$$("[data-mode]").forEach(button => button.addEventListener("click", () => selectMode(button.dataset.mode)));
$$("[data-format]").forEach(button => button.addEventListener("click", () => selectAdFormat(button.dataset.format)));
$$("[data-preset]").forEach(button => button.addEventListener("click", () => preset(button.dataset.preset)));
$$("[data-run-preset]").forEach(button => button.addEventListener("click", () => {
  selectMode("demo");
  preset(button.dataset.runPreset);
  generate();
}));
$$("[data-tab]").forEach(button => button.addEventListener("click", () => { if (!state.current) toast("先生成一份演示预览，即可查看这里"); else showTab(button.dataset.tab); }));
$("#task-form").addEventListener("submit", event => { event.preventDefault(); generate(); });
$("#product").addEventListener("input", invalidateLibraryEvidence);
const syncTaskAfterInput = () => { $("#form-message").hidden = true; syncTaskStaleNotice(); saveTaskDraft(); syncCreationTrace(); };
$("#task-form").addEventListener("input", syncTaskAfterInput);
$("#task-form").addEventListener("change", syncTaskAfterInput);
$("#new-task").addEventListener("click", () => {
  const previousProduct = $("#product").value.trim();
  $("#task-form").reset();
  if (previousProduct !== $("#product").value.trim()) invalidateLibraryEvidence();
  selectMode("demo"); selectAdFormat("editorial"); selectPlatform("xiaohongshu"); clearResult(); $("#form-message").hidden = true; $("#product").focus();
});
$("#edit-article").addEventListener("click", startEdit);
$("#save-edit").addEventListener("click", saveEdit);
$("#cancel-edit").addEventListener("click", () => { $("#edit-panel").hidden = true; });
$("#copy-article").addEventListener("click", copyArticle);
$("#copy-game-script").addEventListener("click", copyGameScript);
$("#export-md").addEventListener("click", exportArticle);
$("#connection-shortcut").addEventListener("click", () => changeView("connection"));
$("#refresh-status").addEventListener("click", () => withBusy($("#refresh-status"), refreshStatus));
$("#probe-connection").addEventListener("click", probeConnection);
$("#probe-model").addEventListener("click", probeModel);
$("#clear-history").addEventListener("click", () => { state.history = []; try { localStorage.removeItem(historyKey); } catch {} $("#history-count").textContent = "0"; renderHistory(); toast("本浏览器中的演示历史已清空"); });
$("#browse-library").addEventListener("click", () => browseDirectory());
$("#close-resource").addEventListener("click", () => $("#resource-dialog").close());
$("#select-resource").addEventListener("click", () => { if (!openResource) return; toggleSelection(openResource.item); $("#select-resource").textContent = selection.has(openResource.item.ref) ? "移出资料篮" : "加入资料篮"; });
$("#copy-resource").addEventListener("click", async () => { if (!openResource) return; try { await navigator.clipboard.writeText(resourceMeta(openResource.content.source) + "\n\n" + openResource.content.text); toast("已复制原文及来源"); } catch { toast("浏览器未允许复制"); } });
$("#kb-name").addEventListener("change", () => { selection.clear(); listingState = null; retrievalContext = null; clearResult(); });
readHistory(); restoreTaskDraft(); syncCreationTrace(); refreshStatus();
