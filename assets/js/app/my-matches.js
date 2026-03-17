
import { activateMenu, escapeHtml, formatDate, setAppTitle } from './common.js';
import { getPortalContext, fetchTeamBundle, renderPortalEmpty, renderSimpleTable } from './portal-common.js';

setAppTitle('Mes matchs');
activateMenu('my-matches');
const host = document.getElementById('portal-content');
const ctx = await getPortalContext();
if (!ctx.teamId) {
  renderPortalEmpty(host, 'Aucun match', "Le compte n'est pas encore lié à une équipe.");
} else {
  const bundle = await fetchTeamBundle(ctx.teamId);
  document.getElementById('portal-title').textContent = `Mes matchs · ${ctx.teamName || ''}`;
  document.getElementById('portal-subtitle').textContent = 'Calendrier des matchs de ton équipe.';
  renderSimpleTable(host, ['Adversaire','Date','Lieu','Compétition','Détail'], bundle.matches.map(m => `<tr><td><strong>${escapeHtml(m.opponent || '')}</strong></td><td>${formatDate(m.match_date)}</td><td>${escapeHtml(m.location || '')}</td><td>${escapeHtml(m.competition_type || '')}</td><td><a class="btn btn-sm btn-outline-secondary" href="match-detail.html?id=${m.id}">Voir</a></td></tr>`).join(''), 'Aucun match planifié.');
}
