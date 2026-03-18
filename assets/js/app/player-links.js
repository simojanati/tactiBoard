import { activateMenu, escapeHtml, setAppTitle, showAlert, supabase } from './common.js';
import { canAdmin, getUserContext } from './auth.js';
const tt = (key, fallback = '') => (window.t ? window.t(key, fallback) : fallback || key);

setAppTitle(tt('page.player_links', 'Liaison comptes'));
activateMenu('player-links');

const playerTbody = document.getElementById('entity-table');
const coachTbody = document.getElementById('coach-table');
const refreshBtn = document.getElementById('refresh-btn');
const unlinkedProfilesBox = document.getElementById('unlinked-profiles');
const unlinkedPlayersBox = document.getElementById('unlinked-players');
const unlinkedCoachProfilesBox = document.getElementById('unlinked-coach-profiles');
const unlinkedCoachesBox = document.getElementById('unlinked-coaches');

const ctx = await getUserContext();
if (!canAdmin(ctx.role)) {
  playerTbody.innerHTML = `<tr><td colspan="20" class="table-empty">${tt('player_links.admin_required', 'Accès administrateur requis.')}</td></tr>`;
  throw new Error(tt('player_links.access_denied', 'Accès refusé'));
}

let playerProfiles = [];
let coachProfiles = [];
let players = [];
let coaches = [];

function linkedProfileLabel(profile, profileId) {
  if (profile) return `<div class="fw-semibold">${escapeHtml(profile.full_name || profile.email || tt('player_links.account', 'Compte'))}</div>${profile.email ? `<small class="text-muted d-block">${escapeHtml(profile.email)}</small>` : ''}<small class="text-muted">ID: ${escapeHtml(profile.id || '')}</small>`;
  if (profileId) return `<span class="badge bg-label-success">Lié</span><small class="text-muted d-block mt-1">ID: ${escapeHtml(profileId)}</small>`;
  return `<span class="badge bg-label-warning">${tt('player_links.unlinked', 'Non lié')}</span>`;
}

function renderListSummary(host, items, emptyMessage) {
  host.innerHTML = items.length
    ? `<ul class="mb-0 ps-3">${items.join('')}</ul>`
    : `<span class="text-success">${emptyMessage}</span>`;
}

function renderSummary() {
  const usedPlayerProfileIds = new Set(players.map(player => player.profile_id).filter(Boolean).map(String));
  const unlinkedPlayerProfiles = playerProfiles.filter(profile => !usedPlayerProfileIds.has(String(profile.id)));
  const unlinkedPlayers = players.filter(player => !player.profile_id);
  renderListSummary(unlinkedProfilesBox, unlinkedPlayerProfiles.map(p => `<li><strong>${escapeHtml(p.full_name || p.email || 'Compte')}</strong>${p.email ? `<span class="text-muted"> — ${escapeHtml(p.email)}</span>` : ''}<span class="text-muted"> — ID: ${escapeHtml(p.id || '')}</span></li>`), tt('player_links.all_player_profiles_linked', 'Tous les profils joueuses sont liés.'));
  renderListSummary(unlinkedPlayersBox, unlinkedPlayers.map(p => `<li><strong>${escapeHtml(p.full_name || '')}</strong>${p.teams?.name ? `<span class="text-muted"> — ${escapeHtml(p.teams.name)}</span>` : ''}</li>`), tt('player_links.all_players_linked', 'Toutes les joueuses ont un compte lié.'));

  const usedCoachProfileIds = new Set(coaches.map(coach => coach.profile_id).filter(Boolean).map(String));
  const unlinkedCoachProfiles = coachProfiles.filter(profile => !usedCoachProfileIds.has(String(profile.id)));
  const unlinkedCoaches = coaches.filter(coach => !coach.profile_id);
  renderListSummary(unlinkedCoachProfilesBox, unlinkedCoachProfiles.map(c => `<li><strong>${escapeHtml(c.full_name || c.email || 'Compte')}</strong>${c.email ? `<span class="text-muted"> — ${escapeHtml(c.email)}</span>` : ''}<span class="text-muted"> — ID: ${escapeHtml(c.id || '')}</span></li>`), tt('player_links.all_coach_profiles_linked', 'Tous les profils coachs sont liés.'));
  renderListSummary(unlinkedCoachesBox, unlinkedCoaches.map(c => `<li><strong>${escapeHtml(c.full_name || '')}</strong>${c.teams?.name ? `<span class="text-muted"> — ${escapeHtml(c.teams.name)}</span>` : ''}</li>`), tt('player_links.all_coaches_linked', 'Tous les coachs ont un compte lié.'));
}

function profileOptions(profiles, collection, currentItemId, selectedProfileId) {
  const opts = ['<option value="">Aucun compte lié</option>'];
  for (const profile of profiles) {
    const alreadyUsed = collection.some(item => String(item.profile_id) === String(profile.id) && String(item.id) !== String(currentItemId));
    const selected = String(profile.id) === String(selectedProfileId) ? 'selected' : '';
    opts.push(`<option value="${profile.id}" ${selected} ${alreadyUsed ? 'disabled' : ''}>${escapeHtml(profile.full_name || profile.email || profile.id)}${profile.email ? ` — ${escapeHtml(profile.email)}` : ''}${alreadyUsed ? ' (déjà lié)' : ''}</option>`);
  }
  return opts.join('');
}

function renderPlayersTable() {
  if (!players.length) {
    playerTbody.innerHTML = '<tr><td colspan="20" class="table-empty">Aucune joueuse.</td></tr>';
    return;
  }
  playerTbody.innerHTML = players.map(player => `
    <tr>
      <td><div class="fw-semibold">${escapeHtml(player.full_name || '')}</div><small class="text-muted">#${escapeHtml(player.jersey_number ?? '—')}</small></td>
      <td>${escapeHtml(player.teams?.name || '—')}</td>
      <td>${escapeHtml(player.primary_position || '—')}</td>
      <td>${linkedProfileLabel(player.profiles, player.profile_id)}</td>
      <td><select class="form-select form-select-sm link-select-player" data-player-id="${player.id}">${profileOptions(playerProfiles, players, player.id, player.profile_id)}</select></td>
      <td class="text-end actions-cell"><button class="btn btn-sm btn-primary save-player-link-btn" data-player-id="${player.id}">Enregistrer</button> <button class="btn btn-sm btn-outline-secondary clear-player-link-btn" data-player-id="${player.id}">Délier</button></td>
    </tr>`).join('');
}

function renderCoachesTable() {
  if (!coaches.length) {
    coachTbody.innerHTML = '<tr><td colspan="20" class="table-empty">Aucun coach.</td></tr>';
    return;
  }
  coachTbody.innerHTML = coaches.map(coach => `
    <tr>
      <td><div class="fw-semibold">${escapeHtml(coach.full_name || '')}</div><small class="text-muted">${escapeHtml(coach.email || '')}</small></td>
      <td>${escapeHtml(coach.teams?.name || '—')}</td>
      <td>${escapeHtml(coach.role || '—')}</td>
      <td>${linkedProfileLabel(coach.profiles, coach.profile_id)}</td>
      <td><select class="form-select form-select-sm link-select-coach" data-coach-id="${coach.id}">${profileOptions(coachProfiles, coaches, coach.id, coach.profile_id)}</select></td>
      <td class="text-end actions-cell"><button class="btn btn-sm btn-primary save-coach-link-btn" data-coach-id="${coach.id}">Enregistrer</button> <button class="btn btn-sm btn-outline-secondary clear-coach-link-btn" data-coach-id="${coach.id}">Délier</button></td>
    </tr>`).join('');
}

async function loadData() {
  playerTbody.innerHTML = '<tr><td colspan="20" class="table-empty">Chargement...</td></tr>';
  coachTbody.innerHTML = '<tr><td colspan="20" class="table-empty">Chargement...</td></tr>';
  const [playerProfilesRes, coachProfilesRes, playersRes, coachesRes] = await Promise.all([
    supabase.from('profiles').select('id,full_name,email,role').eq('role', 'player').order('full_name'),
    supabase.from('profiles').select('id,full_name,email,role').eq('role', 'coach').order('full_name'),
    supabase.from('players').select('id,full_name,jersey_number,primary_position,profile_id,teams(name),profiles(id,full_name,email)').order('id', { ascending: false }),
    supabase.from('coaches').select('id,full_name,email,role,profile_id,teams(name),profiles(id,full_name,email)').order('id', { ascending: false })
  ]);

  if (playerProfilesRes.error) throw playerProfilesRes.error;
  if (coachProfilesRes.error) throw coachProfilesRes.error;
  if (playersRes.error) throw playersRes.error;
  if (coachesRes.error) throw coachesRes.error;

  playerProfiles = playerProfilesRes.data || [];
  coachProfiles = coachProfilesRes.data || [];
  players = playersRes.data || [];
  coaches = coachesRes.data || [];

  renderSummary();
  renderPlayersTable();
  renderCoachesTable();
}

async function saveLink(table, rowId, profileId) {
  const { error } = await supabase.from(table).update({ profile_id: profileId || null }).eq('id', rowId);
  if (error) throw error;
}

playerTbody.addEventListener('click', async e => {
  const saveBtn = e.target.closest('.save-player-link-btn');
  const clearBtn = e.target.closest('.clear-player-link-btn');
  if (saveBtn) {
    const select = playerTbody.querySelector(`.link-select-player[data-player-id="${saveBtn.dataset.playerId}"]`);
    try {
      await saveLink('players', saveBtn.dataset.playerId, select?.value || null);
      showAlert('Liaison joueuse enregistrée avec succès.');
      await loadData();
    } catch (err) {
      console.error(err);
      showAlert(err.message || 'Impossible d’enregistrer la liaison joueuse.', 'danger');
    }
  }
  if (clearBtn) {
    try {
      await saveLink('players', clearBtn.dataset.playerId, null);
      showAlert('Liaison joueuse supprimée avec succès.');
      await loadData();
    } catch (err) {
      console.error(err);
      showAlert(err.message || 'Impossible de supprimer la liaison joueuse.', 'danger');
    }
  }
});

coachTbody.addEventListener('click', async e => {
  const saveBtn = e.target.closest('.save-coach-link-btn');
  const clearBtn = e.target.closest('.clear-coach-link-btn');
  if (saveBtn) {
    const select = coachTbody.querySelector(`.link-select-coach[data-coach-id="${saveBtn.dataset.coachId}"]`);
    try {
      await saveLink('coaches', saveBtn.dataset.coachId, select?.value || null);
      showAlert('Liaison coach enregistrée avec succès.');
      await loadData();
    } catch (err) {
      console.error(err);
      showAlert(err.message || 'Impossible d’enregistrer la liaison coach.', 'danger');
    }
  }
  if (clearBtn) {
    try {
      await saveLink('coaches', clearBtn.dataset.coachId, null);
      showAlert('Liaison coach supprimée avec succès.');
      await loadData();
    } catch (err) {
      console.error(err);
      showAlert(err.message || 'Impossible de supprimer la liaison coach.', 'danger');
    }
  }
});

refreshBtn?.addEventListener('click', loadData);
await loadData();


document.addEventListener('app:language-changed', () => {
  try { loadAll().catch(console.error); } catch (e) { console.warn(e); }
});
