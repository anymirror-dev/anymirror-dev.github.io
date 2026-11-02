// Copy buttons, tabs and the menu: the page works without them, so each
// control starts hidden and shows once its script is here.

const COPY_ICON_DONE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

function setUpCopy(button) {
  const box = button.parentElement;
  const target = box.querySelector('[data-copy-text]') ?? box.querySelector('pre');
  const idle = button.innerHTML;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(target.textContent);
    } catch {
      return; // no clipboard access: the text stays selectable
    }
    button.classList.add('done');
    button.innerHTML = COPY_ICON_DONE;
    setTimeout(() => {
      button.classList.remove('done');
      button.innerHTML = idle;
    }, 1500);
  });
}

function setUpTabs(root) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    for (const other of tabs) {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
      document.getElementById(other.getAttribute('aria-controls')).hidden = !selected;
    }
  };
  root.querySelector('[role="tablist"]').hidden = false;
  select(tabs[0]);
  for (const [i, tab] of tabs.entries()) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (step === undefined) return;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  }
}

function setUpMenu(toggle) {
  const links = document.getElementById(toggle.getAttribute('aria-controls'));
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    links.classList.toggle('open', open);
  });
}

if (navigator.clipboard) document.querySelectorAll('button.copy').forEach(setUpCopy);
document.querySelectorAll('[data-tabs]').forEach(setUpTabs);
document.querySelectorAll('.nav-toggle').forEach(setUpMenu);
