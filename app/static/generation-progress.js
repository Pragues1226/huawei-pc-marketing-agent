"use strict";
const generationProgress = (() => {
  const panel = document.getElementById('generation-progress');
  const title = document.getElementById('generation-progress-title');
  const detail = document.getElementById('generation-progress-detail');
  const meter = document.getElementById('generation-meter');
  const steps = [...panel.querySelectorAll('[data-phase]')];
  const labels = {sources:'正在读取产品资料…',extract:'正在提取有依据的产品事实…',write:'正在创作文案…',review:'正在核对声明与图片…'};
  let active = false, epoch = 0, started = 0, timer, pollTimer, controller, locked = [], originalLabel = '', reference = '', currentPhase = 'sources';
  function elapsed() {
    const seconds = Math.floor((performance.now() - started) / 1000);
    document.getElementById('generation-elapsed').textContent = `${active ? '已等待' : '本次用时'} ${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  }
  function update(snapshot) {
    currentPhase = snapshot.phase;
    meter.value = snapshot.completed;
    meter.setAttribute('aria-valuetext', `已完成 ${snapshot.completed} / 4 个阶段`);
    steps.forEach((step,index) => {
      step.classList.remove('is-stopped');
      step.classList.toggle('is-done', index < snapshot.completed);
      if (step.dataset.phase === snapshot.phase && snapshot.status === 'running') step.setAttribute('aria-current','step');
      else step.removeAttribute('aria-current');
    });
    title.textContent = labels[snapshot.phase] || '正在处理创作任务…';
    document.getElementById('generate-label').textContent = title.textContent;
    detail.textContent = `服务连接正常 · 已完成 ${snapshot.completed} / 4 个阶段。${snapshot.phase === 'sources' ? '正在等待资料读取结果，请勿重复提交。' : '正在等待模型返回，请勿重复提交。'}`;
    if (snapshot.status !== 'running') title.textContent = '本次处理已返回，正在接收结果…';
  }
  async function poll(ref, version) {
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 8000);
    try {
      const response = await fetch('/api/progress/' + encodeURIComponent(ref), {signal:controller.signal});
      if (!response.ok) throw new Error('progress unavailable');
      const snapshot = await response.json();
      if (active && epoch === version) update(snapshot);
    } catch {
      if (active && epoch === version) detail.textContent = '暂时无法获取进度。当前生成请求尚未确认结束，请勿重复提交；正在重新连接。';
    } finally {
      clearTimeout(timeout);
      if (active && epoch === version) pollTimer = setTimeout(() => poll(ref, version), 1500);
    }
  }
  function begin() {
    if (active) throw new Error('已有创作任务正在进行，请等待本次结果。');
    active = true; epoch++; started = performance.now(); reference = '';
    panel.hidden = false; panel.dataset.state = 'running';
    panel.classList.toggle('is-background', document.hidden);
    originalLabel = document.getElementById('generate-label').textContent;
    update({phase:'sources',completed:0,status:'running'});
    title.textContent = '正在检查创作需求…';
    detail.textContent = '进度按实际处理阶段更新，生成与看图核验可能需要几分钟。';
    locked = [...new Set(document.querySelectorAll('#task-form input, #task-form select, #task-form textarea, #task-form button, .mode-switch button, #new-task, #new-feature-task'))].map(node => ({node, disabled:node.disabled}));
    locked.forEach(({node}) => {node.disabled = true;});
    document.getElementById('task-form').setAttribute('aria-busy','true');
    elapsed(); timer = setInterval(elapsed, 1000);
    requestAnimationFrame(() => panel.scrollIntoView({block:'nearest',behavior:'instant'}));
  }
  async function connect() {
    const version = epoch;
    const result = await api('/api/progress', {});
    reference = result.progress_ref;
    if (active && epoch === version) poll(result.progress_ref, version);
    return result.progress_ref;
  }
  async function sync() {
    if (!reference || !active) return;
    const version = epoch;
    const aborter = new AbortController();
    const timeout = setTimeout(() => aborter.abort(), 2000);
    try {
      const response = await fetch('/api/progress/' + encodeURIComponent(reference), {signal:aborter.signal});
      if (response.ok) {
        const snapshot = await response.json();
        if (active && epoch === version) update(snapshot);
      }
    } catch {} finally {clearTimeout(timeout);}
  }
  function finish(status, message = '') {
    if (!active) return;
    active = false; epoch++;
    clearInterval(timer); clearTimeout(pollTimer); controller?.abort();
    panel.dataset.state = status;
    document.getElementById('task-form').removeAttribute('aria-busy');
    locked.forEach(({node,disabled}) => {node.disabled = disabled;}); locked = [];
    document.getElementById('generate-label').textContent = originalLabel;
    if (status === 'ready') update({phase:'review',completed:4,status:'ready'});
    steps.forEach(step => {step.removeAttribute('aria-current');step.classList.toggle('is-stopped',status!=='ready'&&step.dataset.phase===currentPhase);});
    title.textContent = {ready:'图文已生成并完成自动核验',blocked:'核验需要处理，任务已停止',needs_input:'需要补充资料，任务已暂停',error:'本次任务未完成'}[status] || '本次任务已结束';
    if (status === 'error') title.textContent = `${steps.find(step=>step.dataset.phase===currentPhase)?.textContent || '本次任务'}未完成`;
    document.getElementById('generate-label').textContent = originalLabel;
    detail.textContent = message || (status === 'ready' ? '可查看图文预览、资料依据与核验结果；发布前请人工复核。' : '请查看具体提示，处理后重新发起创作。');
    elapsed();
  }
  document.addEventListener('visibilitychange', () => panel.classList.toggle('is-background', document.hidden));
  document.getElementById('new-task').addEventListener('click', () => {if (!active) panel.hidden = true;});
  return {begin,connect,sync,finish,get running(){return active;}};
})();
