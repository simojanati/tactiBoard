
import { ROLE_LABELS, canAdmin, canEdit, firstAllowedPage, getUserContext, readCachedAuth, requireAuthForPage, signOut, supabase } from './auth.js';
import { applyTranslations, initI18n, setLanguage, t, getLanguage } from './i18n.js';

await initI18n();


const MENU_ITEMS = [
  { page: 'dashboard', href: 'index.html', icon: 'bx-home-circle', label: t('nav.dashboard') },
  { page: 'notifications', href: 'notifications.html', icon: 'bx-bell', label: t('nav.notifications') },
  { page: 'teams', href: 'teams.html', icon: 'bx-group', label: t('nav.teams') },
  { page: 'players', href: 'players.html', icon: 'bx-user', label: t('nav.players') },
  { page: 'player-links', href: 'player-links.html', icon: 'bx-link-alt', label: t('nav.player_links') },
  { page: 'my-team', href: 'my-team.html', icon: 'bx-shield-quarter', label: t('nav.my_team') },
  { page: 'my-tactics', href: 'my-tactics.html', icon: 'bx-notepad', label: t('nav.my_tactics') },
  { page: 'my-sessions', href: 'my-sessions.html', icon: 'bx-calendar', label: t('nav.my_sessions') },
  { page: 'my-matches', href: 'my-matches.html', icon: 'bx-trophy', label: t('nav.my_matches') },
  { page: 'my-quizzes', href: 'my-quizzes.html', icon: 'bx-help-circle', label: t('nav.my_quizzes') },
  { page: 'coaches', href: 'coaches.html', icon: 'bx-id-card', label: t('nav.coaches') },
  { page: 'tactics', href: 'tactics.html', icon: 'bx-notepad', label: t('nav.tactics') },
  { page: 'tactical-board', href: 'tactical-board.html', icon: 'bx-pen', label: t('nav.tactical_board') },
  { page: 'quizzes', href: 'quizzes.html', icon: 'bx-help-circle', label: t('nav.quizzes') },
  { page: 'sessions', href: 'sessions.html', icon: 'bx-calendar', label: t('nav.sessions') },
  { page: 'matches', href: 'matches.html', icon: 'bx-trophy', label: t('nav.matches') },
  { page: 'my-tickets', href: 'my-tickets.html', icon: 'bx-message-square-detail', label: t('nav.my_tickets') },
  { page: 'tickets', href: 'tickets.html', icon: 'bx-support', label: t('nav.tickets') },];

function normalizeMenu() {
  const menu = document.querySelector('.menu-inner');
  if (!menu) return;
  const itemsByHref = new Map([...menu.querySelectorAll('.menu-item > .menu-link[href]')].map(link => [link.getAttribute('href'), link.closest('.menu-item')]));
  MENU_ITEMS.forEach(item => {
    let li = itemsByHref.get(item.href);
    if (!li) {
      li = document.createElement('li');
      li.className = 'menu-item';
      itemsByHref.set(item.href, li);
    }
    li.innerHTML = `<a href="${item.href}" class="menu-link" data-menu-page="${item.page}"><i class="menu-icon tf-icons bx ${item.icon}"></i><div>${item.label}</div></a>`;
  });
  menu.innerHTML = '';
  MENU_ITEMS.forEach(item => {
    const li = itemsByHref.get(item.href);
    if (li) menu.appendChild(li);
  });
}



function updateMenuBadge(page, value) {
  const link = document.querySelector(`[data-menu-page="${page}"]`);
  if (!link) return;
  let badge = link.querySelector('.menu-badge');
  const count = Number(value || 0);
  if (!count) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'badge rounded-pill bg-danger ms-auto menu-badge';
    link.appendChild(badge);
  }
  badge.textContent = String(count);
  badge.title = window.t ? window.t('tickets.badge_open', 'Tickets ouverts') : 'Open tickets';
  badge.setAttribute('aria-label', badge.title);
}

async function refreshTicketMenuBadge(ctx) {
  try {
    if (ctx?.role !== 'admin') {
      updateMenuBadge('tickets', 0);
      return;
    }
    const { count, error } = await supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open');
    if (error) throw error;
    updateMenuBadge('tickets', count || 0);
  } catch (e) {
    console.warn('Ticket badge failed:', e);
  }
}
function hideMenuByRole(role) {

  
const rules = {
    'teams.html': ['admin'],
    'players.html': ['admin', 'coach'],
    'player-links.html': ['admin'],
    'coaches.html': ['admin'],
    'tactics.html': ['admin', 'coach'],
    'tactical-board.html': ['admin', 'coach'],
    'sessions.html': ['admin', 'coach'],
    'matches.html': ['admin', 'coach'],
    'my-team.html': ['player', 'coach'],
    'my-tactics.html': ['player'],
    'my-sessions.html': ['player'],
    'my-matches.html': ['player'],
    'quizzes.html': ['admin', 'coach'],
    'my-quizzes.html': ['player'],
    'take-quiz.html': ['player'],
    'notifications.html': ['admin', 'coach', 'player'],
    'my-tickets.html': ['coach', 'player'],
    'tickets.html': ['admin'],
    'ticket-detail.html': ['admin', 'coach', 'player'],
    'profile.html': ['admin', 'coach', 'player'],
    'index.html': ['admin', 'coach', 'player']
  };
  document.querySelectorAll('[data-menu-page]').forEach(link => {
    const href = link.getAttribute('href');
    const allowed = rules[href] || ['admin'];
    const item = link.closest('.menu-item');
    if (item) item.style.display = allowed.includes(role) ? '' : 'none';
  });
}


function injectLanguageSwitcher() {
  const navbar = document.getElementById('navbar-collapse');
  if (!navbar || document.getElementById('language-switcher')) return;
  const box = document.createElement('div');
  box.id = 'language-switcher';
  box.className = 'navbar-quick-action language-switcher-wrap';
  const current = getLanguage();
  box.innerHTML = `
    <label class="language-switcher-label" for="language-select">
      <i class="bx bx-globe"></i>
      <span class="d-none d-lg-inline">${t('lang.label')}</span>
    </label>
    <select id="language-select" class="form-select form-select-sm language-switcher-select" aria-label="${t('lang.label')}" title="${t('lang.label')}">
      <option value="fr" ${current==='fr'?'selected':''}>${t('lang.fr')}</option>
      <option value="en" ${current==='en'?'selected':''}>${t('lang.en')}</option>
    </select>`;
  box.querySelector('select')?.addEventListener('change', e => setLanguage(e.target.value));
  const userBox = document.getElementById('user-box');
  if (userBox) navbar.insertBefore(box, userBox); else navbar.appendChild(box);
}

function applyCrudVisibility(role) {
  const editable = canEdit(role);
  const admin = canAdmin(role);
  document.querySelectorAll('[data-auth="edit"]').forEach(el => el.style.display = editable ? '' : 'none');
  document.querySelectorAll('[data-auth="admin"]').forEach(el => el.style.display = admin ? '' : 'none');
  document.querySelectorAll('.edit-btn, .delete-btn, #toggle-form-btn, #form-panel, #edit-link').forEach(el => {
    if (!el) return;
    if (el.id === 'edit-link' || el.classList.contains('edit-btn') || el.classList.contains('delete-btn') || el.id === 'toggle-form-btn' || el.id === 'form-panel') {
      el.style.display = editable ? '' : 'none';
    }
  });
}


async function injectNotificationsBell(ctx) {
  const navbar = document.getElementById('navbar-collapse');
  if (!navbar || document.getElementById('notifications-bell')) return;
  let unreadCount = 0;
  try {
    const { count } = await (await import('./common.js')).supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', ctx.user?.id)
      .eq('is_read', false);
    unreadCount = count || 0;
  } catch {}
  const box = document.createElement('div');
  box.id = 'notifications-bell';
  box.className = 'navbar-quick-action ms-auto d-flex align-items-center gap-2';
  box.innerHTML = `<a class="btn btn-outline-secondary position-relative" href="notifications.html"><i class="bx bx-bell"></i>${unreadCount ? `<span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">${unreadCount}</span>` : ''}</a>`;
  const userBox = document.getElementById('user-box');
  if (userBox) navbar.insertBefore(box, userBox); else navbar.appendChild(box);
}

function injectUserBox(ctx) {
  const navbar = document.getElementById('navbar-collapse');
  if (!navbar || document.getElementById('user-box')) return;
  const host = document.createElement('div');
  host.id = 'user-box';
  host.className = 'ms-auto d-flex align-items-center gap-3';
  const avatar = ctx.profile?.avatar_url || readCachedAuth()?.avatar_url || '../assets/img/branding/avatar-placeholder.png';
  host.innerHTML = `
    <div class="text-end d-none d-md-block">
      <div class="fw-semibold">${ctx.fullName}</div>
      <small class="text-muted">${t(`role.${ctx.role}`, ROLE_LABELS[ctx.role] || ctx.role)}</small>
    </div>
    <div class="dropdown">
      <button class="btn btn-outline-primary dropdown-toggle userbox-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
        <img src="${avatar}" alt="${ctx.fullName}" class="userbox-avatar me-2">
        <span class="d-none d-sm-inline">${t('common.account')}</span>
      </button>
      <ul class="dropdown-menu dropdown-menu-end">
        <li><div class="dropdown-item-text fw-semibold">${ctx.fullName}</div></li>
        <li><span class="dropdown-item-text small text-muted">${ctx.user?.email || ''}</span></li>
        <li><hr class="dropdown-divider"></li>
        <li><a class="dropdown-item" href="profile.html"><i class="bx bx-user me-2"></i>${t('nav.profile')}</a></li>
        <li><a class="dropdown-item" href="${firstAllowedPage(ctx.role)}"><i class="bx bx-home me-2"></i>${t('common.home')}</a></li>
        <li><button class="dropdown-item" id="logout-btn" type="button"><i class="bx bx-log-out me-2"></i>${t('common.logout')}</button></li>
      </ul>
    </div>`;
  navbar.appendChild(host);
  host.querySelector('#logout-btn')?.addEventListener('click', signOut);
}


function syncNavbarPageTitle() {
  const navbarTitles = document.querySelectorAll('.navbar-page-title');
  if (!navbarTitles.length) return;
  const pageTitleEl = document.getElementById('page-title');
  const pickTitle = () => {
    if (pageTitleEl?.textContent?.trim()) return pageTitleEl.textContent.trim();
    const heading = document.querySelector('.container-xxl h4, .container-fluid h4, h4.fw-bold');
    if (heading?.textContent?.trim()) return heading.textContent.trim();
    const metaTitle = document.body?.dataset?.navTitle || document.title.split('|')[0].trim();
    return metaTitle || '';
  };
  const apply = () => {
    const value = pickTitle();
    navbarTitles.forEach(el => el.textContent = value);
  };
  apply();
  if (pageTitleEl && !pageTitleEl.dataset.navObserved) {
    const observer = new MutationObserver(apply);
    observer.observe(pageTitleEl, { childList: true, characterData: true, subtree: true });
    pageTitleEl.dataset.navObserved = '1';
  }
}

normalizeMenu();
syncNavbarPageTitle();

const cachedAuth = readCachedAuth();
if (cachedAuth?.role) {
  document.documentElement.dataset.userRole = cachedAuth.role;
  hideMenuByRole(cachedAuth.role);
  applyCrudVisibility(cachedAuth.role);
  document.documentElement.dataset.roleReady = '1';
}

(async () => {
  const ctx = await requireAuthForPage();
  if (!ctx) return;
  hideMenuByRole(ctx.role);
  await refreshTicketMenuBadge(ctx);
  applyCrudVisibility(ctx.role);
  await injectNotificationsBell(ctx);
  injectUserBox(ctx);
  injectLanguageSwitcher();
  applyTranslations();
  document.documentElement.dataset.userRole = ctx.role;
  document.documentElement.dataset.roleReady = '1';
  window.APP_USER = ctx;
  syncNavbarPageTitle();
})();

document.addEventListener('app:language-changed', () => { normalizeMenu(); hideMenuByRole(document.documentElement.dataset.userRole || readCachedAuth()?.role || 'player'); syncNavbarPageTitle(); applyTranslations(); });
