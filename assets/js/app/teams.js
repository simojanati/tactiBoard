import { activateMenu, bindFormSubmit, formatDate, setAppTitle, showAlert, supabase, escapeHtml, initCrudPanel, uploadTeamLogo, uploadTeamRolesPdf, teamLogoHtml } from './common.js';
import { recalcLatePenaltyForPlayer } from './discipline.js';
import { canAdmin, canEdit, getUserContext } from './auth.js';
setAppTitle('Équipes');
activateMenu('teams');
const tbody = document.getElementById('entity-table');
const form = document.getElementById('entity-form');
const idInput = document.getElementById('entity-id');
const submitLabel = document.getElementById('submit-label');
const logoPreview = document.getElementById('team-logo-preview');
const rolesCurrent = document.getElementById('team-roles-current');
const panel = initCrudPanel({ addTitle: 'Ajouter une équipe', editTitle: 'Modifier équipe' });
const ctx = await getUserContext();
const isAdmin = canAdmin(ctx.role);
async function loadRows() {
  tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Chargement...</td></tr>`;
  try {
    const { data, error } = await supabase.from('teams').select('id,name,category,season,created_at,logo_url,roles_pdf_url,roles_pdf_filename,default_player_points,practice_presence_points,practice_absence_penalty,late_penalty_threshold_minutes,late_penalty_points').order('id', { ascending: false });
    if (error) throw error;
    if (!data?.length) { tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Aucune donnée.</td></tr>`; return; }
    tbody.innerHTML = data.map(row => `<tr><td><div class="team-title-wrap">${teamLogoHtml(row)}<div><strong>${escapeHtml(row.name || '')}</strong></div></div></td><td>${escapeHtml(row.category || '')}</td><td>${escapeHtml(row.season || '')}</td><td>${formatDate(row.created_at)}</td><td class="text-end actions-cell">${isAdmin ? `<button class="btn btn-sm btn-outline-primary edit-btn" data-id="${row.id}">Modifier</button><button class="btn btn-sm btn-outline-danger delete-btn" data-id="${row.id}" data-label="${escapeHtml(row.name || '')}">Supprimer</button>` : '<span class="text-muted">Lecture seule</span>'}</td></tr>`).join('');
  } catch (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty text-danger">Erreur de chargement des équipes.</td></tr>`;
    showAlert(error.message || 'Erreur de chargement des équipes.', 'danger');
  }
}
function updateTheoryPreviews() {
  const practicePresence = Number(form?.practice_presence_points?.value || 0);
  const practiceAbsence = Number(form?.practice_absence_penalty?.value || 0);
  const presencePreview = document.getElementById('theory-presence-preview');
  const absencePreview = document.getElementById('theory-absence-preview');
  if (presencePreview) presencePreview.value = Number.isFinite(practicePresence) ? practicePresence / 2 : '';
  if (absencePreview) absencePreview.value = Number.isFinite(practiceAbsence) ? practiceAbsence / 2 : '';
}

function validateEvenPoints(value, label) {
  const num = Number(value);
  if (!Number.isInteger(num)) throw new Error(`${label} doit être un nombre entier.`);
  if (num % 2 !== 0) throw new Error(`${label} doit être un nombre pair, car la théorie vaut 50% de la pratique.`);
  if (num < 0) throw new Error(`${label} doit être positif.`);
  return num;
}

function validateWholePositive(value, label) {
  const num = Number(value);
  if (!Number.isInteger(num)) throw new Error(`${label} doit être un nombre entier.`);
  if (num < 0) throw new Error(`${label} doit être positif.`);
  return num;
}

function fillForm(row){ form.name.value=row.name||''; form.category.value=row.category||''; form.season.value=row.season||''; form.default_player_points.value=row.default_player_points ?? 20; form.practice_presence_points.value=row.practice_presence_points ?? 2; form.practice_absence_penalty.value=row.practice_absence_penalty ?? 2; form.late_penalty_threshold_minutes.value = row.late_penalty_threshold_minutes ?? 0; form.late_penalty_points.value = row.late_penalty_points ?? 0; updateTheoryPreviews(); idInput.value=row.id; if (logoPreview) logoPreview.src = row.logo_url || '../assets/img/branding/team-logo-placeholder.png'; if (rolesCurrent) rolesCurrent.innerHTML = row.roles_pdf_url ? `<a href="${row.roles_pdf_url}" download="${escapeHtml(row.roles_pdf_filename || 'roles.pdf')}">${escapeHtml(row.roles_pdf_filename || 'roles.pdf')}</a>` : 'Aucun fichier'; submitLabel.textContent='Mettre à jour'; panel.open(true); }
async function getRow(id){ const { data, error } = await supabase.from('teams').select('*').eq('id', id).single(); if (error) throw error; return data; }
async function removeRow(id){ const { error } = await supabase.from('teams').delete().eq('id', id); if (error) throw error; }
await loadRows();
document.getElementById('refresh-btn').addEventListener('click', loadRows);
tbody.addEventListener('click', async e => { const editBtn = e.target.closest('.edit-btn'); const deleteBtn = e.target.closest('.delete-btn'); if (editBtn) fillForm(await getRow(editBtn.dataset.id)); if (deleteBtn) { if (!confirm(`Supprimer ${deleteBtn.dataset.label} ?`)) return; await removeRow(deleteBtn.dataset.id); showAlert('Équipe supprimée avec succès.'); await loadRows(); } });
if (isAdmin) bindFormSubmit('entity-form', async fd => {
  const logoFile = fd.get('logo_file');
  const rolesPdfFile = fd.get('roles_pdf_file');
  fd.delete('logo_file');
  fd.delete('roles_pdf_file');
  const payload = Object.fromEntries(fd.entries());
  const id = payload.id; delete payload.id;
  payload.default_player_points = payload.default_player_points === '' ? 0 : Number(payload.default_player_points || 0);
  payload.practice_presence_points = validateEvenPoints(payload.practice_presence_points, 'Présence pratique');
  payload.practice_absence_penalty = validateEvenPoints(payload.practice_absence_penalty, 'Absence non excusée pratique');
  payload.late_penalty_threshold_minutes = validateWholePositive(payload.late_penalty_threshold_minutes || 0, 'Seuil retard cumulé');
  payload.late_penalty_points = validateWholePositive(payload.late_penalty_points || 0, 'Pénalité retard cumulée');
  Object.keys(payload).forEach(k => payload[k] === '' && delete payload[k]);
  let teamId = id;
  if (id) {
    const { data: updatedRow, error } = await supabase.from('teams').update(payload).eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!updatedRow?.id) throw new Error('Mise à jour équipe refusée ou introuvable.');
  } else {
    const { data, error } = await supabase.from('teams').insert(payload).select('id').single();
    if (error) throw error;
    teamId = data.id;
  }
  if (logoFile && logoFile.size) {
    const logoUrl = await uploadTeamLogo(logoFile, teamId);
    const { data: logoRow, error: logoErr } = await supabase.from('teams').update({ logo_url: logoUrl }).eq('id', teamId).select('id').maybeSingle();
    if (logoErr) throw logoErr;
    if (!logoRow?.id) throw new Error('Mise à jour du logo refusée ou introuvable.');
  }
  if (rolesPdfFile && rolesPdfFile.size) {
    const fileMeta = await uploadTeamRolesPdf(rolesPdfFile, teamId);
    const { data: rolesRow, error: rolesErr } = await supabase.from('teams').update({
      roles_pdf_url: fileMeta.url,
      roles_pdf_path: fileMeta.path,
      roles_pdf_filename: fileMeta.filename,
      roles_updated_at: new Date().toISOString()
    }).eq('id', teamId).select('id').maybeSingle();
    if (rolesErr) throw rolesErr;
    if (!rolesRow?.id) throw new Error('Mise à jour du PDF des rôles refusée ou introuvable.');
  }

  const { data: teamPlayers, error: teamPlayersError } = await supabase
    .from('players')
    .select('id,team_id,current_points,late_adjusted_minutes,late_penalty_applied')
    .eq('team_id', teamId);
  if (teamPlayersError) throw teamPlayersError;
  const lateConfig = {
    late_penalty_threshold_minutes: payload.late_penalty_threshold_minutes,
    late_penalty_points: payload.late_penalty_points
  };
  for (const player of (teamPlayers || [])) {
    await recalcLatePenaltyForPlayer(player.id, { actorId: ctx.user?.id || null, playerRow: player, teamConfig: lateConfig, reason: 'Recalcul pénalité retard · configuration équipe' });
  }
  form.reset(); idInput.value=''; submitLabel.textContent='Enregistrer';
  if (form.default_player_points) form.default_player_points.value = 20;
  if (form.practice_presence_points) form.practice_presence_points.value = 2;
  if (form.practice_absence_penalty) form.practice_absence_penalty.value = 2;
  if (form.late_penalty_threshold_minutes) form.late_penalty_threshold_minutes.value = 0;
  if (form.late_penalty_points) form.late_penalty_points.value = 0;
  updateTheoryPreviews();
  if (logoPreview) logoPreview.src = '../assets/img/branding/team-logo-placeholder.png';
  if (rolesCurrent) rolesCurrent.textContent = 'Aucun fichier';
  panel.close(true); showAlert(id ? 'Équipe mise à jour avec succès.' : 'Équipe enregistrée avec succès.'); await loadRows(); });

if (!isAdmin) { panel.close(false); }

form?.logo_file?.addEventListener('change', e => { const file = e.target.files?.[0]; if (!logoPreview) return; if (file) { const reader = new FileReader(); reader.onload = () => logoPreview.src = reader.result; reader.readAsDataURL(file); } else { logoPreview.src = '../assets/img/branding/team-logo-placeholder.png'; } });


['practice_presence_points','practice_absence_penalty'].forEach(name => {
  form?.elements?.[name]?.addEventListener('input', updateTheoryPreviews);
});
updateTheoryPreviews();
