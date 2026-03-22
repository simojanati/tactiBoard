import { activateMenu, bindFormSubmit, escapeHtml, formatDate, getQueryParam, initCrudPanel, nl2br, setAppTitle, showAlert, supabase, tt } from './common.js';
import { canEdit, getUserContext } from './auth.js';
import { recalcLatePenaltyForPlayer } from './discipline.js';

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
let teamPlayers = [];
let attendanceRows = [];
let attendanceConfig = null;
let currentPlayerMembership = null;

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


function todayIso() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
}

function sessionTypeLabel(value) {
  return value === 'theory' ? 'Théorie' : 'Pratique';
}

function canManageAttendance() {
  return isEditor && currentSession?.session_date && currentSession.session_date <= todayIso();
}

function getAttendanceConfigValue(key, fallback = 0) {
  const value = Number(attendanceConfig?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function computeAttendanceDelta(status, lateMinutes = 0) {
  const practicePresence = getAttendanceConfigValue('practice_presence_points', 0);
  const practiceAbsence = getAttendanceConfigValue('practice_absence_penalty', 0);
  const isTheory = currentSession?.session_type === 'theory';
  const presencePoints = isTheory ? practicePresence / 2 : practicePresence;
  const absencePenalty = isTheory ? practiceAbsence / 2 : practiceAbsence;
  if (status === 'present') return presencePoints;
  if (status === 'absent_unexcused') return -absencePenalty;
  return 0;
}

function attendanceReasonLabel(status) {
  const type = sessionTypeLabel(currentSession?.session_type).toLowerCase();
  if (status === 'present') return `${type} - présence`;
  if (status === 'absent_unexcused') return `${type} - absence non excusée`;
  if (status === 'absent_excused') return `${type} - absence excusée`;
  return `${type} - présence`;
}

function attendanceImpactBadge(delta) {
  const num = Number(delta || 0);
  const cls = num > 0 ? 'bg-label-success' : num < 0 ? 'bg-label-danger' : 'bg-label-secondary';
  const sign = num > 0 ? '+' : '';
  return `<span class="badge ${cls}">${sign}${num} pt${Math.abs(num) > 1 ? 's' : ''}</span>`;
}

function attendanceSummary() {
  const counts = { present: 0, absent_excused: 0, absent_unexcused: 0, late: 0 };
  attendanceRows.forEach(row => {
    const status = row.attendance_status || 'present';
    counts[status] = (counts[status] || 0) + 1;
    if (Number(row.late_minutes || 0) > 0) counts.late += 1;
  });
  return counts;
}

function currentPlayerAttendanceRow() {
  if (ctx.role !== 'player' || !currentPlayerMembership) return null;
  return attendanceRows.find(row => Number(row.player_id) === Number(currentPlayerMembership.id)) || null;
}

function playerAttendanceHeroBadge() {
  if (ctx.role !== 'player') return '';
  const row = currentPlayerAttendanceRow();
  if (!row) return '';
  const late = Number(row.late_minutes || 0);
  const label = row.attendance_status === 'absent_excused'
    ? 'Absence excusée'
    : row.attendance_status === 'absent_unexcused'
      ? 'Absence'
      : late > 0
        ? `Présente • retard ${late} min`
        : 'Présente';
  const cls = row.attendance_status === 'absent_unexcused'
    ? 'bg-label-danger'
    : row.attendance_status === 'absent_excused'
      ? 'bg-label-info'
      : 'bg-label-success';
  return `<span class="badge ${cls}"><i class="bx bx-user-check me-1"></i>${label}</span>`;
}

function recordedAttendanceRowsWithPlayers() {
  if (!attendanceRows.length) return [];
  return attendanceRows.map(row => ({
    ...row,
    player: teamPlayers.find(player => Number(player.id) === Number(row.player_id)) || null
  }));
}

function renderAttendanceSection() {
  if (ctx.role === 'player') return '';
  const counts = attendanceSummary();
  const canManage = canManageAttendance();
  const recordedRows = recordedAttendanceRowsWithPlayers();
  return `
    <div class="card mb-4">
      <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h5 class="mb-0">Présences & discipline</h5>
          <div class="text-muted small">Affichage limité à cette séance. Le retard est enregistré sans impact pour le moment.</div>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          ${recordedRows.length ? `<span class="badge bg-label-success">Présentes ${counts.present}</span>
          <span class="badge bg-label-info">Excusées ${counts.absent_excused}</span>
          <span class="badge bg-label-danger">Absentes ${counts.absent_unexcused}</span>
          <span class="badge bg-label-warning">Retards ${counts.late}</span>` : ''}
          ${isEditor ? `<button class="btn btn-sm btn-primary" id="attendance-open-btn" ${canManage ? '' : 'disabled'}><i class="bx bx-check-square me-1"></i>Gestion présence</button>` : ''}
        </div>
      </div>
      <div class="card-body">
        <div class="row g-3 mb-3">
          <div class="col-md-4"><div class="session-detail-box h-100"><div class="session-detail-box-label">Type de séance</div><div class="fw-semibold">${sessionTypeLabel(currentSession?.session_type)}</div></div></div>
          <div class="col-md-4"><div class="session-detail-box h-100"><div class="session-detail-box-label">Présence pratique</div><div class="fw-semibold">+${getAttendanceConfigValue('practice_presence_points', 0)} pts</div><div class="small text-muted">Théorie: +${getAttendanceConfigValue('practice_presence_points', 0) / 2} pts</div></div></div>
          <div class="col-md-4"><div class="session-detail-box h-100"><div class="session-detail-box-label">Absence non excusée</div><div class="fw-semibold">-${getAttendanceConfigValue('practice_absence_penalty', 0)} pts</div><div class="small text-muted">Théorie: -${getAttendanceConfigValue('practice_absence_penalty', 0) / 2} pts</div></div></div>
        </div>
        ${!canManage && isEditor ? `<div class="alert alert-secondary py-2 ${recordedRows.length ? 'mb-3' : 'mb-0'}">La gestion de présence est disponible le jour de la séance et après.</div>` : ''}
        ${recordedRows.length ? `<div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>Joueuse</th><th>Statut</th><th>Retard</th><th>Impact</th></tr></thead><tbody>${recordedRows.map(({ player, attendance_status, late_minutes, points_delta }) => {
          const status = attendance_status || 'present';
          const late = Number(late_minutes || 0);
          const delta = Number(points_delta ?? computeAttendanceDelta(status, late));
          return `<tr><td>${escapeHtml(player?.full_name || 'Joueuse')}</td><td>${status === 'absent_excused' ? 'Excusée' : status === 'absent_unexcused' ? 'Absente' : 'Présente'}</td><td>${late > 0 ? `${late} min` : '—'}</td><td>${attendanceImpactBadge(delta)}</td></tr>`;
        }).join('')}</tbody></table></div>` : `<div class="text-muted">Aucune présence n'est encore enregistrée pour cette séance.</div>`}
      </div>
    </div>

    ${isEditor ? `<div class="modal fade" id="attendance-modal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Gestion présence</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body"><form id="attendance-form"><div class="table-responsive"><table class="table align-middle"><thead><tr><th>Joueuse</th><th>Présente</th><th>Excusée</th><th>Absente</th><th>Retard (min)</th><th>Impact</th></tr></thead><tbody>${teamPlayers.map(player => {
      const row = attendanceRows.find(item => Number(item.player_id) === Number(player.id));
      const status = row?.attendance_status || 'present';
      const late = Number(row?.late_minutes || 0);
      const delta = Number(row?.points_delta ?? computeAttendanceDelta(status, late));
      return `<tr data-player-id="${player.id}"><td><div class="fw-semibold">${escapeHtml(player.full_name || '')}</div><div class="small text-muted">Points actuels: ${Number(player.current_points || 0)}</div></td><td><input class="form-check-input attendance-status" type="radio" name="status_${player.id}" value="present" ${status === 'present' ? 'checked' : ''}></td><td><input class="form-check-input attendance-status" type="radio" name="status_${player.id}" value="absent_excused" ${status === 'absent_excused' ? 'checked' : ''}></td><td><input class="form-check-input attendance-status" type="radio" name="status_${player.id}" value="absent_unexcused" ${status === 'absent_unexcused' ? 'checked' : ''}></td><td><input class="form-control form-control-sm attendance-late" type="number" min="0" step="1" value="${late > 0 ? late : ''}" ${status === 'present' ? '' : 'disabled'}></td><td class="attendance-impact-cell">${attendanceImpactBadge(delta)}</td></tr>`;
    }).join('')}</tbody></table></div></form></div><div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Fermer</button><button type="button" class="btn btn-primary" id="attendance-save-btn">Enregistrer</button></div></div></div></div>` : ''}
  `;
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
                  <span class="badge ${currentSession.session_type === 'theory' ? 'bg-label-info' : 'bg-label-primary'}">${sessionTypeLabel(currentSession.session_type)}</span>
                  <span class="badge bg-label-secondary">${sessionDurationLabel(currentSession)}</span>
                  ${playerAttendanceHeroBadge()}
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

        ${renderAttendanceSection()}

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
    wireAttendanceActions();
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


function updateAttendancePreviewRow(tr) {
  if (!tr) return;
  const status = tr.querySelector('.attendance-status:checked')?.value || 'present';
  const lateInput = tr.querySelector('.attendance-late');
  if (lateInput) {
    lateInput.disabled = status !== 'present';
    if (status !== 'present') lateInput.value = '';
  }
  const late = Number(lateInput?.value || 0);
  const delta = computeAttendanceDelta(status, late);
  const impactCell = tr.querySelector('.attendance-impact-cell');
  if (impactCell) impactCell.innerHTML = attendanceImpactBadge(delta);
}

function wireAttendanceActions() {
  const modalEl = document.getElementById('attendance-modal');
  const openBtn = document.getElementById('attendance-open-btn');
  const saveBtn = document.getElementById('attendance-save-btn');
  if (!modalEl || !openBtn || !saveBtn || !window.bootstrap) return;
  const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
  openBtn.addEventListener('click', () => modal.show());
  modalEl.querySelectorAll('tbody tr').forEach(tr => {
    tr.querySelectorAll('.attendance-status').forEach(input => input.addEventListener('change', () => updateAttendancePreviewRow(tr)));
    tr.querySelector('.attendance-late')?.addEventListener('input', () => updateAttendancePreviewRow(tr));
    updateAttendancePreviewRow(tr);
  });
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const oldHtml = saveBtn.innerHTML;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Enregistrement...';
    try {
      const formRows = [...modalEl.querySelectorAll('tbody tr')].map(tr => ({
        player_id: Number(tr.dataset.playerId),
        attendance_status: tr.querySelector('.attendance-status:checked')?.value || 'present',
        late_minutes: Number(tr.querySelector('.attendance-late')?.value || 0)
      }));
      const existingMap = new Map(attendanceRows.map(row => [Number(row.player_id), row]));
      const updatedLateByPlayer = new Map();
      for (const item of formRows) {
        const previous = existingMap.get(item.player_id);
        const normalizedLate = item.attendance_status === 'present' ? item.late_minutes : 0;
        const newDelta = computeAttendanceDelta(item.attendance_status, normalizedLate);
        const oldDelta = Number(previous?.points_delta || 0);
        const diff = newDelta - oldDelta;
        const payload = {
          session_id: currentSession.id,
          team_id: currentSession.team_id,
          player_id: item.player_id,
          attendance_status: item.attendance_status,
          late_minutes: normalizedLate,
          points_delta: newDelta,
          points_reason: attendanceReasonLabel(item.attendance_status),
          recorded_by: ctx.user?.id || null,
          recorded_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        const { error: upsertError } = await supabase.from('session_attendance').upsert(payload, { onConflict: 'session_id,player_id' });
        if (upsertError) throw upsertError;
        updatedLateByPlayer.set(item.player_id, normalizedLate);
        if (diff !== 0) {
          const player = teamPlayers.find(row => Number(row.id) === Number(item.player_id));
          const nextPoints = Number(player?.current_points || 0) + diff;
          const { error: playerError } = await supabase.from('players').update({ current_points: nextPoints }).eq('id', item.player_id);
          if (playerError) throw playerError;
          if (player) player.current_points = nextPoints;
          const { error: historyError } = await supabase.from('player_points_history').insert({
            player_id: item.player_id,
            session_id: currentSession.id,
            delta: diff,
            label: previous ? `${attendanceReasonLabel(item.attendance_status)} · correction` : attendanceReasonLabel(item.attendance_status),
            source_type: 'attendance',
            created_by: ctx.user?.id || null
          });
          if (historyError) throw historyError;
        }
      }

      for (const item of formRows) {
        const player = teamPlayers.find(row => Number(row.id) === Number(item.player_id));
        await recalcLatePenaltyForPlayer(item.player_id, {
          actorId: ctx.user?.id || null,
          playerRow: player || null,
          teamConfig: attendanceConfig || {},
          reason: 'Recalcul pénalité retard · séance'
        });
      }

      showAlert('Présences enregistrées avec succès.');
      modal.hide();
      await loadAll();
    } catch (error) {
      console.error(error);
      showAlert(error.message || "Impossible d'enregistrer les présences.", 'danger');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = oldHtml;
    }
  });
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
      supabase.from('sessions').select('id,team_id,title,session_type,session_date,start_time,end_time,location,notes,teams(name)').eq('id', sessionId).single(),
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
    const attendanceQueries = [
      supabase.from('players').select('id,team_id,full_name,current_points,late_adjusted_minutes,late_penalty_applied').eq('team_id', currentSession.team_id || 0).order('full_name'),
      supabase.from('session_attendance').select('player_id,attendance_status,late_minutes,points_delta').eq('session_id', currentSession.id),
      supabase.from('teams').select('default_player_points,practice_presence_points,practice_absence_penalty,late_penalty_threshold_minutes,late_penalty_points').eq('id', currentSession.team_id || 0).maybeSingle()
    ];
    if (ctx.role === 'player' && ctx.user?.id) {
      attendanceQueries.push(supabase.from('players').select('id,team_id,full_name,current_points,late_adjusted_minutes,late_penalty_applied').eq('team_id', currentSession.team_id || 0).eq('profile_id', ctx.user.id).maybeSingle());
    }
    const [playersRes, attendanceRes, teamRes, playerMembershipRes] = await Promise.all(attendanceQueries);
    const { data: playersData, error: playersError } = playersRes;
    const { data: attendanceData, error: attendanceError } = attendanceRes;
    const { data: teamData, error: teamError } = teamRes;
    if (playersError && !String(playersError.message || '').includes('relation')) throw playersError;
    if (attendanceError && !String(attendanceError.message || '').includes('relation')) throw attendanceError;
    if (teamError && !String(teamError.message || '').includes('relation')) throw teamError;
    teamPlayers = playersData || [];
    attendanceRows = attendanceData || [];
    attendanceConfig = teamData || {};
    currentPlayerMembership = playerMembershipRes?.data || null;
    render();
  } catch (error) {
    console.error(error);
    showAlert(error.message || 'Impossible de charger la séance.', 'danger');
    host.innerHTML = `<div class="card"><div class="card-body">Impossible de charger les détails de la séance.</div></div>`;
  }
}

await loadAll();
