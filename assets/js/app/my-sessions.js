
import { activateMenu, escapeHtml, setAppTitle } from './common.js';
import { getPortalContext, fetchTeamBundle, renderPortalEmpty, renderSimpleTable, sessionLabel } from './portal-common.js';
const tt = (key, fallback = '') => (window.t ? window.t(key, fallback) : fallback || key);

setAppTitle(tt('page.my_sessions', 'Mes séances'));
activateMenu('my-sessions');
const host = document.getElementById('portal-content');
const ctx = await getPortalContext();
if (!ctx.teamId) {
  renderPortalEmpty(host, tt('my_sessions.none_title','Aucune séance'), tt('portal.no_team_linked', "Le compte n'est pas encore lié à une équipe."));
} else {
  const bundle = await fetchTeamBundle(ctx.teamId);
  document.getElementById('portal-title').textContent = `${tt('my_sessions.title','Mes séances')} · ${ctx.teamName || ''}`;
  document.getElementById('portal-subtitle').textContent = tt('my_sessions.subtitle','Séances planifiées pour ton équipe.');
  renderSimpleTable(host, [tt('common.title','Titre'), tt('common.date','Date'), tt('common.location','Lieu')], bundle.sessions.map(s => `<tr><td><strong>${escapeHtml(s.title || '')}</strong></td><td>${sessionLabel(s)}</td><td>${escapeHtml(s.location || '')}</td></tr>`).join(''), tt('my_sessions.none_available','Aucune séance planifiée.'));
}

document.addEventListener('app:language-changed', () => { try { location.reload(); } catch (e) { console.warn(e); } });
