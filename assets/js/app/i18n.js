const SUPPORTED = ['fr', 'en'];
const STORAGE_KEY = 'tactiboard_lang';
let currentLang = 'fr';
let dicts = {};
let reverseMap = new Map();
let observer = null;
let applying = false;

function pagePath() {
  return location.pathname.split('/').pop() || 'index.html';
}

function defaultLang() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (SUPPORTED.includes(saved)) return saved;
  const htmlLang = document.documentElement.lang;
  if (SUPPORTED.includes(htmlLang)) return htmlLang;
  return 'fr';
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Cannot load locale file: ${path}`);
  return res.json();
}

function buildReverseMap() {
  reverseMap = new Map();
  Object.entries(dicts).forEach(([lang, dict]) => {
    Object.entries(dict).forEach(([key, value]) => {
      if (!value) return;
      reverseMap.set(String(value).trim(), key);
    });
  });
}

export async function initI18n() {
  if (!Object.keys(dicts).length) {
    const [fr, en] = await Promise.all([
      fetchJson('../assets/i18n/fr.json'),
      fetchJson('../assets/i18n/en.json')
    ]);
    dicts = { fr, en };
    buildReverseMap();
  }
  currentLang = defaultLang();
  document.documentElement.lang = currentLang;
  window.t = t;
  window.__i18nKeyForText = keyForText;
  observeDom();
  applyTranslations();
  return currentLang;
}

export function getLanguage() {
  return currentLang;
}

export function t(key, fallback = '') {
  return dicts[currentLang]?.[key] ?? fallback ?? key;
}

export function setLanguage(lang) {
  if (!SUPPORTED.includes(lang)) return;
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  applyTranslations();
  document.dispatchEvent(new CustomEvent('app:language-changed', { detail: { lang } }));
}

function keyForText(text) {
  return reverseMap.get(String(text ?? '').trim()) || '';
}

function maybeTranslateText(raw) {
  const text = String(raw ?? '');
  const trimmed = text.trim();
  if (!trimmed) return text;
  const key = reverseMap.get(trimmed);
  if (!key) return text;
  const translated = t(key, trimmed);
  if (!translated || translated === trimmed) return text;
  const leading = text.match(/^\s*/)?.[0] ?? '';
  const trailing = text.match(/\s*$/)?.[0] ?? '';
  return `${leading}${translated}${trailing}`;
}

function applyAttributes(root) {
  root.querySelectorAll?.('*').forEach(el => {
    ['placeholder', 'title', 'aria-label', 'value'].forEach(attr => {
      const val = el.getAttribute(attr);
      if (!val) return;
      const translated = maybeTranslateText(val);
      if (translated !== val) el.setAttribute(attr, translated);
    });
  });
}

function shouldSkipTextNode(node) {
  const parent = node.parentElement;
  if (!parent) return true;
  const tag = parent.tagName;
  return ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tag);
}

function translateTextNodes(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (shouldSkipTextNode(node)) continue;
    textNodes.push(node);
  }
  textNodes.forEach(textNode => {
    const translated = maybeTranslateText(textNode.nodeValue);
    if (translated !== textNode.nodeValue) textNode.nodeValue = translated;
  });
}

function translateDocumentTitle() {
  document.title = maybeTranslateText(document.title);
}

function applyPageSpecifics() {
  const path = pagePath();
  const pageTitles = {
    'index.html': 'page.dashboard',
    'teams.html': 'page.teams',
    'players.html': 'page.players',
    'coaches.html': 'page.coaches',
    'tactics.html': 'page.tactics',
    'tactic-detail.html': 'page.tactic_detail',
    'sessions.html': 'page.sessions',
    'matches.html': 'page.matches',
    'match-detail.html': 'page.match_detail',
    'notifications.html': 'page.notifications',
    'profile.html': 'page.profile',
    'player-links.html': 'page.player_links',
    'my-team.html': 'page.my_team',
    'my-tactics.html': 'page.my_tactics',
    'my-sessions.html': 'page.my_sessions',
    'my-matches.html': 'page.my_matches',
    'my-quizzes.html': 'page.my_quizzes',
    'take-quiz.html': 'page.take_quiz',
    'tactical-board.html': 'page.tactical_board',
    'quizzes.html': 'page.quizzes',
    'match-gameplan-print.html': 'page.match_gameplan_print'
  };
  const key = pageTitles[path];
  if (key) {
    const pageTitle = document.getElementById('page-title');
    const navbarTitle = document.querySelector('.navbar-page-title');
    const translated = t(key);
    if (pageTitle && !pageTitle.dataset.i18nDynamicLocked) pageTitle.textContent = translated;
    if (navbarTitle) navbarTitle.textContent = translated;
  }
}

export function applyTranslations(root = document.body) {
  if (applying) return;
  applying = true;
  try {
    translateTextNodes(root);
    applyAttributes(document);
    translateDocumentTitle();
    applyPageSpecifics();
  } finally {
    applying = false;
  }
}

function observeDom() {
  if (observer || !document.body) return;
  observer = new MutationObserver(mutations => {
    if (applying) return;
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType === 1) applyTranslations(node);
        if (node.nodeType === 3) {
          const translated = maybeTranslateText(node.nodeValue);
          if (translated !== node.nodeValue) node.nodeValue = translated;
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
