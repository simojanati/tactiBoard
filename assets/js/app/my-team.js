
import { activateMenu, escapeHtml, setAppTitle, personAvatarUrl } from './common.js';
import { getPortalContext, fetchTeamBundle, renderPortalEmpty, roleBadge, renderSimpleTable } from './portal-common.js';

setAppTitle('Mon équipe');
activateMenu('my-team');
const host = document.getElementById('portal-content');
const ctx = await getPortalContext();
if (!ctx.teamId) {
  renderPortalEmpty(host, 'Aucune liaison équipe', "Lie d'abord ce compte à une joueuse ou un coach pour afficher son équipe.");
} else {
  const bundle = await fetchTeamBundle(ctx.teamId);
  document.getElementById('portal-title').textContent = ctx.teamName || bundle.team?.name || 'Mon équipe';
  document.getElementById('portal-subtitle').innerHTML = `${roleBadge(ctx.role)} <span class="ms-2 text-muted">${escapeHtml(ctx.fullName || '')}</span>`;
  host.innerHTML = `
    <div class="row mb-4">
      <div class="col-lg-4 mb-3"><div class="card h-100"><div class="card-body"><h5 class="mb-2">Mon profil</h5>
        ${ctx.role === 'player' ? `<div><strong>${escapeHtml(ctx.membership?.full_name || '')}</strong></div><div class="small text-muted">#${escapeHtml(ctx.membership?.jersey_number ?? '—')} · ${escapeHtml(ctx.membership?.primary_position || '—')}</div><div class="small text-muted mt-2">Statut: ${escapeHtml(ctx.membership?.status || '—')}</div>` : `<div><strong>${escapeHtml(ctx.membership?.full_name || '')}</strong></div><div class="small text-muted">${escapeHtml(ctx.membership?.role || 'Coach')}</div><div class="small text-muted mt-2">${escapeHtml(ctx.membership?.email || '')}</div>`}
      </div></div></div>
      <div class="col-lg-4 mb-3"><div class="card h-100"><div class="card-body"><h5 class="mb-2">Équipe</h5><div class="team-title-wrap"><img src="${bundle.team?.logo_url || '../assets/img/branding/team-logo-placeholder.png'}" alt="${escapeHtml(bundle.team?.name || ctx.teamName || '')}" class="team-logo-md"><div><strong>${escapeHtml(bundle.team?.name || ctx.teamName || '')}</strong><div class="small text-muted">Catégorie: ${escapeHtml(bundle.team?.category || '—')}</div><div class="small text-muted">Saison: ${escapeHtml(bundle.team?.season || '—')}</div></div></div></div></div></div>
      <div class="col-lg-4 mb-3"><div class="card h-100"><div class="card-body"><h5 class="mb-2">Résumé</h5><div class="small text-muted">${bundle.players.length} joueuses · ${bundle.coaches.length} coachs · ${bundle.tactics.length} tactiques</div><div class="small text-muted mt-2">${bundle.sessions.length} séances · ${bundle.matches.length} matchs</div></div></div></div>
    </div>
    <div class="row">
      <div class="col-lg-7 mb-4"><div id="team-roster"></div></div>
      <div class="col-lg-5 mb-4"><div id="team-staff"></div></div>
    </div>`;
  renderSimpleTable(document.getElementById('team-roster'), ['#','Nom','Poste','Statut'], bundle.players.map(p => `<tr><td>${escapeHtml(p.jersey_number ?? '—')}</td><td><div class="d-flex align-items-center gap-2"><img src="${personAvatarUrl(p)}" alt="${escapeHtml(p.full_name || '')}" class="player-avatar-sm"><span>${escapeHtml(p.full_name || '')}</span></div></td><td>${escapeHtml(p.primary_position || '')}</td><td>${escapeHtml(p.status || '')}</td></tr>`).join(''), 'Aucune joueuse.');
  renderSimpleTable(document.getElementById('team-staff'), ['Nom','Rôle','Email'], bundle.coaches.map(c => `<tr><td><div class="d-flex align-items-center gap-2"><img src="${personAvatarUrl(c)}" alt="${escapeHtml(c.full_name || '')}" class="coach-avatar-sm"><span>${escapeHtml(c.full_name || '')}</span></div></td><td>${escapeHtml(c.role || '')}</td><td>${escapeHtml(c.email || '')}</td></tr>`).join(''), 'Aucun coach.');
}
