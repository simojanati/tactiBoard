import { activateMenu, escapeHtml, setAppTitle, supabase } from './common.js';
import { getPortalContext, renderPortalEmpty, matchAssignmentsForPlayer, buildReadState } from './portal-common.js';

setAppTitle('Mes tactiques');
activateMenu('my-tactics');
const host = document.getElementById('portal-content');
const ctx = await getPortalContext();

if (!ctx.teamId) {
  renderPortalEmpty(host, 'Aucune tactique', "Le compte n'est pas encore lié à une équipe.");
} else {
  const [{ data: tactics, error: tacticsError }, { data: assignments, error: assignmentsError }, { data: reads, error: readsError }] = await Promise.all([
    supabase.from('tactics').select('id,title,phase,category,formation,status,objective,version,coach_notes,change_note,updated_at').eq('team_id', ctx.teamId).order('updated_at', { ascending: false }).order('title'),
    supabase.from('tactic_assignments').select('tactic_id,position,instruction').order('id'),
    supabase.from('tactic_reads').select('tactic_id,version_seen,read_at').eq('profile_id', ctx.user.id)
  ]);

  if (tacticsError) throw tacticsError;
  if (assignmentsError) throw assignmentsError;
  if (readsError && !String(readsError.message || '').includes('relation')) throw readsError;

  const byTactic = new Map();
  const readsByTactic = new Map((reads || []).map(item => [String(item.tactic_id), item]));
  (assignments || []).forEach(item => {
    const arr = byTactic.get(item.tactic_id) || [];
    arr.push(item);
    byTactic.set(item.tactic_id, arr);
  });

  document.getElementById('portal-title').textContent = `Mes tactiques · ${ctx.teamName || ''}`;
  document.getElementById('portal-subtitle').textContent = `Poste principal: ${ctx.membership?.primary_position || '—'}${ctx.membership?.secondary_position ? ` · Poste secondaire: ${ctx.membership.secondary_position}` : ''}`;

  if (!tactics?.length) {
    renderPortalEmpty(host, 'Aucune tactique', 'Aucune tactique liée à ton équipe pour le moment.');
  } else {
    const cards = tactics.map(tactic => {
      const allAssignments = byTactic.get(tactic.id) || [];
      const myAssignments = matchAssignmentsForPlayer(allAssignments, ctx.membership);
      const roleHtml = myAssignments.length
        ? myAssignments.map(item => `<div class="mb-2"><div class="fw-semibold small text-primary">${escapeHtml(item.position || '')}</div><div class="small">${escapeHtml(item.instruction || '')}</div></div>`).join('')
        : `<div class="small text-muted">Aucune consigne spécifique détectée pour ${escapeHtml(ctx.membership?.primary_position || 'ton poste')}.</div>`;
      const isRecent = tactic.updated_at ? ((Date.now() - new Date(tactic.updated_at).getTime()) / 86400000) <= 7 : false;
      const readEntry = readsByTactic.get(String(tactic.id));
      const readState = buildReadState(tactic, readEntry);
      return `<div class="tactic-player-card">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <h5 class="mb-1">${escapeHtml(tactic.title || '')}</h5>
            <div class="meta">
              <span>${escapeHtml(tactic.phase || '')}</span>
              <span>•</span>
              <span>${escapeHtml(tactic.category || '—')}</span>
              <span>•</span>
              <span>${escapeHtml(tactic.formation || '—')}</span>
            </div>
          </div>
          <div class="d-flex flex-column align-items-end gap-1">
            <span class="badge bg-label-secondary">v${escapeHtml(tactic.version || 1)}</span>
            <span class="badge bg-label-${readState.badge}">${readState.label}</span>
            ${isRecent ? '<span class="badge bg-label-warning">Nouveau</span>' : ''}
          </div>
        </div>
        <div class="small text-muted mt-3">${escapeHtml(tactic.objective || 'Pas d’objectif défini.')}</div>
        <div class="update-preview mt-3">
          <div class="fw-semibold mb-1">Dernière mise à jour</div>
          <div class="small text-muted mb-1">${escapeHtml(tactic.updated_at ? new Date(tactic.updated_at).toLocaleString() : '—')}</div>
          <div class="small">${escapeHtml(tactic.change_note || 'Aucune note de changement.')}</div>
        </div>
        <div class="role-preview">
          <div class="fw-semibold mb-2">Mon rôle</div>
          ${roleHtml}
        </div>
        <div class="coach-note-preview mt-3 small ${tactic.coach_notes ? '' : 'text-muted'}">${escapeHtml((tactic.coach_notes || '').slice(0, 140) || 'Aucune note coach particulière pour le moment.')}</div>
        <div class="small text-muted mt-2">${readEntry?.read_at ? `Dernière lecture: ${new Date(readEntry.read_at).toLocaleString()}` : 'Jamais ouverte'}</div>
        <div class="d-flex justify-content-between align-items-center mt-3">
          <span class="badge bg-label-${myAssignments.length ? 'success' : 'warning'}">${myAssignments.length ? 'Rôle trouvé' : 'À vérifier'}</span>
          <a class="btn btn-sm btn-outline-primary" href="tactic-detail.html?id=${tactic.id}">${readState.isOutdated ? 'Lire la mise à jour' : 'Voir détail'}</a>
        </div>
      </div>`;
    }).join('');
    host.innerHTML = `<div class="tactic-card-grid">${cards}</div>`;
  }
}
