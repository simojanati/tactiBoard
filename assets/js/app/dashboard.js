import { activateMenu, dashboardCounts, setAppTitle, showAlert, supabase } from './common.js';
import { getPortalContext, fetchTeamBundle, cardMetric, buildReadState } from './portal-common.js';

setAppTitle(tt('page.dashboard', 'Dashboard'));
activateMenu('dashboard');
document.getElementById('project-url').textContent = window.APP_CONFIG.supabaseUrl;
document.getElementById('bucket-name').textContent = window.APP_CONFIG.defaultBucket;

const tt = (key, fallback = '') => (window.t ? window.t(key, fallback) : fallback || key);
const ctx = await getPortalContext();
const heroTitle = document.querySelector('.app-hero-card .card-title');
const heroText = document.querySelector('.app-hero-card p');
const quickStartCard = document.querySelectorAll('.row .col-lg-7.mb-4 .card .card-body ol')[0]?.closest('.card');
const connectionCard = document.querySelectorAll('.row .col-lg-5.mb-4 .card')[0];
const pageContainer = document.querySelector('.container-xxl.flex-grow-1');

if (ctx.role === 'admin') {
  try {
    const counts = await dashboardCounts();
    document.getElementById('count-teams').textContent = counts.teams;
    document.getElementById('count-players').textContent = counts.players;
    document.getElementById('count-coaches').textContent = counts.coaches;
    document.getElementById('count-tactics').textContent = counts.tactics;
    document.getElementById('count-sessions').textContent = counts.sessions;
    document.getElementById('count-matches').textContent = counts.matches;
  } catch (err) {
    console.error(err);
    showAlert(tt('dashboard.counts_warning', 'Connexion Supabase OK, mais impossible de lire certains compteurs. Vérifie les tables et les permissions.'), 'warning');
  }
} else {
  document.getElementById('count-teams').closest('.row').innerHTML = '';
  if (heroTitle) heroTitle.textContent = tt('dashboard.welcome', 'Bienvenue {name}').replace('{name}', ctx.fullName || '');
  if (heroText) heroText.textContent = ctx.role === 'coach' ? tt('dashboard.coach_portal', 'Retrouve ton équipe, tes tactiques, tes séances et tes matchs depuis ton portail coach.') : tt('dashboard.player_portal', 'Retrouve ton équipe, tes tactiques, tes séances et tes matchs depuis ton portail joueuse.');
  const bundle = ctx.teamId ? await fetchTeamBundle(ctx.teamId) : { players: [], coaches: [], tactics: [], sessions: [], matches: [] };

  let reviewCount = 0;
  let teamReadRows = [];
  if (ctx.teamId) {
    const [{ data: reads }, { data: teamPlayers }] = await Promise.all([
      supabase.from('tactic_reads').select('tactic_id,profile_id,version_seen,read_at'),
      supabase.from('players').select('profile_id,full_name').eq('team_id', ctx.teamId).not('profile_id', 'is', null)
    ]);
    const playerIds = new Set((teamPlayers || []).map(item => item.profile_id));
    teamReadRows = (reads || []).filter(item => playerIds.has(item.profile_id));
    if (ctx.role === 'player') {
      const readMap = new Map(teamReadRows.filter(item => item.profile_id === ctx.user?.id).map(item => [String(item.tactic_id), item]));
      reviewCount = (bundle.tactics || []).filter(t => buildReadState(t, readMap.get(String(t.id))).isOutdated).length;
    } else {
      const playerCount = (teamPlayers || []).length || 1;
      reviewCount = (bundle.tactics || []).reduce((sum, tactic) => {
        const upToDate = new Set(teamReadRows.filter(item => String(item.tactic_id) === String(tactic.id) && Number(item.version_seen || 0) >= Number(tactic.version || 1)).map(item => item.profile_id));
        return sum + Math.max(0, playerCount - upToDate.size);
      }, 0);
    }
  }

  const metricsHtml = `
    <div class="row">
      ${cardMetric('metric-team', tt('dashboard.metric.my_team','Mon équipe'), ctx.teamName || tt('dashboard.metric.unlinked','Non liée'), 'bx-group')}
      ${cardMetric('metric-tactics', ctx.role === 'coach' ? tt('dashboard.metric.team_tactics','Tactiques équipe') : tt('dashboard.metric.my_tactics','Mes tactiques'), bundle.tactics.length, 'bx-notepad')}
      ${cardMetric('metric-sessions', ctx.role === 'coach' ? tt('dashboard.metric.team_sessions','Séances équipe') : tt('dashboard.metric.my_sessions','Mes séances'), bundle.sessions.length, 'bx-calendar')}
      ${cardMetric('metric-matches', ctx.role === 'coach' ? tt('dashboard.metric.team_matches','Matchs équipe') : tt('dashboard.metric.my_matches','Mes matchs'), bundle.matches.length, 'bx-trophy')}
      ${cardMetric('metric-review', ctx.role === 'coach' ? tt('dashboard.metric.missing_reads','Lectures manquantes') : tt('dashboard.metric.tactics_to_review','Tactiques à relire'), reviewCount, 'bx-show')}
    </div>`;
  pageContainer.insertAdjacentHTML('beforeend', metricsHtml);
  if (ctx.teamId) {
    const { data: recentUpdates } = await getRecentUpdates(ctx.teamId);
    const updatesHtml = (recentUpdates || []).length
      ? recentUpdates.map(item => `<li class="list-group-item d-flex justify-content-between align-items-start gap-2"><div><div class="fw-semibold">${item.title}</div><div class="small text-muted">${item.change_note || tt('dashboard.update.general','Mise à jour générale')}</div></div><span class="small text-muted">${item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '—'}</span></li>`).join('')
      : `` + `<li class="list-group-item text-muted">${tt('dashboard.update.none','Aucune mise à jour récente.')}</li>`;
    pageContainer.insertAdjacentHTML('beforeend', `<div class="row"><div class="col-12 mb-4"><div class="card"><div class="card-header"><h5 class="mb-0">${tt('dashboard.update.latest','Dernières mises à jour tactiques')}</h5></div><ul class="list-group list-group-flush">${updatesHtml}</ul></div></div></div>`);

    if (ctx.role === 'coach') {
      const playerRows = bundle.players.filter(item => item.profile_id);
      const reviewRows = (bundle.tactics || []).slice(0, 5).map(tactic => {
        const upToDate = new Set(teamReadRows.filter(item => String(item.tactic_id) === String(tactic.id) && Number(item.version_seen || 0) >= Number(tactic.version || 1)).map(item => item.profile_id));
        const missing = Math.max(0, playerRows.length - upToDate.size);
        return `<li class="list-group-item d-flex justify-content-between align-items-start gap-2"><div><div class="fw-semibold">${tactic.title}</div><div class="small text-muted">Version ${tactic.version || 1} · ${tactic.change_note || 'Mise à jour à consulter'}</div></div><span class="badge bg-label-${missing ? 'warning' : 'success'}">${missing ? `${missing} à relire` : 'Tout vu'}</span></li>`;
      }).join('') || '<li class="list-group-item text-muted">Aucune tactique à suivre.</li>';
      pageContainer.insertAdjacentHTML('beforeend', `<div class="row"><div class="col-12 mb-4"><div class="card"><div class="card-header"><h5 class="mb-0">${tt('dashboard.review.title','Suivi des lectures tactiques')}</h5></div><ul class="list-group list-group-flush">${reviewRows}</ul></div></div></div>`);
    } else if (ctx.role === 'player') {
      const myReads = new Map(teamReadRows.filter(item => item.profile_id === ctx.user?.id).map(item => [String(item.tactic_id), item]));
      const myReviewRows = (bundle.tactics || []).filter(tactic => buildReadState(tactic, myReads.get(String(tactic.id))).isOutdated).slice(0, 5).map(tactic => `<li class="list-group-item d-flex justify-content-between align-items-start gap-2"><div><div class="fw-semibold">${tactic.title}</div><div class="small text-muted">Version ${tactic.version || 1} · ${tactic.change_note || 'Mise à jour à lire'}</div></div><a class="btn btn-sm btn-outline-primary" href="tactic-detail.html?id=${tactic.id}">${tt('dashboard.review.read','Lire')}</a></li>`).join('') || '<li class="list-group-item text-muted">Tu es à jour sur les tactiques de ton équipe.</li>';
      pageContainer.insertAdjacentHTML('beforeend', `<div class="row"><div class="col-12 mb-4"><div class="card"><div class="card-header"><h5 class="mb-0">Tactiques à relire</h5></div><ul class="list-group list-group-flush">${myReviewRows}</ul></div></div></div>`);
    }
  }
  if (quickStartCard) {
    quickStartCard.querySelector('.card-header h5').textContent = 'Accès rapide';
    quickStartCard.querySelector('.card-body').innerHTML = ctx.role === 'coach'
      ? `
      <div class="list-group list-group-flush">
        <a class="list-group-item list-group-item-action" href="my-team.html"><i class="bx bx-group me-2"></i>Mon équipe</a>
        <a class="list-group-item list-group-item-action" href="tactics.html"><i class="bx bx-notepad me-2"></i>Tactiques</a>
        <a class="list-group-item list-group-item-action" href="sessions.html"><i class="bx bx-calendar me-2"></i>Séances</a>
        <a class="list-group-item list-group-item-action" href="matches.html"><i class="bx bx-trophy me-2"></i>Matchs</a>
      </div>`
      : `
      <div class="list-group list-group-flush">
        <a class="list-group-item list-group-item-action" href="my-team.html"><i class="bx bx-group me-2"></i>Mon équipe</a>
        <a class="list-group-item list-group-item-action" href="my-tactics.html"><i class="bx bx-notepad me-2"></i>Mes tactiques</a>
        <a class="list-group-item list-group-item-action" href="my-sessions.html"><i class="bx bx-calendar me-2"></i>Mes séances</a>
        <a class="list-group-item list-group-item-action" href="my-matches.html"><i class="bx bx-trophy me-2"></i>Mes matchs</a>
      </div>`;
  }
  if (connectionCard) {
    connectionCard.querySelector('.card-header h5').textContent = 'Mon compte';
    connectionCard.querySelector('.card-body').innerHTML = `
      <div class="small-muted mb-2"><strong>Email</strong></div>
      <div class="small-muted">${ctx.user?.email || '—'}</div>
      <div class="small-muted mb-2 mt-3"><strong>Équipe liée</strong></div>
      <div class="small-muted">${ctx.teamName || 'Aucune liaison'}</div>`;
  }
}

async function getRecentUpdates(teamId) {
  return await supabase
    .from('tactics')
    .select('id,title,change_note,updated_at,version')
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false })
    .limit(5);
}
