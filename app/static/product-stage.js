/* Product presentation uses backend-issued references, never client-supplied URLs. */
const productStage = (() => {
  const stage = document.getElementById('product-stage');
  let current = null, currentKey = null, requestVersion = 0, preparedAt = 0;
  const taskKey=task=>JSON.stringify([task.product,task.platform,task.audience,task.scenario]);
  const sourceSelect = document.getElementById('creative-source');
  const form = document.getElementById('task-form');
  const preview = document.createElement('button');
  preview.type='button'; preview.className='official-preview-button'; preview.textContent='读取官网介绍与图片';
  preview.addEventListener('click',()=>withBusy(preview, async()=>{
    try { await prepare(taskFromForm()); } catch(error) { progress(error.message,true); throw error; }
  }));
  sourceSelect.parentElement.append(preview);
  function syncMode(){
    sourceSelect.parentElement.hidden=state.mode!=='live';
    if(state.mode!=='live')stage.hidden=true;
    document.getElementById('mode-note').textContent=state.mode==='live' ? (sourceSelect.value==='official'?'自动读取对应型号的华为官网原文与图片，结合本地 v7 指导生成广告。':'先选择原文和同型号图片，再结合本地 v7 指导生成广告。') : '演示排版，不调用真实产品资料或模型。';
    if(state.mode==='live')document.getElementById('generate-label').textContent=sourceSelect.value==='official'?'读取官网并创作广告':'检索资料并创作';
  }
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',syncMode));
  sourceSelect.addEventListener('change',syncMode);syncMode();
  document.getElementById('product').addEventListener('input',()=>{current=null;requestVersion++;stage.hidden=true;});
  function progress(message,error=false){
    const node=stage.querySelector('.product-progress');
    if(node){node.textContent=message;node.setAttribute('role',error?'alert':'status');node.classList.toggle('is-error',error);}
  }
  function metadata(data,container){
    const details=document.createElement('details');details.className='product-guidance';
    const summary=document.createElement('summary');summary.textContent=data.status==='ready'?`本地 v7 创作指导 · ${data.documents.length} 份`:'本地 v7 创作指导尚未配置';details.append(summary);
    const note=element('p','',data.note||'案例用于结构参考，产品事实以本次原文为准。');details.append(note);
    const list=document.createElement('ul');
    data.documents.forEach(d=>list.append(element('li','',d.title)));details.append(list);container.append(details);
  }
  async function prepare(task){
    const version=++requestVersion;const key=taskKey(task);
    stage.hidden=false;const loadingTitle=element('h3','','正在读取官网产品资料…');loadingTitle.id='product-stage-title';stage.replaceChildren(loadingTitle,element('p','product-progress','连接华为官网，读取原文与对应图片。'));
    stage.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    const data=await api('/api/official/prepare',{task});
    if(version!==requestVersion || key!==taskKey(taskFromForm()))throw new Error("需求已变化，请重新读取当前型号资料。");
    current=data;currentKey=key;preparedAt=Date.now();stage.replaceChildren();
    const header=element('div','product-stage-heading');
    const title=element('h3','',data.product);title.id='product-stage-title';
    const link=element('a','','查看官网原页 ↗');link.href=data.url;link.target='_blank';link.rel='noopener noreferrer';header.append(title,link);
    const figure=element('figure','product-hero');
    const hero=element('img');hero.src=data.images[0].src;hero.alt=data.images[0].name;
    const imageError=element('p','product-image-error','这张图片暂时无法显示，请点击其他缩略图或重新读取官网资料。');imageError.hidden=true;imageError.setAttribute('role','status');
    hero.addEventListener('load',()=>{hero.hidden=false;imageError.hidden=true;figure.classList.add('is-loaded');});
    hero.addEventListener('error',()=>{hero.hidden=true;imageError.hidden=false;figure.classList.remove('is-loaded');});
    figure.append(hero,imageError,element('figcaption','','华为官网产品图片 · '+new Date(data.retrieved_at).toLocaleString('zh-CN')));
    const thumbs=element('div','product-thumbs');thumbs.setAttribute('role','group');thumbs.setAttribute('aria-label','选择产品展示图片');
    data.images.forEach((img,index)=>{const button=element('button');button.type='button';button.setAttribute('aria-label','查看官网产品图片 '+(index+1));button.setAttribute('aria-pressed',String(index===0));const thumb=element('img');thumb.src=img.src;thumb.alt='';button.append(thumb);button.addEventListener('click',()=>{imageError.hidden=true;hero.hidden=false;hero.src=img.src;hero.alt=img.name;[...thumbs.children].forEach(b=>b.setAttribute('aria-pressed',String(b===button)));});thumbs.append(button);});
    const intro=element('blockquote','product-intro',data.intro);
    const original=element('details','product-original');const summary=element('summary','','官网原文 · 保留说明与限制条件');original.append(summary,element('pre','',data.original_text));
    stage.append(header,figure,thumbs,element('p','source-caption','官网介绍原文'),intro,original);
    metadata(data.guidance,stage);
    stage.append(element('p','product-progress','产品资料已就绪；点击“读取官网并创作广告”生成文案。'));
    const next=element('button','official-preview-button','使用这些资料创作广告');next.type='button';next.addEventListener('click',()=>createLive(next));stage.append(next);
    return data;
  }
  function appendSources(result){
    const evidence=document.getElementById('evidence-tab');
    if(result.guidance)metadata(result.guidance,evidence);
    if(result.data_source?.mode==='official'){
      const sources=element('section','official-originals');sources.append(element('h3','','官网来源链接'));
      result.evidence.sources.filter(s=>s.url).forEach(source=>{const a=element('a','',source.title);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';sources.append(a);});evidence.append(sources);
    }
  }
  fetch('/api/status').then(r=>r.json()).then(data=>{const list=document.getElementById('official-product-list');(data.official_products||[]).forEach(name=>{const o=document.createElement('option');o.value=name;list.append(o);});}).catch(()=>{});
  return {prepare:async task=>{
    if(current&&currentKey===taskKey(task)&&Date.now()-preparedAt<45*60*1000){stage.hidden=false;return current;}
    return prepare(task);
  },progress,appendSources};
})();
