
import { activateMenu, bindFormSubmit, escapeHtml, initRichTextEditor, setAppTitle, showAlert, stripHtml, supabase } from './common.js';
import { getPortalContext } from './portal-common.js';
import { TICKET_TYPES, TICKET_PRIORITIES, ticketTypeLabel, ticketPriorityLabel, ticketStatusLabel, ticketPriorityBadge, ticketStatusBadge, notifyAdminTicketCreated } from './tickets-common.js';

const tt = (key, fallback='') => (window.t ? window.t(key, fallback) : fallback || key);

setAppTitle(tt('page.my_tickets', 'Mes tickets'));
activateMenu('my-tickets');

const ctx = await getPortalContext();
const host = document.getElementById('portal-content');
const formAlert = document.getElementById('ticket-form-alert');
const titleEl = document.getElementById('portal-title');
const subtitleEl = document.getElementById('portal-subtitle');

if (ctx.role === 'admin') {
  location.href = 'tickets.html';
}

titleEl.textContent = tt('page.my_tickets', 'Mes tickets');
subtitleEl.textContent = tt('tickets.list_subtitle_user', 'Historique de tes tickets support.');
const descriptionEditor = initRichTextEditor(document.getElementById('ticket-description-input'), { placeholder: tt('tickets.description_placeholder', 'Décris clairement le problème, la demande ou la suggestion...'), minHeight: 180 });

function setOptions(select, values, labelFn, includeAll=false) {
  if (!select) return;
  const options = [];
  if (includeAll) options.push(`<option value="">${tt('tickets.all','Tous les tickets')}</option>`);
  options.push(...values.map(v => `<option value="${v}">${escapeHtml(labelFn(v))}</option>`));
  select.innerHTML = options.join('');
}
setOptions(document.getElementById('ticket-type-select'), TICKET_TYPES, ticketTypeLabel);
setOptions(document.getElementById('ticket-priority-select'), TICKET_PRIORITIES, ticketPriorityLabel);

async function loadTickets() {
  host.innerHTML = `<div class="text-muted">${tt('common.loading','Chargement...')}</div>`;
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('created_by_profile_id', ctx.user.id)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  if (!data?.length) {
    host.innerHTML = `<div class="card"><div class="card-body text-muted">${tt('tickets.no_tickets','Aucun ticket pour le moment.')}</div></div>`;
    return;
  }
  host.innerHTML = `<div class="row">${
    data.map(item => `
      <div class="col-12 mb-4">
        <div class="card">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
              <div>
                <h5 class="mb-1">${escapeHtml(item.title || '')}</h5>
                <div class="small text-muted mb-2">${tt('tickets.internal_id','Ticket')} #${item.id}</div>
                <div class="mb-3 ticket-rich-content">${item.description || ''}</div>
                <div class="d-flex gap-2 flex-wrap">
                  <span class="badge bg-label-secondary">${escapeHtml(ticketTypeLabel(item.ticket_type))}</span>
                  <span class="badge bg-label-${ticketPriorityBadge(item.priority)}">${escapeHtml(ticketPriorityLabel(item.priority))}</span>
                  <span class="badge bg-label-${ticketStatusBadge(item.status)}">${escapeHtml(ticketStatusLabel(item.status))}</span>
                </div>
              </div>
              <div class="text-end">
                <div class="small text-muted mb-2">${tt('tickets.updated_at','Mis à jour le')}: ${new Date(item.updated_at).toLocaleString()}</div>
                <a class="btn btn-sm btn-outline-primary" href="ticket-detail.html?id=${item.id}">${tt('tickets.open_ticket','Ouvrir')}</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    `).join('')
  }</div>`;
}

bindFormSubmit('ticket-create-form', async (fd, form) => {
  await descriptionEditor?.ready;
  formAlert.innerHTML = '';
  const payload = Object.fromEntries(fd.entries());
  const descriptionHtml = descriptionEditor?.getHTML?.() || payload.description || '';
  const { data, error } = await supabase.from('support_tickets').insert({
    created_by_profile_id: ctx.user.id,
    title: payload.title,
    description: descriptionHtml,
    ticket_type: payload.ticket_type || 'support',
    priority: payload.priority || 'medium'
  }).select();
  if (error) throw error;
  let createdTicket = Array.isArray(data) ? data[0] : data;

  if (!createdTicket?.id) {
    const { data: fallbackTicket, error: fallbackError } = await supabase
      .from('support_tickets')
      .select('id,title,created_at')
      .eq('created_by_profile_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!fallbackError && fallbackTicket?.id) {
      createdTicket = fallbackTicket;
    }
  }

  try {
    await notifyAdminTicketCreated({
      ticketId: createdTicket?.id,
      title: createdTicket?.title || payload.title
    });
  } catch (e) { console.warn('Ticket creation notification failed:', e); }
  showAlert(tt('tickets.ticket_created','Ticket créé.'), 'success', 'ticket-form-alert');
  form.reset();
  descriptionEditor?.clear?.();
  await loadTickets();
});

await loadTickets();
document.addEventListener('app:language-changed', () => location.reload());
