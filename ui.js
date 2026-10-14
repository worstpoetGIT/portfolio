import { CARDS, TECH } from './content.js';

function techHTML() {
  return TECH.map(([f, name]) => `<span class="ti${f === 'matplotlib' ? ' wide' : ''}" style="--icon:url('assets/icons/stack/${f}.svg')" role="img" aria-label="${name}" title="${name}"></span>`).join('');
}

// Address is assembled at runtime so it isn't sitting in the HTML for scrapers.
function mailAddr() { return ['srikartadepalli96', 'icloud.com'].join('@'); }

function fillMail(root) {
  root.querySelectorAll('[data-mail-text]').forEach((n) => { n.textContent = mailAddr(); });
}

function bodyHTML(c) {
  const avatar = c.id === 'who' ? '<img class="avatar" src="assets/img/avatar.jpg" alt="Srikar Tadepalli">' : '';
  return avatar + c.body.replace('__TECH__', techHTML());
}

export function initUI({ onOpen = () => {}, onClose = () => {} } = {}) {
  const detail = document.getElementById('detail');
  const sheet = detail.querySelector('.detail-sheet');
  const closeBtn = detail.querySelector('.detail-close');
  const access = document.getElementById('access');
  let lastFocus = null;
  let openIndex = -1;

  function openDetail(i) {
    const c = CARDS[i];
    if (!c) return;
    openIndex = i;
    lastFocus = document.activeElement;
    sheet.style.setProperty('--c', c.color);
    sheet.style.setProperty('--t', c.titleColor);
    detail.querySelector('.detail-num').textContent = `${c.n} / 06`;
    detail.querySelector('#detail-title').textContent = c.title;
    const body = detail.querySelector('.detail-body');
    body.innerHTML = bodyHTML(c);
    fillMail(body);
    detail.querySelector('.detail-scroll').scrollTop = 0;
    detail.classList.add('open');
    detail.setAttribute('aria-hidden', 'false');
    document.body.classList.add('detail-open');
    setTimeout(() => closeBtn.focus({ preventScroll: true }), 60);
    onOpen(i);
  }
  function closeDetail() {
    if (openIndex < 0) return;
    const was = openIndex;
    openIndex = -1;
    detail.classList.remove('open');
    detail.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('detail-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    onClose(was);
  }
  closeBtn.addEventListener('click', closeDetail);
  detail.addEventListener('click', (e) => { if (e.target === detail) closeDetail(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });

  document.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mail]');
    if (!m) return;
    e.preventDefault();
    location.href = 'mailto:' + mailAddr() + '?subject=' + encodeURIComponent('Hello Srikar');
  });

  // Keyboard / screen-reader access to the orbiting cards
  const accessBtns = CARDS.filter((c) => c.id !== 'why').map((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c.title;
    b.tabIndex = -1;
    b.addEventListener('click', () => openDetail(i));
    access.appendChild(b);
    return b;
  });
  function setAccess(on) { accessBtns.forEach((b) => { b.tabIndex = on ? 0 : -1; }); }

  // Finale card content (shares markup with the sheet)
  const fin = document.querySelector('#finale .fin-body');
  if (fin) { fin.innerHTML = bodyHTML(CARDS[5]); fillMail(fin); }

  function buildFallback() {
    const root = document.getElementById('fallback');
    const list = root.querySelector('.fb-list');
    CARDS.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fb-card';
      b.style.setProperty('--c', c.color);
      b.style.setProperty('--t', c.titleColor);
      b.innerHTML = `<span>${c.n}</span><strong>${c.title}</strong>`;
      b.addEventListener('click', () => openDetail(i));
      list.appendChild(b);
    });
    root.hidden = false;
  }

  return { openDetail, closeDetail, isOpen: () => openIndex >= 0, setAccess, buildFallback };
}
