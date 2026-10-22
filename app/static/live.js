"use strict";

async function createLive(button) {
  await withBusy(button, async () => {
    const task = taskFromForm();
    const prepared = await api("/api/prepare", {task});
    if (prepared.status !== "prepared") {
      $("#form-message").textContent = prepared.questions?.join(" ") || "请检查任务信息。";
      $("#form-message").hidden = false; return;
    }
    if (!selection.size) return toast("先选择该型号的原文和图片。");
    $("#form-message").textContent = "正在读取 ima、提取事实、生成并核验图文，通常需要数分钟…";
    $("#form-message").hidden = false;
    try {
      const result = await api("/api/generate", {task, knowledge_base: knowledgeName(), references: [...selection.keys()]});
      result.adFormat = state.adFormat;
      state.adGame = emptyGameProgress();
      renderLiveResult(result);
    } catch (error) {
      $("#form-message").textContent = error.message;
      throw error;
    }
  });
}

function liveFigure(plan, result) {
  const image = result.evidence.images.find(i => i.image_id === plan.image_id);
  const figure = element("figure", "live-figure image-evidence-card");
  figure.dataset.imageId = plan.image_id;
  figure.tabIndex = -1;
  if (image) {
    const img = element("img"); img.src = image.asset_ref; img.alt = plan.caption;
    figure.append(img, element("figcaption", "", plan.caption + " · ima / " + image.name));
  }
  return figure;
}

function renderLiveResult(result) {
  if (!result.article) {
    const messages = result.questions?.length ? result.questions : result.review?.checks.map(c => c.detail) || ["请补充资料后重试。"];
    $("#form-message").textContent = messages.join("\n"); $("#form-message").hidden = false;
    requestAnimationFrame(() => {
      const message = $("#form-message");
      message.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center"});
      message.focus({preventScroll: true});
    });
    toast("生成已暂停，详细原因已定位到任务表单。"); return;
  }
  state.current = result;
  $("#empty-state").hidden = true; $("#search-content").hidden = true;
  $("#result-content").hidden = false; $("#edit-panel").hidden = true;
  $("#form-message").hidden = true;
  const ready = result.status === "ready";
  $("#result-state").textContent = ready ? "真实生成 · 核验通过" : "真实草稿 · 待处理";
  $("#demo-banner").replaceChildren(element("div", "", ready ? "真实 ima 资料与图片 · 已完成自动核验；发布前请人工复核。" : "真实生成草稿 · 核验尚未全部通过，请查看核验结果后修改。"));
  renderArticle(); renderStrategy(); renderReview();
  const outputLabel = result.adFormat === "game" ? (ready ? "自动核验图文 + 小游戏" : "待核验图文 + 小游戏方案") : (ready ? "已核验图文" : "待核验草稿");
  $("#preview-platform").textContent = platformNames[result.task.platform] + " · " + outputLabel;
  $(".article-meta small").textContent = "ima 资料支持 · AI 辅助生成";
  $(".cover-text").hidden = true;
  const cover = result.evidence.images.find(i => i.image_id === result.article.image_plan[0]?.image_id);
  $(".cover-preview img").src = cover?.asset_ref || "";
  $(".cover-preview img").alt = result.article.image_plan[0]?.caption || "ima 产品图片";
  $("#article-image-count").textContent = result.article.image_plan.length + " 张真实图片";
  $("#article-images").replaceChildren();
  const paragraphs = [...$("#article-body").children];
  for (const plan of result.article.image_plan.slice(1).reverse()) {
    const index = Number(plan.position.match(/第(\d+)段后/)?.[1] || paragraphs.length) - 1;
    (paragraphs[Math.max(0, Math.min(index, paragraphs.length - 1))] || $("#article-body")).after(liveFigure(plan, result));
  }
  $("#strategy-tab .detail-description").textContent = "规则确定平台边界，模型根据真实资料分析本次场景与写作策略。";
  $("#strategy-tab").append(sectionList("本次场景判断与策略", [result.strategy.analysis, result.strategy.model_strategy]));
  renderLiveEvidence(result);
  renderLiveClaimLinks(result);
  $("#review-tab .detail-title").textContent = ready ? "本次自动核验已通过" : "以下问题需要处理";
  $("#review-tab .detail-description").textContent = "包括结构检查、单独模型复核与实际图片输入检查；自动核验可能遗漏问题。";
  $$("#review-tab .check-tag").forEach(node => { if (node.textContent === "结构通过") node.textContent = "已检查"; });
  $("#copy-article").disabled = !ready; $("#export-md").disabled = !ready;
  $("#live-revision")?.remove();
  const revision = element("section", "live-revision"); revision.id = "live-revision";
  revision.append(element("h3", "", "按意见重写"));
  const input = element("textarea"); input.id = "revision-input"; input.rows = 3; input.maxLength = 2000;
  input.placeholder = "例如：突出开学整理资料的场景，语气更自然，保留适用条件。";
  input.setAttribute("aria-label", "修改意见");
  const rewrite = element("button", "button primary", "重新生成并核验");
  rewrite.addEventListener("click", () => withBusy(rewrite, async () => {
    if (!input.value.trim()) return toast("请先填写修改意见。");
    toast("正在按意见重写，并重新核对全文…");
    const adFormat = state.current.adFormat || "editorial";
    const revised = await api("/api/revise", {run_ref: state.current.run_ref, revision: input.value.trim()});
    revised.adFormat = adFormat;
    renderLiveResult(revised);
  }));
  revision.append(input, rewrite); $("#preview-tab").append(revision);
  showTab(ready ? "preview" : "review");
  $$(".workflow-step").forEach((node, index) => node.classList.toggle("current", index === 4));
  syncTaskStaleNotice();
  toast(ready ? "真实图文已生成并完成自动核验。" : "草稿已生成，请查看待处理项。");
}

function renderLiveClaimLinks(result) {
  const claims = Array.isArray(result.claim_links) ? result.claim_links : [];
  const targets = [$("#article-title"), $("#article-lead"), ...$$("#article-body > p, #article-body > h3, #preview-tab .live-figure figcaption"), $("#article-cta")].filter(node => node && node.textContent.trim());
  const attached = new Set();
  const grouped = new Map();
  for (const claim of claims) {
    if (!claim || typeof claim.text !== "string" || !claim.text.trim() || attached.has(claim.text)) continue;
    const target = targets.find(node => node.textContent.includes(claim.text));
    if (!target) continue;
    attached.add(claim.text);
    const group = grouped.get(target) || [];
    group.push(claim);
    grouped.set(target, group);
  }
  for (const [target, group] of grouped) {
    const factIds = [...new Set(group.flatMap(claim => Array.isArray(claim.fact_ids) ? claim.fact_ids : []))];
    const status = group.some(claim => claim.status === "fail") ? "fail" : group.some(claim => claim.status === "pending") ? "pending" : "pass";
    if (!factIds.length || group.some(claim => !Array.isArray(claim.fact_ids) || !claim.fact_ids.length)) {
      target.append(element("span", "claim-evidence-unlinked", "声明待核 · 未关联事实依据"));
    }
    if (!factIds.length) continue;
    const label = status === "fail" ? "依据关联 · 核验未通过" : status === "pending" ? "依据关联 · 待核验" : "查看本段事实依据";
    const link = element("button", "claim-evidence-link " + status, label);
    link.type = "button";
    link.addEventListener("click", () => openFactEvidence(factIds));
    target.append(link);
  }
}

function renderLiveEvidence(result) {
  const container = $("#evidence-tab");
  container.replaceChildren(...detailHeader("从原文，到每一条声明。", "以下事实从本次 ima 原文提取，引用片段已逐字定位。"));
  container.append(renderEvidenceCoverage(result));
  for (const fact of result.evidence.facts) {
    const card = element("div", "source-card");
    card.classList.add("fact-source-card");
    card.dataset.factId = fact.fact_id;
    card.tabIndex = -1;
    const quotes = result.quotes.filter(q => q.fact_id === fact.fact_id);
    card.append(element("div", "source-label real", fact.fact_id + " · ima 原文依据"), element("strong", "", fact.statement));
    if (fact.conditions.length) card.append(element("p", "", "适用条件：" + fact.conditions.join("；")));
    for (const quote of quotes) card.append(element("blockquote", "fact-quote", quote.quote));
    for (const sid of fact.source_ids) {
      const source = result.evidence.sources.find(s => s.source_id === sid);
      if (source) card.append(element("p", "resource-source", source.title + "\n" + new Date(source.retrieved_at).toLocaleString("zh-CN")));
    }
    container.append(card);
  }
  for (const plan of result.article.image_plan) {
    const image = result.evidence.images.find(item => item.image_id === plan.image_id);
    const source = result.evidence.sources.find(item => item.source_id === image?.source_id);
    container.append(liveFigure(plan, result), element("p", "resource-source", "来源 · " + (source?.title || image?.name || "来源信息缺失")), element("p", "detail-description", plan.position + " · " + plan.reason));
  }
}

function renderEvidenceCoverage(result) {
  const claims = Array.isArray(result.claim_links) ? result.claim_links : [];
  const knownFacts = new Map(result.evidence.facts.map(fact => [fact.fact_id, fact]));
  const linkedClaims = claims.filter(claim => (claim.fact_ids || []).some(id => knownFacts.has(id)));
  const section = element("section", "evidence-coverage");
  const heading = element("div", "evidence-coverage-heading");
  heading.append(element("h3", "", "声明与事实关联总览"), element("span", "evidence-coverage-scope", "自动核验记录 · 不代表人工确认"));
  section.append(heading);
  if (!claims.length) {
    section.append(element("p", "evidence-coverage-empty", "本次没有返回可定位的声明关联记录。请逐条检查稿件与原文，不能据此认为声明已通过核验。"));
    return section;
  }
  const unlinked = claims.length - linkedClaims.length;
  section.append(element("p", "evidence-coverage-summary", `${claims.length} 条声明 · ${linkedClaims.length} 条关联到事实 · ${unlinked} 条未关联`));
  const list = element("div", "evidence-coverage-list");
  const labels = {pass: "模型核验通过", pending: "待确认", fail: "需处理"};
  for (const claim of claims) {
    const factIds = [...new Set((claim.fact_ids || []).filter(id => knownFacts.has(id)))];
    const card = element("article", `evidence-claim-card ${claim.status || "pending"}`);
    const status = element("span", `evidence-claim-status ${claim.status || "pending"}`, labels[claim.status] || "待确认");
    card.append(status, element("p", "evidence-claim-text", claim.text));
    const facts = element("div", "evidence-claim-facts");
    if (!factIds.length) {
      facts.append(element("p", "evidence-claim-unlinked", "未关联到已提取事实 · 需人工检查"));
    } else {
      for (const id of factIds) {
        const fact = knownFacts.get(id);
        const link = element("button", "evidence-fact-link", `${id} · ${fact.statement}`);
        link.type = "button";
        link.addEventListener("click", () => openFactEvidence([id]));
        facts.append(link);
      }
    }
    card.append(facts);
    list.append(card);
  }
  section.append(list);
  return section;
}

function liveMarkdown() {
  const r = state.current, a = r.article;
  const content = ["> ima 资料支持 · AI辅助生成 · 发布前请人工复核", "", "# " + a.title, "", ...taskContractMarkdown(r.task, r.strategy), "", "## 图文内容", "", a.lead, "", a.body, "", a.cta, "", a.tags.map(t => "#" + t.replace(/^#/, "")).join(" "), "", "## 场景判断", r.strategy.analysis, "", "## 声明与事实对应关系", ...claimEvidenceMarkdown(r), "", "## 知识库依据", ...r.evidence.facts.map(f => "- " + f.fact_id + "：" + f.statement + "；条件：" + f.conditions.join("；") + "；来源：" + f.source_ids.join(", ")), ...r.evidence.sources.map(s => "- " + s.source_id + "：" + s.title + "；读取：" + s.retrieved_at), "", "## 核验", ...r.review.checks.map(c => "- [" + c.status + "] " + c.detail), "", "## 人工复核记录", ...humanReviewMarkdown(r.human_review)];
  if (r.adFormat === "game") content.push("", gameScriptMarkdown(r.task, false));
  return content.join("\n");
}

function humanReviewLabel(record) {
  return ({pending: "暂未复核", approved: "人工复核通过", needs_changes: "需修改后再复核"})[record?.status] || "尚未记录";
}

function humanReviewMarkdown(record) {
  if (!record?.recorded_at) return ["尚未记录人工复核结论。"];
  return [`结论：${humanReviewLabel(record)}`, `时间：${new Date(record.recorded_at).toLocaleString("zh-CN")}`, `备注：${record.note || "无"}`];
}

function claimEvidenceMarkdown(result) {
  const claims = Array.isArray(result.claim_links) ? result.claim_links : [];
  if (!claims.length) return ["本次响应未提供逐条声明映射；请勿据此推断声明已关联来源。"];
  const labels = {pass: "模型复核通过，仍需人工复核", pending: "待确认", fail: "需处理"};
  const lines = [];
  for (const claim of claims) {
    lines.push(`- [${labels[claim.status] || "待确认"}] 声明：「${claim.text}」`);
    const facts = result.evidence.facts.filter(fact => (claim.fact_ids || []).includes(fact.fact_id));
    if (!facts.length) {
      lines.push("  - 未关联事实依据。");
      continue;
    }
    for (const fact of facts) {
      lines.push(`  - ${fact.fact_id}：${fact.statement}`, `    - 适用条件：${fact.conditions.join("；") || "原文未提供"}`, `    - 来源：${fact.source_ids.map(id => result.evidence.sources.find(source => source.source_id === id)?.title || id).join("；")}`);
      for (const quote of result.quotes.filter(item => item.fact_id === fact.fact_id)) {
        lines.push(...quote.quote.split(/\r?\n/).map(line => "    > " + line));
      }
    }
  }
  return lines;
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[ch])); }

async function exportLiveHTML() {
  const r = structuredClone(state.current);
  if (r.status !== "ready") return toast("核验未全部通过，请先处理问题。");
  const embedded = new Map();
  for (const plan of r.article.image_plan) {
    const image = r.evidence.images.find(i => i.image_id === plan.image_id);
    const response = await fetch(image.asset_ref);
    if (!response.ok) throw new Error("图片已失效，请重新生成后导出。");
    const blob = await response.blob();
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    embedded.set(plan.image_id, `<figure><img src="${data}" alt="${escapeHtml(plan.caption)}"><figcaption>${escapeHtml(plan.caption)} · ima / ${escapeHtml(image.name)}</figcaption></figure>`);
  }
  const a = r.article;
  let body = a.body.split(/\n\n+/).map((text, index) => `<p>${escapeHtml(text).replace(/\n/g,"<br>")}</p>` + a.image_plan.filter(p => p.position === `第${index+1}段后`).map(p => embedded.get(p.image_id)).join("")).join("");
  const claimSections = (Array.isArray(r.claim_links) ? r.claim_links : []).map(claim => {
    const facts = r.evidence.facts.filter(fact => (claim.fact_ids || []).includes(fact.fact_id));
    const factList = facts.length ? `<ul>${facts.map(fact => `<li><a href="#fact-${escapeHtml(fact.fact_id)}">查看 ${escapeHtml(fact.fact_id)} · ${escapeHtml(fact.statement)}</a></li>`).join("")}</ul>` : "<p>未关联事实依据。</p>";
    const label = {pass: "模型复核通过 · 仍需人工复核", pending: "待确认", fail: "需处理"}[claim.status] || "待确认";
    return `<li><strong>${escapeHtml(label)}</strong>：${escapeHtml(claim.text)}${factList}</li>`;
  }).join("") || "<li>本次响应未提供逐条声明映射；请勿据此推断声明已关联来源。</li>";
  const factsHtml = r.evidence.facts.map(fact => {
    const quotes = r.quotes.filter(item => item.fact_id === fact.fact_id).map(item => `<blockquote>${escapeHtml(item.quote)}</blockquote>`).join("");
    const sources = fact.source_ids.map(id => r.evidence.sources.find(source => source.source_id === id)).filter(Boolean).map(source => `<li>${escapeHtml(source.title)} · ${escapeHtml(source.retrieved_at)}</li>`).join("");
    return `<section id="fact-${escapeHtml(fact.fact_id)}"><h3>${escapeHtml(fact.fact_id)} · ${escapeHtml(fact.statement)}</h3><p>适用条件：${escapeHtml(fact.conditions.join("；") || "原文未提供")}</p>${quotes}<ul>${sources}</ul></section>`;
  }).join("");
  const humanReview = r.human_review?.recorded_at
    ? `<p>结论：${escapeHtml(humanReviewLabel(r.human_review))}</p><p>时间：${escapeHtml(new Date(r.human_review.recorded_at).toLocaleString("zh-CN"))}</p><p>备注：${escapeHtml(r.human_review.note || "无")}</p>`
    : "<p>尚未记录人工复核结论。</p>";
  const contractLines = taskContractMarkdown(r.task, r.strategy).slice(1).map(line => `<li>${escapeHtml(line.replace(/^-\s*/, ""))}</li>`).join("");
  const gameAppendix = r.adFormat === "game" ? `<h2>互动小游戏玩法脚本</h2><pre>${escapeHtml(gameScriptMarkdown(r.task, false))}</pre>` : "";
  const details = `<h2>本次任务契约</h2><ul>${contractLines}</ul><h2>场景判断</h2><p>${escapeHtml(r.strategy.analysis)}</p><h2>声明与事实对应关系</h2><ul>${claimSections}</ul><h2>知识库事实与原文摘录</h2>${factsHtml}<h2>其他来源</h2><ul>${r.evidence.sources.map(s => `<li>${escapeHtml(s.source_id + "：" + s.title + "；读取时间：" + s.retrieved_at)}</li>`).join("")}</ul><h2>配图安排</h2><ul>${a.image_plan.map(p => `<li>${escapeHtml(p.position + "：" + p.caption + "；" + p.reason)}</li>`).join("")}</ul><h2>模型核验结果</h2><ul>${r.review.checks.map(c => `<li>${escapeHtml(c.status + "：" + c.detail)}</li>`).join("")}</ul>${gameAppendix}<h2>人工复核记录（独立于模型核验）</h2>${humanReview}`;
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(a.title)}</title><style>body{max-width:780px;margin:40px auto;padding:0 24px;font:16px/1.9 system-ui;color:#243d35}h1{line-height:1.4}img{max-width:100%;max-height:680px;object-fit:contain}figure{margin:28px 0}figcaption,small{font-size:12px;color:#657b70}p{white-space:normal}aside{border-top:1px solid #ccd8cd;margin-top:48px;font-size:13px}section[id^=fact-]{scroll-margin:20px;padding:12px 0;border-bottom:1px solid #e0e8e1}blockquote{margin:8px 0;padding:8px 12px;border-left:2px solid #a9bba9;background:#f5f8f5}a{color:#315f47}</style><small>ima 资料支持 · AI辅助生成 · 发布前请人工复核</small><h1>${escapeHtml(a.title)}</h1>${embedded.get(a.image_plan[0].image_id)}<p>${escapeHtml(a.lead)}</p>${body}<p>${escapeHtml(a.cta)}</p><p>${escapeHtml(a.tags.map(t=>"#"+t).join(" "))}</p><aside>${details}</aside></html>`;
  const url = URL.createObjectURL(new Blob([html], {type:"text/html;charset=utf-8"}));
  const link = element("a"); link.href = url; link.download = "华为PC图文_" + platformNames[r.task.platform] + "_" + Date.now() + ".html";
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("已导出含真实图片、来源与核验的离线图文。");
}
