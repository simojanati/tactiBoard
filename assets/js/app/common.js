import { supabase } from './auth.js';

const cfg = window.APP_CONFIG;

function tt(key, fallback='') {
  return window.t ? window.t(key, fallback) : fallback;
}

export { supabase };

export function setAppTitle(suffix = '') {
  const localSuffix = window.t ? (window.t(window.__i18nKeyForText?.(suffix) || '', suffix) || suffix) : suffix;
  const title = localSuffix ? `${localSuffix} | ${cfg.projectName}` : cfg.projectName;
  document.title = title;
  document.querySelectorAll('[data-app-name]').forEach(el => el.textContent = cfg.projectName);
  document.querySelectorAll('[data-app-title]').forEach(el => el.textContent = cfg.projectName);
}

export function activateMenu(page) {
  document.querySelectorAll('[data-menu-page]').forEach(el => {
    const li = el.closest('.menu-item');
    if (!li) return;
    li.classList.toggle('active', el.dataset.menuPage === page);
  });
}

export function showAlert(message, type = 'success', targetId = 'page-alert') {
  const host = document.getElementById(targetId);
  if (!host) return;
  host.innerHTML = `<div class="alert alert-${type} alert-dismissible" role="alert">${escapeHtml(message)}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="${tt('common.close','Close')}"></button></div>`;
}

export function clearAlert(targetId = 'page-alert') {
  const host = document.getElementById(targetId);
  if (host) host.innerHTML = '';
}

export function escapeHtml(str = '') {
  return String(str).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function formatDate(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleDateString(window.t ? (localStorage.getItem('tactiboard_lang') || 'fr') : undefined); } catch { return value; }
}

export function nl2br(str = '') {
  return escapeHtml(str).replace(/\n/g, '<br>');
}

export async function fetchTeamsOptions(selectEl, includePlaceholder = true) {
  const { data, error } = await supabase.from('teams').select('id,name').order('name');
  if (error) throw error;
  const options = [];
  if (includePlaceholder) options.push(`<option value="">${tt('common.choose_team','Choisir une équipe')}</option>`);
  options.push(...data.map(team => `<option value="${team.id}">${escapeHtml(team.name)}</option>`));
  selectEl.innerHTML = options.join('');
  return data;
}

export async function fetchTacticsOptions(selectEl, { teamId = '', includePlaceholder = false, selectedIds = [] } = {}) {
  if (!selectEl) return [];
  let query = supabase.from('tactics').select('id,title,team_id,phase').order('title');
  if (teamId) query = query.eq('team_id', teamId);
  const { data, error } = await query;
  if (error) throw error;
  const selectedSet = new Set((selectedIds || []).map(String));
  const options = [];
  if (includePlaceholder) options.push(`<option value="">${tt('common.choose_tactic','Choisir une tactique')}</option>`);
  options.push(...data.map(tactic => `<option value="${tactic.id}" ${selectedSet.has(String(tactic.id)) ? 'selected' : ''}>${escapeHtml(tactic.title)}${tactic.phase ? ` (${escapeHtml(tactic.phase)})` : ''}</option>`));
  selectEl.innerHTML = options.join('');
  return data;
}

export function bindFormSubmit(formId, handler) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearAlert();
    const submitBtn = form.querySelector('[type="submit"]');
    const original = submitBtn ? submitBtn.innerHTML : null;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${tt('common.saving','Enregistrement...')}`;
    }
    try { await handler(new FormData(form), form); }
    catch (err) { console.error(err); showAlert(err.message || tt('common.loading','Une erreur est survenue.'), 'danger'); }
    finally { if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = original; } }
  });
}

export function initCrudPanel({panelId='form-panel', toggleId='toggle-form-btn', cancelId='cancel-form-btn', titleId='form-title', addTitle='Ajouter', editTitle='Modifier'}={}) {
  const panel = document.getElementById(panelId);
  const toggleBtn = document.getElementById(toggleId);
  const cancelButtons = document.querySelectorAll(`#${cancelId}, .${cancelId}`);
  const titleEl = document.getElementById(titleId);
  const hiddenId = document.getElementById('entity-id');
  function open(isEdit=false) {
    panel?.classList.remove('form-panel-hidden','d-none');
    if (titleEl) titleEl.textContent = isEdit ? editTitle : addTitle;
    if (toggleBtn) toggleBtn.innerHTML = `<i class="bx ${isEdit ? 'bx-edit' : 'bx-minus'} me-1"></i>${isEdit ? 'Mode édition' : 'Masquer le formulaire'}`;
    panel?.scrollIntoView({behavior:'smooth', block:'start'});
  }
  function close(reset=true) {
    panel?.classList.add('form-panel-hidden');
    if (titleEl) titleEl.textContent = addTitle;
    if (toggleBtn) toggleBtn.innerHTML = `<i class="bx bx-plus me-1"></i>${tt('common.add','Ajouter')}`;
    if (reset) {
      const activeForm = panel?.querySelector('form');
      activeForm?.reset();
      if (hiddenId) hiddenId.value = '';
      const submitLabel = document.getElementById('submit-label');
      if (submitLabel) submitLabel.textContent = 'Enregistrer';
    }
  }
  toggleBtn?.addEventListener('click', () => {
    if (panel?.classList.contains('form-panel-hidden')) open(false); else close(false);
  });
  cancelButtons.forEach(btn => btn.addEventListener('click', () => close(true)));
  return { open, close };
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function renderAssignmentsBuilder(container, items = []) {
  if (!container) return;
  const rows = items.length ? items : [{ position: '', instruction: '' }];
  container.innerHTML = rows.map((item, index) => assignmentRowHtml(item, index)).join('');
}

function assignmentRowHtml(item, index) {
  return `<div class="assignment-row border rounded p-3 mb-2" data-index="${index}">
    <div class="row g-2 align-items-end">
      <div class="col-md-3">
        <label class="form-label">${tt('common.player','Poste')}</label>
        <input type="text" class="form-control assignment-position" placeholder="QB, WR, LB..." value="${escapeHtml(item.position || '')}">
      </div>
      <div class="col-md-8">
        <label class="form-label">Instruction</label>
        <input type="text" class="form-control assignment-instruction" placeholder="Consigne précise pour ce poste" value="${escapeHtml(item.instruction || '')}">
      </div>
      <div class="col-md-1 d-grid">
        <button class="btn btn-outline-danger remove-assignment-btn" type="button" title="Supprimer"><i class="bx bx-trash"></i></button>
      </div>
    </div>
  </div>`;
}

export function setupAssignmentsBuilder(container, addBtn) {
  const ensureOne = () => {
    if (!container.querySelector('.assignment-row')) {
      container.insertAdjacentHTML('beforeend', assignmentRowHtml({ position: '', instruction: '' }, Date.now()));
    }
  };
  addBtn?.addEventListener('click', () => {
    container.insertAdjacentHTML('beforeend', assignmentRowHtml({ position: '', instruction: '' }, Date.now()));
  });
  container?.addEventListener('click', e => {
    const btn = e.target.closest('.remove-assignment-btn');
    if (!btn) return;
    btn.closest('.assignment-row')?.remove();
    ensureOne();
  });
  ensureOne();
}

export function collectAssignments(container) {
  return [...container.querySelectorAll('.assignment-row')]
    .map(row => ({
      position: row.querySelector('.assignment-position')?.value.trim() || '',
      instruction: row.querySelector('.assignment-instruction')?.value.trim() || ''
    }))
    .filter(item => item.position || item.instruction);
}

export async function dashboardCounts() {
  const tables = ['teams', 'players', 'coaches', 'tactics', 'sessions', 'matches'];
  const results = {};
  await Promise.all(tables.map(async name => {
    const { count, error } = await supabase.from(name).select('*', { count: 'exact', head: true });
    if (error) throw error;
    results[name] = count || 0;
  }));
  return results;
}


export async function uploadTeamLogo(file, teamId) {
  if (!file) return null;
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `team-${teamId}-${Date.now()}.${ext}`;
  const bucket = window.APP_CONFIG.teamLogoBucket || 'team-logos';
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

export function teamLogoHtml(team, className='team-logo-sm') {
  const url = team?.logo_url || '../assets/img/branding/team-logo-placeholder.png';
  const name = escapeHtml(team?.name || 'Équipe');
  return `<img src="${url}" alt="${name}" class="${className}">`;
}


export async function uploadAvatar(file, userId) {
  if (!file) return null;
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `profile-${userId}-${Date.now()}.${ext}`;
  const bucket = window.APP_CONFIG.avatarBucket || 'user-avatars';
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}


export function personAvatarUrl(row = {}) {
  return row?.image_url || row?.profiles?.avatar_url || '../assets/img/branding/avatar-placeholder.png';
}

export async function syncLinkedAvatar({ table, rowId, profileId, imageUrl, profileColumn = 'avatar_url' } = {}) {
  if (!table || !rowId) return;
  const payload = { image_url: imageUrl || null };
  const updates = [supabase.from(table).update(payload).eq('id', rowId)];
  if (profileId) updates.push(supabase.from('profiles').update({ [profileColumn]: imageUrl || null }).eq('id', profileId));
  const results = await Promise.all(updates);
  const failed = results.find(item => item.error);
  if (failed?.error) throw failed.error;
}


function getResponsiveTableHeaders(table) {
  const headers = [...table.querySelectorAll('thead th')].map(th => (th.textContent || '').trim());
  if (headers.length) return headers;
  const firstRow = table.querySelector('tr');
  if (!firstRow) return [];
  return [...firstRow.children].map(cell => (cell.textContent || '').trim());
}

function markResponsiveTable(table) {
  if (!table || table.dataset.responsiveCardsReady === '1') return;
  const headers = getResponsiveTableHeaders(table);
  const bodyRows = [...table.querySelectorAll('tbody tr')];
  bodyRows.forEach(row => {
    const cells = [...row.children];
    cells.forEach((cell, index) => {
      if (!(cell instanceof HTMLElement)) return;
      const label = headers[index] || '';
      if (!cell.hasAttribute('data-label')) cell.setAttribute('data-label', label);
    });
  });
  table.classList.add('responsive-card-table');
  table.dataset.responsiveCardsReady = '1';
}

export function applyResponsiveDataCards(root = document) {
  const tables = [...root.querySelectorAll('table.table, table[data-responsive-cards], .table-responsive table')];
  tables.forEach(table => {
    if (table.closest('.keep-table-desktop-only')) return;
    markResponsiveTable(table);
  });
}

export function initResponsiveDataCards() {
  const run = () => applyResponsiveDataCards(document);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }

  const observer = new MutationObserver(() => {
    applyResponsiveDataCards(document);
  });
  const startObserve = () => {
    if (!document.body) return;
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserve, { once: true });
  } else {
    startObserve();
  }

  document.addEventListener('app:language-changed', () => {
    document.querySelectorAll('table.responsive-card-table').forEach(table => {
      table.dataset.responsiveCardsReady = '';
    });
    applyResponsiveDataCards(document);
  });
}

initResponsiveDataCards();
