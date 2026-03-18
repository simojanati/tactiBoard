import { activateMenu, escapeHtml, setAppTitle, supabase } from './common.js';
import { getPortalContext, renderPortalEmpty, matchAssignmentsForPlayer, buildReadState } from './portal-common.js';

const tt = (key, fallback = '') => (window.t ? window.t(key, fallback) : fallback || key);

setAppTitle(tt('page.my_tactics', 'Mes tactiques'));
activateMenu('my-tactics');

const host = document.getElementById('portal-content');
const ctx = await getPortalContext();

if (!ctx.teamId) {
  renderPortalEmpty(
    host,
    tt('my_tactics.none_title', 'Aucune tactique'),
    tt('my_tactics.none_team', "Le compte n'est pas encore lié à une équipe.")
  );
} else {
  const [{ data: tactics, error: tacticsError }, { data: assignments, error: assignmentsError }, { data: reads, error: readsError }] = await Promise.all([
    supabase
      .from('tactics')
      .select('id,title,phase,category,formation,status,objective,version,coach_notes,change_note,updated_at')
      .eq('team_id', ctx.teamId)
      .order('updated_at', { ascending: false })
      .order('title'),
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

  document.getElementById('portal-title').textContent = `${tt('page.my_tactics', 'Mes tactiques')} · ${ctx.teamName || ''}`;
  document.getElementById('portal-subtitle').textContent =
    `${tt('my_tactics.primary_position', 'Poste principal')}: ${ctx.membership?.primary_position || '—'}`
    + `${ctx.membership?.secondary_position ? ` · ${tt('my_tactics.secondary_position', 'Poste secondaire')}: ${ctx.membership.secondary_position}` : ''}`;

  if (!tactics?.length) {
    renderPortalEmpty(
      host,
      tt('my_tactics.none_title', 'Aucune tactique'),
      tt('my_tactics.none_available', 'Aucune tactique liée à ton équipe pour le moment.')
    );
  } else {
    const cards = tactics.map((tactic) => {
      const allAssignments = byTactic.get(tactic.id) || [];
      const myAssignments = matchAssignmentsForPlayer(allAssignments, ctx.membership);

      const roleHtml = myAssignments.length
        ? myAssignments.map((item) => `
            <div class="mb-2">
              <div class="fw-semibold small text-primary">${escapeHtml(item.position || '')}</div>
              <div class="small">${escapeHtml(item.instruction || '')}</div>
            </div>
          `).join('')
        : `<div class="small text-muted">${tt('my_tactics.no_instruction', 'Aucune consigne spécifique détectée pour {position}.').replace('{position}', escapeHtml(ctx.membership?.primary_position || tt('my_tactics.your_position', 'ton poste')))}</div>`;

      const readEntry = readsByTactic.get(String(tactic.id));
      const readState = buildReadState(tactic, readEntry);
      const coachNote = tactic.coach_notes
        ? escapeHtml(tactic.coach_notes)
        : tt('my_tactics.no_coach_note', 'Aucune note coach particulière pour le moment.');
      const lastRead = readEntry?.read_at ? new Date(readEntry.read_at).toLocaleString() : '—';

      return `
        <div class="col-md-6 col-xl-6 mb-4">
          <div class="card h-100">
            <div class="card-body d-flex flex-column">
              <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                <div>
                  <h5 class="mb-1">${escapeHtml(tactic.title || '')}</h5>
                  <div class="small text-muted">
                    ${escapeHtml(tactic.phase || '')} • ${escapeHtml(tactic.category || '—')} • ${escapeHtml(tactic.formation || '—')}
                  </div>
                </div>
                <div class="d-flex flex-column align-items-end gap-1">
                  <span class="badge bg-label-secondary">V${escapeHtml(tactic.version || 1)}</span>
                  <span class="badge ${readState.isOutdated ? 'bg-label-warning' : 'bg-label-success'}">
                    ${readState.isOutdated ? 'NEW' : 'VU'}
                  </span>
                </div>
              </div>

              <p class="text-muted mb-3">${escapeHtml(tactic.objective || '')}</p>

              <div class="p-3 rounded mb-3" style="background: rgba(255,193,7,.08);">
                <div class="fw-semibold mb-2">${tt('my_tactics.last_update', 'Dernière mise à jour')}</div>
                <div class="small text-muted">${tactic.updated_at ? new Date(tactic.updated_at).toLocaleString() : '—'}</div>
                <div class="small text-muted">${escapeHtml(tactic.change_note || '—')}</div>
              </div>

              <div class="p-3 rounded mb-3" style="background: rgba(13,202,240,.08);">
                <div class="fw-semibold mb-2">${tt('my_tactics.role_found', 'RÔLE TROUVÉ')}</div>
                ${roleHtml}
              </div>

              <div class="mt-auto">
                <div class="small text-muted mb-2">${coachNote}</div>
                <div class="small text-muted mb-3">${tt('my_tactics.last_read', 'Dernière lecture')}: ${lastRead}</div>
                <div class="d-flex justify-content-between align-items-center">
                  <span class="badge bg-label-success">${tt('my_tactics.role_found', 'RÔLE TROUVÉ')}</span>
                  <a class="btn btn-sm btn-outline-primary" href="tactic-detail.html?id=${tactic.id}">${tt('my_tactics.detail', 'Voir détail')}</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    host.innerHTML = `<div class="row">${cards}</div>`;
  }
}

document.addEventListener('app:language-changed', () => {
  try {
    location.reload();
  } catch (e) {
    console.warn(e);
  }
});
