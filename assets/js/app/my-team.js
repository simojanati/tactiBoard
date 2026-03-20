import { activateMenu, escapeHtml, setAppTitle, personAvatarUrl, showAlert, supabase, uploadTeamRolesPdf } from './common.js';
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

setAppTitle(tt('page.my_team', 'Mon équipe'));
activateMenu('my-team');
const host = document.getElementById('portal-content');
const ctx = await getPortalContext();
if (!ctx.teamId) {
  renderPortalEmpty(host, tt('my_team.no_team_title','Aucune liaison équipe'), tt('my_team.no_team_desc', "Lie d'abord ce compte à une joueuse ou un coach pour afficher son équipe."));
} else {
  const bundle = await fetchTeamBundle(ctx.teamId);
  document.getElementById('portal-title').textContent = ctx.teamName || bundle.team?.name || tt('page.my_team','Mon équipe');
  document.getElementById('portal-subtitle').innerHTML = `${roleBadge(ctx.role)} <span class="ms-2 text-muted">${escapeHtml(ctx.fullName || '')}</span>`;
  host.innerHTML = `
    <div class="row mb-4">
      <div class="col-lg-4 mb-3"><div class="card h-100"><div class="card-body"><h5 class="mb-2">${tt('my_team.profile','Mon profil')}</h5>
        ${ctx.role === 'player'
          ? `<div><strong>${escapeHtml(ctx.membership?.full_name || '')}</strong></div><div class="small text-muted">#${escapeHtml(ctx.membership?.jersey_number ?? '—')} · ${escapeHtml(ctx.membership?.primary_position || '—')}</div><div class="small text-muted mt-2 d-flex align-items-center gap-2 flex-wrap">${captainBadge(ctx.membership?.captain_role, 'captain-icon-lg')}<span>${tt('my_team.age','Âge')}: ${ageCell(ctx.membership?.age)}</span></div><div class="small text-muted mt-2">${tt('my_team.status','Statut')}: ${escapeHtml(ctx.membership?.status || '—')}</div>`
          : `<div><strong>${escapeHtml(ctx.membership?.full_name || '')}</strong></div><div class="small text-muted">${escapeHtml(ctx.membership?.role || tt('my_team.role_coach','Coach'))}</div><div class="small text-muted mt-2">${escapeHtml(ctx.membership?.email || '')}</div>`}
      </div></div></div>
      <div class="col-lg-4 mb-3"><div class="card h-100"><div class="card-body"><h5 class="mb-2">${tt('my_team.team','Équipe')}</h5><div class="team-title-wrap"><img src="${bundle.team?.logo_url || '../assets/img/branding/team-logo-placeholder.png'}" alt="${escapeHtml(bundle.team?.name || ctx.teamName || '')}" class="team-logo-md"><div><strong>${escapeHtml(bundle.team?.name || ctx.teamName || '')}</strong><div class="small text-muted">${tt('my_team.category','Catégorie')}: ${escapeHtml(bundle.team?.category || '—')}</div><div class="small text-muted">${tt('my_team.season','Saison')}: ${escapeHtml(bundle.team?.season || '—')}</div></div></div></div></div></div>
      <div class="col-lg-4 mb-3"><div class="card h-100"><div class="card-body"><h5 class="mb-2">${tt('my_team.summary','Résumé')}</h5><div class="small text-muted">${tt('my_team.players_count','{players} joueuses · {coaches} coachs · {tactics} tactiques').replace('{players}', bundle.players.length).replace('{coaches}', bundle.coaches.length).replace('{tactics}', bundle.tactics.length)}</div><div class="small text-muted mt-2">${tt('my_team.sessions_count','{sessions} séances · {matches} matchs').replace('{sessions}', bundle.sessions.length).replace('{matches}', bundle.matches.length)}</div></div></div></div>
    </div>
    <div class="row mb-4">
      <div class="col-12"><div class="card"><div class="card-body"><div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3"><div><h5 class="mb-1">${tt('my_team.roles_title', "Rôles de l'équipe")}</h5><div class="small text-muted">${bundle.team?.roles_pdf_url ? tt('my_team.roles_available','Le document PDF des rôles est disponible pour cette équipe.') : tt('my_team.roles_empty','Aucun document de rôles disponible pour cette équipe.')}</div></div><div id="team-roles-actions">${bundle.team?.roles_pdf_url ? `<a class="btn btn-outline-primary" href="${bundle.team.roles_pdf_url}" target="_blank" rel="noopener" download="${escapeHtml(bundle.team.roles_pdf_filename || 'roles.pdf')}">${tt('my_team.roles_download','Télécharger le PDF')}</a>` : `<span class="text-muted">${tt('my_team.roles_none_short','Aucun PDF')}</span>`}</div></div>${ctx.role === 'coach' ? `<form id="team-roles-form" class="mt-3"><div class="row align-items-end"><div class="col-lg-8 mb-3"><label class="form-label">${tt('my_team.roles_upload_label','Mettre à jour le PDF des rôles')}</label><input class="form-control" type="file" id="team-roles-file" accept="application/pdf,.pdf" required><div class="form-text">${tt('my_team.roles_upload_help','Le coach peut ajouter ou remplacer le PDF des rôles de son équipe.')}</div></div><div class="col-lg-4 mb-3"><button class="btn btn-primary w-100" type="submit">${bundle.team?.roles_pdf_url ? tt('my_team.roles_replace','Remplacer le PDF') : tt('my_team.roles_add','Ajouter le PDF')}</button></div></div></form>` : ''}</div></div></div>
    </div>
    <div class="row">
      <div class="col-lg-7 mb-4"><div id="team-roster"></div></div>
      <div class="col-lg-5 mb-4"><div id="team-staff"></div></div>
    </div>`;
  renderSimpleTable(document.getElementById('team-roster'), [tt('players.number','#'), tt('my_team.roster_name','Nom'), tt('my_team.roster_position','Poste'), tt('my_team.captain','Capitaine'), tt('my_team.age','Âge'), tt('my_team.status','Statut')], bundle.players.map(p => `<tr><td>${escapeHtml(p.jersey_number ?? '—')}</td><td><div class="d-flex align-items-center gap-2"><img src="${personAvatarUrl(p)}" alt="${escapeHtml(p.full_name || '')}" class="player-avatar-sm"><span>${escapeHtml(p.full_name || '')}</span></div></td><td>${escapeHtml(p.primary_position || '')}</td><td>${captainBadge(p.captain_role)}</td><td>${ageCell(p.age)}</td><td>${escapeHtml(p.status || '')}</td></tr>`).join(''), tt('my_team.no_players','Aucune joueuse.'));
  renderSimpleTable(document.getElementById('team-staff'), [tt('my_team.roster_name','Nom'), tt('my_team.staff_role','Rôle'), tt('profile.email','Email')], bundle.coaches.map(c => `<tr><td><div class="d-flex align-items-center gap-2"><img src="${personAvatarUrl(c)}" alt="${escapeHtml(c.full_name || '')}" class="coach-avatar-sm"><span>${escapeHtml(c.full_name || '')}</span></div></td><td>${escapeHtml(c.role || tt('my_team.role_coach','Coach'))}</td><td>${escapeHtml(c.email || '')}</td></tr>`).join(''), tt('my_team.no_staff','Aucun coach.'));

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
