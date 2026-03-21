
import { activateMenu, escapeHtml, formatDate, getQueryParam, nl2br, setAppTitle, showAlert, supabase } from './common.js';
import { canEdit, requireAuthForPage } from './auth.js';
import { notifyTeamEvent } from './notification-helpers.js';
import { getPortalContext } from './portal-common.js';
const tt = (key, fallback = '') => (window.t ? window.t(key, fallback) : fallback || key);

setAppTitle('Détail match');
activateMenu('matches');

const pageCtx = await requireAuthForPage();
const portalCtx = await getPortalContext();
const canModifyGamePlan = !!pageCtx && canEdit(pageCtx.role);
let currentMatch = null;

const id = getQueryParam('id');
const host = document.getElementById('match-detail-host');
const pageTitle = document.getElementById('page-title');
const editLink = document.getElementById('edit-link');
const lists = {
  offense: document.getElementById('gp-offense'),
  defense: document.getElementById('gp-defense'),
  special_teams: document.getElementById('gp-special')
};

function renderPlanList(hostEl, items, emptyLabel) {
  if (!hostEl) return;
  hostEl.innerHTML = items.length
    ? items.map(item => `<li class="list-group-item"><div><a href="tactic-detail.html?id=${item.tactics?.id}">${escapeHtml(item.tactics?.title || 'Tactique')}</a><div class="meta">${escapeHtml(item.tactics?.formation || '—')} • ${escapeHtml(item.tactics?.category || '—')}</div></div><span class="badge bg-label-primary">#${escapeHtml(item.priority_order || 1)}</span></li>`).join('')
    : `<li class="list-group-item text-muted">${emptyLabel}</li>`;
}

if (!id) {
  showAlert(tt('match.no_id', 'Identifiant de match manquant.'), 'danger');
  host.innerHTML = `<div class="card"><div class="card-body">${tt('match.none_selected', 'Aucun match sélectionné.')}</div></div>`;
} else {
  try {
    const [{ data: match, error }, { data: links, error: linksError }] = await Promise.all([
      supabase.from('matches').select('*, teams(name)').eq('id', id).single(),
      supabase.from('match_tactics').select('side,priority_order,tactics(id,title,formation,category)').eq('match_id', id).order('priority_order')
    ]);
    if (error) throw error;
    if (linksError) throw linksError;

    currentMatch = match;
    pageTitle.textContent = match.opponent ? `${tt('match.label','Match')} vs ${match.opponent}` : tt('page.match_detail', 'Détail du match');
    editLink.href = `matches.html?edit=${match.id}`;

    host.innerHTML = `<div class="row">
      <div class="col-lg-8 mb-4"><div class="card h-100"><div class="card-header d-flex justify-content-between align-items-start gap-3 flex-wrap"><div><h4 class="mb-1">${escapeHtml(match.opponent || '')}</h4><div class="d-flex gap-2 flex-wrap mt-2"><span class="badge bg-label-primary">${formatDate(match.match_date)}</span><span class="badge bg-label-secondary">${escapeHtml(match.competition_type || 'Match')}</span></div></div><div class="text-end small text-muted"><div class="team-title-wrap justify-content-end"><img src="${match.teams?.logo_url || '../assets/img/branding/team-logo-placeholder.png'}" alt="${escapeHtml(match.teams?.name || tt('match.team', 'Équipe'))}" class="team-logo-sm"><span>${tt('match.team','Équipe')}: ${escapeHtml(match.teams?.name || '—')}</span></div><div>${tt('x.1273357555572465201','Lieu')}: ${escapeHtml(match.location || '—')}</div></div></div><div class="card-body"><div class="mb-4"><h6 class="text-uppercase text-muted mb-2">${tt('match.notes','Notes')}</h6><p class="mb-0">${nl2br(match.notes || tt('match.no_notes', 'Aucune note pour le moment.'))}</p></div><div><h6 class="text-uppercase text-muted mb-2">${tt('x.3574378149377106297','Game plan')}</h6><div class="tag-list">${(() => {
        const totals = { offense: 0, defense: 0, special_teams: 0 };
        (links || []).forEach(item => { if (Object.prototype.hasOwnProperty.call(totals, item.side || '')) totals[item.side] += 1; });
        const chips = [];
        if (totals.offense) chips.push(`<span class="tag-chip">${tt('x.3014715369595947509',tt('match.offense', 'Offense'))} ${totals.offense}</span>`);
        if (totals.defense) chips.push(`<span class="tag-chip">${tt('x.4537250632815006505',tt('match.defense', 'Defense'))} ${totals.defense}</span>`);
        if (totals.special_teams) chips.push(`<span class="tag-chip">ST ${totals.special_teams}</span>`);
        return chips.length ? chips.join('') : `<span class="text-muted">${tt('match.no_linked_tactics','Aucune tactique liée.')}</span>`;
      })()}</div></div></div></div></div>
      <div class="col-lg-4 mb-4"><div class="card"><div class="card-header"><h5 class="mb-0">${tt('match.quick_read','Lecture rapide')}</h5></div><div class="card-body small"><div class="mb-2"><strong>${tt('match.team','Équipe')}:</strong> ${escapeHtml(match.teams?.name || '—')}</div><div class="mb-2"><strong>${tt('x.3905222729924685381','Date')}:</strong> ${formatDate(match.match_date)}</div><div class="mb-2"><strong>${tt('x.1273357555572465201','Lieu')}:</strong> ${escapeHtml(match.location || '—')}</div><div class="mb-0"><strong>${tt('x.788177760432123048','Compétition')}:</strong> ${escapeHtml(match.competition_type || '—')}</div></div></div></div>
    </div>`;

    renderPlanList(lists.offense, (links || []).filter(item => item.side === 'offense'), tt('match.no_offense', 'Aucune tactique offense liée.'));
    renderPlanList(lists.defense, (links || []).filter(item => item.side === 'defense'), tt('match.no_defense', 'Aucune tactique défense liée.'));
    renderPlanList(lists.special_teams, (links || []).filter(item => item.side === 'special_teams'), tt('match.no_special', 'Aucune tactique special teams liée.'));
    await loadMatchLiveSection();
  } catch (err) {
    console.error(err);
    showAlert(err.message || tt('match.load_failed', 'Impossible de charger le match.'), 'danger');
    host.innerHTML = `<div class="card"><div class="card-body">${tt('match.load_error', 'Erreur de chargement du match.')}</div></div>`;
  }
}


const gamePlanListHost = document.getElementById('gameplan-list');
const gamePlanNotesInput = document.getElementById('gameplan-notes');
const saveGamePlanBtn = document.getElementById('save-gameplan-btn');
const offenseNotesInput = document.getElementById('offense-notes');
const defenseNotesInput = document.getElementById('defense-notes');
const exportPdfLink = document.getElementById('export-pdf-link');
const gamePlanReadonlyHint = document.getElementById('gameplan-readonly-hint');
let currentMatchGamePlanRows = [];
let currentMatchDiagramLinks = [];
let currentMatchTacticDiagrams = [];


if (!canModifyGamePlan) {
  if (editLink) editLink.style.display = 'none';
  if (saveGamePlanBtn) saveGamePlanBtn.style.display = 'none';
  if (gamePlanReadonlyHint) gamePlanReadonlyHint.classList.remove('d-none');
}





function ensureLiveSectionHost() {
  let section = document.getElementById('match-live-section');
  if (!section) {
    host.insertAdjacentHTML('afterend', `<div id="match-live-section" class="mt-4"></div>`);
    section = document.getElementById('match-live-section');
  }
  return section;
}

function getLiveStatusLabel(value) {
  return ({
    scheduled: tt('match.live_status_scheduled', 'Prévu'),
    live: tt('match.live_status_live', 'En direct'),
    halftime: tt('match.live_status_halftime', 'Mi-temps'),
    paused: tt('match.live_status_paused', 'Pause'),
    finished: tt('match.live_status_finished', 'Terminé')
  })[value || 'scheduled'] || tt('match.live_status_scheduled', 'Prévu');
}

function getLiveStatusBadgeClass(value) {
  return ({
    scheduled: 'bg-label-secondary',
    live: 'bg-label-danger',
    halftime: 'bg-label-warning',
    paused: 'bg-label-info',
    finished: 'bg-label-success'
  })[value || 'scheduled'] || 'bg-label-secondary';
}

function normalizeLiveState(matchRow, statsRow) {
  return {
    status: matchRow?.live_status || 'scheduled',
    period: matchRow?.live_period || 'Q1',
    clock: matchRow?.live_clock || '15:00',
    points: Number(statsRow?.points || 0),
    touchdowns: Number(statsRow?.touchdowns || 0),
    xp_made: Number(statsRow?.xp_made || 0),
    two_pt_made: Number(statsRow?.two_pt_made || 0),
    field_goals_made: Number(statsRow?.field_goals_made || 0),
    safeties: Number(statsRow?.safeties || 0),
    first_downs: Number(statsRow?.first_downs || 0),
    total_yards: Number(statsRow?.total_yards || 0),
    passing_yards: Number(statsRow?.passing_yards || 0),
    rushing_yards: Number(statsRow?.rushing_yards || 0),
    turnovers: Number(statsRow?.turnovers || 0),
    penalties: Number(statsRow?.penalties || 0),
    third_down_made: Number(statsRow?.third_down_made || 0),
    third_down_attempts: Number(statsRow?.third_down_attempts || 0),
    red_zone_trips: Number(statsRow?.red_zone_trips || 0),
    red_zone_tds: Number(statsRow?.red_zone_tds || 0),
    possession_seconds: Number(statsRow?.possession_seconds || 0)
  };
}

function formatPossession(seconds) {
  const total = Number(seconds || 0);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}

function scoreChip(label, value, tone = 'primary') {
  return `<div class="col-6 col-md-4 col-xl-3"><div class="border rounded-3 p-3 h-100 bg-white"><div class="d-flex align-items-center justify-content-between gap-2"><span class="badge bg-label-${escapeHtml(tone)}">${escapeHtml(label)}</span><span class="fw-bold fs-5">${escapeHtml(String(value ?? 0))}</span></div></div></div>`;
}

function eventTypeLabel(value) {
  return ({
    touchdown: 'Touchdown',
    extra_point_good: 'Extra point',
    two_point_good: '2-point',
    field_goal_good: 'Field goal',
    safety: 'Safety',
    turnover: 'Turnover',
    penalty: 'Penalty',
    first_down: 'First down',
    big_play: 'Big play',
    custom: tt('common.custom', 'Personnalisé')
  })[value || 'custom'] || tt('common.custom', 'Personnalisé');
}


function captainTitle(value) {
  return ({
    captain_1: tt('players.captain_1', 'Capitaine 1'),
    captain_2: tt('players.captain_2', 'Capitaine 2'),
    captain_3: tt('players.captain_3', 'Capitaine 3')
  })[value || ''] || '';
}

function captainIconMarkup(value, sizeClass = 'captain-icon-sm') {
  const map = {
    captain_1: '../assets/img/captains/captaine1.png',
    captain_2: '../assets/img/captains/captaine2.png',
    captain_3: '../assets/img/captains/captaine3.png'
  };
  const src = map[value || ''];
  if (!src) return '';
  const title = captainTitle(value);
  return `<span class="captain-icon-wrap" title="${escapeHtml(title)}"><img src="${src}" alt="${escapeHtml(title || 'Captain')}" class="captain-icon ${sizeClass}"></span>`;
}

function formatPlayerOptionLabel(player) {
  const number = player?.jersey_number ? `#${player.jersey_number}` : '#—';
  const name = player?.full_name || tt('players.player', 'Joueuse');
  return `${number} · ${name}`;
}

function buildPlayerDropdown(players = [], selectedId = '', disabled = false) {
  const selected = players.find((player) => String(player.id) === String(selectedId || '')) || null;
  const selectedLabel = selected ? formatPlayerOptionLabel(selected) : tt('match.live_player_placeholder', 'Choisir une joueuse');
  const selectedCaptain = selected ? captainIconMarkup(selected.captain_role) : '';
  const items = [`
    <li><button class="dropdown-item d-flex align-items-center gap-2" type="button" data-player-option="">${tt('common.none', 'Aucun')}</button></li>
  `].concat(players.map((player) => `
    <li>
      <button class="dropdown-item d-flex align-items-center gap-2" type="button" data-player-option="${player.id}" data-player-label="${escapeHtml(formatPlayerOptionLabel(player))}">
        ${captainIconMarkup(player.captain_role)}
        <span>${escapeHtml(formatPlayerOptionLabel(player))}</span>
      </button>
    </li>
  `));
  return `
    <input type="hidden" name="player_id" value="${escapeHtml(selected ? String(selected.id) : '')}">
    <input type="hidden" name="player_name" value="${escapeHtml(selected ? (playerDisplayName(selected)) : '')}">
    <div class="dropdown w-100 match-player-dropdown">
      <button class="btn btn-outline-secondary dropdown-toggle w-100 text-start d-flex align-items-center justify-content-between" type="button" data-bs-toggle="dropdown" aria-expanded="false" ${disabled ? 'disabled' : ''}>
        <span class="d-inline-flex align-items-center gap-2 overflow-hidden">
          ${selectedCaptain || '<span class="captain-icon-wrap d-none"></span>'}
          <span class="text-truncate" data-player-selected-label>${escapeHtml(selectedLabel)}</span>
        </span>
      </button>
      <ul class="dropdown-menu w-100 shadow-sm" style="max-height:280px; overflow:auto;">
        ${items.join('')}
      </ul>
    </div>`;
}

function playerDisplayName(player) {
  if (!player) return '';
  const number = player?.jersey_number ? `#${player.jersey_number} · ` : '';
  return `${number}${player.full_name || ''}`.trim();
}

function buildEventTimeline(events = []) {
  if (!events.length) {
    return `<div class="text-muted">${tt('match.live_no_events', 'Aucun événement enregistré pour le moment.')}</div>`;
  }
  return `<div class="list-group list-group-flush">${events.map((event) => `
    <div class="list-group-item px-0">
      <div class="d-flex justify-content-between gap-3 align-items-start flex-wrap">
        <div>
          <div class="fw-semibold">${escapeHtml(eventTypeLabel(event.event_type))}${event.player_name ? ` · ${escapeHtml(event.player_name)}` : ''}</div>
          <div class="small text-muted">${escapeHtml(event.period || 'Q1')} • ${escapeHtml(event.clock_display || '15:00')}${event.notes ? ` • ${escapeHtml(event.notes)}` : ''}</div>
        </div>
        <div class="text-end">
          ${Number(event.points_delta || 0) ? `<span class="badge bg-label-success">+${escapeHtml(String(event.points_delta || 0))} pts</span>` : ''}
        </div>
      </div>
    </div>`).join('')}</div>`;
}

function applyEventToStats(baseStats, eventType, pointsDelta) {
  const next = { ...baseStats };
  const safePoints = Number(pointsDelta || 0);
  next.points = Number(next.points || 0) + safePoints;
  if (eventType === 'touchdown') next.touchdowns += 1;
  if (eventType === 'extra_point_good') next.xp_made += 1;
  if (eventType === 'two_point_good') next.two_pt_made += 1;
  if (eventType === 'field_goal_good') next.field_goals_made += 1;
  if (eventType === 'safety') next.safeties = Number(next.safeties || 0) + 1;
  if (eventType === 'turnover') next.turnovers += 1;
  if (eventType === 'penalty') next.penalties += 1;
  if (eventType === 'first_down') next.first_downs += 1;
  return next;
}


function recomputeStatsFromEvents(matchRow, events = []) {
  return (events || []).reduce((acc, item) => applyEventToStats(acc, item.event_type, item.points_delta), normalizeLiveState(matchRow, {}));
}

async function loadMatchLiveSection() {
  const section = ensureLiveSectionHost();
  if (!section || !currentMatch?.id) return;
  const isCoachManager = pageCtx?.role === 'coach' && Number(portalCtx.teamId || 0) === Number(currentMatch.team_id || 0);
  try {
    const [{ data: statsRow, error: statsErr }, { data: events, error: eventsErr }, { data: teamPlayers, error: playersErr }] = await Promise.all([
      supabase.from('match_team_stats').select('*').eq('match_id', currentMatch.id).eq('team_id', currentMatch.team_id).maybeSingle(),
      supabase.from('match_events').select('*').eq('match_id', currentMatch.id).eq('team_id', currentMatch.team_id).order('created_at', { ascending: false }),
      supabase.from('players').select('id,full_name,jersey_number,captain_role').eq('team_id', currentMatch.team_id).order('jersey_number', { ascending: true, nullsFirst: false }).order('full_name')
    ]);
    if (statsErr && !String(statsErr.message || '').includes('relation')) throw statsErr;
    if (eventsErr && !String(eventsErr.message || '').includes('relation')) throw eventsErr;
    if (playersErr && !String(playersErr.message || '').includes('relation')) throw playersErr;
    const state = normalizeLiveState(currentMatch, statsRow || {});
    const derivedState = recomputeStatsFromEvents(currentMatch, events || []);
    const displayState = {
      ...state,
      points: Number(derivedState.points || 0),
      touchdowns: Number(derivedState.touchdowns || 0),
      xp_made: Number(derivedState.xp_made || 0),
      two_pt_made: Number(derivedState.two_pt_made || 0),
      field_goals_made: Number(derivedState.field_goals_made || 0),
      safeties: Number(derivedState.safeties || 0),
      turnovers: Number(derivedState.turnovers || 0),
      penalties: Number(derivedState.penalties || 0),
      first_downs: Number(derivedState.first_downs || 0)
    };
    const computedTeamPoints = Number(displayState.points || 0);
    const teamPlayersSafe = teamPlayers || [];
    const statsVisible = isCoachManager || currentMatch.live_status === 'finished' || currentMatch.stats_ready === true;

    if (!statsVisible) {
      section.innerHTML = `<div class="card border-warning"><div class="card-body"><div class="d-flex justify-content-between align-items-center flex-wrap gap-3"><div><h5 class="mb-1">${tt('match.live_title', 'Statistiques du match')}</h5><div class="text-muted">${tt('match.live_hidden_until_finished', 'Les statistiques seront visibles une fois le match terminé et validé.')}</div></div><span class="badge ${getLiveStatusBadgeClass(currentMatch.live_status || 'scheduled')}">${escapeHtml(getLiveStatusLabel(currentMatch.live_status || 'scheduled'))}</span></div></div></div>`;
      return;
    }

    const eventsEnabled = state.status === 'live';
    section.innerHTML = `
      <div class="card mb-3 border-${isCoachManager ? 'primary' : 'success'}" id="match-live-header-card">
        <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div>
            <h5 class="mb-1">${tt('match.live_title', 'Statistiques du match')}</h5>
            <div class="small text-muted">${isCoachManager ? tt('match.live_coach_hint', 'Gestion en temps réel de ton équipe pendant le match.') : tt('match.live_readonly_hint', 'Lecture seule des statistiques du match terminé.')}</div>
          </div>
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <span class="badge ${getLiveStatusBadgeClass(state.status)}">${escapeHtml(getLiveStatusLabel(state.status))}</span>
            <span class="badge bg-label-dark">${escapeHtml(state.period)}</span>
            <span class="badge bg-label-secondary">${escapeHtml(state.clock)}</span>
          </div>
        </div>
      </div>

      <details class="card mb-3 border-${isCoachManager ? 'primary' : 'success'}" id="match-live-stats-details">
        <summary class="card-header d-flex justify-content-between align-items-center flex-wrap gap-3 cursor-pointer" style="list-style:none;">
          <div>
            <h6 class="mb-1">${tt('match.live_stats_overview', 'Statistiques du match')}</h6>
            <div class="small text-muted">${tt('match.live_stats_toggle_hint', 'Ouvrir pour afficher les cartes de statistiques.')}</div>
          </div>
          <i class="bx bx-chevron-down fs-4 text-muted"></i>
        </summary>
        <div class="card-body">
          <div class="row g-3 mb-3">
            <div class="col-lg-4">
              <div class="border rounded-3 p-3 h-100 bg-light">
                <div class="small text-muted mb-1">${tt('match.live_team_score', 'Score de l’équipe')}</div>
                <div class="display-6 fw-bold mb-1">${escapeHtml(String(currentMatch.team_final_score ?? computedTeamPoints))}</div>
                <div class="small text-muted">${escapeHtml(currentMatch.teams?.name || tt('match.team', 'Équipe'))}</div>
              </div>
            </div>
            <div class="col-lg-4">
              <div class="border rounded-3 p-3 h-100 bg-light">
                <div class="small text-muted mb-1">${tt('match.live_opponent_score', 'Score adverse')}</div>
                <div class="display-6 fw-bold mb-1">${escapeHtml(String(currentMatch.opponent_final_score ?? 0))}</div>
                <div class="small text-muted">${escapeHtml(currentMatch.opponent || tt('match.opponent', 'Adversaire'))}</div>
              </div>
            </div>
            <div class="col-lg-4">
              <div class="border rounded-3 p-3 h-100 bg-light">
                <div class="small text-muted mb-1">${tt('match.live_result', 'Résultat')}</div>
                <div class="fs-4 fw-bold mb-1">${escapeHtml((() => {
                  const teamScore = Number(currentMatch.team_final_score ?? computedTeamPoints ?? 0);
                  const oppScore = Number(currentMatch.opponent_final_score ?? 0);
                  if ((currentMatch.live_status || state.status) !== 'finished') return tt('match.live_pending', 'En attente');
                  if (teamScore > oppScore) return tt('match.live_result_win', 'Victoire');
                  if (teamScore < oppScore) return tt('match.live_result_loss', 'Défaite');
                  return tt('match.live_result_draw', 'Égalité');
                })())}</div>
                <div class="small text-muted">${escapeHtml(currentMatch.opponent || tt('match.opponent', 'Adversaire'))}</div>
              </div>
            </div>
          </div>
          <div class="row g-3 mb-3">
            ${scoreChip(tt('match.live_touchdowns', 'Touchdowns'), displayState.touchdowns, 'primary')}
            ${scoreChip(tt('match.live_xp', 'Extra points'), displayState.xp_made, 'success')}
            ${scoreChip(tt('match.live_fg', 'Field goals'), displayState.field_goals_made, 'warning')}
            ${scoreChip(tt('match.live_two_pt', '2-point conversions'), displayState.two_pt_made, 'dark')}
          </div>

          <div class="row g-3 mb-3">
            ${scoreChip(tt('match.live_safeties', 'Safeties'), displayState.safeties, 'warning')}
            ${scoreChip(tt('match.live_turnovers', 'Turnovers'), displayState.turnovers, 'danger')}
            ${scoreChip(tt('match.live_penalties', 'Penalties'), displayState.penalties, 'secondary')}
            ${scoreChip(tt('match.live_first_downs', 'First downs'), displayState.first_downs, 'info')}
          </div>
        </div>
      </details>

      ${isCoachManager ? `
          <div class="card border mb-3">
            <div class="card-header"><h6 class="mb-0">${tt('match.live_controls', 'Contrôle du match')}</h6></div>
            <div class="card-body">
              <form id="match-live-status-form" class="row g-3 align-items-end">
                <div class="col-md-3"><label class="form-label">${tt('match.live_status', 'Statut')}</label><select class="form-select" name="live_status"><option value="scheduled" ${state.status==='scheduled'?'selected':''}>${tt('match.live_status_scheduled', 'Prévu')}</option><option value="live" ${state.status==='live'?'selected':''}>${tt('match.live_status_live', 'En direct')}</option><option value="halftime" ${state.status==='halftime'?'selected':''}>${tt('match.live_status_halftime', 'Mi-temps')}</option><option value="paused" ${state.status==='paused'?'selected':''}>${tt('match.live_status_paused', 'Pause')}</option><option value="finished" ${state.status==='finished'?'selected':''}>${tt('match.live_status_finished', 'Terminé')}</option></select></div>
                <div class="col-md-3"><label class="form-label">${tt('match.live_period', 'Période')}</label><select class="form-select" name="live_period">${['Q1','Q2','Q3','Q4','OT'].map((period) => `<option value="${period}" ${state.period===period?'selected':''}>${period}</option>`).join('')}</select></div>
                <div class="col-md-3"><label class="form-label">${tt('match.live_clock', 'Horloge')}</label><input class="form-control" type="text" name="live_clock" value="${escapeHtml(state.clock)}" placeholder="15:00"></div>
                <div class="col-md-3"><button class="btn btn-primary w-100" type="submit">${tt('match.live_update_status', 'Mettre à jour')}</button></div>
                <div class="col-12 ${state.status === 'finished' ? '' : 'd-none'}" id="match-final-score-row">
                  <div class="row g-3">
                    <div class="col-md-4"><label class="form-label">${tt('match.live_team_final_score', 'Score final équipe')}</label><input class="form-control" type="number" name="team_final_score" min="0" step="1" value="${escapeHtml(String(currentMatch.team_final_score ?? computedTeamPoints ?? 0))}" readonly></div>
                    <div class="col-md-4"><label class="form-label">${tt('match.live_opponent_final_score', 'Score final adverse')}</label><input class="form-control" type="number" name="opponent_final_score" min="0" step="1" value="${escapeHtml(String(currentMatch.opponent_final_score ?? 0))}"></div>
                    <div class="col-md-4"><div class="form-text pt-4 mt-2">${tt('match.live_final_score_hint', 'Le score de ton équipe est calculé automatiquement à partir des événements. Renseigne uniquement le score adverse.')}</div></div>
                  </div>
                </div>
              </form>
            </div>
          </div>

          <div class="card border mb-0 ${eventsEnabled ? '' : 'border-warning'}">
            <div class="card-header"><h6 class="mb-0">${tt('match.live_add_event', 'Ajouter un événement')}</h6></div>
            <div class="card-body">
              <div id="match-events-live-warning" class="alert alert-warning mb-3 ${eventsEnabled ? 'd-none' : ''}">${tt('match.live_events_only_live', 'Tu peux ajouter des événements uniquement quand le match est en direct.')}</div>
              <div class="d-flex flex-wrap gap-2 mb-3" id="match-live-quick-events">
                ${[
                  ['touchdown', 6, 'Touchdown'],
                  ['extra_point_good', 1, 'XP'],
                  ['two_point_good', 2, '2PT'],
                  ['field_goal_good', 3, 'FG'],
                  ['safety', 2, 'Safety'],
                  ['turnover', 0, 'TO'],
                  ['penalty', 0, 'Penalty'],
                  ['first_down', 0, '1st down']
                ].map(([type, points, label]) => `<button class="btn btn-sm btn-outline-secondary" type="button" ${eventsEnabled ? '' : 'disabled'} data-quick-event="${type}" data-quick-points="${points}">${label}</button>`).join('')}
              </div>
              <form id="match-event-form" class="row g-3 align-items-end">
                <div class="col-md-3"><label class="form-label">${tt('match.event_type', 'Type')}</label><select class="form-select" name="event_type" ${eventsEnabled ? '' : 'disabled'}>${['touchdown','extra_point_good','two_point_good','field_goal_good','safety','turnover','penalty','first_down','big_play','custom'].map((item) => `<option value="${item}">${escapeHtml(eventTypeLabel(item))}</option>`).join('')}</select></div>
                <div class="col-md-2"><label class="form-label">${tt('match.live_period', 'Période')}</label><select class="form-select" name="period" ${eventsEnabled ? '' : 'disabled'}>${['Q1','Q2','Q3','Q4','OT'].map((period) => `<option value="${period}" ${state.period===period?'selected':''}>${period}</option>`).join('')}</select></div>
                <div class="col-md-2"><label class="form-label">${tt('match.live_clock', 'Horloge')}</label><input class="form-control" type="text" name="clock_display" value="${escapeHtml(state.clock)}" placeholder="12:34" ${eventsEnabled ? '' : 'disabled'}></div>
                <div class="col-md-2"><label class="form-label">${tt('match.live_points_delta', 'Points')}</label><input class="form-control" type="number" name="points_delta" min="0" step="1" value="0" ${eventsEnabled ? '' : 'disabled'}></div>
                <div class="col-md-3"><label class="form-label">${tt('match.live_player_name', 'Joueuse / joueuse clé')}</label>${buildPlayerDropdown(teamPlayersSafe, '', !eventsEnabled)}</div>
                <div class="col-12"><label class="form-label">${tt('match.notes','Notes')}</label><input class="form-control" type="text" name="notes" placeholder="${tt('match.live_event_notes_placeholder', 'Détail rapide de l’action...')}" ${eventsEnabled ? '' : 'disabled'}></div>
                <div class="col-12 d-flex justify-content-end"><button class="btn btn-primary" type="submit" ${eventsEnabled ? '' : 'disabled'}>${tt('match.live_event_save', 'Enregistrer l’événement')}</button></div>
              </form>
            </div>
          </div>` : ''}

          <div class="mt-4">
            <h6 class="mb-3">${tt('match.live_timeline', 'Timeline')}</h6>
            ${buildEventTimeline(events || [])}
          </div>
      `;

    if (isCoachManager) {
      const matchLiveStatusForm = document.getElementById('match-live-status-form');
      const matchLiveStatusSelect = matchLiveStatusForm?.querySelector('[name="live_status"]');
      const finalScoreRow = document.getElementById('match-final-score-row');
      const eventForm = document.getElementById('match-event-form');
      const statusSubmitBtn = matchLiveStatusForm?.querySelector('button[type="submit"]');
      const statusSubmitLabel = statusSubmitBtn?.innerHTML || tt('match.live_update_status', 'Mettre à jour');
      const syncFinalScoreVisibility = () => {
        const currentStatus = matchLiveStatusSelect?.value || state.status;
        const show = currentStatus === 'finished';
        finalScoreRow?.classList.toggle('d-none', !show);
        const teamInput = matchLiveStatusForm?.querySelector('[name="team_final_score"]');
        if (teamInput) {
          teamInput.value = String(computedTeamPoints);
          teamInput.readOnly = true;
        }
      };
      const syncEventControls = () => {
        const liveNow = (matchLiveStatusSelect?.value || state.status) === 'live';
        const eventWarning = document.getElementById('match-events-live-warning');
        eventWarning?.classList.toggle('d-none', liveNow);
        document.querySelectorAll('#match-live-quick-events [data-quick-event]').forEach((btn) => {
          btn.disabled = !liveNow;
        });
        if (eventForm) {
          eventForm.querySelectorAll('input, select, textarea, button[type="submit"]').forEach((field) => {
            field.disabled = !liveNow;
          });
          const dropdownToggle = eventForm.querySelector('.match-player-dropdown .dropdown-toggle');
          if (dropdownToggle) dropdownToggle.disabled = !liveNow;
        }
      };
      const syncLiveMatchControls = () => {
        syncFinalScoreVisibility();
        syncEventControls();
      };
      matchLiveStatusSelect?.addEventListener('change', syncLiveMatchControls);
      syncLiveMatchControls();

      matchLiveStatusForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const fd = new FormData(form);
        if (statusSubmitBtn) {
          statusSubmitBtn.disabled = true;
          statusSubmitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${tt('common.saving','Enregistrement...')}`;
        }
        try {
        const nextStatus = fd.get('live_status') || 'scheduled';
        const teamFinalScore = nextStatus === 'finished' ? Number(fd.get('team_final_score')) : null;
        const opponentFinalScore = nextStatus === 'finished' ? Number(fd.get('opponent_final_score')) : null;
        if (nextStatus === 'finished' && (!Number.isFinite(teamFinalScore) || !Number.isFinite(opponentFinalScore) || teamFinalScore < 0 || opponentFinalScore < 0)) {
          showAlert(tt('match.live_final_score_required', 'Le score de ton équipe est calculé automatiquement à partir des événements. Renseigne uniquement le score adverse.'), 'warning');
          return;
        }
        const payload = {
          live_status: nextStatus,
          live_period: fd.get('live_period') || 'Q1',
          live_clock: fd.get('live_clock') || '15:00',
          stats_ready: nextStatus === 'finished',
          started_at: ['live', 'halftime', 'paused', 'finished'].includes(nextStatus) ? (currentMatch.started_at || new Date().toISOString()) : currentMatch.started_at || null,
          finished_at: nextStatus === 'finished' ? new Date().toISOString() : null,
          team_final_score: nextStatus === 'finished' ? teamFinalScore : (currentMatch.team_final_score ?? null),
          opponent_final_score: nextStatus === 'finished' ? opponentFinalScore : (currentMatch.opponent_final_score ?? null)
        };
        const { error } = await supabase.from('matches').update(payload).eq('id', currentMatch.id).eq('team_id', currentMatch.team_id);
        if (error) throw error;
        if (nextStatus === 'finished') {
          const { data: allEvents, error: allEventsErr } = await supabase.from('match_events').select('*').eq('match_id', currentMatch.id).eq('team_id', currentMatch.team_id).order('created_at', { ascending: true });
          if (allEventsErr) throw allEventsErr;
          const finalStats = recomputeStatsFromEvents({ ...currentMatch, ...payload }, allEvents || []);
          finalStats.points = teamFinalScore;
          const upsertPayload = {
            match_id: currentMatch.id,
            team_id: currentMatch.team_id,
            points: finalStats.points,
            touchdowns: finalStats.touchdowns,
            xp_made: finalStats.xp_made,
            two_pt_made: finalStats.two_pt_made,
            field_goals_made: finalStats.field_goals_made,
            first_downs: finalStats.first_downs,
            total_yards: finalStats.total_yards,
            passing_yards: finalStats.passing_yards,
            rushing_yards: finalStats.rushing_yards,
            turnovers: finalStats.turnovers,
            penalties: finalStats.penalties,
            third_down_made: finalStats.third_down_made,
            third_down_attempts: finalStats.third_down_attempts,
            red_zone_trips: finalStats.red_zone_trips,
            red_zone_tds: finalStats.red_zone_tds,
            possession_seconds: finalStats.possession_seconds,
            updated_by_profile_id: pageCtx?.user?.id || null
          };
          const { error: statsErr } = await supabase.from('match_team_stats').upsert(upsertPayload, { onConflict: 'match_id,team_id' });
          if (statsErr) throw statsErr;
        }
        currentMatch = { ...currentMatch, ...payload };
        showAlert(tt('match.live_status_saved', 'Statut du match mis à jour.'), 'success');
        await loadMatchLiveSection();
        } finally {
          if (statusSubmitBtn) {
            statusSubmitBtn.disabled = false;
            statusSubmitBtn.innerHTML = statusSubmitLabel;
          }
        }
      });

      document.getElementById('match-live-quick-events')?.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-quick-event]');
        if (!btn) return;
        const form = document.getElementById('match-event-form');
        if (!form) return;
        form.event_type.value = btn.dataset.quickEvent || 'custom';
        form.points_delta.value = btn.dataset.quickPoints || '0';
      });

      document.querySelector('#match-event-form .match-player-dropdown .dropdown-menu')?.addEventListener('click', (event) => {
        const option = event.target.closest('[data-player-option]');
        if (!option) return;
        const wrapper = document.querySelector('#match-event-form .match-player-dropdown');
        if (!wrapper) return;
        const hiddenId = wrapper.parentElement.querySelector('input[name="player_id"]');
        const hiddenName = wrapper.parentElement.querySelector('input[name="player_name"]');
        const labelHost = wrapper.querySelector('[data-player-selected-label]');
        const iconHost = wrapper.querySelector('.captain-icon-wrap');
        const playerId = option.dataset.playerOption || '';
        hiddenId.value = playerId;
        const selected = teamPlayersSafe.find((player) => String(player.id) === String(playerId)) || null;
        hiddenName.value = selected ? playerDisplayName(selected) : '';
        if (labelHost) labelHost.textContent = selected ? formatPlayerOptionLabel(selected) : tt('match.live_player_placeholder', 'Choisir une joueuse');
        const iconHtml = selected ? captainIconMarkup(selected.captain_role) : '';
        if (iconHost) {
          iconHost.outerHTML = iconHtml || '<span class="captain-icon-wrap d-none"></span>';
        } else if (iconHtml) {
          wrapper.querySelector('.dropdown-toggle > span').insertAdjacentHTML('afterbegin', `${iconHtml}`);
        }
      });

      document.getElementById('match-event-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (currentMatch.live_status !== 'live') {
          showAlert(tt('match.live_events_only_live', 'Tu peux ajouter des événements uniquement quand le match est en direct.'), 'warning');
          return;
        }
        const form = event.currentTarget;
        const fd = new FormData(form);
        const eventType = String(fd.get('event_type') || 'custom');
        const pointsDelta = Number(fd.get('points_delta') || 0);
        const payload = {
          match_id: currentMatch.id,
          team_id: currentMatch.team_id,
          event_type: eventType,
          period: String(fd.get('period') || currentMatch.live_period || 'Q1'),
          clock_display: String(fd.get('clock_display') || currentMatch.live_clock || '15:00'),
          points_delta: pointsDelta,
          player_name: String(fd.get('player_name') || '').trim() || null,
          notes: String(fd.get('notes') || '').trim() || null,
          created_by_profile_id: pageCtx?.user?.id || null
        };
        const { error: insertEventErr } = await supabase.from('match_events').insert(payload);
        if (insertEventErr) throw insertEventErr;
        form.reset();
        const selectedLabel = form.querySelector('[data-player-selected-label]');
        if (selectedLabel) selectedLabel.textContent = tt('match.live_player_placeholder', 'Choisir une joueuse');
        const hiddenPlayerId = form.querySelector('input[name="player_id"]');
        const hiddenPlayerName = form.querySelector('input[name="player_name"]');
        if (hiddenPlayerId) hiddenPlayerId.value = '';
        if (hiddenPlayerName) hiddenPlayerName.value = '';
        const iconWrap = form.querySelector('.captain-icon-wrap');
        if (iconWrap) iconWrap.outerHTML = '<span class="captain-icon-wrap d-none"></span>';
        const pointsInput = form.querySelector('[name="points_delta"]');
        if (pointsInput) pointsInput.value = '0';
        showAlert(tt('match.live_event_saved', 'Événement enregistré.'), 'success');
        await loadMatchLiveSection();
      });
    }
  } catch (err) {
    console.error(err);
    section.innerHTML = `<div class="card border-warning"><div class="card-body"><h6 class="mb-2">${tt('match.live_title', 'Statistiques du match')}</h6><div class="text-muted">${tt('match.live_setup_needed', 'La gestion live des stats nécessite la nouvelle migration SQL. Applique le fichier SQL dédié puis recharge la page.')}</div></div></div>`;
  }
}

function parseDiagramPayload(diagramJson) {
  if (!diagramJson) return null;
  try {
    const parsed = typeof diagramJson === 'string' ? JSON.parse(diagramJson) : diagramJson;
    return { board: parsed?.board ? parsed.board : parsed, animation: parsed?.animation || null };
  } catch (_) {
    return null;
  }
}

function getDiagramVideoUrl(diagram) {
  const payload = parseDiagramPayload(diagram?.diagram_json);
  const animation = payload?.animation;
  if (!animation?.baseState || !Array.isArray(animation?.keyframes) || animation.keyframes.length < 2) return '';
  return animation?.webm_url || animation?.webmUrl || '';
}

function formatDiagramDate(diagram) {
  const value = diagram?.updated_at || diagram?.created_at;
  if (!value) return tt('tactic.no_date', 'Aucune date');
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? tt('tactic.no_date', 'Aucune date') : `${tt('gp.update', 'Mise à jour :')} ${dt.toLocaleString()}`;
}

function groupMatchTactics(items) {
  const groups = { offense: [], defense: [], special_teams: [] };
  items.forEach(item => {
    const side = item.side || item.tactics?.phase || 'offense';
    if (!groups[side]) groups[side] = [];
    groups[side].push(item);
  });
  return groups;
}

function renderMatchGamePlan() {
  if (!gamePlanListHost) return;
  if (!currentMatchGamePlanRows.length) {
    gamePlanListHost.innerHTML = `<div class="text-muted">${tt('match.gameplan.none', 'Aucune tactique liée à ce match pour le moment.')}</div>`;
    return;
  }
  const groups = groupMatchTactics(currentMatchGamePlanRows);
  const blocks = Object.entries(groups).map(([side, items]) => {
    if (!items.length) return '';
    const title = sideTitle(side);
    return `
      <div class="mb-4">
        <h6 class="fw-semibold mb-3">${title}</h6>
        <div class="match-gameplan-grid">
          ${items.map(item => {
            const tactic = item.tactics || {};
            const diagrams = currentMatchTacticDiagrams.filter(d => d.tactic_id === tactic.id);
            const saved = currentMatchDiagramLinks.find(link => link.tactic_id === tactic.id) || null;
            const selectedId = saved?.diagram_id || diagrams.find(d => d.is_primary)?.id || diagrams[0]?.id || '';
            const selectedDiagram = diagrams.find(d => String(d.id) === String(selectedId)) || null;
            const selectedVideoUrl = getDiagramVideoUrl(selectedDiagram);
            return `
              <div class="card border match-gameplan-item" data-tactic-id="${tactic.id}">
                <div class="match-diagram-preview-wrap ${(selectedVideoUrl || selectedDiagram?.image_url) ? '' : 'd-none'}">
                  ${buildMatchDiagramPreviewMediaV943(selectedDiagram, selectedVideoUrl)}
                </div>
                <div class="card-body">
                  <div class="fw-semibold mb-1">${escapeHtml(tactic.title || tt('common.tactic','Tactique'))}</div>
                  <div class="small text-muted mb-2">${escapeHtml(tactic.category || side)}</div>
                  <div class="row g-2 mb-2">
                    <div class="col-md-6">
                      <label class="form-label small">${tt('match.section','Section')}</label>
                      <select class="form-select match-plan-section" data-tactic-id="${tactic.id}" ${canModifyGamePlan ? '' : 'disabled'}>
                        ${['standard','top_plays','red_zone','third_down','fourth_down','two_point','special_situation'].map(sec => `<option value="${sec}" ${(item.plan_section || 'standard')===sec?'selected':''}>${({standard:'Standard',top_plays:'Top plays',red_zone:'Red zone',third_down:'3rd down',fourth_down:'4th down',two_point:'2-point',special_situation:'Situation spéciale'})[sec]}</option>`).join('')}
                      </select>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small">${tt('match.priority','Priorité')}</label>
                      <select class="form-select match-plan-importance" data-tactic-id="${tactic.id}" ${canModifyGamePlan ? '' : 'disabled'}>
                        ${['normal','important','urgent'].map(level => `<option value="${level}" ${(item.importance || 'normal')===level?'selected':''}>${({normal:'Normale',important:'Importante',urgent:'Urgente'})[level]}</option>`).join('')}
                      </select>
                    </div>
                  </div>
                  <div class="mb-2">
                    <label class="form-label small">${tt('match.diagram_for_match','Diagramme pour ce match')}</label>
                    <select class="form-select match-diagram-select" data-tactic-id="${tactic.id}" ${canModifyGamePlan ? '' : 'disabled'}>
                      <option value="">${tt('match.no_diagram','Aucun diagramme')}</option>
                      ${diagrams.map(diagram => `<option value="${diagram.id}" ${String(selectedId) === String(diagram.id) ? 'selected' : ''}>${escapeHtml(diagram.title || 'Diagramme')}${diagram.is_primary ? ` · ${tt('match.primary','Principal')}` : ''}</option>`).join('')}
                    </select>
                  </div>
                  <div class="mb-2">
                    <label class="form-label small">${tt('match.quick_note','Note tactique')}</label>
                    <textarea class="form-control form-control-sm match-plan-item-notes" rows="2" data-tactic-id="${tactic.id}" placeholder="${tt('match.quick_instruction','Consigne rapide...')}" ${canModifyGamePlan ? '' : 'readonly'}>${escapeHtml(item.notes || '')}</textarea>
                  </div>
                  <div class="small text-muted mb-2 match-diagram-date">${formatDiagramDate(selectedDiagram)}</div>
                  ${(canModifyGamePlan && ['admin','coach'].includes(pageCtx?.role)) ? `` : ''}
                </div>
              </div>`;
          }).join('')}
        </div>
      </details>`;
  }).join('');
  gamePlanListHost.innerHTML = blocks;
}

async function loadMatchGamePlanSection() {
  if (!gamePlanListHost) return;
  const matchId = Number(new URLSearchParams(location.search).get('id'));
  if (!matchId) return;
  const [{ data: matchRow, error: matchErr }, { data: rows, error: rowsErr }, { data: links, error: linksErr }] = await Promise.all([
    supabase.from('matches').select('id,game_plan_notes,offense_plan_notes,defense_plan_notes').eq('id', matchId).single(),
    supabase.from('match_tactics').select('tactic_id,side,priority_order,plan_section,importance,notes,tactics(id,title,phase,category)').eq('match_id', matchId).order('priority_order'),
    supabase.from('match_tactic_diagrams').select('*').eq('match_id', matchId)
  ]);
  if (matchErr) throw matchErr;
  if (rowsErr) throw rowsErr;
  if (linksErr && !String(linksErr.message || '').includes('relation')) throw linksErr;
  currentMatchGamePlanRows = rows || [];
  currentMatchDiagramLinks = links || [];
  const tacticIds = currentMatchGamePlanRows.map(r => r.tactics?.id).filter(Boolean);
  if (tacticIds.length) {
    const { data: diagrams, error: diagErr } = await supabase.from('tactic_diagrams').select('*').in('tactic_id', tacticIds).order('is_primary', { ascending: false }).order('updated_at', { ascending: false });
    if (diagErr && !String(diagErr.message || '').includes('relation')) throw diagErr;
    currentMatchTacticDiagrams = diagrams || [];
  } else {
    currentMatchTacticDiagrams = [];
  }
  if (gamePlanNotesInput) {
    gamePlanNotesInput.value = matchRow?.game_plan_notes || '';
    if (!canModifyGamePlan) gamePlanNotesInput.setAttribute('readonly', 'readonly');
  }
  if (offenseNotesInput) {
    offenseNotesInput.value = matchRow?.offense_plan_notes || '';
    if (!canModifyGamePlan) offenseNotesInput.setAttribute('readonly', 'readonly');
  }
  if (defenseNotesInput) {
    defenseNotesInput.value = matchRow?.defense_plan_notes || '';
    if (!canModifyGamePlan) defenseNotesInput.setAttribute('readonly', 'readonly');
  }
  renderMatchGamePlan();
}


async function imageUrlToDataUrl(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error('image fetch failed');
    const blob = await response.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dimensions = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 });
      img.onerror = () => resolve({ width: 0, height: 0 });
      img.src = dataUrl;
    });
    return { dataUrl, ...dimensions };
  } catch (err) {
    console.warn(tt('match.pdf_image_load_failed', 'Impossible de charger une image pour le PDF'), url, err);
    return null;
  }
}

function sectionLabel(value) {
  return ({ standard:tt('gp.standard','Standard'), top_plays:tt('gp.top_plays','Top plays'), red_zone:tt('gp.red_zone','Red zone'), third_down:tt('gp.third_down','3rd down'), fourth_down:tt('gp.fourth_down','4th down'), two_point:tt('gp.two_point','2-point'), special_situation:tt('gp.special_situation','Situation spéciale') })[value || 'standard'] || tt('gp.standard','Standard');
}

function priorityLabel(value) {
  return ({ normal:tt('gp.normal','Normale'), important:tt('gp.important','Importante'), urgent:tt('gp.urgent','Urgente') })[value || 'normal'] || tt('gp.normal','Normale');
}

function sideTitle(value) {
  return value === 'offense' ? tt('x.3014715369595947509', tt('match.offense', 'Offense')) : value === 'defense' ? tt('x.4537250632815006505', tt('match.defense', 'Defense')) : tt('x.6425912552892308646', tt('match.special_teams', 'Special Teams'));
}

async function exportGamePlanPdf() {
  const matchId = Number(new URLSearchParams(location.search).get('id'));
  if (!matchId) return;
  const button = exportPdfLink;
  const prev = button?.innerHTML || '';
  if (button) {
    button.classList.add('disabled');
    button.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${tt('match.pdf_preparing','Préparation PDF...')}`;
  }
  try {
    const [{ data: match, error: matchErr }, { data: rows, error: rowsErr }, { data: links, error: linksErr }] = await Promise.all([
      supabase.from('matches').select('*, teams(name)').eq('id', matchId).single(),
      supabase.from('match_tactics').select('*, tactics(id,title,formation,category)').eq('match_id', matchId).order('side').order('priority_order'),
      supabase.from('match_tactic_diagrams').select('*').eq('match_id', matchId)
    ]);
    if (matchErr) throw matchErr;
    if (rowsErr) throw rowsErr;
    if (linksErr && !String(linksErr.message || '').includes('relation')) throw linksErr;
    const tacticIds = (rows || []).map(r => r.tactics?.id).filter(Boolean);
    let diagrams = [];
    if (tacticIds.length) {
      const { data, error } = await supabase.from('tactic_diagrams').select('*').in('tactic_id', tacticIds);
      if (error && !String(error.message || '').includes('relation')) throw error;
      diagrams = data || [];
    }

    const jsPDFNS = window.jspdf || window.jsPDF ? (window.jspdf || { jsPDF: window.jsPDF }) : null;
    if (!jsPDFNS?.jsPDF) throw new Error(tt('match.pdf_lib_missing', 'Librairie PDF non chargée. Vérifiez votre connexion internet.'));
    const pdf = new jsPDFNS.jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const COLORS = {
      green: [33, 150, 83],
      greenDark: [17, 94, 56],
      blue: [43, 108, 176],
      amber: [217, 119, 6],
      red: [220, 38, 38],
      text: [33, 37, 41],
      muted: [107, 114, 128],
      line: [225, 230, 235],
      soft: [247, 249, 252],
      white: [255, 255, 255]
    };

    const setText = (rgb = COLORS.text) => pdf.setTextColor(...rgb);
    const ensureSpace = (needed = 12) => {
      if (y + needed > pageHeight - 18) {
        pdf.addPage();
        y = margin;
      }
    };
    const drawDivider = () => {
      pdf.setDrawColor(...COLORS.line);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 5;
    };
    const writeWrapped = (textValue, x, maxWidth = contentWidth, size = 10, lineGap = 4.5, color = COLORS.text) => {
      const text = String(textValue || '—');
      pdf.setFontSize(size);
      setText(color);
      const lines = pdf.splitTextToSize(text, maxWidth);
      ensureSpace(lines.length * lineGap + 2);
      pdf.text(lines, x, y);
      y += lines.length * lineGap;
      setText(COLORS.text);
    };
    const drawChip = (label, x, width, bg, fg = COLORS.white) => {
      pdf.setFillColor(...bg);
      pdf.roundedRect(x, y - 4, width, 8, 2, 2, 'F');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...fg);
      pdf.text(label, x + 3, y + 1.1);
      setText(COLORS.text);
    };
    const priorityColor = (value) => value === 'urgent' ? COLORS.red : value === 'important' ? COLORS.amber : COLORS.blue;
    const sideColor = (value) => value === 'offense' ? COLORS.green : value === 'defense' ? COLORS.blue : COLORS.amber;

    // Header / cover-like block
    pdf.setFillColor(...COLORS.green);
    pdf.roundedRect(margin, y, contentWidth, 30, 4, 4, 'F');
    pdf.setFontSize(20);
    pdf.setTextColor(...COLORS.white);
    pdf.text(`Game Plan — ${match.opponent || 'Match'}`, margin + 5, y + 9);
    pdf.setFontSize(10);
    pdf.text(`${match.teams?.name || '—'} • ${formatDate(match.match_date)} • ${match.location || '—'}`, margin + 5, y + 17);
    pdf.text(`Compétition : ${match.competition_type || '—'}`, margin + 5, y + 23);
    const groupCount = (rows || []).length;
    const offenseCount = (rows || []).filter(r => (r.side || 'offense') === 'offense').length;
    const defenseCount = (rows || []).filter(r => r.side === 'defense').length;
    const stCount = (rows || []).filter(r => r.side === 'special_teams').length;
    pdf.setFontSize(8.8);
    pdf.text(`Tactiques: ${groupCount}  •  O: ${offenseCount}  •  D: ${defenseCount}  •  ST: ${stCount}`, margin + 5, y + 28);
    setText(COLORS.text);
    y += 38;

    // Notes boxes
    const addNoteCard = (title, value) => {
      ensureSpace(20);
      pdf.setFillColor(...COLORS.soft);
      pdf.setDrawColor(...COLORS.line);
      const noteLines = pdf.splitTextToSize(String(value || '—'), contentWidth - 8);
      const boxHeight = Math.max(18, 10 + (noteLines.length * 4.2) + 6);
      pdf.roundedRect(margin, y, contentWidth, boxHeight, 3, 3, 'FD');
      pdf.setFontSize(10.5);
      setText(COLORS.greenDark);
      pdf.text(title, margin + 4, y + 6);
      y += 10;
      writeWrapped(value || '—', margin + 4, contentWidth - 8, 9.5, 4.2, COLORS.text);
      y += 4;
    };

    addNoteCard('Notes générales', match.game_plan_notes);
    addNoteCard('Notes Offense', match.offense_plan_notes);
    addNoteCard('Notes Defense / ST', match.defense_plan_notes);

    const groups = { offense: [], defense: [], special_teams: [] };
    (rows || []).forEach(row => {
      const side = row.side || 'offense';
      if (!groups[side]) groups[side] = [];
      groups[side].push(row);
    });

    for (const [side, items] of Object.entries(groups)) {
      if (!items.length) continue;
      ensureSpace(16);
      pdf.setFillColor(...sideColor(side));
      pdf.roundedRect(margin, y, contentWidth, 10, 2.5, 2.5, 'F');
      pdf.setFontSize(12.5);
      pdf.setTextColor(...COLORS.white);
      pdf.text(sideTitle(side), margin + 4, y + 6.5);
      setText(COLORS.text);
      y += 14;

      for (const item of items) {
        const link = (links || []).find(l => String(l.tactic_id) === String(item.tactic_id));
        const diagram = diagrams.find(d => String(d.id) === String(link?.diagram_id));
        const image = diagram?.image_url ? await imageUrlToDataUrl(diagram.image_url) : null;
        const maxImgW = contentWidth * 0.5;
        const maxImgH = 48;
        let imgW = 0;
        let imgH = 0;
        if (image?.dataUrl) {
          imgW = maxImgW;
          imgH = maxImgH;
          if (image.width && image.height) {
            const ratio = image.width / image.height;
            imgW = maxImgW;
            imgH = imgW / ratio;
            if (imgH > maxImgH) {
              imgH = maxImgH;
              imgW = imgH * ratio;
            }
          }
        }
        const noteText = `Note tactique : ${item.notes || '—'}`;
        const noteLines = pdf.splitTextToSize(noteText, contentWidth - 8);
        const bodyHeight = 20 + (noteLines.length * 4.2);
        const cardHeight = bodyHeight + (image?.dataUrl ? imgH + 12 : 0) + 10;
        ensureSpace(cardHeight + 8);

        pdf.setFillColor(...COLORS.white);
        pdf.setDrawColor(...COLORS.line);
        const cardStartY = y;
        pdf.roundedRect(margin, cardStartY, contentWidth, cardHeight, 3, 3, 'FD');

        pdf.setFillColor(...COLORS.soft);
        pdf.roundedRect(margin + 1, cardStartY + 1, contentWidth - 2, 10, 2, 2, 'F');
        pdf.setFontSize(11.5);
        setText(COLORS.text);
        pdf.text(`${item.priority_order || 1}. ${item.tactics?.title || 'Tactique'}`, margin + 4, cardStartY + 7.2);

        const chipY = cardStartY + 16;
        y = chipY;
        drawChip(sectionLabel(item.plan_section), margin + 4, 28, COLORS.blue);
        drawChip(priorityLabel(item.importance), margin + 35, 24, priorityColor(item.importance));
        if (diagram?.title) drawChip(diagram.title, margin + 61, Math.min(58, contentWidth - 65), COLORS.green);

        y = cardStartY + 28;
        writeWrapped(`${item.tactics?.formation || '—'} • ${item.tactics?.category || '—'}`, margin + 4, contentWidth - 8, 9, 4.2, COLORS.muted);
        writeWrapped(noteText, margin + 4, contentWidth - 8, 9.5, 4.2, COLORS.text);

        if (image?.dataUrl) {
          const imgX = margin + ((contentWidth - imgW) / 2);
          const imgY = y + 3;
          pdf.setDrawColor(...COLORS.line);
          pdf.roundedRect(imgX - 1, imgY - 1, imgW + 2, imgH + 2, 1.5, 1.5);
          pdf.addImage(image.dataUrl, 'PNG', imgX, imgY, imgW, imgH, undefined, 'FAST');
          y = imgY + imgH + 6;
        }

        y = cardStartY + cardHeight + 5;
      }
    }
    // footer page numbers
    const totalPages = pdf.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      pdf.setPage(page);
      pdf.setDrawColor(...COLORS.line);
      pdf.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
      pdf.setFontSize(8.5);
      setText(COLORS.muted);
      pdf.text(`${match.teams?.name || 'Playbook'} • Game Plan`, margin, pageHeight - 5.5);
      const pageLabel = `Page ${page} / ${totalPages}`;
      pdf.text(pageLabel, pageWidth - margin - pdf.getTextWidth(pageLabel), pageHeight - 5.5);
    }

    const safeName = `game-plan-${String(match.opponent || 'match').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'match'}.pdf`;
    pdf.save(safeName);
  } catch (err) {
    console.error(err);
    showAlert(err.message || tt('match.pdf_failed', 'Impossible de générer le PDF.'), 'danger');
  } finally {
    if (button) {
      button.classList.remove('disabled');
      button.innerHTML = prev;
    }
  }
}
exportPdfLink?.addEventListener('click', (event) => {
  event.preventDefault();
  exportGamePlanPdf();
});

saveGamePlanBtn?.addEventListener('click', async () => {
  if (!canModifyGamePlan) return;
  const matchId = Number(new URLSearchParams(location.search).get('id'));
  if (!matchId) return;
  saveGamePlanBtn.disabled = true;
  const prev = saveGamePlanBtn.innerHTML;
  saveGamePlanBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${tt('common.saving','Enregistrement...')}`;
  try {
    await supabase.from('matches').update({ game_plan_notes: gamePlanNotesInput?.value || '', offense_plan_notes: offenseNotesInput?.value || '', defense_plan_notes: defenseNotesInput?.value || '' }).eq('id', matchId);
    const selects = [...document.querySelectorAll('.match-diagram-select')];
    for (const select of selects) {
      const tacticId = Number(select.dataset.tacticId);
      const diagramId = select.value ? Number(select.value) : null;
      const existing = currentMatchDiagramLinks.find(link => link.tactic_id === tacticId);
      const section = document.querySelector(`.match-plan-section[data-tactic-id="${tacticId}"]`)?.value || 'standard';
      const importance = document.querySelector(`.match-plan-importance[data-tactic-id="${tacticId}"]`)?.value || 'normal';
      const itemNotes = document.querySelector(`.match-plan-item-notes[data-tactic-id="${tacticId}"]`)?.value || '';
      const { error: tacticUpdateErr } = await supabase.from('match_tactics').update({ plan_section: section, importance, notes: itemNotes }).eq('match_id', matchId).eq('tactic_id', tacticId);
      if (tacticUpdateErr) throw tacticUpdateErr;
      if (diagramId) {
        const payload = { match_id: matchId, tactic_id: tacticId, diagram_id: diagramId, updated_at: new Date().toISOString() };
        if (existing?.id) {
          const { error } = await supabase.from('match_tactic_diagrams').update(payload).eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('match_tactic_diagrams').insert(payload);
          if (error) throw error;
        }
      } else if (existing?.id) {
        const { error } = await supabase.from('match_tactic_diagrams').delete().eq('id', existing.id);
        if (error) throw error;
      }
    }
    await loadMatchGamePlanSection();

    try {
      const { data: notifyMatchRow, error: notifyMatchErr } = await supabase
        .from('matches')
        .select('id,team_id,opponent')
        .eq('id', matchId)
        .single();
      if (notifyMatchErr) throw notifyMatchErr;

      await notifyTeamEvent({
        teamId: notifyMatchRow?.team_id,
        eventType: 'match',
        title: tt('match.gameplan_updated_title', 'Game plan mis à jour'),
        body: tt('match.gameplan_updated_body', 'Le game plan du match contre {opponent} a été mis à jour.')
          .replace('{opponent}', notifyMatchRow?.opponent || '—'),
        links: {
          player: 'my-matches.html',
          coach: `match-detail.html?id=${matchId}`
        }
      });
    } catch (notifyErr) {
      console.warn('Game plan notification failed:', notifyErr);
    }

    showAlert(tt('match.gameplan_saved', 'Game plan sauvegardé.'), 'success');
  } catch (err) {
    console.error(err);
    showAlert(err.message || tt('match.gameplan_save_failed', 'Impossible de sauvegarder le game plan.'), 'danger');
  } finally {
    saveGamePlanBtn.disabled = false;
    saveGamePlanBtn.innerHTML = prev;
  }
});

loadMatchGamePlanSection().catch(err => {
  console.error(err);
  if (gamePlanListHost) gamePlanListHost.innerHTML = `<div class="text-danger">${tt('match.gameplan_load_failed', 'Impossible de charger le game plan.')}</div>`;
});



function buildMatchDiagramPreviewMediaV943(diagram, videoUrl) {
  const orientation = gamePlanOrientationFromJsonV940(diagram);
  const mediaClass = orientation === 'vertical' ? 'card-img-top match-diagram-preview diagram-media-vertical' : 'card-img-top match-diagram-preview diagram-media-horizontal';
  const mediaStyle = orientation === 'vertical'
    ? 'aspect-ratio:9/16;object-fit:contain;background:#0f7c3d;'
    : 'aspect-ratio:16/9;object-fit:contain;background:#0f7c3d;';
  if (videoUrl) {
    return `<video src="${videoUrl}" class="${mediaClass}" style="${mediaStyle}" autoplay muted loop playsinline controls controlsList="nodownload noremoteplayback" disablePictureInPicture></video>`;
  }
  return `<img src="${diagram?.image_url || ''}" class="${mediaClass}" style="${mediaStyle}" alt="${escapeHtml(diagram?.title || tt('tactic.diagram','Diagramme'))}">`;
}

function updateGamePlanCardPreview(tacticId, diagramId) {
  const card = document.querySelector(`.match-gameplan-item[data-tactic-id="${tacticId}"]`);
  if (!card) return;
  const previewWrap = card.querySelector('.match-diagram-preview-wrap');
  const diagrams = currentMatchTacticDiagrams.filter(d => String(d.tactic_id) === String(tacticId));
  const selectedDiagram = diagrams.find(d => String(d.id) === String(diagramId)) || null;
  const videoUrl = getDiagramVideoUrl(selectedDiagram);
  const dateEl = card.querySelector('.match-diagram-date');
    if (videoUrl || selectedDiagram?.image_url) {
    previewWrap?.classList.remove('d-none');
    if (previewWrap) {
      previewWrap.innerHTML = buildMatchDiagramPreviewMediaV943(selectedDiagram, videoUrl);
    }
    try { applySavedOrientationMediaClassesMatchV942(card); } catch (e) { console.warn(e); }
    if (dateEl) dateEl.textContent = formatDiagramDate(selectedDiagram);
      } else {
    previewWrap?.classList.add('d-none');
    if (previewWrap) previewWrap.innerHTML = '';
    if (dateEl) dateEl.textContent = tt('tactic.no_date', 'Aucune date');
      }
}

gamePlanListHost?.addEventListener('change', event => {
  const select = event.target.closest('.match-diagram-select');
  if (!select) return;
  const tacticId = select.dataset.tacticId;
  updateGamePlanCardPreview(tacticId, select.value || '');
});


// ---- Shared Timeline Match Player (v9.1) ----
function escapeHtmlMatch(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildMatchTimeline(idPrefix) {
  return `
    <div class="detail-timeline mt-2" data-timeline-root="${idPrefix}">
      <div class="detail-timeline-row">
        <button id="${idPrefix}-play" class="btn btn-sm btn-primary" type="button">▶</button>
        <button id="${idPrefix}-pause" class="btn btn-sm btn-outline-secondary" type="button">⏸</button>
        <span id="${idPrefix}-time" class="detail-timeline-time">0.0s / 0.0s</span>
        <input id="${idPrefix}-slider" class="detail-timeline-slider" type="range" min="0" max="1000" value="0" step="0.01">
        <select id="${idPrefix}-speed" class="form-select form-select-sm detail-timeline-speed">
          <option value="0.5">0.5x</option>
          <option value="1" selected>1x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
      </div>
    </div>
  `;
}

function bindMatchVideoTimeline(idPrefix, videoEl) {
  if (!videoEl) return;
  const playBtn = document.getElementById(`${idPrefix}-play`);
  const pauseBtn = document.getElementById(`${idPrefix}-pause`);
  const slider = document.getElementById(`${idPrefix}-slider`);
  const speed = document.getElementById(`${idPrefix}-speed`);
  const time = document.getElementById(`${idPrefix}-time`);

  const updateUi = () => {
    const duration = Number(videoEl.duration || 0);
    const current = Number(videoEl.currentTime || 0);
    if (time) time.textContent = `${current.toFixed(1)}s / ${duration.toFixed(1)}s`;
    if (slider) {
      slider.max = String(duration || 1000);
      slider.value = String(current);
    }
  };

  if (playBtn && !playBtn.dataset.bound) {
    playBtn.dataset.bound = '1';
    playBtn.onclick = () => videoEl.play().catch(() => {});
  }
  if (pauseBtn && !pauseBtn.dataset.bound) {
    pauseBtn.dataset.bound = '1';
    pauseBtn.onclick = () => videoEl.pause();
  }
  if (slider && !slider.dataset.bound) {
    slider.dataset.bound = '1';
    slider.oninput = (e) => {
      videoEl.currentTime = Number(e.target.value || 0);
      updateUi();
    };
  }
  if (speed && !speed.dataset.bound) {
    speed.dataset.bound = '1';
    speed.onchange = (e) => {
      videoEl.playbackRate = parseFloat(e.target.value) || 1;
    };
  }

  videoEl.addEventListener('loadedmetadata', updateUi);
  videoEl.addEventListener('timeupdate', updateUi);
  updateUi();
}

function activateMatchVideoTimelines(scope = document) {
  scope.querySelectorAll('video[id^="match-gp-"][id$="-video"]').forEach((videoEl) => {
    const idPrefix = videoEl.id.replace(/-video$/, '');
    bindMatchVideoTimeline(idPrefix, videoEl);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  try { activateMatchVideoTimelines();
  try { applySavedOrientationMediaClassesMatchV942(document); } catch (e) { console.warn(e); }
  try { applySavedOrientationMediaClassesMatchV941(document); } catch (e) { console.warn(e); } } catch (e) { console.warn(e); }
});


// gamePlanOrientationFromJsonV940
function gamePlanOrientationFromJsonV940(diagram) {
  try {
    const parsed = typeof diagram?.diagram_json === 'string' ? JSON.parse(diagram.diagram_json) : diagram?.diagram_json;
    return parsed?.board?.boardOrientation || parsed?.animation?.boardOrientation || 'horizontal';
  } catch (e) {
    return 'horizontal';
  }
}


// applySavedOrientationMediaClassesMatchV941
function applySavedOrientationMediaClassesMatchV941(scope = document) {
  try {
    scope.querySelectorAll('.diagram-media-vertical').forEach((el) => {
      const card = el.closest('.card, .gameplan-card, .match-gameplan-card');
      if (card) card.classList.add('diagram-card-vertical');
    });
    scope.querySelectorAll('.diagram-media-horizontal').forEach((el) => {
      const card = el.closest('.card, .gameplan-card, .match-gameplan-card');
      if (card) card.classList.add('diagram-card-horizontal');
    });
  } catch (e) {
    console.warn(e);
  }
}
document.addEventListener('DOMContentLoaded', () => {
  try { applySavedOrientationMediaClassesMatchV941(document); } catch (e) { console.warn(e); }
});


// applySavedOrientationMediaClassesMatchV942
function applySavedOrientationMediaClassesMatchV942(scope = document) {
  try {
    const cards = scope.querySelectorAll('.card, .gameplan-card, .match-gameplan-card');
    cards.forEach((card) => {
      const verticalMedia = card.querySelector('.diagram-media-vertical');
      const horizontalMedia = card.querySelector('.diagram-media-horizontal');
      card.classList.remove('diagram-card-vertical', 'diagram-card-horizontal');
      if (verticalMedia) {
        card.classList.add('diagram-card-vertical');
      } else if (horizontalMedia) {
        card.classList.add('diagram-card-horizontal');
      }
    });
  } catch (e) {
    console.warn(e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  try { applySavedOrientationMediaClassesMatchV942(document); } catch (e) { console.warn(e); }
});


document.addEventListener('app:language-changed', () => {
  try {
    if (typeof loadMatchDetails === 'function') {
      loadMatchDetails().catch(console.error);
    } else {
      location.reload();
    }
  } catch (e) {
    console.warn(e);
  }
});
