import { activateMenu, bindFormSubmit, fetchTeamsOptions, setAppTitle, showAlert, supabase, escapeHtml, initCrudPanel, personAvatarUrl, uploadAvatar, syncLinkedAvatar } from './common.js';
import { canEdit, getUserContext } from './auth.js';

setAppTitle('Joueuses');
activateMenu('players');
const tbody = document.getElementById('entity-table');
const teamSelect = document.getElementById('team-select');
const form = document.getElementById('entity-form');
const idInput = document.getElementById('entity-id');
const submitLabel = document.getElementById('submit-label');
const imagePreview = document.getElementById('entity-image-preview');
const imageFileInput = document.getElementById('entity-image-file');
const imageUrlInput = document.getElementById('entity-image-url');
const panel = initCrudPanel({ addTitle: 'Ajouter une joueuse', editTitle: 'Modifier joueuse' });
const ctx = await getUserContext();
const isEditor = canEdit(ctx.role);
let editingProfileId = null;
let currentImageUrl = '';

function updateImagePreview(url = '') {
  currentImageUrl = url || '';
  if (imagePreview) imagePreview.src = currentImageUrl || '../assets/img/branding/avatar-placeholder.png';
  if (imageUrlInput && document.activeElement !== imageUrlInput) imageUrlInput.value = currentImageUrl;
}

imageUrlInput?.addEventListener('input', () => updateImagePreview(imageUrlInput.value.trim()));
imageFileInput?.addEventListener('change', () => {
  const file = imageFileInput.files?.[0];
  if (!file) return updateImagePreview(imageUrlInput?.value.trim() || currentImageUrl);
  const objectUrl = URL.createObjectURL(file);
  updateImagePreview(objectUrl);
});

try {
  await fetchTeamsOptions(teamSelect);
} catch {
  showAlert('Impossible de charger les équipes. Ajoute au moins une équipe.', 'warning');
}

async function loadRows() {
  tbody.innerHTML = `<tr><td colspan="11" class="table-empty">Chargement...</td></tr>`;
  const { data, error } = await supabase
    .from('players')
    .select('id,team_id,profile_id,image_url,teams(name),full_name,jersey_number,primary_position,secondary_position,status,captain_role,age,height_cm,weight_kg')
    .order('id', { ascending: false });
  if (error) throw error;
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="table-empty">Aucune donnée.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(row => `
    <tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          <img src="${personAvatarUrl(row)}" alt="${escapeHtml(row.full_name || '')}" class="player-avatar-sm">
          <span>${escapeHtml(row.full_name || '')}</span>
        </div>
      </td>
      <td>${escapeHtml(row.teams?.name || '—')}</td>
      <td>${escapeHtml(row.jersey_number ?? '')}</td>
      <td>${formatCaptainRole(row.captain_role)}</td>
      <td>${escapeHtml(row.age ?? '')}</td>
      <td>${formatMeasure(row.height_cm, 'cm')}</td>
      <td>${formatMeasure(row.weight_kg, 'kg')}</td>
      <td>${escapeHtml(row.primary_position || '')}</td>
      <td>${escapeHtml(row.status || '')}</td>
      <td>${row.profile_id ? `<span class="badge bg-label-success">Lié</span><div class="small text-muted mt-1">ID: ${escapeHtml(row.profile_id || '')}</div>` : '<span class="badge bg-label-warning">Non lié</span>'}</td>
      <td class="text-end actions-cell">${isEditor ? `<button class="btn btn-sm btn-outline-primary edit-btn" data-id="${row.id}">Modifier</button><button class="btn btn-sm btn-outline-danger delete-btn" data-id="${row.id}" data-label="${escapeHtml(row.full_name || '')}">Supprimer</button>` : '<span class="text-muted">Lecture seule</span>'}</td>
    </tr>`).join('');
}

function fillForm(row) {
  form.team_id.value = row.team_id ?? '';
  form.full_name.value = row.full_name || '';
  form.jersey_number.value = row.jersey_number ?? '';
  form.primary_position.value = row.primary_position || '';
  form.secondary_position.value = row.secondary_position || '';
  form.status.value = row.status || '';
  form.captain_role.value = row.captain_role || '';
  form.age.value = row.age ?? '';
  form.height_cm.value = row.height_cm ?? '';
  form.weight_kg.value = row.weight_kg ?? '';
  idInput.value = row.id;
  editingProfileId = row.profile_id || null;
  submitLabel.textContent = 'Mettre à jour';
  updateImagePreview(row.image_url || '');
  panel.open(true);
}

async function getRow(id) {
  const { data, error } = await supabase.from('players').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function removeRow(id) {
  const { error } = await supabase.from('players').delete().eq('id', id);
  if (error) throw error;
}

async function resolveImageUrl(recordId) {
  const file = imageFileInput?.files?.[0];
  const manualUrl = imageUrlInput?.value?.trim() || '';
  if (file) {
    return await uploadAvatar(file, `player-${recordId}`);
  }
  return manualUrl || currentImageUrl || null;
}

function captainTitle(value) {
  const map = {
    captain_1: window.t ? window.t('players.captain_1', 'Capitaine 1') : 'Capitaine 1',
    captain_2: window.t ? window.t('players.captain_2', 'Capitaine 2') : 'Capitaine 2',
    captain_3: window.t ? window.t('players.captain_3', 'Capitaine 3') : 'Capitaine 3'
  };
  return map[value] || '';
}

function formatCaptainRole(value) {
  const map = { captain_1: '../assets/img/captains/captaine1.png', captain_2: '../assets/img/captains/captaine2.png', captain_3: '../assets/img/captains/captaine3.png' };
  const src = map[value];
  if (!src) return '—';
  const title = captainTitle(value);
  return `<span class="captain-icon-wrap" title="${escapeHtml(title)}"><img src="${src}" alt="${escapeHtml(title || 'Captain')}" class="captain-icon captain-icon-sm"></span>`;
}

function normalizeComparableValue(key, value) {
  if (value == null || value === '') return null;
  if (['team_id', 'jersey_number', 'age', 'height_cm', 'weight_kg'].includes(key)) {
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  }
  return String(value).trim();
}

function formatMeasure(value, unit) {
  if (value == null || value === '') return '—';
  return `${escapeHtml(value)} ${unit}`;
}

await loadRows();
document.getElementById('refresh-btn').addEventListener('click', loadRows);
tbody.addEventListener('click', async e => {
  const editBtn = e.target.closest('.edit-btn');
  const deleteBtn = e.target.closest('.delete-btn');
  if (editBtn) fillForm(await getRow(editBtn.dataset.id));
  if (deleteBtn) {
    if (!confirm(`Supprimer ${deleteBtn.dataset.label} ?`)) return;
    await removeRow(deleteBtn.dataset.id);
    showAlert('Joueuse supprimée avec succès.');
    await loadRows();
  }
});

if (isEditor) bindFormSubmit('entity-form', async fd => {
  const payload = Object.fromEntries(fd.entries());
  const id = payload.id;
  delete payload.id;
  delete payload.image_file;
  const manualImageUrl = (payload.image_url || '').trim();
  delete payload.image_url;
  ['age', 'height_cm', 'weight_kg'].forEach(key => {
    if (payload[key] === '') delete payload[key];
    else if (payload[key] != null) payload[key] = Number(payload[key]);
  });
  if (payload.captain_role === '') payload.captain_role = null;
  Object.keys(payload).forEach(k => payload[k] === '' && delete payload[k]);

  let savedId = id;
  let linkedProfileId = editingProfileId;
  if (id) {
    const { data: beforeRow, error: beforeError } = await supabase.from('players').select('id,profile_id,team_id,full_name,jersey_number,primary_position,secondary_position,status,captain_role,age,height_cm,weight_kg,image_url').eq('id', id).maybeSingle();
    if (beforeError) throw beforeError;
    if (!beforeRow) throw new Error("Joueuse introuvable pour la mise à jour.");

    const { error } = await supabase.from('players').update(payload).eq('id', id);
    if (error) throw error;

    const { data: afterRow, error: afterError } = await supabase.from('players').select('id,profile_id,team_id,full_name,jersey_number,primary_position,secondary_position,status,captain_role,age,height_cm,weight_kg,image_url').eq('id', id).maybeSingle();
    if (afterError) throw afterError;
    if (!afterRow) throw new Error("La mise à jour a échoué.");

    const comparableKeys = ['team_id','full_name','jersey_number','primary_position','secondary_position','status','captain_role','age','height_cm','weight_kg'];
    const requestedSnapshot = Object.fromEntries(comparableKeys.map(key => [key, key in payload ? normalizeComparableValue(key, payload[key]) : normalizeComparableValue(key, beforeRow[key])]));
    const beforeSnapshot = Object.fromEntries(comparableKeys.map(key => [key, normalizeComparableValue(key, beforeRow[key])]));
    const afterSnapshot = Object.fromEntries(comparableKeys.map(key => [key, normalizeComparableValue(key, afterRow[key])]));
    const requestedChange = comparableKeys.some(key => requestedSnapshot[key] !== beforeSnapshot[key]);
    const appliedChange = comparableKeys.every(key => requestedSnapshot[key] === afterSnapshot[key]);
    if (requestedChange && !appliedChange) {
      throw new Error("La mise à jour n'a pas été appliquée. Vérifie les droits d'accès ou les règles RLS de la table players.");
    }

    savedId = afterRow.id;
    linkedProfileId = afterRow.profile_id || editingProfileId;
  } else {
    const { data, error } = await supabase.from('players').insert(payload).select('id,profile_id').maybeSingle();
    if (error) throw error;
    savedId = data?.id;
    linkedProfileId = data?.profile_id || null;
  }

  const file = imageFileInput?.files?.[0];
  const nextImageUrl = file ? await uploadAvatar(file, `player-${savedId}`) : (manualImageUrl || currentImageUrl || null);
  await syncLinkedAvatar({ table: 'players', rowId: savedId, profileId: linkedProfileId, imageUrl: nextImageUrl });

  form.reset();
  editingProfileId = null;
  updateImagePreview('');
  idInput.value = '';
  submitLabel.textContent = 'Enregistrer';
  panel.close(true);
  await fetchTeamsOptions(teamSelect);
  showAlert(id ? 'Joueuse mise à jour avec succès.' : 'Joueuse enregistrée avec succès.');
  await loadRows();
});

if (!isEditor) panel.close(false);
