import { activateMenu, escapeHtml, setAppTitle, personAvatarUrl, showAlert, supabase, uploadTeamRolesPdf } from './common.js';
import { recalcLatePenaltyForPlayer } from './discipline.js';
import { getPortalContext, fetchTeamBundle, renderPortalEmpty, roleBadge, renderSimpleTable } from './portal-common.js';
const tt = (key, fallback = '') => (window.t ? window.t(key, fallback) : fallback || key);

function captainBadge(value, sizeClass = '') {
  const map = { captain_1: '../assets/img/captains/captaine1.png', captain_2: '../assets/img/captains/captaine2.png', captain_3: '../assets/img/captains/captaine3.png' };
  const labels = {
    captain_1: tt('players.captain_1', 'Capitaine 1'),
    captain_2: tt('players.captain_2', 'Capitaine 2'),
    captain_3: tt('players.captain_3', 'Capitaine 3')
  };
  const src = map[value];
  if (!src) return '<span class="text-muted">—</span>';
  const title = labels[value] || '';
  return `<span class="captain-icon-wrap" title="${escapeHtml(title)}"><img src="${src}" alt="${escapeHtml(title || 'Captain')}" class="captain-icon ${sizeClass}"></span>`;
}

function ageCell(value) {
  return value == null || value === '' ? '—' : escapeHtml(String(value));
}

function pointsBadge(value) {
  return `<span class="badge bg-label-warning">${Number(value || 0)} ${tt('player_detail.unit_pts','pts')}</span>`;
}

function statCard(label, value, tone = 'primary') {
  return `<div class="col-6 col-lg-3 mb-3"><div class="border rounded-3 p-3 h-100"><div class="small text-muted mb-1">${escapeHtml(label)}</div><div class="fw-semibold text-${tone}">${escapeHtml(String(value))}</div></div></div>`;
}



function validateEvenPoints(value, label) {
  const num = Number(value);
  if (!Number.isInteger(num)) throw new Error(tt('my_team.validation_integer','{label} doit être un nombre entier.').replace('{label}', label));
  if (num % 2 !== 0) throw new Error(tt('my_team.validation_even','{label} doit être un nombre pair, car la théorie vaut 50% de la pratique.').replace('{label}', label));
  if (num < 0) throw new Error(tt('my_team.validation_positive','{label} doit être positif.').replace('{label}', label));
  return num;
}

function validateWholePositive(value, label) {
  const num = Number(value);
  if (!Number.isInteger(num)) throw new Error(tt('my_team.validation_integer','{label} doit être un nombre entier.').replace('{label}', label));
  if (num < 0) throw new Error(tt('my_team.validation_positive','{label} doit être positif.').replace('{label}', label));
  return num;
}

function updateTeamConfigTheoryPreviews(form) {
  if (!form) return;
  const practicePresence = Number(form.practice_presence_points?.value || 0);
  const practiceAbsence = Number(form.practice_absence_penalty?.value || 0);
  const presencePreview = form.querySelector('[data-team-config-preview="theory-presence"]');
  const absencePreview = form.querySelector('[data-team-config-preview="theory-absence"]');
  if (presencePreview) presencePreview.value = Number.isFinite(practicePresence) ? practicePresence / 2 : '';
  if (absencePreview) absencePreview.value = Number.isFinite(practiceAbsence) ? practiceAbsence / 2 : '';
}

function buildPlayerDisciplineStats(rows = []) {
  return rows.reduce((acc, row) => {
    const status = row.attendance_status || 'present';
    if (status === 'present') acc.present += 1;
    if (status === 'absent_excused') acc.excused += 1;
    if (status === 'absent_unexcused') acc.absent += 1;
    acc.late += Number(row.late_minutes || 0);
    return acc;
  }, { present: 0, excused: 0, absent: 0, late: 0 });
}

function captainPriority(value) {
  const map = { captain_1: 0, captain_2: 1, captain_3: 2 };
  return map[value] ?? 9;
}

function rankBadge(index) {
  if (index === 0) return '<span class="badge bg-label-warning"><i class="bx bxs-medal me-1"></i>#1</span>';
  if (index === 1) return '<span class="badge bg-label-secondary"><i class="bx bxs-medal me-1"></i>#2</span>';
  return '<span class="badge bg-label-info"><i class="bx bxs-medal me-1"></i>#3</span>';
}

function podiumTone(index) {
  return index === 0 ? 'warning' : (index === 1 ? 'secondary' : 'info');
}

function buildPodiumCard(player, index, stats) {
  const tone = podiumTone(index);
  return `<div class="col-lg-4 col-md-6 mb-3"><div class="card h-100 border-${tone}"><div class="card-body"><div class="d-flex justify-content-between align-items-start gap-2 mb-3"><div>${rankBadge(index)}</div>${captainBadge(player.captain_role)}</div><div class="text-center"><img src="${personAvatarUrl(player)}" alt="${escapeHtml(player.full_name || '')}" class="rounded-circle mb-3" style="width:72px;height:72px;object-fit:cover;"><div class="fw-semibold">${escapeHtml(player.full_name || '')}</div><div class="small text-muted">#${escapeHtml(player.jersey_number ?? '—')} · ${escapeHtml(player.primary_position || '—')}</div></div><div class="d-flex justify-content-center mt-3">${pointsBadge(player.current_points || 0)}</div><div class="small text-muted text-center mt-2">${tt('my_team.unexcused_absences','Absences non excusées')}: ${Number(stats.absent || 0)}</div></div></div></div>`;
}

setAppTitle(tt('page.my_team', 'Mon équipe'));
activateMenu('my-team');
const host = document.getElementById('portal-content');
const ctx = await getPortalContext();
if (!ctx.teamId) {
  renderPortalEmpty(host, tt('my_team.no_team_title','Aucune liaison équipe'), tt('my_team.no_team_desc', "Lie d'abord ce compte à une joueuse ou un coach pour afficher son équipe."));
} else {
  const bundle = await fetchTeamBundle(ctx.teamId);
  let myAttendance = [];
  let myHistory = [];
  let teamAttendance = [];
  try {
    const attendanceQuery = supabase.from('session_attendance').select('player_id,attendance_status,late_minutes,points_delta,recorded_at').eq('team_id', ctx.teamId).order('recorded_at', { ascending: false });
    const historyQuery = ctx.role === 'player' && ctx.membership?.id
      ? supabase.from('player_points_history').select('id,session_id,delta,label,created_at').eq('player_id', ctx.membership.id).order('created_at', { ascending: false }).limit(5)
      : Promise.resolve({ data: [], error: null });
    const [attendanceRes, historyRes] = await Promise.all([attendanceQuery, historyQuery]);
    if (!attendanceRes.error) teamAttendance = attendanceRes.data || [];
    if (ctx.role === 'player' && ctx.membership?.id) {
      myAttendance = teamAttendance.filter(item => item.player_id === ctx.membership.id);
      if (!historyRes.error) myHistory = historyRes.data || [];
    }
  } catch (err) {
    console.warn('discipline data unavailable', err);
  }
  const disciplineByPlayer = new Map();
  for (const row of teamAttendance) {
    const current = disciplineByPlayer.get(row.player_id) || { present: 0, excused: 0, absent: 0, late: 0 };
    const status = row.attendance_status || 'present';
    if (status === 'present') current.present += 1;
    if (status === 'absent_excused') current.excused += 1;
    if (status === 'absent_unexcused') current.absent += 1;
    current.late += Number(row.late_minutes || 0);
    disciplineByPlayer.set(row.player_id, current);
  }
  const rankedPlayers = [...bundle.players].sort((a, b) => {
    const pointsDiff = Number(b.current_points || 0) - Number(a.current_points || 0);
    if (pointsDiff !== 0) return pointsDiff;
    const absentDiff = Number((disciplineByPlayer.get(a.id)?.absent) || 0) - Number((disciplineByPlayer.get(b.id)?.absent) || 0);
    if (absentDiff !== 0) return absentDiff;
    const captainDiff = captainPriority(a.captain_role) - captainPriority(b.captain_role);
    if (captainDiff !== 0) return captainDiff;
    return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'fr', { sensitivity: 'base' });
  });
  const topPlayers = rankedPlayers.slice(0, 3);
  const myStats = buildPlayerDisciplineStats(myAttendance);
  document.getElementById('portal-title').textContent = ctx.teamName || bundle.team?.name || tt('page.my_team','Mon équipe');
  document.getElementById('portal-subtitle').innerHTML = `${roleBadge(ctx.role)} <span class="ms-2 text-muted">${escapeHtml(ctx.fullName || '')}</span>`;
  host.innerHTML = `
    <div class="row mb-4">
      <div class="col-lg-4 mb-3"><div class="card h-100"><div class="card-body"><h5 class="mb-2">${tt('my_team.profile','Mon profil')}</h5>
        ${ctx.role === 'player'
          ? `<div><strong>${escapeHtml(ctx.membership?.full_name || '')}</strong></div><div class="small text-muted">#${escapeHtml(ctx.membership?.jersey_number ?? '—')} · ${escapeHtml(ctx.membership?.primary_position || '—')}</div><div class="small text-muted mt-2 d-flex align-items-center gap-2 flex-wrap">${captainBadge(ctx.membership?.captain_role, 'captain-icon-lg')}<span>${tt('my_team.age','Âge')}: ${ageCell(ctx.membership?.age)}</span>${pointsBadge(ctx.membership?.current_points || 0)}</div><div class="small text-muted mt-2">${tt('my_team.status','Statut')}: ${escapeHtml(ctx.membership?.status || '—')}</div>`
          : `<div><strong>${escapeHtml(ctx.membership?.full_name || '')}</strong></div><div class="small text-muted">${escapeHtml(ctx.membership?.role || tt('my_team.role_coach','Coach'))}</div><div class="small text-muted mt-2">${escapeHtml(ctx.membership?.email || '')}</div>`}
      </div></div></div>
      <div class="col-lg-4 mb-3"><div class="card h-100"><div class="card-body"><h5 class="mb-2">${tt('my_team.team','Équipe')}</h5><div class="team-title-wrap"><img src="${bundle.team?.logo_url || '../assets/img/branding/team-logo-placeholder.png'}" alt="${escapeHtml(bundle.team?.name || ctx.teamName || '')}" class="team-logo-md"><div><strong>${escapeHtml(bundle.team?.name || ctx.teamName || '')}</strong><div class="small text-muted">${tt('my_team.category','Catégorie')}: ${escapeHtml(bundle.team?.category || '—')}</div><div class="small text-muted">${tt('my_team.season','Saison')}: ${escapeHtml(bundle.team?.season || '—')}</div></div></div></div></div></div>
      <div class="col-lg-4 mb-3"><div class="card h-100"><div class="card-body"><h5 class="mb-2">${tt('my_team.summary','Résumé')}</h5><div class="small text-muted">${tt('my_team.players_count','{players} joueuses · {coaches} coachs · {tactics} tactiques').replace('{players}', bundle.players.length).replace('{coaches}', bundle.coaches.length).replace('{tactics}', bundle.tactics.length)}</div><div class="small text-muted mt-2">${tt('my_team.sessions_count','{sessions} séances · {matches} matchs').replace('{sessions}', bundle.sessions.length).replace('{matches}', bundle.matches.length)}</div></div></div></div>
    </div>
    <div class="row mb-4">
      <div class="col-12"><div class="card"><div class="card-body"><div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3"><div><h5 class="mb-1">${tt('my_team.roles_title', "Rôles de l'équipe")}</h5><div class="small text-muted">${bundle.team?.roles_pdf_url ? tt('my_team.roles_available','Le document PDF des rôles est disponible pour cette équipe.') : tt('my_team.roles_empty','Aucun document de rôles disponible pour cette équipe.')}</div></div><div id="team-roles-actions" class="d-flex flex-wrap gap-2">${bundle.team?.roles_pdf_url ? `<a class="btn btn-outline-primary" href="${bundle.team.roles_pdf_url}" target="_blank" rel="noopener" download="${escapeHtml(bundle.team.roles_pdf_filename || 'roles.pdf')}">${tt('my_team.roles_download','Télécharger le PDF')}</a>` : `<span class="text-muted align-self-center">${tt('my_team.roles_none_short','Aucun PDF')}</span>`}${ctx.role === 'coach' ? `<button type="button" class="btn btn-outline-warning" id="team-config-open-btn"><i class="bx bx-cog me-1"></i>${tt('my_team.team_config_button','Configurer la discipline')}</button>` : ''}</div></div>${ctx.role === 'coach' ? `<form id="team-roles-form" class="mt-3"><div class="row align-items-end"><div class="col-lg-8 mb-3"><label class="form-label">${tt('my_team.roles_upload_label','Mettre à jour le PDF des rôles')}</label><input class="form-control" type="file" id="team-roles-file" accept="application/pdf,.pdf" required><div class="form-text">${tt('my_team.roles_upload_help','Le coach peut ajouter ou remplacer le PDF des rôles de son équipe.')}</div></div><div class="col-lg-4 mb-3"><button class="btn btn-primary w-100" type="submit">${bundle.team?.roles_pdf_url ? tt('my_team.roles_replace','Remplacer le PDF') : tt('my_team.roles_add','Ajouter le PDF')}</button></div></div></form>` : ''}${ctx.role === 'coach' ? `<div class="modal fade" id="team-config-modal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">${tt('my_team.team_config_title','Configuration discipline')}</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div><form id="team-config-form"><div class="modal-body"><div class="row"><div class="col-md-4 mb-3"><label class="form-label">${tt('my_team.default_points','Points initiaux')}</label><input type="number" min="0" step="1" class="form-control" name="default_player_points" value="${Number(bundle.team?.default_player_points ?? 20)}" required></div><div class="col-md-4 mb-3"><label class="form-label">${tt('my_team.practice_presence','Présence pratique')}</label><input type="number" min="0" step="2" class="form-control" name="practice_presence_points" value="${Number(bundle.team?.practice_presence_points ?? 2)}" required></div><div class="col-md-4 mb-3"><label class="form-label">${tt('my_team.theory_presence','Présence théorie')}</label><input type="number" class="form-control" data-team-config-preview="theory-presence" value="${Number(bundle.team?.practice_presence_points ?? 2) / 2}" readonly></div><div class="col-md-4 mb-3"><label class="form-label">${tt('my_team.practice_absence','Absence pratique')}</label><input type="number" min="0" step="2" class="form-control" name="practice_absence_penalty" value="${Number(bundle.team?.practice_absence_penalty ?? 2)}" required></div><div class="col-md-4 mb-3"><label class="form-label">${tt('my_team.theory_absence','Absence théorie')}</label><input type="number" class="form-control" data-team-config-preview="theory-absence" value="${Number(bundle.team?.practice_absence_penalty ?? 2) / 2}" readonly></div><div class="col-md-4 mb-3"><label class="form-label">${tt('my_team.late_threshold','Seuil retard cumulé (min)')}</label><input type="number" min="0" step="1" class="form-control" name="late_penalty_threshold_minutes" value="${Number(bundle.team?.late_penalty_threshold_minutes ?? 0)}" required></div><div class="col-md-4 mb-3"><label class="form-label">${tt('my_team.late_penalty','Pénalité retard (pts)')}</label><input type="number" min="0" step="1" class="form-control" name="late_penalty_points" value="${Number(bundle.team?.late_penalty_points ?? 0)}" required></div><div class="col-12"><div class="form-text">${tt('my_team.team_config_help','Les valeurs pratique doivent être paires. La théorie est calculée automatiquement à 50% de la pratique.')}</div></div></div></div><div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${tt('common.cancel','Annuler')}</button><button type="submit" class="btn btn-warning">${tt('common.save','Enregistrer')}</button></div></form></div></div></div>` : ''}</div></div></div>
    </div>
    <div class="row mb-4">
      <div class="col-12"><div class="card"><div class="card-body"><div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-3"><div><h5 class="mb-1">${tt('my_team.top3_title','Top 3 discipline')}</h5><div class="small text-muted">${tt('my_team.top3_desc','Classement par points, puis absences non excusées, puis priorité capitaine.')}</div></div></div>${topPlayers.length ? `<div class="row">${topPlayers.map((player, index) => buildPodiumCard(player, index, disciplineByPlayer.get(player.id) || {})).join('')}</div>` : `<div class="text-muted small">${tt('my_team.top3_empty','Aucune joueuse classée pour le moment.')}</div>`}</div></div></div>
    </div>
    ${ctx.role === 'player' ? `<div class="row mb-4"><div class="col-12"><div class="card"><div class="card-body"><div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3"><div><h5 class="mb-1">${tt('my_team.discipline_title','Discipline')}</h5><div class="small text-muted">${tt('my_team.discipline_desc','Synthèse de tes présences et derniers impacts de points.')}</div></div>${pointsBadge(ctx.membership?.current_points || 0)}</div><div class="row">${statCard(tt('my_team.stat_present','Présences'), myStats.present, 'success')}${statCard(tt('my_team.stat_excused','Excusées'), myStats.excused, 'secondary')}${statCard(tt('my_team.stat_absent','Absences'), myStats.absent, 'danger')}${statCard(tt('my_team.stat_late_total','Retard cumulé'), `${myStats.late} ${tt('my_team.unit_min','min')}`, 'warning')}</div><div class="mt-2"><h6 class="mb-2">${tt('my_team.latest_changes','Derniers mouvements')}</h6>${myHistory.length ? `<div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>${tt('profile.table_date','Date')}</th><th>${tt('profile.table_reason','Motif')}</th><th>${tt('profile.table_impact','Impact')}</th></tr></thead><tbody>${myHistory.map(item => `<tr><td>${escapeHtml(new Date(item.created_at || '').toLocaleDateString())}</td><td>${escapeHtml(item.label || tt('profile.discipline_label','Discipline'))}</td><td>${Number(item.delta || 0) >= 0 ? `<span class="badge bg-label-success">+${Number(item.delta || 0)}</span>` : `<span class="badge bg-label-danger">${Number(item.delta || 0)}</span>`}</td></tr>`).join('')}</tbody></table></div>` : `<div class="text-muted small">${tt('my_team.no_point_changes','Aucun mouvement de points pour le moment.')}</div>`}</div></div></div></div></div>` : ''}
    <div class="row">
      <div class="col-lg-7 mb-4"><div id="team-roster"></div></div>
      <div class="col-lg-5 mb-4"><div id="team-staff"></div></div>
    </div>`;
  const rosterHeaders = ctx.role === 'coach' ? [tt('players.number','#'), tt('my_team.roster_name','Nom'), tt('my_team.roster_position','Poste'), tt('my_team.captain','Capitaine'), tt('my_team.age','Âge'), tt('my_team.status','Statut'), tt('my_team.points','Points'), tt('my_team.detail','Détail')] : [tt('players.number','#'), tt('my_team.roster_name','Nom'), tt('my_team.roster_position','Poste'), tt('my_team.captain','Capitaine'), tt('my_team.age','Âge'), tt('my_team.status','Statut')];
  renderSimpleTable(document.getElementById('team-roster'), rosterHeaders, bundle.players.map(p => `<tr><td>${escapeHtml(p.jersey_number ?? '—')}</td><td><div class="d-flex align-items-center gap-2"><img src="${personAvatarUrl(p)}" alt="${escapeHtml(p.full_name || '')}" class="player-avatar-sm"><span>${escapeHtml(p.full_name || '')}</span></div></td><td>${escapeHtml(p.primary_position || '')}</td><td>${captainBadge(p.captain_role)}</td><td>${ageCell(p.age)}</td><td>${escapeHtml(p.status || '')}</td>${ctx.role === 'coach' ? `<td>${pointsBadge(p.current_points || 0)}</td><td><a class="btn btn-sm btn-outline-secondary" href="player-detail.html?id=${p.id}&from=my-team">${tt('my_team.detail','Détail')}</a></td>` : ''}</tr>`).join(''), tt('my_team.no_players','Aucune joueuse.'));
  renderSimpleTable(document.getElementById('team-staff'), [tt('my_team.roster_name','Nom'), tt('my_team.staff_role','Rôle'), tt('profile.email','Email')], bundle.coaches.map(c => `<tr><td><div class="d-flex align-items-center gap-2"><img src="${personAvatarUrl(c)}" alt="${escapeHtml(c.full_name || '')}" class="coach-avatar-sm"><span>${escapeHtml(c.full_name || '')}</span></div></td><td>${escapeHtml(c.role || tt('my_team.role_coach','Coach'))}</td><td>${escapeHtml(c.email || '')}</td></tr>`).join(''), tt('my_team.no_staff','Aucun coach.'));

  const teamConfigForm = document.getElementById('team-config-form');
  const teamConfigOpenBtn = document.getElementById('team-config-open-btn');
  const teamConfigModalEl = document.getElementById('team-config-modal');
  const teamConfigModal = teamConfigModalEl && window.bootstrap?.Modal ? new window.bootstrap.Modal(teamConfigModalEl) : null;

  ['practice_presence_points', 'practice_absence_penalty'].forEach(name => {
    teamConfigForm?.elements?.[name]?.addEventListener('input', () => updateTeamConfigTheoryPreviews(teamConfigForm));
  });
  updateTeamConfigTheoryPreviews(teamConfigForm);

  teamConfigOpenBtn?.addEventListener('click', () => {
    updateTeamConfigTheoryPreviews(teamConfigForm);
    teamConfigModal?.show();
  });

  teamConfigForm?.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const formData = new FormData(teamConfigForm);
      const payload = Object.fromEntries(formData.entries());
      payload.default_player_points = validateWholePositive(payload.default_player_points || 0, tt('my_team.label_default_points','Points initiaux'));
      payload.practice_presence_points = validateEvenPoints(payload.practice_presence_points, tt('my_team.label_practice_presence','Présence pratique'));
      payload.practice_absence_penalty = validateEvenPoints(payload.practice_absence_penalty, tt('my_team.label_practice_absence','Absence non excusée pratique'));
      payload.late_penalty_threshold_minutes = validateWholePositive(payload.late_penalty_threshold_minutes || 0, tt('my_team.label_late_threshold','Seuil retard cumulé'));
      payload.late_penalty_points = validateWholePositive(payload.late_penalty_points || 0, tt('my_team.label_late_penalty','Pénalité retard cumulée'));

      const { data: updatedTeam, error } = await supabase
        .from('teams')
        .update(payload)
        .eq('id', ctx.teamId)
        .select('id,late_penalty_threshold_minutes,late_penalty_points')
        .maybeSingle();
      if (error) throw error;
      if (!updatedTeam?.id) throw new Error(tt('my_team.team_config_update_failed','Impossible de mettre à jour la configuration discipline.'));

      const { data: teamPlayers, error: playersError } = await supabase
        .from('players')
        .select('id,team_id,current_points,late_adjusted_minutes,late_penalty_applied')
        .eq('team_id', ctx.teamId);
      if (playersError) throw playersError;

      for (const player of (teamPlayers || [])) {
        await recalcLatePenaltyForPlayer(player.id, {
          actorId: ctx.user?.id || null,
          playerRow: player,
          teamConfig: updatedTeam,
          reason: tt('my_team.recalc_reason_team_config','Recalcul pénalité retard · configuration équipe')
        });
      }

      showAlert(tt('my_team.team_config_saved','Configuration discipline mise à jour avec succès.'));
      teamConfigModal?.hide();
      setTimeout(() => location.reload(), 450);
    } catch (err) {
      console.error(err);
      showAlert(err.message || tt('my_team.team_config_error','Impossible de mettre à jour la configuration discipline.'), 'danger');
    }
  });

  const rolesForm = document.getElementById('team-roles-form');
  rolesForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const file = document.getElementById('team-roles-file')?.files?.[0];
    if (!file) {
      showAlert(tt('my_team.roles_select_pdf','Choisis un fichier PDF.'), 'warning');
      return;
    }
    try {
      const meta = await uploadTeamRolesPdf(file, ctx.teamId);
      const { data: updatedTeam, error } = await supabase.from('teams').update({
        roles_pdf_url: meta.url,
        roles_pdf_path: meta.path,
        roles_pdf_filename: meta.filename,
        roles_updated_at: new Date().toISOString()
      }).eq('id', ctx.teamId).select('id,roles_pdf_url,roles_pdf_filename').maybeSingle();
      if (error) throw error;
      if (!updatedTeam?.id) {
        throw new Error(tt('my_team.roles_save_error','Impossible de mettre à jour le PDF des rôles.'));
      }
      showAlert(tt('my_team.roles_saved','PDF des rôles mis à jour avec succès.'));
      setTimeout(() => location.reload(), 500);
    } catch (err) {
      console.error(err);
      showAlert(err.message || tt('my_team.roles_save_error','Impossible de mettre à jour le PDF des rôles.'), 'danger');
    }
  });

}
document.addEventListener('app:language-changed', () => { try { location.reload(); } catch (e) { console.warn(e); } });
