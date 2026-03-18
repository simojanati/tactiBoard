
import { activateMenu, escapeHtml, formatDate, setAppTitle } from './common.js';
import { getPortalContext, fetchTeamBundle, renderPortalEmpty, renderSimpleTable } from './portal-common.js';
const tt = (key, fallback = '') => (window.t ? window.t(key, fallback) : fallback || key);

setAppTitle(tt('page.my_matches', 'Mes matchs'));
activateMenu('my-matches');
const host = document.getElementById('portal-content');
const ctx = await getPortalContext();
if (!ctx.teamId) {
  renderPortalEmpty(host, tt('my_matches.none_title','Aucun match'), tt('portal.no_team_linked', "Le compte n'est pas encore lié à une équipe."));
} else {
  const bundle = await fetchTeamBundle(ctx.teamId);
  document.getElementById('portal-title').textContent = `${tt('my_matches.title','Mes matchs')} · ${ctx.teamName || ''}`;
  document.getElementById('portal-subtitle').textContent = tt('my_matches.subtitle','Calendrier des matchs de ton équipe.');
  renderSimpleTable(host, [tt('matches.opponent','Adversaire'), tt('common.date','Date'), tt('common.location','Lieu'), tt('common.competition','Compétition'), tt('my_matches.detail','Voir')], bundle.matches.map(m => `<tr><td><strong>${escapeHtml(m.opponent || '')}</strong></td><td>${formatDate(m.match_date)}</td><td>${escapeHtml(m.location || '')}</td><td>${escapeHtml(m.competition_type || '')}</td><td><a class="btn btn-sm btn-outline-secondary" href="match-detail.html?id=${m.id}">${tt('my_matches.detail','Voir')}</a></td></tr>`).join(''), tt('my_matches.none_available','Aucun match planifié.'));
}

document.addEventListener('app:language-changed', () => { try { location.reload(); } catch (e) { console.warn(e); } });
