
import { activateMenu, bindFormSubmit, fetchTeamsOptions, fetchTacticsOptions, formatDate, setAppTitle, showAlert, supabase, escapeHtml, initCrudPanel, teamLogoHtml } from './common.js';
import { canEdit, getUserContext } from './auth.js';
import { notifyTeamEvent } from './notification-helpers.js';

setAppTitle('Matchs');
activateMenu('matches');

const tbody = document.getElementById('entity-table');
const teamSelect = document.getElementById('team-select');
const tacticsSelect = document.getElementById('match-tactics-select');
const form = document.getElementById('entity-form');
const idInput = document.getElementById('entity-id');
const submitLabel = document.getElementById('submit-label');
const panel = initCrudPanel({ addTitle:'Ajouter un match', editTitle:'Modifier match' });
const ctx = await getUserContext();
const isEditor = canEdit(ctx.role);

let tacticsCache = [];

try {
  await fetchTeamsOptions(teamSelect);
  if (tacticsSelect) tacticsCache = await fetchTacticsOptions(tacticsSelect);
} catch {
  showAlert('Impossible de charger les équipes ou tactiques de base.', 'warning');
}

teamSelect?.addEventListener('change', async () => {
  if (!tacticsSelect) return;
  tacticsCache = await fetchTacticsOptions(tacticsSelect, { teamId: teamSelect.value || '' });
});

function summarizeGamePlan(links = []) {
  const totals = { offense: 0, defense: 0, special_teams: 0 };
  links.forEach(link => {
    const side = link.side || 'offense';
    if (Object.prototype.hasOwnProperty.call(totals, side)) totals[side] += 1;
  });
  const chips = [];
  if (totals.offense) chips.push(`<span class="tag-chip">Offense ${totals.offense}</span>`);
  if (totals.defense) chips.push(`<span class="tag-chip">Defense ${totals.defense}</span>`);
  if (totals.special_teams) chips.push(`<span class="tag-chip">ST ${totals.special_teams}</span>`);
  return chips.length ? `<div class="tag-list">${chips.join('')}</div>` : '<span class="text-muted">Aucune</span>';
}

async function loadRows() {
  tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Chargement...</td></tr>`;
  const [{ data, error }, { data: links, error: linksError }] = await Promise.all([
    supabase.from('matches').select('id,team_id,teams(name,logo_url),opponent,match_date,location,competition_type,notes').order('id',{ascending:false}),
    supabase.from('match_tactics').select('match_id,side,priority_order,tactics(title)')
  ]);
  if (error) throw error;
  if (linksError) throw linksError;

  const byMatch = new Map();
  (links || []).forEach(link => {
    const current = byMatch.get(link.match_id) || [];
    current.push(link);
    byMatch.set(link.match_id, current);
  });

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Aucune donnée.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(row => {
    const linked = byMatch.get(row.id) || [];
    return `<tr>
      <td><strong>${escapeHtml(row.opponent || '')}</strong></td>
      <td><div class="team-title-wrap">${teamLogoHtml(row.teams)}<span>${escapeHtml(row.teams?.name || '—')}</span></div></td>
      <td>${formatDate(row.match_date)}</td>
      <td>${escapeHtml(row.location || '')}</td>
      <td>${escapeHtml(row.competition_type || '')}</td>
      <td>${summarizeGamePlan(linked)}</td>
      <td class="text-end actions-cell">
        <a class="btn btn-sm btn-outline-secondary" href="match-detail.html?id=${row.id}">Détail</a>
        ${isEditor ? `<button class="btn btn-sm btn-outline-primary edit-btn" data-id="${row.id}">Modifier</button>
        <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${row.id}" data-label="${escapeHtml(row.opponent || '')}">Supprimer</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

async function getRow(id) {
  const { data, error } = await supabase.from('matches').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function fillForm(row) {
  form.team_id.value = row.team_id ?? '';
  form.opponent.value = row.opponent || '';
  form.match_date.value = row.match_date || '';
  form.location.value = row.location || '';
  form.competition_type.value = row.competition_type || '';
  form.notes.value = row.notes || '';
  idInput.value = row.id;
  const { data: links, error } = await supabase.from('match_tactics').select('tactic_id').eq('match_id', row.id).order('priority_order');
  if (error) throw error;
  if (tacticsSelect) {
    tacticsCache = await fetchTacticsOptions(tacticsSelect, { teamId: row.team_id || '', selectedIds: (links || []).map(x => x.tactic_id) });
  }
  submitLabel.textContent = 'Mettre à jour';
  panel.open(true);
}

async function replaceMatchTactics(matchId, tacticIds) {
  const { error: deleteError } = await supabase.from('match_tactics').delete().eq('match_id', matchId);
  if (deleteError) throw deleteError;
  if (!tacticIds.length) return;
  const tacticMap = new Map(tacticsCache.map(item => [String(item.id), item]));
  const rows = tacticIds.map((tacticId, index) => {
    const tactic = tacticMap.get(String(tacticId));
    return {
      match_id: matchId,
      tactic_id: tacticId,
      side: tactic?.phase || 'offense',
      priority_order: index + 1
    };
  });
  const { error } = await supabase.from('match_tactics').insert(rows);
  if (error) throw error;
}

async function removeRow(id) {
  const { error } = await supabase.from('matches').delete().eq('id', id);
  if (error) throw error;
}

await loadRows();
document.getElementById('refresh-btn').addEventListener('click', loadRows);

tbody.addEventListener('click', async e => {
  const editBtn = e.target.closest('.edit-btn');
  const deleteBtn = e.target.closest('.delete-btn');
  if (editBtn && isEditor) {
    await fillForm(await getRow(editBtn.dataset.id));
  }
  if (deleteBtn && isEditor) {
    if (!confirm(`Supprimer ${deleteBtn.dataset.label} ?`)) return;
    await removeRow(deleteBtn.dataset.id);
    showAlert('Match supprimé avec succès.');
    await loadRows();
  }
});

if (isEditor) bindFormSubmit('entity-form', async fd => {
  const payload = Object.fromEntries(fd.entries());
  const id = payload.id;
  delete payload.id;
  const tacticIds = tacticsSelect ? [...tacticsSelect.selectedOptions].map(opt => Number(opt.value)) : [];
  Object.keys(payload).forEach(k => payload[k] === '' && delete payload[k]);
  const isUpdate = Boolean(id);
  let matchId = id;
  if (id) {
    const { error } = await supabase.from('matches').update(payload).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('matches').insert(payload).select('id').single();
    if (error) throw error;
    matchId = data.id;
  }
  await replaceMatchTactics(matchId, tacticIds);
  form.reset();
  idInput.value = '';
  submitLabel.textContent = 'Enregistrer';
  panel.close(true);
  await fetchTeamsOptions(teamSelect);
  if (tacticsSelect) tacticsCache = await fetchTacticsOptions(tacticsSelect);
  showAlert(id ? 'Match mis à jour avec succès.' : 'Match enregistré avec succès.');
  await notifyTeamEvent({
    teamId: payload.team_id,
    eventType: 'match',
    title: isUpdate ? 'Match mis à jour' : 'Nouveau match programmé',
    body: isUpdate
      ? `Le match contre ${payload.opponent} a été mis à jour.`
      : `Un match contre ${payload.opponent} est prévu le ${payload.match_date || 'prochainement'}.`,
    links: {
      player: 'my-matches.html',
      coach: `match-detail.html?id=${matchId}`
    }
  });
  await loadRows();
});

if (!isEditor) { panel.close(false); }
