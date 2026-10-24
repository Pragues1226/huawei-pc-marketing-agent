"use strict";
(() => {
  const find = id => document.getElementById(id);
  let current = null;
  const notify = (message, error = false) => {
    const target = find('image-feedback');
    target.hidden = false; target.textContent = message; target.dataset.error = String(error);
  };
  async function refresh() {
    try {
      current = await api('/api/images/status');
      const admin = current.role === 'admin', loggedIn = current.role !== 'guest';
      find('image-config-state').textContent = current.configured ? 'Key 已配置 · 尚需实际生图验证' : '等待管理员配置';
      find('image-setup-form').hidden = current.initialized || !current.setup_available;
      find('image-setup-token-field').hidden = !current.setup_token_required;
      find('image-setup-token').required = Boolean(current.setup_token_required);
      find('image-login-form').hidden = !current.initialized || loggedIn;
      find('image-session-controls').hidden = !loggedIn;
      find('image-session-role').textContent = admin ? '管理员已登录 · 配置供团队共用' : '团队成员已登录';
      find('image-settings-form').hidden = !admin;
      find('image-generate-form').hidden = !loggedIn;
      const textModel = current.text_model;
      find('text-model-section').hidden = !current.initialized;
      find('text-model-form').hidden = !admin;
      find('text-model-state').textContent = !textModel.configured ? '尚未配置' : textModel.vision_verified ? '看图与 JSON 已验证' : '已配置 · 待验证';
      find('text-model-name').replaceChildren(...textModel.models.map(value => {
        const option = document.createElement('option'); option.value = value; option.textContent = value; return option;
      }));
      find('text-model-name').value = textModel.model || 'qwen3-vl-plus';
      find('text-model-save').disabled = !current.key_configured;
      find('text-model-probe').disabled = !textModel.configured || textModel.key_source !== 'shared_bailian';
      find('image-api-key').value = '';
      find('image-api-key').type = 'password';
      find('image-toggle-key').textContent = '显示';
      find('image-toggle-key').setAttribute('aria-pressed', 'false');
      find('image-api-key').placeholder = current.key_configured ? '已保存；留空保留原 Key' : '粘贴完整 Key';
      find('image-key-hint').textContent = current.key_configured ? 'Key 已保存在后端，不回显完整内容。需要更换时粘贴新 Key。' : '仅在这里填写。Key 不会写入浏览器历史或本地存储。';
      find('image-base-url').value = current.base_url;
      find('image-model').replaceChildren(...current.models.map(value => {
        const option = document.createElement('option'); option.value = value; option.textContent = value; return option;
      }));
      find('image-model').value = current.model;
      find('image-clear-key').disabled = !current.key_configured;
      find('image-generate').disabled = !current.configured;
      find('image-generate-hint').textContent = current.configured ? '每次生成 1 张。请等待本次结果；图片用于场景示意，需人工检查。' : '请管理员先保存生图配置。';
      if (!current.initialized && !current.setup_available) notify('请管理员在服务器本机初始化，或通过部署平台设置初始化码。');
    } catch (error) { notify(error.message, true); }
  }
  async function perform(button, action, message) {
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    const original = button.textContent; button.textContent = message;
    try { await action(); }
    catch (error) { notify(error.message || '操作未完成，请稍后重试。', true); }
    finally {
      button.textContent = original; button.removeAttribute('aria-busy');
      const disabled = {'image-generate': !current?.configured, 'image-clear-key': !current?.key_configured, 'text-model-save': !current?.key_configured, 'text-model-probe': !current?.text_model?.configured || current?.text_model?.key_source !== 'shared_bailian'};
      button.disabled = Boolean(disabled[button.id]);
    }
  }
  find('image-setup-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (find('image-admin-password').value !== find('image-admin-confirm').value) { notify('两次管理员密码不一致，请重新确认。', true); return; }
    perform(form.querySelector('button[type=submit]'), async () => {
      await api('/api/images/setup', {admin_password: find('image-admin-password').value, team_password: find('image-team-password').value, setup_token: find('image-setup-token').value});
      form.reset(); await refresh(); notify('管理员已创建。现在可以填写 Key，团队成员使用你设置的访问码登录。');
    }, '正在创建…');
  });
  find('image-login-form').addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget;
    perform(form.querySelector('button[type=submit]'), async () => {
      await api('/api/images/login', {role: find('image-login-role').value, password: find('image-login-password').value});
      find('image-login-password').value = ''; await refresh(); notify('登录成功。');
    }, '正在登录…');
  });
  find('image-logout').addEventListener('click', event => perform(event.currentTarget, async () => {
    await api('/api/images/logout', {}); find('image-result').hidden = true;
    find('image-result-preview').removeAttribute('src'); find('image-download').removeAttribute('href');
    await refresh(); notify('已退出生图服务。');
  }, '正在退出…'));
  find('image-toggle-key').addEventListener('click', event => {
    const visible = find('image-api-key').type === 'password'; find('image-api-key').type = visible ? 'text' : 'password';
    event.currentTarget.textContent = visible ? '隐藏' : '显示'; event.currentTarget.setAttribute('aria-pressed', String(visible));
  });
  find('image-settings-form').addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget;
    perform(form.querySelector('button[type=submit]'), async () => {
      try {
        const result = await api('/api/images/settings', {api_key: find('image-api-key').value.trim(), model: find('image-model').value, base_url: find('image-base-url').value.trim()});
        await refresh(); await refreshStatus(); notify(result.note);
      } finally { find('image-api-key').value = ''; }
    }, '正在保存…');
  });
  find('text-model-form').addEventListener('submit', event => {
    event.preventDefault();
    perform(find('text-model-save'), async () => {
      const result = await api('/api/images/text-model/settings', {model: find('text-model-name').value});
      await refresh(); await refreshStatus(); notify(result.note);
    }, '正在保存…');
  });
  find('text-model-probe').addEventListener('click', event => perform(event.currentTarget, async () => {
    notify('正在验证文案模型的看图能力与 JSON 输出，请稍候…');
    const result = await api('/api/images/text-model/probe', {});
    await refresh(); await refreshStatus(); notify(result.note);
  }, '正在验证…'));
  find('image-clear-key').addEventListener('click', event => {
    if (!window.confirm('清除后团队场景生图与复用该 Key 的文案生成将暂停，之后可以重新填写 Key。继续清除？')) return;
    perform(event.currentTarget, async () => { const result = await api('/api/images/clear', {}); await refresh(); await refreshStatus(); notify(result.note); }, '正在清除…');
  });
  find('image-use-task').addEventListener('click', () => {
    const audience = document.getElementById('audience')?.value.trim() || '目标读者';
    const scenario = document.getElementById('scenario')?.value.trim() || '明亮自然的学习或办公空间';
    find('image-prompt').value = `为${audience}创作一张场景背景，场景是：${scenario}。自然光，真实摄影感，构图简洁，保留标题和产品的排版空间。不出现电脑、品牌 Logo、型号、参数或促销承诺。`;
    find('image-prompt').focus();
  });
  find('image-generate-form').addEventListener('submit', event => {
    event.preventDefault();
    perform(find('image-generate'), async () => {
      notify('正在生成 1 张场景图，请等待本次结果。切换页面不会自动发起新的生图请求。');
      const result = await api('/api/images/generate', {prompt: find('image-prompt').value.trim(), size: find('image-size').value});
      if (!/^\/api\/images\/asset\/[A-Za-z0-9_-]+$/.test(result.asset_url)) throw new Error('图片预览地址不正确，请重试。');
      find('image-result-preview').src = result.asset_url; find('image-download').href = result.asset_url;
      find('image-result-note').textContent = result.notice + ' ' + result.note;
      find('image-result').hidden = false; find('image-config-state').textContent = '本次生图成功';
      notify('场景图已生成，请检查画面并下载。');
    }, '正在生成，请稍候…');
  });
  find('image-result-preview').addEventListener('error', () => notify('图片预览不可用或已过期。请重新登录，或使用此前下载的图片。', true));
  document.addEventListener('click', event => {
    if (event.target.closest('[data-open-feature="connection"], [data-feature="connection"], #refresh-status')) refresh();
  });
  window.openImageStudio = () => {
    changeView('connection'); refresh();
    requestAnimationFrame(() => find('qwen-studio').scrollIntoView({block: 'start', behavior: 'instant'}));
  };
  refresh();
})();
