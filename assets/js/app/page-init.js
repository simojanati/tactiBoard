
import { ROLE_LABELS, canAdmin, canEdit, firstAllowedPage, getUserContext, readCachedAuth, requireAuthForPage, signOut, supabase } from './auth.js';
import { applyTranslations, initI18n, setLanguage, t, getLanguage } from './i18n.js';
import { escapeHtml, getThemeMode, setThemeMode } from './common.js';
import { injectNavbarInstallButton, initPwaUi, registerServiceWorker } from './pwa.js';

await initI18n();


const MENU_ITEMS = [
  { page: 'dashboard', href: 'index.html', icon: 'bx-home-circle', label: t('nav.dashboard') },
  { page: 'notifications', href: 'notifications.html', icon: 'bx-bell', label: t('nav.notifications') },
  { page: 'teams', href: 'teams.html', icon: 'bx-group', label: t('nav.teams') },
  { page: 'field-templates', href: 'field-templates.html', icon: 'bx-landscape', label: t('nav.field_templates', 'Templates terrain') },
  { page: 'players', href: 'players.html', icon: 'bx-user', label: t('nav.players') },
  { page: 'player-links', href: 'player-links.html', icon: 'bx-link-alt', label: t('nav.player_links') },
  { page: 'users', href: 'users.html', icon: 'bx-user-check', label: t('nav.users') },
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




function applyStoredActiveMenu() {
  const activePage = window.__activeMenuPage;
  if (!activePage) return;
  document.querySelectorAll('[data-menu-page]').forEach(link => {
    const item = link.closest('.menu-item');
    if (!item) return;
    item.classList.toggle('active', link.dataset.menuPage === activePage);
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
    'field-templates.html': ['admin'],
    'players.html': ['admin', 'coach'],
    'player-links.html': ['admin'],
    'users.html': ['admin'],
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



function protectPlayerMedia(scope = document) {
  if ((document.documentElement.dataset.userRole || '').toLowerCase() !== 'player') return;
  scope.querySelectorAll('video').forEach(video => {
    video.setAttribute('controlsList', 'nodownload noremoteplayback');
    video.setAttribute('disablePictureInPicture', 'true');
    video.setAttribute('oncontextmenu', 'return false;');
    video.setAttribute('playsinline', 'true');
    video.addEventListener('contextmenu', e => e.preventDefault());
    video.addEventListener('dragstart', e => e.preventDefault());
  });
  scope.querySelectorAll('img').forEach(img => {
    img.setAttribute('draggable', 'false');
    img.setAttribute('oncontextmenu', 'return false;');
    img.addEventListener('contextmenu', e => e.preventDefault());
    img.addEventListener('dragstart', e => e.preventDefault());
  });
  scope.querySelectorAll('a[target="_blank"], a[href]').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (!href || href.startsWith('javascript:')) return;
    const isImageOrVideo = /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov)(\?|#|$)/i.test(href);
    const isPublicStorageMedia = /\/storage\/v1\/object\/public\//i.test(href) && /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov)(\?|#|$)/i.test(href);
    const mediaLike = isImageOrVideo || isPublicStorageMedia;
    if (!mediaLike) return;
    link.dataset.originalHref = href;
    link.removeAttribute('href');
    link.removeAttribute('target');
    link.classList.add('disabled');
    link.setAttribute('aria-disabled', 'true');
    link.addEventListener('click', e => e.preventDefault());
  });
}

function watchPlayerMediaProtection() {
  if ((document.documentElement.dataset.userRole || '').toLowerCase() !== 'player') return;
  protectPlayerMedia(document);
  if (document.body?.dataset?.playerMediaProtected === '1') return;
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node instanceof Element) protectPlayerMedia(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.body.dataset.playerMediaProtected = '1';
}


function isSidebarCollapsed() {
  return localStorage.getItem('tactiboard_sidebar_collapsed') === '1';
}

function applySidebarCollapsedState(collapsed) {
  if (window.Helpers?.isSmallScreen?.()) return;
  const root = document.documentElement;
  const menu = document.getElementById('layout-menu');
  const wrapper = document.querySelector('.layout-page');
  root.classList.toggle('layout-menu-collapsed', collapsed);
  root.classList.remove('layout-menu-hover');
  menu?.classList.toggle('menu-collapsed', collapsed);
  wrapper?.classList.toggle('sidebar-is-collapsed', collapsed);
  try {
    window.Helpers?._unbindMenuMouseEvents?.();
    window.Helpers?._setMenuHoverState?.(false);
    if (collapsed) {
      window.Helpers?.setCollapsed?.(true, true);
    } else {
      window.Helpers?.setCollapsed?.(false, true);
    }
  } catch (e) {}
  window.dispatchEvent(new Event('resize'));
  const btn = document.getElementById('sidebar-collapse-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
    btn.title = collapsed ? t('nav.expand_menu', 'Agrandir le menu') : t('nav.collapse_menu', 'Réduire le menu');
    btn.classList.toggle('is-collapsed', collapsed);
    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = `bx ${collapsed ? 'bx-chevrons-right' : 'bx-chevrons-left'}`;
    }
  }
}

function injectSidebarCollapseToggle() {
  const brand = document.querySelector('#layout-menu .app-brand') || document.getElementById('layout-menu');
  if (!brand || document.getElementById('sidebar-collapse-toggle') || window.Helpers?.isSmallScreen?.()) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'sidebar-collapse-toggle';
  btn.className = 'd-none d-xl-inline-flex align-items-center justify-content-center';
  btn.setAttribute('aria-label', t('nav.collapse_menu', 'Réduire le menu'));
  btn.innerHTML = '<i class="bx bx-chevrons-left"></i>';
  btn.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const current = document.documentElement.classList.contains('layout-menu-collapsed') || isSidebarCollapsed();
    const next = !current;
    localStorage.setItem('tactiboard_sidebar_collapsed', next ? '1' : '0');
    applySidebarCollapsedState(next);
  });
  const mobileToggle = brand.querySelector('.layout-menu-toggle');
  if (mobileToggle) {
    brand.insertBefore(btn, mobileToggle);
  } else {
    brand.appendChild(btn);
  }
  applySidebarCollapsedState(isSidebarCollapsed());
}

function lockCollapsedMenuHover() {
  const menu = document.getElementById('layout-menu');
  if (!menu || menu.dataset.collapseHoverLock === '1') return;
  const clearHoverState = () => {
    if (!isSidebarCollapsed()) return;
    document.documentElement.classList.remove('layout-menu-hover');
    try {
      window.Helpers?._setMenuHoverState?.(false);
    } catch (e) {}
  };
  ['mouseenter', 'mousemove', 'mouseover'].forEach(eventName => {
    menu.addEventListener(eventName, clearHoverState, true);
  });
  menu.dataset.collapseHoverLock = '1';
}

function refreshFooterBranding() {
  const year = new Date().getFullYear();
  const appName = window.APP_CONFIG?.projectName || 'TactiBoard';
  document.querySelectorAll('.content-footer').forEach(footer => {
    footer.innerHTML = `
      <div class="container-xxl d-flex flex-wrap justify-content-center py-3 flex-md-row flex-column text-center">
        <div class="mb-0 text-muted">© ${year} ${escapeHtml(appName)}. All rights reserved.</div>
      </div>`;
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


function injectThemeSwitcher() {
  const navbar = document.getElementById('navbar-collapse');
  if (!navbar || document.getElementById('theme-switcher')) return;
  const wrap = document.createElement('div');
  wrap.id = 'theme-switcher';
  wrap.className = 'navbar-quick-action theme-switcher-wrap';
  const render = () => {
    const mode = getThemeMode();
    const isDark = mode === 'dark';
    const title = escapeHtml(isDark ? t('theme.switch_to_light', 'Passer au mode clair') : t('theme.switch_to_dark', 'Passer au mode sombre'));
    wrap.innerHTML = `<button type="button" class="btn btn-outline-secondary theme-switcher-btn" aria-pressed="${isDark ? 'true' : 'false'}" aria-label="${title}" title="${title}"><i class="bx ${isDark ? 'bx-sun' : 'bx-moon'}"></i></button>`;
    wrap.querySelector('button')?.addEventListener('click', () => setThemeMode(isDark ? 'light' : 'dark'));
  };
  render();
  document.addEventListener('app:theme-changed', render);
  const languageSwitcher = document.getElementById('language-switcher');
  const userBox = document.getElementById('user-box');
  const anchor = languageSwitcher || userBox;
  if (anchor) navbar.insertBefore(wrap, anchor); else navbar.appendChild(wrap);
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

function captainLabel(value) {
  const map = {
    captain_1: t('players.captain_1', 'Capitaine 1'),
    captain_2: t('players.captain_2', 'Capitaine 2'),
    captain_3: t('players.captain_3', 'Capitaine 3')
  };
  return map[value] || '';
}

function captainIconMarkup(value, sizeClass = 'captain-icon-sm') {
  const map = { captain_1: '../assets/img/captains/captaine1.png', captain_2: '../assets/img/captains/captaine2.png', captain_3: '../assets/img/captains/captaine3.png' };
  const src = map[value];
  if (!src) return '';
  const title = captainLabel(value);
  return `<span class="captain-icon-wrap ms-1" title="${escapeHtml(title)}"><img src="${src}" alt="${escapeHtml(title || 'Captain')}" class="captain-icon ${sizeClass}"></span>`;
}

async function resolveCaptainRoleForUser(ctx) {
  if (ctx?.role !== 'player' || !ctx?.user?.id) return '';
  if (ctx.membership?.captain_role) return ctx.membership.captain_role;
  try {
    const { data, error } = await supabase.from('players').select('captain_role').eq('profile_id', ctx.user.id).maybeSingle();
    if (error) throw error;
    if (data?.captain_role) {
      ctx.membership = { ...(ctx.membership || {}), captain_role: data.captain_role };
      return data.captain_role;
    }
  } catch (e) {
    console.warn('Captain role load failed:', e);
  }
  return '';
}

async function injectUserBox(ctx) {
  const navbar = document.getElementById('navbar-collapse');
  if (!navbar || document.getElementById('user-box')) return;
  const host = document.createElement('div');
  host.id = 'user-box';
  host.className = 'ms-auto d-flex align-items-center gap-3';
  const avatar = ctx.profile?.avatar_url || readCachedAuth()?.avatar_url || '../assets/img/branding/avatar-placeholder.png';
  const captainRole = await resolveCaptainRoleForUser(ctx);
  const captainIcon = captainIconMarkup(captainRole);
  host.innerHTML = `
    <div class="dropdown ms-auto">
      <button class="btn btn-outline-primary dropdown-toggle userbox-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
        <span class="userbox-avatar-wrap me-2"><img src="${avatar}" alt="${ctx.fullName}" class="userbox-avatar"><span class="status-dot ${ctx.profile?.is_active === false ? "d-none" : ""}" aria-label="Actif"></span></span>
        <span class="d-none d-sm-inline">${t('common.account')}</span>
      </button>
      <ul class="dropdown-menu dropdown-menu-end">
        <li class="px-3 py-2">
          <div class="userbox-name fw-semibold d-inline-flex align-items-center">${ctx.fullName}${captainIcon}</div>
          <div class="small text-muted userbox-role">${t(`role.${ctx.role}`, ROLE_LABELS[ctx.role] || ctx.role)}</div>
          <div class="small text-muted">${ctx.user?.email || ''}</div>
        </li>
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
applyStoredActiveMenu();
syncNavbarPageTitle();
initPwaUi();
registerServiceWorker();

const cachedAuth = readCachedAuth();
if (cachedAuth?.role) {
  document.documentElement.dataset.userRole = cachedAuth.role;
  hideMenuByRole(cachedAuth.role);
  applyStoredActiveMenu();
  applyCrudVisibility(cachedAuth.role);
  document.documentElement.dataset.roleReady = '1';
  if (cachedAuth.role === 'player') watchPlayerMediaProtection();
}

(async () => {
  const ctx = await requireAuthForPage();
  if (!ctx) return;
  hideMenuByRole(ctx.role);
  applyStoredActiveMenu();
  await refreshTicketMenuBadge(ctx);
  applyCrudVisibility(ctx.role);
  await injectNotificationsBell(ctx);
  await injectUserBox(ctx);
  injectNavbarInstallButton();
  injectLanguageSwitcher();
  injectThemeSwitcher();
  injectSidebarCollapseToggle();
  lockCollapsedMenuHover();
  refreshFooterBranding();
  applyTranslations();
  document.documentElement.dataset.userRole = ctx.role;
  document.documentElement.dataset.roleReady = '1';
  window.APP_USER = ctx;
  syncNavbarPageTitle();
  watchPlayerMediaProtection();
})();

document.addEventListener('app:language-changed', () => { normalizeMenu(); applyStoredActiveMenu(); hideMenuByRole(document.documentElement.dataset.userRole || readCachedAuth()?.role || 'player'); syncNavbarPageTitle(); injectSidebarCollapseToggle(); refreshFooterBranding(); applyTranslations(); injectThemeSwitcher(); injectNavbarInstallButton(); });
