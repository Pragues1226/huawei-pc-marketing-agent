function sourceLabel(result) { return result.data_source?.label || "产品资料"; }
"use strict";

async function createLive(button, requestedSource = null) {
  await withBusy(button, async () => {
    const task = taskFromForm();
    const prepared = await api("/api/prepare", {task});
    if (prepared.status !== "prepared") {
      $("#form-message").textContent = prepared.questions?.join(" ") || "请检查任务信息。";
      $("#form-message").hidden = false; return;
    }
    const official = requestedSource ? requestedSource === "official" : document.getElementById("creative-source")?.value !== "ima";
    if (!official && !selection.size) return toast("先选择该型号的原文和图片。");
    $("#form-message").textContent = "正在读取产品原文、提取事实、生成并核验图文，通常需要数分钟…";
    $("#form-message").hidden = false;
    try {
      let product;
      if (official) product = await productStage.prepare(task);
      $("#form-message").textContent = "正在结合产品原文与本地 v7 指导，生成并核验图文…";
      productStage.progress("资料已就绪，正在生成与核验广告…");
      const result = await api("/api/generate", {task, knowledge_base: knowledgeName(), references: [...selection.keys()], source: official ? "official" : "ima", product_ref: product?.product_ref});
      productStage.progress(result.article ? "广告已生成，可查看图文预览。" : (result.questions?.join(" ") || "请补充资料后重试。"));
      renderLiveResult(result);
    } catch (error) {
      productStage.progress(error.message, true);
      $("#form-message").textContent = error.message;
      throw error;
    }
  });
}

function liveFigure(plan, result) {
  const image = result.evidence.images.find(i => i.image_id === plan.image_id);
  const figure = element("figure", "live-figure");
  if (image) {
    const img = element("img"); img.src = image.asset_ref; img.alt = plan.caption;
    figure.append(img, element("figcaption", "", plan.caption + " · " + sourceLabel(result) + " / " + image.name));
  }
  return figure;
}

function renderLiveResult(result) {
  if (!result.article) {
    const messages = result.questions?.length ? result.questions : result.review?.checks.map(c => c.detail) || ["请补充资料后重试。"];
    $("#form-message").textContent = messages.join("\n"); $("#form-message").hidden = false;
    toast("信息不足或证据冲突，已停止生成。"); return;
  }
  state.current = result;
  $("#empty-state").hidden = true; $("#search-content").hidden = true;
  $("#result-content").hidden = false; $("#edit-panel").hidden = true;
  $("#form-message").hidden = true;
  const ready = result.status === "ready";
  $("#result-state").textContent = ready ? "真实生成 · 核验通过" : "真实草稿 · 待处理";
  $("#demo-banner").replaceChildren(element("div", "", ready ? "真实产品资料与图片 · 已完成自动核验；发布前请人工复核。" : "真实生成草稿 · 核验尚未全部通过，请查看核验结果后修改。"));
  renderArticle(); renderStrategy(); renderReview();
  $("#preview-platform").textContent = platformNames[result.task.platform] + " · " + (ready ? "已核验图文" : "待核验草稿");
  $(".article-meta small").textContent = "产品资料支持 · AI 辅助生成";
  $(".cover-text").hidden = true; $(".cover-label").textContent = "来源原图";
  const cover = result.evidence.images.find(i => i.image_id === result.article.image_plan[0]?.image_id);
  $(".cover-preview img").src = cover?.asset_ref || "";
  $(".cover-preview img").alt = result.article.image_plan[0]?.caption || "产品图片";
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
  productStage.appendSources(result);
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
    renderLiveResult(await api("/api/revise", {run_ref: state.current.run_ref, source: state.current.data_source?.mode, revision: input.value.trim()}));
  }));
  revision.append(input, rewrite); $("#preview-tab").append(revision);
  showTab(ready ? "preview" : "review");
  $$(".workflow-step").forEach((node, index) => node.classList.toggle("current", index === 4));
  toast(ready ? "真实图文已生成并完成自动核验。" : "草稿已生成，请查看待处理项。");
}

function renderLiveEvidence(result) {
  const container = $("#evidence-tab");
  container.replaceChildren(...detailHeader("从原文，到每一条声明。", "以下事实从本次产品原文提取，引用片段已逐字定位。"));
  for (const fact of result.evidence.facts) {
    const card = element("div", "source-card");
    const quotes = result.quotes.filter(q => q.fact_id === fact.fact_id);
    card.append(element("div", "source-label real", fact.fact_id + " · 产品原文依据"), element("strong", "", fact.statement));
    if (fact.conditions.length) card.append(element("p", "", "适用条件：" + fact.conditions.join("；")));
    for (const quote of quotes) card.append(element("blockquote", "fact-quote", quote.quote));
    for (const sid of fact.source_ids) {
      const source = result.evidence.sources.find(s => s.source_id === sid);
      if (source) card.append(element("p", "resource-source", source.title + (source.url ? "\n" + source.url : "") + "\n" + new Date(source.retrieved_at).toLocaleString("zh-CN")));
    }
    container.append(card);
  }
  for (const plan of result.article.image_plan) {
    container.append(liveFigure(plan, result), element("p", "detail-description", plan.position + " · " + plan.reason));
  }
}

function liveMarkdown() {
  const r = state.current, a = r.article;
  return ["> 产品资料支持 · AI辅助生成 · 发布前请人工复核", "", "# " + a.title, "", a.lead, "", a.body, "", a.cta, "", a.tags.map(t => "#" + t.replace(/^#/, "")).join(" "), "", "## 场景判断", r.strategy.analysis, "", "## 知识库依据", ...r.evidence.facts.map(f => "- " + f.fact_id + "：" + f.statement + "；条件：" + f.conditions.join("；") + "；来源：" + f.source_ids.join(", ")), ...r.evidence.sources.map(s => "- " + s.source_id + "：" + s.title + (s.url ? "；链接：" + s.url : "") + "；读取：" + s.retrieved_at), "", "## 配图方案", ...a.image_plan.map(p => "- " + p.position + "：" + p.caption + "；" + r.evidence.images.find(i => i.image_id === p.image_id)?.name + "；" + p.reason), "", "## 核验", ...r.review.checks.map(c => "- [" + c.status + "] " + c.detail)].join("\n");
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
    embedded.set(plan.image_id, `<figure><img src="${data}" alt="${escapeHtml(plan.caption)}"><figcaption>${escapeHtml(plan.caption)} · ${escapeHtml(sourceLabel(r))} / ${escapeHtml(image.name)}</figcaption></figure>`);
  }
  const a = r.article;
  let body = a.body.split(/\n\n+/).map((text, index) => `<p>${escapeHtml(text).replace(/\n/g,"<br>")}</p>` + a.image_plan.filter(p => p.position === `第${index+1}段后`).map(p => embedded.get(p.image_id)).join("")).join("");
  const details = `<h2>场景判断</h2><p>${escapeHtml(r.strategy.analysis)}</p><h2>知识库依据</h2>${r.evidence.facts.map(f => `<p>${escapeHtml(f.fact_id + "：" + f.statement + "；条件：" + f.conditions.join("；"))}</p>`).join("")}<ul>${r.evidence.sources.map(s => `<li>${escapeHtml(s.source_id + "：" + s.title + (s.url ? "；链接：" + s.url : "") + "；读取时间：" + s.retrieved_at)}</li>`).join("")}</ul><h2>配图安排</h2><ul>${a.image_plan.map(p => `<li>${escapeHtml(p.position + "：" + p.caption + "；" + p.reason)}</li>`).join("")}</ul><h2>核验结果</h2><ul>${r.review.checks.map(c => `<li>${escapeHtml(c.status + "：" + c.detail)}</li>`).join("")}</ul>`;
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(a.title)}</title><style>body{max-width:780px;margin:40px auto;padding:0 24px;font:16px/1.9 system-ui;color:#243d35}h1{line-height:1.4}img{max-width:100%;max-height:680px;object-fit:contain}figure{margin:28px 0}figcaption,small{font-size:12px;color:#657b70}p{white-space:normal}aside{border-top:1px solid #ccd8cd;margin-top:48px;font-size:13px}</style><small>产品资料支持 · AI辅助生成 · 发布前请人工复核</small><h1>${escapeHtml(a.title)}</h1>${embedded.get(a.image_plan[0].image_id)}<p>${escapeHtml(a.lead)}</p>${body}<p>${escapeHtml(a.cta)}</p><p>${escapeHtml(a.tags.map(t=>"#"+t).join(" "))}</p><aside>${details}</aside></html>`;
  const url = URL.createObjectURL(new Blob([html], {type:"text/html;charset=utf-8"}));
  const link = element("a"); link.href = url; link.download = "华为PC图文_" + platformNames[r.task.platform] + "_" + Date.now() + ".html";
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("已导出含真实图片、来源与核验的离线图文。");
}
