import { activateMenu, bindFormSubmit, formatDate, setAppTitle, showAlert, supabase, escapeHtml, initCrudPanel, uploadFieldTemplateImage } from './common.js';
import { canAdmin, getUserContext } from './auth.js';

setAppTitle('Templates terrain');
activateMenu('field-templates');

const tbody = document.getElementById('entity-table');
const form = document.getElementById('entity-form');
const idInput = document.getElementById('entity-id');
const submitLabel = document.getElementById('submit-label');
const panel = initCrudPanel({ addTitle: 'Ajouter un template', editTitle: 'Modifier le template' });
const ctx = await getUserContext();
const isAdmin = canAdmin(ctx.role);
const placeholder = '../assets/img/branding/team-logo-placeholder.png';
const previews = {
  full_horizontal: document.getElementById('preview-full-horizontal'),
  full_vertical: document.getElementById('preview-full-vertical'),
  half_vertical: document.getElementById('preview-half-vertical')
};
const statusLine = document.getElementById('template-status-line');

function isCompleteRow(row = {}) {
  return !!(row.full_horizontal_url && row.full_vertical_url && row.half_vertical_url);
}

function thumb(url, alt) {
  return `<img src="${url || placeholder}" alt="${escapeHtml(alt || 'Template')}">`;
}

function renderStatus(row) {
  const complete = isCompleteRow(row);
  return `<span class="badge ${complete ? 'bg-label-success' : 'bg-label-warning'}">${complete ? '3/3 images' : 'Incomplet'}</span>`;
}

function updateFormStatus() {
  const hasExisting = {
    full_horizontal: previews.full_horizontal?.dataset.currentUrl || '',
    full_vertical: previews.full_vertical?.dataset.currentUrl || '',
    half_vertical: previews.half_vertical?.dataset.currentUrl || ''
  };
  const hasFiles = {
    full_horizontal: !!form.full_horizontal_file?.files?.[0],
    full_vertical: !!form.full_vertical_file?.files?.[0],
    half_vertical: !!form.half_vertical_file?.files?.[0]
  };
  const complete = ['full_horizontal','full_vertical','half_vertical'].every(key => hasExisting[key] || hasFiles[key]);
  statusLine.textContent = complete ? 'Statut : complet (3/3 images)' : 'Statut : incomplet';
  statusLine.className = `small mb-3 ${complete ? 'text-success' : 'text-warning'}`;
}

function setPreview(key, url) {
  const img = previews[key];
  if (!img) return;
  img.src = url || placeholder;
  img.dataset.currentUrl = url || '';
  updateFormStatus();
}

function wireFilePreview(inputName, key) {
  form?.[inputName]?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) {
      const current = previews[key]?.dataset.currentUrl || '';
      previews[key].src = current || placeholder;
      updateFormStatus();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      previews[key].src = reader.result;
      updateFormStatus();
    };
    reader.readAsDataURL(file);
  });
}

wireFilePreview('full_horizontal_file', 'full_horizontal');
wireFilePreview('full_vertical_file', 'full_vertical');
wireFilePreview('half_vertical_file', 'half_vertical');

function resetFormState() {
  form.reset();
  idInput.value = '';
  submitLabel.textContent = 'Enregistrer';
  setPreview('full_horizontal', '');
  setPreview('full_vertical', '');
  setPreview('half_vertical', '');
}

async function loadRows() {
  tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Chargement...</td></tr>`;
  try {
    const { data, error } = await supabase.from('field_templates').select('*').order('id', { ascending: false });
    if (error) throw error;
    if (!data?.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Aucun template terrain.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map(row => `
      <tr>
        <td><div><strong>${escapeHtml(row.name || '')}</strong></div>${row.description ? `<div class="small text-muted">${escapeHtml(row.description)}</div>` : ''}</td>
        <td><div class="template-thumb-row">${thumb(row.full_horizontal_url,'Complet horizontal')}${thumb(row.full_vertical_url,'Complet vertical')}${thumb(row.half_vertical_url,'Demi vertical')}</div></td>
        <td>${renderStatus(row)}</td>
        <td>${formatDate(row.created_at)}</td>
        <td class="text-end actions-cell">
          ${isAdmin ? `<button class="btn btn-sm btn-outline-primary edit-btn" data-id="${row.id}">Modifier</button><button class="btn btn-sm btn-outline-danger delete-btn" data-id="${row.id}" data-label="${escapeHtml(row.name || '')}">Supprimer</button>` : '<span class="text-muted">Lecture seule</span>'}
        </td>
      </tr>`).join('');
  } catch (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty text-danger">Erreur de chargement des templates.</td></tr>`;
    showAlert(error.message || 'Erreur de chargement des templates.', 'danger');
  }
}

async function getRow(id) {
  const { data, error } = await supabase.from('field_templates').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

function fillForm(row) {
  form.name.value = row.name || '';
  form.description.value = row.description || '';
  idInput.value = row.id;
  setPreview('full_horizontal', row.full_horizontal_url || '');
  setPreview('full_vertical', row.full_vertical_url || '');
  setPreview('half_vertical', row.half_vertical_url || '');
  submitLabel.textContent = 'Mettre à jour';
  panel.open(true);
}

async function removeRow(id) {
  const { error } = await supabase.from('field_templates').delete().eq('id', id);
  if (error) throw error;
}

await loadRows();
updateFormStatus();

document.getElementById('refresh-btn')?.addEventListener('click', loadRows);
document.querySelectorAll('.cancel-form-btn').forEach(btn => btn.addEventListener('click', () => resetFormState()));

tbody.addEventListener('click', async e => {
  const editBtn = e.target.closest('.edit-btn');
  const deleteBtn = e.target.closest('.delete-btn');
  if (editBtn) {
    fillForm(await getRow(editBtn.dataset.id));
  }
  if (deleteBtn) {
    if (!confirm(`Supprimer ${deleteBtn.dataset.label} ?`)) return;
    await removeRow(deleteBtn.dataset.id);
    showAlert('Template supprimé avec succès.');
    await loadRows();
  }
});

if (isAdmin) bindFormSubmit('entity-form', async fd => {
  const id = fd.get('id');
  const payload = {
    name: fd.get('name')?.toString().trim() || '',
    description: fd.get('description')?.toString().trim() || null
  };
  const files = {
    full_horizontal: fd.get('full_horizontal_file'),
    full_vertical: fd.get('full_vertical_file'),
    half_vertical: fd.get('half_vertical_file')
  };

  let current = null;
  if (id) current = await getRow(id);

  const createComplete = !!((files.full_horizontal && files.full_horizontal.size) && (files.full_vertical && files.full_vertical.size) && (files.half_vertical && files.half_vertical.size));
  if (!id && !createComplete) {
    throw new Error('Les 3 images sont obligatoires pour créer un template terrain.');
  }

  let templateId = id;
  if (id) {
    const { data: updated, error } = await supabase.from('field_templates').update(payload).eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!updated?.id) throw new Error('Mise à jour du template refusée ou introuvable.');
  } else {
    const { data: inserted, error } = await supabase.from('field_templates').insert(payload).select('id').single();
    if (error) throw error;
    templateId = inserted.id;
  }

  const updates = {};
  for (const [variant, file] of Object.entries(files)) {
    if (file && file.size) {
      const meta = await uploadFieldTemplateImage(file, templateId, variant);
      updates[`${variant}_url`] = meta.url;
      updates[`${variant}_path`] = meta.path;
      updates[`${variant}_filename`] = meta.filename;
    }
  }

  if (Object.keys(updates).length) {
    const { data: imagesUpdated, error } = await supabase.from('field_templates').update(updates).eq('id', templateId).select('*').maybeSingle();
    if (error) throw error;
    if (!imagesUpdated?.id) throw new Error('Mise à jour des images du template refusée ou introuvable.');
    current = imagesUpdated;
  } else if (id) {
    current = await getRow(templateId);
  }

  if (!isCompleteRow(current)) {
    throw new Error('Le template doit contenir 3 images complètes avant d’être enregistré.');
  }

  resetFormState();
  panel.close(true);
  showAlert(id ? 'Template terrain mis à jour avec succès.' : 'Template terrain enregistré avec succès.');
  await loadRows();
});

if (!isAdmin) {
  panel.close(false);
}
