
import { activateMenu, escapeHtml, setAppTitle, supabase } from './common.js';
import { getUserContext } from './auth.js';
import { TICKET_TYPES, TICKET_PRIORITIES, TICKET_STATUSES, ticketTypeLabel, ticketPriorityLabel, ticketStatusLabel, ticketPriorityBadge, ticketStatusBadge } from './tickets-common.js';

const tt = (key, fallback='') => (window.t ? window.t(key, fallback) : fallback || key);

setAppTitle(tt('page.tickets', 'Tickets'));
activateMenu('tickets');

const ctx = await getUserContext();
if (ctx.role !== 'admin') location.href = 'index.html';

const host = document.getElementById('portal-content');
document.getElementById('portal-title').textContent = tt('page.tickets', 'Tickets');
document.getElementById('portal-subtitle').textContent = tt('tickets.list_subtitle_admin', 'Centre de gestion des tickets.');

function setOptions(select, values, labelFn, includeAll=true) {
  const options = [];
  if (includeAll) options.push(`<option value="">${tt('tickets.all','Tous les tickets')}</option>`);
  options.push(...values.map(v => `<option value="${v}">${escapeHtml(labelFn(v))}</option>`));
  select.innerHTML = options.join('');
}
setOptions(document.getElementById('ticket-filter-status'), TICKET_STATUSES, ticketStatusLabel, true)
setOptions(document.getElementById('ticket-filter-priority'), TICKET_PRIORITIES, ticketPriorityLabel, true)
setOptions(document.getElementById('ticket-filter-type'), TICKET_TYPES, ticketTypeLabel, true)

async function loadTickets() {
  host.innerHTML = `<div class="text-muted">${tt('common.loading','Chargement...')}</div>`;
  let query = supabase.from('support_tickets').select('*, profiles!support_tickets_created_by_profile_id_fkey(full_name,email)').order('updated_at', { ascending: false });
  const status = document.getElementById('ticket-filter-status').value;
  const priority = document.getElementById('ticket-filter-priority').value;
  const type = document.getElementById('ticket-filter-type').value;
  if (status) query = query.eq('status', status);
  if (priority) query = query.eq('priority', priority);
  if (type) query = query.eq('ticket_type', type);
  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) {
    host.innerHTML = `<div class="card"><div class="card-body text-muted">${tt('tickets.no_tickets','Aucun ticket pour le moment.')}</div></div>`;
    return;
  }
  host.innerHTML = `<div class="card"><div class="table-responsive"><table class="table align-middle"><thead><tr>
    <th>${tt('tickets.internal_id','Ticket')}</th>
    <th>${tt('tickets.title','Titre')}</th>
    <th>${tt('tickets.author','Auteur')}</th>
    <th>${tt('tickets.type','Type')}</th>
    <th>${tt('tickets.priority','Priorité')}</th>
    <th>${tt('tickets.status','Statut')}</th>
    <th>${tt('tickets.updated_at','Mis à jour le')}</th>
    <th>${tt('common.open','Ouvrir')}</th>
  </tr></thead><tbody>
  ${data.map(item => `<tr>
    <td>#${item.id}</td>
    <td><div class="fw-semibold">${escapeHtml(item.title || '')}</div><div class="small text-muted">${escapeHtml((item.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120))}</div></td>
    <td>${escapeHtml(item.profiles?.full_name || item.profiles?.email || item.created_by_profile_id)}</td>
    <td><span class="badge bg-label-secondary">${escapeHtml(ticketTypeLabel(item.ticket_type))}</span></td>
    <td><span class="badge bg-label-${ticketPriorityBadge(item.priority)}">${escapeHtml(ticketPriorityLabel(item.priority))}</span></td>
    <td><span class="badge bg-label-${ticketStatusBadge(item.status)}">${escapeHtml(ticketStatusLabel(item.status))}</span></td>
    <td>${new Date(item.updated_at).toLocaleString()}</td>
    <td class="actions-cell"><a class="btn btn-sm btn-outline-primary" href="ticket-detail.html?id=${item.id}">${tt('tickets.open_ticket','Ouvrir')}</a></td>
  </tr>`).join('')}
  </tbody></table></div></div>`;
}
['ticket-filter-status','ticket-filter-priority','ticket-filter-type'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', () => loadTickets().catch(console.error));
});

await loadTickets();
document.addEventListener('app:language-changed', () => location.reload());
