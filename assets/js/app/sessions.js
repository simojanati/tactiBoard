import { activateMenu, bindFormSubmit, fetchTeamsOptions, fetchTacticsOptions, formatDate, setAppTitle, showAlert, supabase, escapeHtml, initCrudPanel } from './common.js';
import { canEdit, getUserContext } from './auth.js';
import { notifyTeamEvent } from './notification-helpers.js';

setAppTitle('Séances');
activateMenu('sessions');
const tbody=document.getElementById('entity-table');
const teamSelect=document.getElementById('team-select');
const tacticsSelect=document.getElementById('session-tactics-select');
const form=document.getElementById('entity-form');
const idInput=document.getElementById('entity-id');
const submitLabel=document.getElementById('submit-label');
const panel=initCrudPanel({ addTitle:'Ajouter une séance', editTitle:'Modifier séance' });
const formCardBody = form?.closest('.card-body');
if (formCardBody && !document.getElementById('session-planning-helper')) {
  const helper = document.createElement('div');
  helper.id = 'session-planning-helper';
  helper.className = 'alert alert-info py-2 small';
  helper.innerHTML = '<i class="bx bx-info-circle me-1"></i>Le planning détaillé de la séance se gère après enregistrement, depuis le bouton <strong>Détail</strong>.';
  formCardBody.insertBefore(helper, form);
}
const ctx = await getUserContext();
const isEditor = canEdit(ctx.role);

try { await fetchTeamsOptions(teamSelect); } catch { showAlert('Impossible de charger les équipes. Ajoute au moins une équipe.', 'warning'); }
if (tacticsSelect) await fetchTacticsOptions(tacticsSelect);

teamSelect.addEventListener('change', async () => {
  if (!tacticsSelect) return;
  await fetchTacticsOptions(tacticsSelect, { teamId: teamSelect.value, selectedIds: [...tacticsSelect.selectedOptions].map(opt => opt.value) });
});

async function loadRows(){
  tbody.innerHTML=`<tr><td colspan="7" class="table-empty">Chargement...</td></tr>`;
  const {data,error}=await supabase.from('sessions').select('id,team_id,teams(name),title,session_date,start_time,end_time,location,notes').order('id',{ascending:false});
  if(error) throw error;
  if(!data.length){tbody.innerHTML=`<tr><td colspan="7" class="table-empty">Aucune donnée.</td></tr>`; return;}

  const sessionIds = data.map(row => row.id);
  const { data: links, error: linksError } = await supabase.from('session_tactics').select('session_id, tactics(title)').in('session_id', sessionIds);
  if (linksError) throw linksError;
  const bySession = new Map();
  (links || []).forEach(link => {
    const arr = bySession.get(link.session_id) || [];
    arr.push(link.tactics?.title || 'Tactique');
    bySession.set(link.session_id, arr);
  });

  tbody.innerHTML=data.map(row=>`<tr><td><a href="session-detail.html?id=${row.id}" class="fw-semibold text-decoration-none">${escapeHtml(row.title||'')}</a></td><td>${escapeHtml(row.teams?.name||'—')}</td><td>${formatDate(row.session_date)}</td><td>${escapeHtml(row.location||'')}</td><td>${escapeHtml((bySession.get(row.id) || []).slice(0,3).join(', ') || '—')}</td><td>${escapeHtml(row.notes||'')}</td><td class="text-end actions-cell"><a class="btn btn-sm btn-outline-secondary" href="session-detail.html?id=${row.id}">Détail</a>${isEditor ? `<button class=\"btn btn-sm btn-outline-primary edit-btn\" data-id=\"${row.id}\">Modifier</button><button class=\"btn btn-sm btn-outline-danger delete-btn\" data-id=\"${row.id}\" data-label=\"${escapeHtml(row.title||'')}\">Supprimer</button>` : ''}</td></tr>`).join('');
}

async function fillForm(row){
  form.team_id.value=row.team_id??'';
  form.title.value=row.title||'';
  form.session_date.value=row.session_date||'';
  form.start_time.value=row.start_time||'';
  form.end_time.value=row.end_time||'';
  form.location.value=row.location||'';
  form.notes.value=row.notes||'';
  idInput.value=row.id;
  const { data: links } = await supabase.from('session_tactics').select('tactic_id').eq('session_id', row.id);
  if (tacticsSelect) {
    await fetchTacticsOptions(tacticsSelect, { teamId: row.team_id || '', selectedIds: (links || []).map(x => x.tactic_id) });
  }
  submitLabel.textContent='Mettre à jour';
  panel.open(true);
}

async function getRow(id){ const {data,error}=await supabase.from('sessions').select('*').eq('id',id).single(); if(error) throw error; return data; }
async function removeRow(id){ const {error}=await supabase.from('sessions').delete().eq('id',id); if(error) throw error; }
async function replaceSessionTactics(sessionId, tacticIds) {
  await supabase.from('session_tactics').delete().eq('session_id', sessionId);
  if (!tacticIds.length) return;
  const rows = tacticIds.map((tacticId, index) => ({ session_id: sessionId, tactic_id: tacticId, priority: index === 0 ? 'haute' : 'normal' }));
  const { error } = await supabase.from('session_tactics').insert(rows);
  if (error) throw error;
}

await loadRows();
document.getElementById('refresh-btn').addEventListener('click',loadRows);
tbody.addEventListener('click',async e=>{ const editBtn=e.target.closest('.edit-btn'); const deleteBtn=e.target.closest('.delete-btn'); if(editBtn && isEditor) fillForm(await getRow(editBtn.dataset.id)); if(deleteBtn && isEditor){ if(!confirm(`Supprimer ${deleteBtn.dataset.label} ?`)) return; await removeRow(deleteBtn.dataset.id); showAlert('Séance supprimée avec succès.'); await loadRows(); } });
if (isEditor) bindFormSubmit('entity-form', async fd=>{
  const payload=Object.fromEntries(fd.entries());
  const id=payload.id;
  delete payload.id;
  const tacticIds = tacticsSelect ? [...tacticsSelect.selectedOptions].map(opt => Number(opt.value)) : [];
  Object.keys(payload).forEach(k=>payload[k]===''&&delete payload[k]);
  const isUpdate = Boolean(id);
  let sessionId = id;
  if(id) {
    const {error}= await supabase.from('sessions').update(payload).eq('id',id);
    if(error) throw error;
  } else {
    const { data, error } = await supabase.from('sessions').insert(payload).select('id').single();
    if(error) throw error;
    sessionId = data.id;
  }
  await replaceSessionTactics(sessionId, tacticIds);
  form.reset();
  idInput.value='';
  submitLabel.textContent='Enregistrer';
  panel.close(true);
  await fetchTeamsOptions(teamSelect);
  if (tacticsSelect) await fetchTacticsOptions(tacticsSelect);
  showAlert(id ? 'Séance mise à jour avec succès.' : 'Séance enregistrée avec succès.');
  await notifyTeamEvent({
    teamId: payload.team_id,
    eventType: 'session',
    title: isUpdate ? 'Séance mise à jour' : 'Nouvelle séance planifiée',
    body: isUpdate
      ? `${payload.title} a été modifiée pour le ${payload.session_date || 'planning en cours'}.`
      : `${payload.title} est planifiée le ${payload.session_date || 'prochainement'}.`,
    links: {
      player: 'my-sessions.html',
      coach: 'sessions.html'
    }
  });
  await loadRows();
});

if (!isEditor) { panel.close(false); }
