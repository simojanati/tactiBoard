import { activateMenu, bindFormSubmit, fetchTeamsOptions, setAppTitle, showAlert, supabase, escapeHtml, initCrudPanel, personAvatarUrl, uploadAvatar, syncLinkedAvatar } from './common.js';
import { canAdmin, getUserContext } from './auth.js';

setAppTitle('Coachs');
activateMenu('coaches');
const tbody = document.getElementById('entity-table');
const teamSelect = document.getElementById('team-select');
const form = document.getElementById('entity-form');
const idInput = document.getElementById('entity-id');
const submitLabel = document.getElementById('submit-label');
const imagePreview = document.getElementById('entity-image-preview');
const imageFileInput = document.getElementById('entity-image-file');
const imageUrlInput = document.getElementById('entity-image-url');
const panel = initCrudPanel({ addTitle: 'Ajouter un coach', editTitle: 'Modifier coach' });
const ctx = await getUserContext();
const isAdmin = canAdmin(ctx.role);
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

try { await fetchTeamsOptions(teamSelect); } catch { showAlert('Impossible de charger les équipes. Ajoute au moins une équipe.', 'warning'); }

async function loadRows() {
  tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Chargement...</td></tr>`;
  const { data, error } = await supabase.from('coaches').select('id,team_id,profile_id,image_url,teams(name),full_name,role,email').order('id',{ascending:false});
  if (error) throw error;
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Aucune donnée.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(row => `
    <tr>
      <td><div class="d-flex align-items-center gap-2"><img src="${personAvatarUrl(row)}" alt="${escapeHtml(row.full_name||'')}" class="coach-avatar-sm"><span>${escapeHtml(row.full_name||'')}</span></div></td>
      <td>${escapeHtml(row.teams?.name||'—')}</td>
      <td>${escapeHtml(row.role||'')}</td>
      <td>${escapeHtml(row.email||'')}</td>
      <td>${row.profile_id ? `<span class="badge bg-label-success">Lié</span><div class="small text-muted mt-1">ID: ${escapeHtml(row.profile_id || '')}</div>` : '<span class="badge bg-label-warning">Non lié</span>'}</td>
      <td class="text-end actions-cell">${isAdmin ? `<button class="btn btn-sm btn-outline-primary edit-btn" data-id="${row.id}">Modifier</button><button class="btn btn-sm btn-outline-danger delete-btn" data-id="${row.id}" data-label="${escapeHtml(row.full_name||'')}">Supprimer</button>` : '<span class="text-muted">Lecture seule</span>'}</td>
    </tr>`).join('');
}

function fillForm(row) {
  form.team_id.value = row.team_id ?? '';
  form.full_name.value = row.full_name || '';
  form.role.value = row.role || '';
  form.email.value = row.email || '';
  idInput.value = row.id;
  editingProfileId = row.profile_id || null;
  submitLabel.textContent = 'Mettre à jour';
  updateImagePreview(row.image_url || '');
  panel.open(true);
}

async function getRow(id) {
  const { data, error } = await supabase.from('coaches').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function removeRow(id) {
  const { error } = await supabase.from('coaches').delete().eq('id', id);
  if (error) throw error;
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
    showAlert('Coach supprimé avec succès.');
    await loadRows();
  }
});

if (isAdmin) bindFormSubmit('entity-form', async fd => {
  const payload = Object.fromEntries(fd.entries());
  const id = payload.id;
  delete payload.id;
  delete payload.image_file;
  const manualImageUrl = (payload.image_url || '').trim();
  delete payload.image_url;
  Object.keys(payload).forEach(k => payload[k] === '' && delete payload[k]);

  let savedId = id;
  let linkedProfileId = editingProfileId;
  if (id) {
    const { data, error } = await supabase.from('coaches').update(payload).eq('id', id).select('id,profile_id').single();
    if (error) throw error;
    savedId = data.id;
    linkedProfileId = data.profile_id || editingProfileId;
  } else {
    const { data, error } = await supabase.from('coaches').insert(payload).select('id,profile_id').single();
    if (error) throw error;
    savedId = data.id;
    linkedProfileId = data.profile_id || null;
  }

  const file = imageFileInput?.files?.[0];
  const nextImageUrl = file ? await uploadAvatar(file, `coach-${savedId}`) : (manualImageUrl || currentImageUrl || null);
  await syncLinkedAvatar({ table: 'coaches', rowId: savedId, profileId: linkedProfileId, imageUrl: nextImageUrl });

  form.reset();
  editingProfileId = null;
  updateImagePreview('');
  idInput.value = '';
  submitLabel.textContent = 'Enregistrer';
  panel.close(true);
  await fetchTeamsOptions(teamSelect);
  showAlert(id ? 'Coach mis à jour avec succès.' : 'Coach enregistré avec succès.');
  await loadRows();
});

if (!isAdmin) panel.close(false);
