import { activateMenu, bindFormSubmit, escapeHtml, formatDate, getQueryParam, initCrudPanel, nl2br, setAppTitle, showAlert, supabase, tt } from './common.js';
import { canEdit, getUserContext } from './auth.js';

setAppTitle('Détail séance');

const host = document.getElementById('session-detail-host');
const sessionId = Number(getQueryParam('id') || 0);
const ctx = await getUserContext();
activateMenu(ctx.role === 'player' ? 'my-sessions' : 'sessions');
const isEditor = canEdit(ctx.role);
let currentSession = null;
let currentLinks = [];
let planningItems = [];
let availableTactics = [];

function safeText(value, fallback = '—') {
  return value ? escapeHtml(String(value)) : fallback;
}

function minutesBetween(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return null;
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

function formatMinutes(mins) {
  if (mins == null || mins === '') return '—';
  const value = Number(mins);
  if (!Number.isFinite(value)) return '—';
  if (value < 60) return `${value} min`;
  const h = Math.floor(value / 60);
  const m = value % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function sessionDurationLabel(session) {
  const auto = minutesBetween(session?.start_time, session?.end_time);
  return formatMinutes(auto);
}

function planningDurationLabel(item) {
  return formatMinutes(item?.duration_minutes || minutesBetween(item?.start_time, item?.end_time));
}

function planningStepHtml(item, index) {
  const badge = item.order_index || index + 1;
  const start = item.start_time ? escapeHtml(String(item.start_time).slice(0,5)) : '—';
  const end = item.end_time ? escapeHtml(String(item.end_time).slice(0,5)) : '';
  const objective = item.objective ? nl2br(item.objective) : '<span class="text-muted">Aucun objectif</span>';
  const instructions = item.instructions ? nl2br(item.instructions) : '<span class="text-muted">Aucune consigne</span>';
  const equipment = item.equipment ? nl2br(item.equipment) : '<span class="text-muted">Aucun matériel</span>';
  return `<div class="planning-step-card card mb-3" data-plan-id="${item.id}">
    <div class="card-body">
      <div class="d-flex gap-3 align-items-start">
        <div class="planning-step-marker">
          <span class="planning-step-badge">${badge}</span>
        </div>
        <div class="flex-grow-1 min-w-0">
          <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-2">
            <div>
              <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
                <h6 class="mb-0">${escapeHtml(item.title || 'Étape')}</h6>
                <span class="badge bg-label-primary">${planningDurationLabel(item)}</span>
              </div>
              <div class="text-muted small d-flex flex-wrap align-items-center gap-2">
                <span><i class="bx bx-time-five me-1"></i>${start}${end ? ` → ${end}` : ''}</span>
                ${item.order_index ? `<span><i class="bx bx-sort-up me-1"></i>Ordre ${badge}</span>` : ''}
              </div>
            </div>
            ${isEditor ? `<div class="d-flex gap-2 flex-wrap planning-step-actions">
              <button class="btn btn-sm btn-outline-secondary plan-move-up-btn" data-id="${item.id}" ${index === 0 ? 'disabled' : ''} title="Monter"><i class="bx bx-chevron-up"></i></button>
              <button class="btn btn-sm btn-outline-secondary plan-move-down-btn" data-id="${item.id}" ${index === planningItems.length - 1 ? 'disabled' : ''} title="Descendre"><i class="bx bx-chevron-down"></i></button>
              <button class="btn btn-sm btn-outline-primary plan-edit-btn" data-id="${item.id}">Modifier</button>
              <button class="btn btn-sm btn-outline-danger plan-delete-btn" data-id="${item.id}" data-label="${escapeHtml(item.title || 'Étape')}">Supprimer</button>
            </div>` : ''}
          </div>
          <div class="row g-3 mt-1">
            <div class="col-lg-4">
              <div class="session-detail-box h-100">
                <div class="session-detail-box-label">Objectif</div>
                <div>${objective}</div>
              </div>
            </div>
            <div class="col-lg-5">
              <div class="session-detail-box h-100">
                <div class="session-detail-box-label">Consignes</div>
                <div>${instructions}</div>
              </div>
            </div>
            <div class="col-lg-3">
              <div class="session-detail-box h-100">
                <div class="session-detail-box-label">Matériel</div>
                <div>${equipment}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function render() {
  if (!currentSession) {
    host.innerHTML = `<div class="card"><div class="card-body">${tt('session_detail.not_found','Séance introuvable.')}</div></div>`;
    return;
  }
  const linkedTacticsHtml = currentLinks.length
    ? currentLinks.map(link => {
        const t = link.tactics || {};
        return `<div class="col-12"><div class="linked-tactic-card card border-0 shadow-none bg-lighter h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                  <a href="tactic-detail.html?id=${t.id}" class="fw-semibold text-decoration-none">${escapeHtml(t.title || tt('session_detail.tactic_fallback','Tactique'))}</a>
                  ${t.phase ? `<span class="badge bg-label-info">${escapeHtml(t.phase)}</span>` : ''}
                  ${t.category ? `<span class="badge bg-label-secondary">${escapeHtml(t.category)}</span>` : ''}
                </div>
                <div class="text-muted small">${tt('session_detail.linked_tactics.accessible_from_detail','Accessible directement depuis le détail de la séance.')}</div>
              </div>
              <div class="d-flex gap-2 flex-wrap">
                <a href="tactic-detail.html?id=${t.id}" class="btn btn-sm btn-outline-secondary">${tt('common.view','Voir')}</a>
                ${isEditor ? `<button class="btn btn-sm btn-outline-danger unlink-tactic-btn" data-id="${t.id}" data-label="${escapeHtml(t.title || tt('session_detail.tactic_fallback','Tactique'))}">Retirer</button>` : ''}
              </div>
            </div>
          </div>
        </div></div>`;
      }).join('')
    : `<div class="col-12"><div class="card border-0 bg-lighter"><div class="card-body text-muted">${tt('session_detail.linked_tactics.none','Aucune tactique liée à cette séance.')}</div></div></div>`;

  const planningHtml = planningItems.length
    ? planningItems.map((item, index) => planningStepHtml(item, index)).join('')
    : `<div class="card border-0 bg-lighter"><div class="card-body text-muted d-flex justify-content-between align-items-center flex-wrap gap-2"><span>${tt('session_detail.planning.none','Aucun planning défini pour cette séance.')}</span>${isEditor ? `<button class="btn btn-sm btn-primary" id="planning-empty-add-btn"><i class="bx bx-plus me-1"></i>${tt('session_detail.planning.add_step','Ajouter une étape')}</button>` : ''}</div></div>`;

  host.innerHTML = `
    <div class="row g-4">
      <div class="col-12">
        <div class="card app-hero-card session-hero-card">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
              <div>
                <div class="d-flex align-items-center gap-2 flex-wrap mb-2">
                  <span class="badge bg-label-primary">${tt('page.session_detail','Détail séance')}</span>
                  <span class="badge bg-label-info">${formatDate(currentSession.session_date)}</span>
                  <span class="badge bg-label-secondary">${sessionDurationLabel(currentSession)}</span>
                </div>
                <h3 class="mb-1">${escapeHtml(currentSession.title || '')}</h3>
                <div class="text-muted">${escapeHtml(currentSession.teams?.name || '—')} ${currentSession.location ? `• ${escapeHtml(currentSession.location)}` : ''}</div>
              </div>
              <div class="d-flex gap-2 flex-wrap">
                <a href="${ctx.role === 'player' ? 'my-sessions.html' : 'sessions.html'}" class="btn btn-outline-secondary"><i class="bx bx-arrow-back me-1"></i>${tt('common.back','Retour')}</a>
                ${isEditor ? `<button class="btn btn-primary" id="planning-toggle-btn"><i class="bx bx-plus me-1"></i>${tt('session_detail.planning.add_step','Ajouter une étape')}</button>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-xl-8">
        <div class="card mb-4">
          <div class="card-header d-flex justify-content-between align-items-center"><h5 class="mb-0">${tt('session_detail.summary.title','Résumé de la séance')}</h5><span class="badge bg-label-info">${tt('session_detail.summary.badge','Planning & tactiques')}</span></div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-4"><div class="session-detail-box h-100"><div class="session-detail-box-label">${tt('common.date','Date')}</div><div class="fw-semibold">${formatDate(currentSession.session_date)}</div></div></div>
              <div class="col-md-4"><div class="session-detail-box h-100"><div class="session-detail-box-label">${tt('session_detail.summary.schedule','Horaires')}</div><div class="fw-semibold">${currentSession.start_time ? escapeHtml(String(currentSession.start_time).slice(0,5)) : '—'} ${currentSession.end_time ? `→ ${escapeHtml(String(currentSession.end_time).slice(0,5))}` : ''}</div></div></div>
              <div class="col-md-4"><div class="session-detail-box h-100"><div class="session-detail-box-label">${tt('common.location','Lieu')}</div><div class="fw-semibold">${escapeHtml(currentSession.location || '—')}</div></div></div>
              <div class="col-12"><div class="session-detail-box"><div class="session-detail-box-label">${tt('session_detail.summary.coach_notes','Notes coach')}</div><div>${currentSession.notes ? nl2br(currentSession.notes) : `<span class="text-muted">${tt('session_detail.summary.no_notes','Aucune note.')}</span>`}</div></div></div>
            </div>
          </div>
        </div>

        ${isEditor ? `<div class="card mb-4 form-panel-hidden" id="planning-form-panel">
          <div class="card-header d-flex justify-content-between align-items-center"><h5 class="mb-0" id="planning-form-title">${tt('session_detail.planning.form.add_title','Ajouter une étape')}</h5><button class="btn btn-sm btn-outline-secondary cancel-plan-form-btn" type="button"><i class="bx bx-x me-1"></i>${tt('common.close','Fermer')}</button></div>
          <div class="card-body">
            <form id="planning-form">
              <input type="hidden" name="id" id="planning-id">
              <div class="row g-3">
                <div class="col-md-2"><label class="form-label">${tt('session_detail.planning.form.order','Ordre')}</label><input class="form-control" type="number" name="order_index" min="1" step="1" /></div>
                <div class="col-md-4"><label class="form-label">${tt('common.title','Titre')}</label><input class="form-control" type="text" name="title" required /></div>
                <div class="col-md-2"><label class="form-label">${tt('common.start','Début')}</label><input class="form-control" type="time" name="start_time" /></div>
                <div class="col-md-2"><label class="form-label">${tt('common.end','Fin')}</label><input class="form-control" type="time" name="end_time" /></div>
                <div class="col-md-2"><label class="form-label">${tt('session_detail.planning.form.duration_minutes','Durée (min)')}</label><input class="form-control" type="number" name="duration_minutes" min="0" step="1" /></div>
                <div class="col-md-4"><label class="form-label">${tt('common.objective','Objectif')}</label><textarea class="form-control" name="objective" rows="3"></textarea></div>
                <div class="col-md-5"><label class="form-label">${tt('session_detail.planning.form.instructions','Consignes')}</label><textarea class="form-control" name="instructions" rows="3"></textarea></div>
                <div class="col-md-3"><label class="form-label">${tt('session_detail.planning.form.equipment','Matériel')}</label><textarea class="form-control" name="equipment" rows="3"></textarea></div>
              </div>
              <div class="d-flex gap-2 mt-3"><button class="btn btn-primary" type="submit"><span id="planning-submit-label">${tt('common.save','Enregistrer')}</span></button><button class="btn btn-outline-secondary cancel-plan-form-btn" type="button">${tt('common.cancel','Annuler')}</button></div>
            </form>
          </div>
        </div>` : ''}

        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div>
            <h4 class="mb-1">${tt('session_detail.planning.title','Planning de la séance')}</h4>
            <div class="text-muted small">${tt('session_detail.planning.subtitle','Étapes ordonnées, horaires et consignes opérationnelles.')}</div>
          </div>
          ${planningItems.length ? `<span class="badge bg-label-primary">${planningItems.length} étape${planningItems.length > 1 ? 's' : ''}</span>` : ''}
        </div>
        <div id="planning-list" class="planning-timeline">${planningHtml}</div>
      </div>

      <div class="col-xl-4">
        <div class="card mb-4">
          <div class="card-header d-flex justify-content-between align-items-center"><h5 class="mb-0">${tt('session_detail.linked_tactics.title','Tactiques liées')}</h5><span class="badge bg-label-secondary">${tt('session_detail.linked_tactics.badge','Lecture rapide')}</span></div>
          <div class="card-body">
            ${isEditor ? `<form id="session-tactic-form" class="mb-3">
              <div class="input-group">
                <select class="form-select" id="session-tactic-select" required>
                  <option value="">${tt('session_detail.linked_tactics.select_placeholder','Sélectionner une tactique')}</option>
                </select>
                <button class="btn btn-primary" type="submit">${tt('session_detail.linked_tactics.link','Lier')}</button>
              </div>
              <div class="form-text">${tt('session_detail.linked_tactics.help','Seules les tactiques non encore liées sont proposées.')}</div>
            </form>` : ''}
            <div class="row g-3">${linkedTacticsHtml}</div>
          </div>
        </div>
      </div>
    </div>`;

  if (isEditor) {
    wirePlanningActions();
    wireTacticActions();
    renderTacticSelectOptions();
  }
}

function wirePlanningActions() {
  const planningPanel = initCrudPanel({ panelId: 'planning-form-panel', toggleId: 'planning-toggle-btn', cancelId: 'cancel-plan-form-btn', titleId: 'planning-form-title', addTitle: tt('session_detail.planning.form.add_title','Ajouter une étape'), editTitle: tt('session_detail.planning.form.edit_title','Modifier une étape') });
  document.getElementById('planning-empty-add-btn')?.addEventListener('click', () => planningPanel.open(false));
  const planningForm = document.getElementById('planning-form');
  const submitLabel = document.getElementById('planning-submit-label');
  const planningIdInput = document.getElementById('planning-id');
  const list = document.getElementById('planning-list');

  async function movePlanningItem(itemId, direction) {
    const idx = planningItems.findIndex(row => Number(row.id) === Number(itemId));
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= planningItems.length) return;
    const current = planningItems[idx];
    const target = planningItems[swapIdx];
    const currentOrder = Number(current.order_index || idx + 1);
    const targetOrder = Number(target.order_index || swapIdx + 1);
    const tempOrder = -9999;
    let res = await supabase.from('session_plans').update({ order_index: tempOrder }).eq('id', current.id);
    if (res.error) throw res.error;
    res = await supabase.from('session_plans').update({ order_index: currentOrder }).eq('id', target.id);
    if (res.error) throw res.error;
    res = await supabase.from('session_plans').update({ order_index: targetOrder }).eq('id', current.id);
    if (res.error) throw res.error;
  }

  list?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.plan-edit-btn');
    const deleteBtn = e.target.closest('.plan-delete-btn');
    const moveUpBtn = e.target.closest('.plan-move-up-btn');
    const moveDownBtn = e.target.closest('.plan-move-down-btn');
    try {
      if (moveUpBtn) {
        await movePlanningItem(moveUpBtn.dataset.id, -1);
        showAlert('Étape déplacée vers le haut.');
        await loadAll();
        return;
      }
      if (moveDownBtn) {
        await movePlanningItem(moveDownBtn.dataset.id, 1);
        showAlert('Étape déplacée vers le bas.');
        await loadAll();
        return;
      }
      if (editBtn) {
        const item = planningItems.find(row => Number(row.id) === Number(editBtn.dataset.id));
        if (!item || !planningForm) return;
        planningForm.order_index.value = item.order_index || '';
        planningForm.title.value = item.title || '';
        planningForm.start_time.value = item.start_time || '';
        planningForm.end_time.value = item.end_time || '';
        planningForm.duration_minutes.value = item.duration_minutes || '';
        planningForm.objective.value = item.objective || '';
        planningForm.instructions.value = item.instructions || '';
        planningForm.equipment.value = item.equipment || '';
        planningIdInput.value = item.id;
        submitLabel.textContent = tt('common.update','Mettre à jour');
        planningPanel.open(true);
        return;
      }
      if (deleteBtn) {
        if (!confirm(`Supprimer ${deleteBtn.dataset.label} ?`)) return;
        const { error } = await supabase.from('session_plans').delete().eq('id', deleteBtn.dataset.id);
        if (error) { showAlert(error.message || 'Suppression impossible.', 'danger'); return; }
        showAlert('Étape supprimée avec succès.');
        await loadAll();
      }
    } catch (error) {
      showAlert(error.message || 'Action impossible sur le planning.', 'danger');
    }
  });

  bindFormSubmit('planning-form', async (fd, form) => {
    const payload = Object.fromEntries(fd.entries());
    const id = payload.id;
    delete payload.id;
    payload.session_id = currentSession.id;
    Object.keys(payload).forEach(key => payload[key] === '' && delete payload[key]);
    if (id) {
      const { error } = await supabase.from('session_plans').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      if (!payload.order_index) payload.order_index = planningItems.length + 1;
      const { error } = await supabase.from('session_plans').insert(payload);
      if (error) throw error;
    }
    form.reset();
    planningIdInput.value = '';
    submitLabel.textContent = tt('common.save','Enregistrer');
    planningPanel.close(true);
    showAlert(id ? 'Étape mise à jour avec succès.' : 'Étape ajoutée avec succès.');
    await loadAll();
  });
}

function renderTacticSelectOptions() {
  const select = document.getElementById('session-tactic-select');
  if (!select) return;
  const linkedIds = new Set(currentLinks.map(link => Number(link.tactics?.id || link.tactic_id)).filter(Boolean));
  const candidates = availableTactics.filter(t => t && !linkedIds.has(Number(t.id)));
  select.innerHTML = `<option value="">${tt('session_detail.linked_tactics.select_placeholder','Sélectionner une tactique')}</option>${candidates.map(t => `<option value="${t.id}">${escapeHtml(t.title || tt('session_detail.tactic_fallback','Tactique'))}${t.phase ? ` • ${escapeHtml(t.phase)}` : ''}${t.category ? ` • ${escapeHtml(t.category)}` : ''}</option>`).join('')}`;
  select.disabled = !candidates.length;
}

function wireTacticActions() {
  const form = document.getElementById('session-tactic-form');
  const select = document.getElementById('session-tactic-select');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tacticId = Number(select?.value || 0);
    if (!tacticId) {
      showAlert('Sélectionne une tactique à lier.', 'warning');
      return;
    }
    const alreadyLinked = currentLinks.some(link => Number(link.tactics?.id || link.tactic_id) === tacticId);
    if (alreadyLinked) {
      showAlert('Cette tactique est déjà liée à la séance.', 'warning');
      return;
    }
    const { error } = await supabase.from('session_tactics').insert({ session_id: currentSession.id, tactic_id: tacticId, priority: 'normal' });
    if (error) {
      showAlert(error.message || 'Liaison impossible.', 'danger');
      return;
    }
    showAlert('Tactique liée avec succès.');
    if (select) select.value = '';
    await loadAll();
  });

  host.querySelectorAll('.unlink-tactic-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tacticId = Number(btn.dataset.id || 0);
      if (!tacticId) return;
      if (!confirm(tt('session_detail.linked_tactics.confirm_remove','Retirer {{label}} de la séance ?').replace('{{label}}', btn.dataset.label || tt('session_detail.linked_tactics.this_tactic','cette tactique')))) return;
      const { error } = await supabase.from('session_tactics').delete().eq('session_id', currentSession.id).eq('tactic_id', tacticId);
      if (error) {
        showAlert(error.message || 'Suppression impossible.', 'danger');
        return;
      }
      showAlert('Tactique retirée avec succès.');
      await loadAll();
    });
  });
}
async function loadAll() {
  if (!sessionId) {
    showAlert('Identifiant de séance manquant.', 'danger');
    host.innerHTML = `<div class="card"><div class="card-body">Aucune séance sélectionnée.</div></div>`;
    return;
  }
  try {
    const [sessionRes, linksRes, plansRes] = await Promise.all([
      supabase.from('sessions').select('id,team_id,title,session_date,start_time,end_time,location,notes,teams(name)').eq('id', sessionId).single(),
      supabase.from('session_tactics').select('tactic_id,priority,tactics(id,title,phase,category)').eq('session_id', sessionId).order('id'),
      supabase.from('session_plans').select('*').eq('session_id', sessionId).order('order_index', { ascending: true }).order('id', { ascending: true })
    ]);
    if (sessionRes.error) throw sessionRes.error;
    if (linksRes.error && !String(linksRes.error.message || '').includes('relation')) throw linksRes.error;
    if (plansRes.error && !String(plansRes.error.message || '').includes('relation')) throw plansRes.error;
    currentSession = sessionRes.data;
    currentLinks = linksRes.data || [];
    planningItems = plansRes.data || [];
    if (isEditor) {
      const { data: tacticsData, error: tacticsError } = await supabase.from('tactics').select('id,title,phase,category,team_id').eq('team_id', currentSession.team_id || 0).order('title');
      if (tacticsError) throw tacticsError;
      availableTactics = tacticsData || [];
    }
    render();
  } catch (error) {
    console.error(error);
    showAlert(error.message || 'Impossible de charger la séance.', 'danger');
    host.innerHTML = `<div class="card"><div class="card-body">Impossible de charger les détails de la séance.</div></div>`;
  }
}

await loadAll();
