import { activateMenu, bindFormSubmit, formatDate, setAppTitle, showAlert, supabase, escapeHtml, initCrudPanel, uploadTeamLogo, teamLogoHtml } from './common.js';
import { canAdmin, canEdit, getUserContext } from './auth.js';
setAppTitle('Équipes');
activateMenu('teams');
const tbody = document.getElementById('entity-table');
const form = document.getElementById('entity-form');
const idInput = document.getElementById('entity-id');
const submitLabel = document.getElementById('submit-label');
const logoPreview = document.getElementById('team-logo-preview');
const panel = initCrudPanel({ addTitle: 'Ajouter une équipe', editTitle: 'Modifier équipe' });
const ctx = await getUserContext();
const isAdmin = canAdmin(ctx.role);
async function loadRows() {
  tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Chargement...</td></tr>`;
  const { data, error } = await supabase.from('teams').select('id,name,category,season,created_at,logo_url').order('id', { ascending: false });
  if (error) throw error;
  if (!data.length) { tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Aucune donnée.</td></tr>`; return; }
  tbody.innerHTML = data.map(row => `<tr><td><div class="team-title-wrap">${teamLogoHtml(row)}<div><strong>${escapeHtml(row.name || '')}</strong></div></div></td><td>${escapeHtml(row.category || '')}</td><td>${escapeHtml(row.season || '')}</td><td>${formatDate(row.created_at)}</td><td class="text-end actions-cell">${isAdmin ? `<button class="btn btn-sm btn-outline-primary edit-btn" data-id="${row.id}">Modifier</button><button class="btn btn-sm btn-outline-danger delete-btn" data-id="${row.id}" data-label="${escapeHtml(row.name || '')}">Supprimer</button>` : '<span class="text-muted">Lecture seule</span>'}</td></tr>`).join('');
}
function fillForm(row){ form.name.value=row.name||''; form.category.value=row.category||''; form.season.value=row.season||''; idInput.value=row.id; if (logoPreview) logoPreview.src = row.logo_url || '../assets/img/branding/team-logo-placeholder.png'; submitLabel.textContent='Mettre à jour'; panel.open(true); }
async function getRow(id){ const { data, error } = await supabase.from('teams').select('*').eq('id', id).single(); if (error) throw error; return data; }
async function removeRow(id){ const { error } = await supabase.from('teams').delete().eq('id', id); if (error) throw error; }
await loadRows();
document.getElementById('refresh-btn').addEventListener('click', loadRows);
tbody.addEventListener('click', async e => { const editBtn = e.target.closest('.edit-btn'); const deleteBtn = e.target.closest('.delete-btn'); if (editBtn) fillForm(await getRow(editBtn.dataset.id)); if (deleteBtn) { if (!confirm(`Supprimer ${deleteBtn.dataset.label} ?`)) return; await removeRow(deleteBtn.dataset.id); showAlert('Équipe supprimée avec succès.'); await loadRows(); } });
if (isAdmin) bindFormSubmit('entity-form', async fd => {
  const logoFile = fd.get('logo_file');
  fd.delete('logo_file');
  const payload = Object.fromEntries(fd.entries());
  const id = payload.id; delete payload.id;
  Object.keys(payload).forEach(k => payload[k] === '' && delete payload[k]);
  let teamId = id;
  if (id) {
    const { error } = await supabase.from('teams').update(payload).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('teams').insert(payload).select('id').single();
    if (error) throw error;
    teamId = data.id;
  }
  if (logoFile && logoFile.size) {
    const logoUrl = await uploadTeamLogo(logoFile, teamId);
    const { error: logoErr } = await supabase.from('teams').update({ logo_url: logoUrl }).eq('id', teamId);
    if (logoErr) throw logoErr;
  }
  form.reset(); idInput.value=''; submitLabel.textContent='Enregistrer';
  if (logoPreview) logoPreview.src = '../assets/img/branding/team-logo-placeholder.png';
  panel.close(true); showAlert(id ? 'Équipe mise à jour avec succès.' : 'Équipe enregistrée avec succès.'); await loadRows(); });

if (!isAdmin) { panel.close(false); }

form?.logo_file?.addEventListener('change', e => { const file = e.target.files?.[0]; if (!logoPreview) return; if (file) { const reader = new FileReader(); reader.onload = () => logoPreview.src = reader.result; reader.readAsDataURL(file); } else { logoPreview.src = '../assets/img/branding/team-logo-placeholder.png'; } });
