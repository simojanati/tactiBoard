import {
  activateMenu,
  bindFormSubmit,
  fetchTeamsOptions,
  setAppTitle,
  showAlert,
  supabase,
  escapeHtml,
  initCrudPanel,
  renderAssignmentsBuilder,
  setupAssignmentsBuilder,
  collectAssignments
} from './common.js';
import { canEdit, getUserContext } from './auth.js';
import { notifyTeamEvent } from './notification-helpers.js';
const tt = (key, fallback = '') => (window.t ? window.t(key, fallback) : fallback || key);

setAppTitle(tt('page.tactics', 'Tactiques'));
activateMenu('tactics');

const tbody = document.getElementById('tactics-table');
const teamSelect = document.getElementById('team-select');
const form = document.getElementById('tactic-form');
const idInput = document.getElementById('entity-id');
const submitLabel = document.getElementById('submit-label');
const panel = initCrudPanel({ addTitle: tt('tactics.add','Ajouter une tactique'), editTitle: tt('tactics.edit','Modifier tactique') });
const assignmentsContainer = document.getElementById('assignments-builder');
const addAssignmentBtn = document.getElementById('add-assignment-btn');
const ctx = await getUserContext();
const isEditor = canEdit(ctx.role);

setupAssignmentsBuilder(assignmentsContainer, addAssignmentBtn);
await fetchTeamsOptions(teamSelect);

async function uploadDiagram(file) {
  if (!file) return null;
  const ext = file.name.split('.').pop();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(window.APP_CONFIG.defaultBucket).upload(path, file, { upsert: false });

  if (error) {
    if (String(error.message || '').toLowerCase().includes('row-level security')) {
      throw new Error(tt('tactics.upload_policy_error', 'Upload bloqué par Supabase Storage. Ajoute une policy INSERT sur storage.objects pour le bucket tactic-images.'));
    }
    throw error;
  }

  const { data } = supabase.storage.from(window.APP_CONFIG.defaultBucket).getPublicUrl(path);
  return data.publicUrl;
}

async function loadRows() {
  tbody.innerHTML = `<tr><td colspan="9" class="table-empty">${tt('tactics.loading','Chargement...')}</td></tr>`;
  const { data, error } = await supabase
    .from('tactics')
    .select('id,title,phase,formation,version,diagram_image_url,team_id,category,objective,notes,coach_notes,change_note,updated_at,teams(name)')
    .order('id', { ascending: false });

  if (error) throw error;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty">${tt('tactics.none','Aucune tactique pour le moment.')}</td></tr>`;
    return;
  }

  tbody.innerHTML = data
    .map(
      row => `<tr>
        <td><strong>${escapeHtml(row.title || '')}</strong></td>
        <td>${escapeHtml(row.teams?.name || '—')}</td>
        <td><span class="badge bg-label-primary">${escapeHtml(row.phase || '')}</span></td>
        <td>${escapeHtml(row.category || '—')}</td>
        <td>${escapeHtml(row.formation || '')}</td>
        <td>${escapeHtml(row.version ?? '')}</td>
        <td><div class="small">${row.updated_at ? escapeHtml(new Date(row.updated_at).toLocaleDateString()) : '—'}</div><div class="small text-muted">${escapeHtml(row.change_note || '—')}</div></td>
        <td>${row.diagram_image_url ? `<a href=\"${row.diagram_image_url}\" target=\"_blank\" class=\"btn btn-sm btn-outline-primary\">${tt('tactics.view','Voir')}</a>` : '—'}</td>
        <td class="text-end actions-cell">
          <a class="btn btn-sm btn-outline-secondary" href="tactic-detail.html?id=${row.id}">${tt('tactics.detail','Détail')}</a>
          ${isEditor ? `<a class="btn btn-sm btn-outline-dark" href="tactical-board.html?id=${row.id}">${tt('tactics.board','Board')}</a>
          <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${row.id}">Modifier</button>
          <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${row.id}" data-label="${escapeHtml(row.title || '')}">Supprimer</button>` : ''}
        </td>
      </tr>`
    )
    .join('');
}

async function fillForm(row) {
  form.team_id.value = row.team_id ?? '';
  form.title.value = row.title || '';
  form.phase.value = row.phase || '';
  form.category.value = row.category || '';
  form.formation.value = row.formation || '';
  form.objective.value = row.objective || '';
  form.version.value = row.version || 1;
  form.notes.value = row.notes || '';
  form.coach_notes.value = row.coach_notes || '';
  form.change_note.value = row.change_note || '';
  idInput.value = row.id;
  const { data: assignments } = await supabase.from('tactic_assignments').select('position,instruction').eq('tactic_id', row.id).order('id');
  renderAssignmentsBuilder(assignmentsContainer, assignments || []);
  submitLabel.textContent = 'Mettre à jour';
  panel.open(true);
}

async function getRow(id) {
  const { data, error } = await supabase.from('tactics').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function removeAssignments(tacticId) {
  await supabase.from('tactic_assignments').delete().eq('tactic_id', tacticId);
}

async function removeRow(id) {
  const { error } = await supabase.from('tactics').delete().eq('id', id);
  if (error) throw error;
}

await loadRows();

const editIdFromUrl = new URLSearchParams(window.location.search).get('edit');
if (editIdFromUrl) {
  const row = await getRow(editIdFromUrl);
  await fillForm(row);
}

document.getElementById('refresh-btn').addEventListener('click', loadRows);
document.querySelectorAll('.cancel-form-btn').forEach(btn => btn.addEventListener('click', () => {
  renderAssignmentsBuilder(assignmentsContainer, [{ position: '', instruction: '' }]);
}));

tbody.addEventListener('click', async e => {
  const editBtn = e.target.closest('.edit-btn');
  const deleteBtn = e.target.closest('.delete-btn');

  if (editBtn && isEditor) {
    fillForm(await getRow(editBtn.dataset.id));
  }

  if (deleteBtn && isEditor) {
    if (!confirm(`Supprimer ${deleteBtn.dataset.label} ?`)) return;
    await removeAssignments(deleteBtn.dataset.id);
    await removeRow(deleteBtn.dataset.id);
    showAlert('Tactique supprimée avec succès.');
    await loadRows();
  }
});

if (isEditor) bindFormSubmit('tactic-form', async fd => {
  const payload = Object.fromEntries(fd.entries());
  const id = payload.id;
  delete payload.id;

  const file = document.getElementById('diagram-file').files[0];
  payload.status = 'active';
  payload.updated_at = new Date().toISOString();
  if (!payload.change_note) payload.change_note = id ? 'Mise à jour générale' : 'Création de la tactique';
  Object.keys(payload).forEach(key => payload[key] === '' && delete payload[key]);

  if (file) {
    payload.diagram_image_url = await uploadDiagram(file);
  }

  const assignments = collectAssignments(assignmentsContainer);
  let tacticId = id;

  const isUpdate = Boolean(id);
  if (id) {
    const { error } = await supabase.from('tactics').update(payload).eq('id', id);
    if (error) throw error;
    await removeAssignments(id);
  } else {
    const { data, error } = await supabase.from('tactics').insert(payload).select('id').single();
    if (error) throw error;
    tacticId = data.id;
  }

  if (assignments.length) {
    const rows = assignments.map(item => ({ tactic_id: tacticId, position: item.position, instruction: item.instruction }));
    const { error: assignmentsError } = await supabase.from('tactic_assignments').insert(rows);
    if (assignmentsError) throw assignmentsError;
  }

  form.reset();
  renderAssignmentsBuilder(assignmentsContainer, [{ position: '', instruction: '' }]);
  idInput.value = '';
  submitLabel.textContent = 'Enregistrer';
  panel.close(true);
  await fetchTeamsOptions(teamSelect);
  showAlert(id ? 'Tactique mise à jour avec succès.' : 'Tactique enregistrée avec succès.');
  await notifyTeamEvent({
    teamId: payload.team_id,
    eventType: 'update',
    title: isUpdate ? 'Tactique mise à jour' : 'Nouvelle tactique disponible',
    body: isUpdate
      ? `${payload.title} a été mise à jour${payload.change_note ? ` · ${payload.change_note}` : ''}`
      : `${payload.title} a été ajoutée au playbook de l'équipe.`,
    links: {
      default: `tactic-detail.html?id=${tacticId}`
    }
  });
  await loadRows();
});

if (!isEditor) { panel.close(false); }

document.addEventListener('app:language-changed', () => { try { location.reload(); } catch (e) { console.warn(e); } });
