import { activateMenu, escapeHtml, formatDate, getQueryParam, personAvatarUrl, setAppTitle, showAlert, supabase } from './common.js';
import { requireAuthForPage } from './auth.js';
import { buildDisciplineStats, computeLatePenaltyState, recalcLatePenaltyForPlayer } from './discipline.js';

setAppTitle('Détail joueuse');
activateMenu('players');

const host = document.getElementById('player-detail-content');
const titleEl = document.getElementById('player-detail-title');
const subtitleEl = document.getElementById('player-detail-subtitle');
const backToPlayers = document.getElementById('back-to-players');
const backToTeam = document.getElementById('back-to-team');

function captainBadge(value, sizeClass = '') {
  const map = { captain_1: '../assets/img/captains/captaine1.png', captain_2: '../assets/img/captains/captaine2.png', captain_3: '../assets/img/captains/captaine3.png' };
  const labels = { captain_1: 'Capitaine 1', captain_2: 'Capitaine 2', captain_3: 'Capitaine 3' };
  const src = map[value];
  if (!src) return '<span class="text-muted">—</span>';
  const title = labels[value] || '';
  return `<span class="captain-icon-wrap" title="${escapeHtml(title)}"><img src="${src}" alt="${escapeHtml(title)}" class="captain-icon ${sizeClass}"></span>`;
}

function statCard(label, value, tone = 'primary') {
  return `<div class="col-6 col-lg-3 mb-3"><div class="border rounded-3 p-3 h-100"><div class="small text-muted mb-1">${escapeHtml(label)}</div><div class="fw-semibold text-${tone}">${escapeHtml(String(value))}</div></div></div>`;
}

function impactBadge(delta) {
  const value = Number(delta || 0);
  if (value > 0) return `<span class="badge bg-label-success">+${value}</span>`;
  if (value < 0) return `<span class="badge bg-label-danger">${value}</span>`;
  return `<span class="badge bg-label-secondary">0</span>`;
}

function sessionTypeLabel(value) {
  return value === 'theory' ? 'Théorie' : 'Pratique';
}

function attendanceStatusLabel(value) {
  if (value === 'absent_excused') return 'Absence excusée';
  if (value === 'absent_unexcused') return 'Absence non excusée';
  return 'Présence';
}

function buildAdjustmentModal(state, canAdjust) {
  if (!canAdjust) return '';
  return `
    <div class="modal fade" id="late-adjust-modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Ajuster le retard cumulé</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fermer"></button>
          </div>
          <form id="late-adjust-form">
            <div class="modal-body">
              <div class="alert alert-info mb-3">
                <div class="small mb-1">Retard total enregistré</div>
                <div class="fw-semibold">${state.totalLateMinutes} min</div>
              </div>
              <div class="mb-3">
                <label class="form-label">Minutes ajustées</label>
                <input class="form-control" type="number" min="0" step="1" name="late_adjusted_minutes" value="${state.adjustedMinutes}" required />
                <div class="form-text">Utilise cette valeur pour retirer des minutes déjà rattrapées par la joueuse.</div>
              </div>
              <div class="mb-0">
                <label class="form-label">Motif</label>
                <textarea class="form-control" rows="3" name="reason" placeholder="Exemple : rattrapage sur séance supplémentaire"></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
              <button type="submit" class="btn btn-primary" id="late-adjust-save-btn">Enregistrer</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
}

function wireAdjustmentModal({ ctx, player, teamConfig }) {
  const modalEl = document.getElementById('late-adjust-modal');
  const openBtn = document.getElementById('open-late-adjust-btn');
  const form = document.getElementById('late-adjust-form');
  const saveBtn = document.getElementById('late-adjust-save-btn');
  if (!modalEl || !openBtn || !form || !saveBtn || !window.bootstrap) return;
  const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
  openBtn.addEventListener('click', () => modal.show());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const adjustedMinutes = Number(fd.get('late_adjusted_minutes') || 0);
    const reasonText = String(fd.get('reason') || '').trim();
    if (!Number.isInteger(adjustedMinutes) || adjustedMinutes < 0) {
      showAlert('Les minutes ajustées doivent être un nombre entier positif.', 'danger');
      return;
    }
    saveBtn.disabled = true;
    const oldLabel = saveBtn.innerHTML;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Enregistrement...';
    try {
      const { data: playerBefore, error: readError } = await supabase
        .from('players')
        .select('id,team_id,current_points,late_adjusted_minutes,late_penalty_applied')
        .eq('id', player.id)
        .maybeSingle();
      if (readError) throw readError;
      const { error: updateError } = await supabase
        .from('players')
        .update({ late_adjusted_minutes: adjustedMinutes })
        .eq('id', player.id);
      if (updateError) throw updateError;
      const { data: attendanceRows, error: attendanceError } = await supabase
        .from('session_attendance')
        .select('late_minutes')
        .eq('player_id', player.id);
      if (attendanceError) throw attendanceError;
      await recalcLatePenaltyForPlayer(player.id, {
        actorId: ctx.user?.id || null,
        playerRow: { ...playerBefore, late_adjusted_minutes: adjustedMinutes },
        teamConfig,
        attendanceRows: attendanceRows || [],
        reason: reasonText || 'Ajustement retard cumulé'
      });
      showAlert('Retard cumulé ajusté avec succès.');
      modal.hide();
      window.location.reload();
    } catch (error) {
      console.error(error);
      showAlert(error.message || 'Impossible de mettre à jour le retard cumulé.', 'danger');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = oldLabel;
    }
  });
}

(async () => {
  const ctx = await requireAuthForPage();
  if (!ctx) return;

  const playerId = getQueryParam('id');
  const from = getQueryParam('from');
  if (from === 'my-team') {
    backToPlayers?.classList.add('d-none');
    backToTeam?.classList.remove('d-none');
  }
  if (!playerId) {
    showAlert('Joueuse introuvable.', 'danger');
    host.innerHTML = '<div class="card"><div class="card-body text-muted">Identifiant de joueuse manquant.</div></div>';
    return;
  }

  try {
    const { data: player, error } = await supabase
      .from('players')
      .select('id,team_id,profile_id,image_url,full_name,jersey_number,primary_position,secondary_position,status,captain_role,age,height_cm,weight_kg,current_points,late_adjusted_minutes,late_penalty_applied,teams(id,name,logo_url,category,season,late_penalty_threshold_minutes,late_penalty_points)')
      .eq('id', playerId)
      .maybeSingle();
    if (error) throw error;
    if (!player?.id) throw new Error('Joueuse introuvable.');

    if (ctx.role === 'coach') {
      const { data: coachMembership, error: coachError } = await supabase.from('coaches').select('team_id').eq('profile_id', ctx.user.id).maybeSingle();
      if (coachError) throw coachError;
      if (!coachMembership?.team_id || Number(coachMembership.team_id) !== Number(player.team_id)) {
        throw new Error('Accès non autorisé à cette joueuse.');
      }
    }

    const canAdjustLate = ['admin', 'coach'].includes(ctx.role);
    const teamConfig = {
      late_penalty_threshold_minutes: player.teams?.late_penalty_threshold_minutes || 0,
      late_penalty_points: player.teams?.late_penalty_points || 0
    };

    titleEl.textContent = player.full_name || 'Détail joueuse';
    subtitleEl.innerHTML = `<span class="badge bg-label-primary">${escapeHtml(player.teams?.name || 'Équipe')}</span><span class="ms-2 text-muted">#${escapeHtml(player.jersey_number ?? '—')} · ${escapeHtml(player.primary_position || '—')}</span>`;

    const [attendanceRes, historyRes] = await Promise.all([
      supabase
        .from('session_attendance')
        .select('id,session_id,attendance_status,late_minutes,points_delta,points_reason,recorded_at,sessions(title,session_date,session_type,start_time)')
        .eq('player_id', player.id)
        .order('recorded_at', { ascending: false }),
      supabase
        .from('player_points_history')
        .select('id,session_id,delta,label,source_type,created_at')
        .eq('player_id', player.id)
        .order('created_at', { ascending: false })
        .limit(25)
    ]);
    if (attendanceRes.error) throw attendanceRes.error;
    if (historyRes.error) throw historyRes.error;

    const attendanceRows = attendanceRes.data || [];
    const historyRows = historyRes.data || [];
    const stats = buildDisciplineStats(attendanceRows);
    const lateState = computeLatePenaltyState(attendanceRows, player.late_adjusted_minutes || 0, teamConfig);

    host.innerHTML = `
      <div class="row">
        <div class="col-lg-4 mb-4">
          <div class="card h-100">
            <div class="card-body text-center">
              <img src="${personAvatarUrl(player)}" alt="${escapeHtml(player.full_name || '')}" class="rounded-circle mb-3" style="width:96px;height:96px;object-fit:cover;">
              <h5 class="mb-1">${escapeHtml(player.full_name || '')}</h5>
              <div class="small text-muted mb-2">#${escapeHtml(player.jersey_number ?? '—')} · ${escapeHtml(player.primary_position || '—')}</div>
              <div class="d-flex justify-content-center align-items-center gap-2 flex-wrap mb-3">${captainBadge(player.captain_role, 'captain-icon-lg')}<span class="badge bg-label-warning">${Number(player.current_points || 0)} pts</span></div>
              <div class="text-start small">
                <div class="mb-2"><span class="text-muted">Équipe :</span> <span class="fw-semibold">${escapeHtml(player.teams?.name || '—')}</span></div>
                <div class="mb-2"><span class="text-muted">Statut :</span> ${escapeHtml(player.status || '—')}</div>
                <div class="mb-2"><span class="text-muted">Âge :</span> ${escapeHtml(player.age ?? '—')}</div>
                <div class="mb-2"><span class="text-muted">Taille :</span> ${escapeHtml(player.height_cm ?? '—')} ${player.height_cm ? 'cm' : ''}</div>
                <div class="mb-2"><span class="text-muted">Poids :</span> ${escapeHtml(player.weight_kg ?? '—')} ${player.weight_kg ? 'kg' : ''}</div>
                <div><span class="text-muted">Poste secondaire :</span> ${escapeHtml(player.secondary_position || '—')}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-8 mb-4">
          <div class="card h-100">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <div>
                  <h5 class="mb-1">Discipline</h5>
                  <div class="small text-muted">Vue détaillée des présences, absences, retard cumulé et impacts de points.</div>
                </div>
                <div class="d-flex align-items-center gap-2 flex-wrap">
                  <span class="badge bg-label-warning">${Number(player.current_points || 0)} pts</span>
                  ${canAdjustLate ? '<button class="btn btn-sm btn-outline-primary" id="open-late-adjust-btn"><i class="bx bx-time-five me-1"></i>Ajuster retard</button>' : ''}
                </div>
              </div>
              <div class="row">
                ${statCard('Présences', stats.present, 'success')}
                ${statCard('Excusées', stats.excused, 'secondary')}
                ${statCard('Absences', stats.absent, 'danger')}
                ${statCard('Retard total', `${lateState.totalLateMinutes} min`, 'warning')}
                ${statCard('Minutes ajustées', `${lateState.adjustedMinutes} min`, 'info')}
                ${statCard('Retard effectif', `${lateState.effectiveLateMinutes} min`, 'warning')}
                ${statCard('Paliers dépassés', lateState.penaltySteps, 'danger')}
                ${statCard('Impact retard', `${lateState.penaltyTotal} pts`, lateState.penaltyTotal < 0 ? 'danger' : 'secondary')}
              </div>
              <div class="small text-muted mt-2">Seuil équipe : ${lateState.thresholdMinutes} min • Pénalité appliquée à chaque seuil : ${lateState.penaltyPoints} pt${lateState.penaltyPoints > 1 ? 's' : ''}</div>
            </div>
          </div>
        </div>
        <div class="col-12 mb-4">
          <div class="card">
            <div class="card-body">
              <h5 class="mb-3">Historique des points</h5>
              ${historyRows.length ? `<div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>Date</th><th>Motif</th><th>Source</th><th>Impact</th></tr></thead><tbody>${historyRows.map(item => `<tr><td>${escapeHtml(formatDate(item.created_at))}</td><td>${escapeHtml(item.label || 'Discipline')}</td><td>${escapeHtml(item.source_type || 'attendance')}</td><td>${impactBadge(item.delta)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="text-muted small">Aucun mouvement de points pour le moment.</div>`}
            </div>
          </div>
        </div>
        <div class="col-12 mb-4">
          <div class="card">
            <div class="card-body">
              <h5 class="mb-3">Présences enregistrées</h5>
              ${attendanceRows.length ? `<div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>Séance</th><th>Type</th><th>Statut</th><th>Retard</th><th>Impact</th><th>Enregistré le</th></tr></thead><tbody>${attendanceRows.map(item => `<tr><td><div class="fw-semibold">${escapeHtml(item.sessions?.title || 'Séance')}</div><div class="small text-muted">${escapeHtml(formatDate(item.sessions?.session_date))}${item.sessions?.start_time ? ` · ${escapeHtml(String(item.sessions.start_time).slice(0,5))}` : ''}</div></td><td>${sessionTypeLabel(item.sessions?.session_type)}</td><td>${attendanceStatusLabel(item.attendance_status)}</td><td>${Number(item.late_minutes || 0)} min</td><td>${impactBadge(item.points_delta)}</td><td>${escapeHtml(formatDate(item.recorded_at))}</td></tr>`).join('')}</tbody></table></div>` : `<div class="text-muted small">Aucune présence enregistrée pour le moment.</div>`}
            </div>
          </div>
        </div>
      </div>
      ${buildAdjustmentModal(lateState, canAdjustLate)}`;

    wireAdjustmentModal({ ctx, player, teamConfig });
  } catch (err) {
    console.error(err);
    showAlert(err.message || 'Impossible de charger le détail de la joueuse.', 'danger');
    host.innerHTML = `<div class="card"><div class="card-body text-muted">${escapeHtml(err.message || 'Impossible de charger le détail de la joueuse.')}</div></div>`;
  }
})();
