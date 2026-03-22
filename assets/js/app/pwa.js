import { getLanguage, t } from './i18n.js';

let deferredInstallPrompt = null;
let installButtonHandlerBound = false;
let installInstructionShown = false;

function swPath() {
  const path = window.location.pathname || '';
  return path.includes('/pages/') ? '../sw.js' : './sw.js';
}

function setThemeMeta() {
  const isDark = document.documentElement.classList.contains('dark-style') || document.documentElement.dataset.themeMode === 'dark';
  const color = isDark ? '#1f2333' : '#696cff';
  const ensure = (selector, attrs = {}) => {
    let el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement('meta');
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
    }
    return el;
  };
  ensure('meta[name="theme-color"]', { name: 'theme-color' }).setAttribute('content', color);
  ensure('meta[name="apple-mobile-web-app-status-bar-style"]', { name: 'apple-mobile-web-app-status-bar-style' }).setAttribute('content', isDark ? 'black-translucent' : 'default');
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register(swPath());
    try { await registration.update(); } catch {}
    return registration;
  } catch (error) {
    console.warn('Service worker registration failed:', error);
    return null;
  }
}

function installLabel() {
  return t('pwa.install', 'Installer l’application');
}

function installHintLabel() {
  return t('pwa.install_hint', 'Installer');
}

function hideInstallCtas() {
  document.querySelectorAll('[data-pwa-install]').forEach(el => {
    el.classList.add('d-none');
    el.setAttribute('aria-hidden', 'true');
  });
}

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function showInstallInstructions() {
  if (installInstructionShown) return;
  installInstructionShown = true;
  const lang = (getLanguage() || 'fr').toLowerCase();
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
  const message = isIOS
    ? (lang === 'en'
        ? 'To install TactiBoard on iPhone/iPad: open the Share menu in Safari, then choose "Add to Home Screen".'
        : `Pour installer TactiBoard sur iPhone/iPad : ouvrez le menu Partager dans Safari, puis choisissez « Ajouter à l'écran d'accueil ».`)
    : (lang === 'en'
        ? 'Install prompt is not available yet. On Android, open the browser menu and choose "Install app" or "Add to Home screen". If the option does not appear, make sure the app is opened over HTTPS (or localhost) and that the service worker is active.'
        : `Le prompt d'installation n'est pas encore disponible. Sur Android, ouvrez le menu du navigateur puis choisissez « Installer l'application » ou « Ajouter à l'écran d'accueil ». Si l'option n'apparaît pas, vérifiez que l'app est ouverte en HTTPS (ou localhost) et que le service worker est actif.`);
  window.alert(message);
  setTimeout(() => { installInstructionShown = false; }, 1000);
}

async function triggerInstall() {
  if (!deferredInstallPrompt) {
    showInstallInstructions();
    return;
  }
  deferredInstallPrompt.prompt();
  try {
    await deferredInstallPrompt.userChoice;
  } catch {}
  deferredInstallPrompt = null;
  hideInstallCtas();
}

function bindInstallButtons() {
  if (installButtonHandlerBound) return;
  document.addEventListener('click', event => {
    const btn = event.target.closest('[data-pwa-install]');
    if (!btn || btn.classList.contains('d-none')) return;
    event.preventDefault();
    triggerInstall();
  });
  installButtonHandlerBound = true;
}

function showInstallCtas() {
  if (isStandaloneMode()) return;
  document.querySelectorAll('[data-pwa-install]').forEach(el => {
    el.classList.remove('d-none');
    el.removeAttribute('aria-hidden');
    const label = el.dataset.pwaInstallCompact === '1' ? installHintLabel() : installLabel();
    const textNode = el.querySelector('[data-pwa-install-label]');
    if (textNode) textNode.textContent = label;
    el.title = label;
    el.setAttribute('aria-label', label);
  });
}

function createInstallButton({ compact = false, extraClass = '' } = {}) {
  const label = compact ? installHintLabel() : installLabel();
  return `<button type="button" class="btn btn-outline-primary ${compact ? 'btn-sm' : ''} ${extraClass}" data-pwa-install data-pwa-install-compact="${compact ? '1' : '0'}" title="${label}" aria-label="${label}"><i class="bx bx-download me-1"></i><span data-pwa-install-label>${label}</span></button>`;
}

export function injectNavbarInstallButton() {
  const navbar = document.getElementById('navbar-collapse');
  if (!navbar || document.getElementById('pwa-install-navbar')) return;
  const wrap = document.createElement('div');
  wrap.id = 'pwa-install-navbar';
  wrap.className = 'navbar-quick-action pwa-install-wrap d-none';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = createInstallButton({ compact: true, extraClass: 'pwa-install-btn' });
  const bell = document.getElementById('notifications-bell');
  const userBox = document.getElementById('user-box');
  const anchor = bell || userBox;
  if (anchor) navbar.insertBefore(wrap, anchor); else navbar.appendChild(wrap);
}

export function injectLoginInstallButton() {
  if (document.getElementById('pwa-install-login')) return;
  const authInner = document.querySelector('.authentication-inner .card-body');
  if (!authInner) return;
  const host = document.createElement('div');
  host.id = 'pwa-install-login';
  host.className = 'd-none mt-3';
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = `<div class="d-grid">${createInstallButton({ compact: false })}</div>`;
  const footer = authInner.querySelector('.text-center.small.text-muted');
  if (footer) footer.parentNode.insertBefore(host, footer); else authInner.appendChild(host);
}

export function initPwaUi() {
  setThemeMeta();
  bindInstallButtons();
  if (!isStandaloneMode()) {
    showInstallCtas();
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallCtas();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideInstallCtas();
  });
  document.addEventListener('app:theme-changed', setThemeMeta);
  document.addEventListener('app:language-changed', () => {
    document.documentElement.lang = getLanguage() || 'fr';
    showInstallCtas();
  });
  document.documentElement.lang = getLanguage() || 'fr';
}
