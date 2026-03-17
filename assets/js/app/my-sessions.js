
import { activateMenu, escapeHtml, setAppTitle } from './common.js';
import { getPortalContext, fetchTeamBundle, renderPortalEmpty, renderSimpleTable, sessionLabel } from './portal-common.js';

setAppTitle('Mes séances');
activateMenu('my-sessions');
const host = document.getElementById('portal-content');
const ctx = await getPortalContext();
if (!ctx.teamId) {
  renderPortalEmpty(host, 'Aucune séance', "Le compte n'est pas encore lié à une équipe.");
} else {
  const bundle = await fetchTeamBundle(ctx.teamId);
  document.getElementById('portal-title').textContent = `Mes séances · ${ctx.teamName || ''}`;
  document.getElementById('portal-subtitle').textContent = 'Séances planifiées pour ton équipe.';
  renderSimpleTable(host, ['Titre','Date','Lieu'], bundle.sessions.map(s => `<tr><td><strong>${escapeHtml(s.title || '')}</strong></td><td>${sessionLabel(s)}</td><td>${escapeHtml(s.location || '')}</td></tr>`).join(''), 'Aucune séance planifiée.');
}
