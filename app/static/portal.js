(() => {
  const portal = document.getElementById('portal');
  const studio = document.getElementById('studio-shell');
  const enter = document.getElementById('enter-portal');
  const skip = document.getElementById('skip-portal');
  const status = document.getElementById('portal-status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finalFrame = .58;
  let busy = false, active = false, frame;
  const revealStudio = immediate => {
    studio.hidden = false;
    studio.inert = true;
    studio.classList.toggle('instant-arrival', immediate);
    studio.classList.add('studio-arriving');
    portal.classList.add('as-background');
    document.body.classList.add('studio-active');
    document.body.classList.remove('portal-active');
    requestAnimationFrame(() => studio.classList.add('studio-visible'));
  };
  const ready = () => {
    active = true; busy = false;
    cancelAnimationFrame(frame);
    portal.style.setProperty('--p', finalFrame);
    portal.style.setProperty('--px', '0px'); portal.style.setProperty('--py', '0px');
    portal.inert = true; portal.setAttribute('aria-hidden', 'true');
    revealStudio(reduced.matches);
    studio.inert = false;
    history.replaceState(null, '', location.pathname + location.search);
    document.querySelector('.feature-card')?.focus({preventScroll:true});
  };
  const launch = () => {
    if (busy || active) return;
    busy = true; enter.disabled = true;
    status.textContent = '正在进入创作空间…';
    if (reduced.matches) { ready(); return; }
    portal.classList.add('travelling');
    let start;
    const move = now => {
      start ??= now;
      const t = Math.min((now - start) / 2400, 1);
      const eased = 1 - Math.pow(1-t, 3);
      portal.style.setProperty('--p', (finalFrame * eased).toFixed(5));
      if (t > .68 && studio.hidden) revealStudio(false);
      if (t < 1) frame = requestAnimationFrame(move); else ready();
    };
    frame = requestAnimationFrame(move);
  };
  const showCover = () => {
    cancelAnimationFrame(frame);
    active = false; busy = false; enter.disabled = false;
    studio.hidden = true; studio.inert = true;
    studio.classList.remove('studio-arriving', 'studio-visible', 'instant-arrival');
    portal.inert = false; portal.removeAttribute('aria-hidden');
    portal.classList.remove('as-background','travelling');
    portal.style.setProperty('--p', 0);
    document.body.classList.remove('studio-active');
    document.body.classList.add('portal-active');
    history.replaceState(null, '', location.pathname + location.search);
    window.scrollTo(0,0);
    enter.focus({preventScroll:true});
    status.textContent = '点击进入华为 PC 营销智能体';
  };
  enter.addEventListener('click', launch);
  skip.addEventListener('click', ready);
  document.getElementById('replay-portal').addEventListener('click', showCover);
  portal.addEventListener('pointermove', event => {
    if (reduced.matches || busy || active) return;
    portal.style.setProperty('--px', `${(event.clientX/innerWidth-.5)*18}px`);
    portal.style.setProperty('--py', `${(event.clientY/innerHeight-.5)*8}px`);
  }, {passive:true});
  let failed = 0;
  portal.querySelectorAll('img').forEach(img => img.addEventListener('error', () => {
    failed++;
    if (failed >= 2) status.textContent = '场景图片加载受限，可直接进入工作台';
  }));
  // A legacy link must not bypass the user's choice to enter.
  if (location.hash === '#studio') {
    history.replaceState(null, '', location.pathname + location.search);
  }
})();
