(() => {
  const shell = document.getElementById('studio-shell');
  const deck = document.getElementById('feature-deck');
  const panel = document.getElementById('feature-panel-heading');
  const empty = document.getElementById('feature-empty');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  // Crossfade into the final landscape rather than abruptly reframing the camera layers.
  const landscape=document.createElement('div');landscape.className='studio-landscape';landscape.setAttribute('aria-hidden','true');
  ['sky','glow','town'].forEach(kind=>{const img=document.createElement('img');img.src=document.querySelector('.portal-'+kind).src;img.alt='';img.className='landscape-'+kind;landscape.append(img);});
  document.querySelector('.portal-scene').insertBefore(landscape,document.querySelector('.portal-shade'));
  const icons = {
    task:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    strategy:'<path d="M12 3v6M5 21v-6h14v6M12 9v6"/><rect x="8" y="1" width="8" height="5" rx="1"/><path d="M2 21h6M9 21h6M16 21h6"/>',
    evidence:'<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><circle cx="14" cy="12" r="2"/><path d="m5 19 4-5 4 4 3-3 4 4"/>',
    preview:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12M13 13h4M13 17h4"/>',
    review:'<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6Z"/><path d="m8 12 3 3 5-6"/>',
    history:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/>',
    connection:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M14 6h3a1 1 0 0 1 1 1v4M6 14v3a1 1 0 0 0 1 1h4M13 3v6M10 15v6"/>'
  };
  const features = [
    {id:'task', label:'创作任务', en:'CREATE A BRIEF', text:'选定人群、场景与平台，写下这次创作的起点。', hint:'设置产品、人群与平台，开始一份图文任务。'},
    {id:'strategy', label:'内容策略', en:'FIND THE ANGLE', text:'围绕真实需求，找到产品与读者之间的切入点。', hint:'查看当前稿件的场景判断、卖点顺序与平台结构。'},
    {id:'evidence', label:'资料与配图', en:'GROUND IN FACTS', text:'查阅官网原文、v7 指导与产品图片，为每一句表达找到依据。', hint:'浏览知识库、筛选资料与配图，查看稿件依据。'},
    {id:'preview', label:'图文预览', en:'SHAPE THE STORY', text:'阅读图文、调整措辞，让内容成为你想说的样子。', hint:'预览当前图文，编辑文案并保存修改。'},
    {id:'review', label:'核验与导出', en:'REVIEW & EXPORT', text:'确认来源与表达，处理待复核项，再复制或导出。', hint:'查看核验结果，并按当前稿件状态复制或导出。'},
    {id:'history', label:'最近任务', en:'PICK UP THE THREAD', text:'找回浏览器中保存的演示任务，继续上一次创作。', hint:'查看并恢复保存在当前浏览器中的演示任务。'},
    {id:'connection', label:'连接与生图', en:'CONNECT THE SOURCE', text:'管理员配置团队生图服务，检查模型与知识库连接。', hint:'配置团队共用的 QwenImage，并检查知识库连接。'}
  ];
  const originalChangeView = changeView;
  const originalShowTab = showTab;
  const originalRenderSearch = renderSearch;
  let selected = null, routing = false;

  features.forEach((feature,index) => {
    const card=document.createElement('button');
    card.type='button'; card.className='feature-card';card.dataset.feature=feature.id;
    card.setAttribute('aria-pressed','false');card.setAttribute('aria-controls','feature-panel');
    card.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[feature.id]}</svg><strong>${feature.label}</strong><small>${feature.text}</small><span class="feature-current" aria-hidden="true"></span>`;
    card.addEventListener('click',()=>activate(feature.id));
    card.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      let next=event.key==='Home'?0:event.key==='End'?features.length-1:Math.max(0,Math.min(features.length-1,index+(event.key==='ArrowRight'?1:-1)));
      deck.children[next].focus({preventScroll:true});
      deck.children[next].scrollIntoView({behavior:reduce.matches?'instant':'smooth',inline:'nearest',block:'nearest'});
    });
    deck.append(card);
  });

  function syncExport(){
    document.getElementById('feature-copy').disabled=!state.current||document.getElementById('copy-article').disabled;
    document.getElementById('feature-export').disabled=!state.current||document.getElementById('export-md').disabled;
  }
  function showEmpty(feature){
    const evidence=feature.id==='evidence';
    empty.replaceChildren();
    const title=document.createElement('h3');
    title.textContent=evidence?'先找到资料，再组织表达。':feature.id==='review'?'有了稿件，再逐项核验。':feature.id==='strategy'?'先有需求，才有内容的方向。':'你的下一篇内容，从一个需求开始。';
    const note=document.createElement('p');
    note.textContent=evidence?'可以浏览 ima 知识库原文和图片。真实读取需要先完成本机连接配置；已有稿件时，这里也会显示其资料依据。':'还没有当前稿件。先在“创作任务”中填写需求并生成内容，再回到这里查看；也可以先使用演示预览体验流程。';
    const action=document.createElement('button');action.className='button primary';action.type='button';
    action.textContent=evidence?'浏览知识库目录':'填写创作需求';
    action.addEventListener('click',()=>evidence?browseDirectory():activate('task'));
    empty.append(title,note,action);
    if(evidence){const ai=document.createElement('button');ai.className='button secondary';ai.type='button';ai.textContent='创作 AI 场景图';ai.addEventListener('click',()=>window.openImageStudio());empty.append(ai);const config=document.createElement('button');config.className='text-button';config.textContent='检查连接设置';config.addEventListener('click',()=>activate('connection'));empty.append(config);}
  }
  function activate(id,{center=true}={}){
    const feature=features.find(f=>f.id===id);if(!feature)return;
    routing=true;
    try{
      const newlyOpened=!selected;
      selected=id;shell.dataset.feature=id;shell.classList.add('has-feature');
      const workspace=document.getElementById("feature-panel");workspace.inert=false;workspace.setAttribute("aria-hidden","false");
      document.getElementById('feature-panel-title').textContent=feature.label;
      document.getElementById('feature-panel-description').textContent=feature.hint;
      originalChangeView(id==='history'?'history':id==='connection'?'connection':'workspace');
      const hasResult=Boolean(state.current);
      const hasSearch=id==='evidence'&&Boolean(listingState||retrievalContext);
      shell.dataset.empty=String(!hasResult&&!hasSearch);
      if(!['task','history','connection'].includes(id)){
        if(hasResult){document.getElementById('result-content').hidden=false;document.getElementById('search-content').hidden=true;originalShowTab(id);}
        else if(hasSearch){document.getElementById('result-content').hidden=true;document.getElementById('search-content').hidden=false;}
        else showEmpty(feature);
      }
      [...deck.children].forEach(card=>card.setAttribute('aria-pressed',String(card.dataset.feature===id)));
      if(center)deck.querySelector(`[data-feature="${id}"]`).scrollIntoView({behavior:reduce.matches?'instant':'smooth',inline:'nearest',block:'nearest'});
      document.querySelectorAll('.main>.view').forEach(view=>{view.scrollTop=0;});
      syncExport();
      if(newlyOpened){const heading=document.getElementById("feature-panel-title");heading.tabIndex=-1;heading.focus({preventScroll:true});}
    }finally{routing=false;}
  }
  function closePanel(focus=true){
    const last=selected;selected=null;shell.classList.remove('has-feature');delete shell.dataset.feature;
    document.getElementById("feature-panel").inert=true;document.getElementById("feature-panel").setAttribute("aria-hidden","true");
    [...deck.children].forEach(card=>card.setAttribute('aria-pressed','false'));
    if(focus&&last)deck.querySelector(`[data-feature="${last}"]`).focus({preventScroll:true});
  }
  document.getElementById("feature-panel").inert=true;
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&selected){event.preventDefault();closePanel();}});
  // Adapt existing business flows to the new navigation without recreating data or requests.
  changeView=function(view){
    if(routing)return originalChangeView(view);
    activate(view==='workspace'?(state.current?state.tab:'task'):view);
  };
  showTab=function(name){
    const result=originalShowTab(name);
    if(!routing&&state.current)activate(name,{center:true});
    return result;
  };
  renderSearch=function(...args){const result=originalRenderSearch(...args);activate('evidence');return result;};
  if(typeof showRetrieved==='function'){
    const originalShowRetrieved=showRetrieved;
    showRetrieved=function(...args){const result=originalShowRetrieved(...args);activate('evidence');return result;};
  }
  document.getElementById('close-feature').addEventListener('click',()=>closePanel());
  document.getElementById('new-feature-task').addEventListener('click',()=>{document.getElementById('new-task').click();activate('task');});
  document.getElementById('feature-copy').addEventListener('click',()=>document.getElementById('copy-article').click());
  document.getElementById('feature-export').addEventListener('click',()=>document.getElementById('export-md').click());
  document.querySelectorAll('[data-open-feature]').forEach(button=>button.addEventListener('click',()=>activate(button.dataset.openFeature)));
  document.getElementById('replay-portal').addEventListener('click',()=>closePanel(false));
  document.getElementById('new-task').addEventListener('click',()=>activate('task'));

  function updateDeck(){
    const atStart=deck.scrollLeft<3,atEnd=deck.scrollLeft+deck.clientWidth>=deck.scrollWidth-3;
    document.getElementById('deck-prev').disabled=atStart;document.getElementById('deck-next').disabled=atEnd;
    const first=deck.children[0],pitch=first.getBoundingClientRect().width+parseFloat(getComputedStyle(deck).gap);
    document.getElementById('deck-position').textContent=`${Math.min(7,Math.floor(deck.scrollLeft/pitch)+1)} / ${features.length}`;
  }
  deck.addEventListener('scroll',updateDeck,{passive:true});
  deck.addEventListener('wheel',event=>{
    if(event.ctrlKey||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
    event.preventDefault();
    const delta=event.deltaY*(event.deltaMode===1?24:event.deltaMode===2?deck.clientWidth:1);
    deck.scrollLeft+=delta;
  },{passive:false});
  ['prev','next'].forEach(direction=>document.getElementById('deck-'+direction).addEventListener('click',()=>deck.scrollBy({left:(direction==='next'?1:-1)*(deck.children[0].getBoundingClientRect().width+16),behavior:reduce.matches?'instant':'smooth'})));
  new ResizeObserver(updateDeck).observe(deck);updateDeck();
})();
