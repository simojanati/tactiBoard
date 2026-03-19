
import { activateMenu, bindFormSubmit, escapeHtml, getQueryParam, initRichTextEditor, setAppTitle, showAlert, stripHtml, supabase } from './common.js';
import { canAdmin, getUserContext } from './auth.js';
import { TICKET_PRIORITIES, TICKET_STATUSES, ticketTypeLabel, ticketPriorityLabel, ticketStatusLabel, ticketPriorityBadge, ticketStatusBadge, fetchTicketComments, notifyAdminsTicketComment, notifyTicketOwnerComment, notifyTicketOwnerUpdated, renderTicketComments } from './tickets-common.js';

const tt = (key, fallback='') => (window.t ? window.t(key, fallback) : fallback || key);

setAppTitle(tt('page.ticket_detail', 'Détail ticket'));
activateMenu(canAdmin((await getUserContext()).role) ? 'tickets' : 'my-tickets');

const ctx = await getUserContext();
const ticketId = getQueryParam('id');
const detailHost = document.getElementById('ticket-detail-host');
const commentsHost = document.getElementById('ticket-comments-host');
const adminForm = document.getElementById('ticket-admin-form');
const userHint = document.getElementById('ticket-user-hint');

let currentTicket = null;
const commentEditor = initRichTextEditor(document.getElementById('ticket-comment-input'), { placeholder: tt('tickets.comment_placeholder', 'Ajoute un commentaire ou une précision...'), minHeight: 160 });

function setSelectOptions(select, values, labelFn) {
  if (!select) return;
  select.innerHTML = values.map(v => `<option value="${v}">${escapeHtml(labelFn(v))}</option>`).join('');
}
setSelectOptions(document.getElementById('ticket-status-select'), TICKET_STATUSES, ticketStatusLabel);
setSelectOptions(document.getElementById('ticket-priority-select-admin'), TICKET_PRIORITIES, ticketPriorityLabel);

async function loadTicket() {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*, profiles!support_tickets_created_by_profile_id_fkey(full_name,email)')
    .eq('id', ticketId)
    .single();
  if (error) throw error;
  currentTicket = data;

  document.getElementById('page-title').textContent = `${tt('tickets.internal_id','Ticket')} #${data.id}`;
  document.getElementById('page-subtitle').textContent = data.title || '';

  detailHost.innerHTML = `
    <div class="mb-3">
      <h4 class="mb-1">${escapeHtml(data.title || '')}</h4>
      <div class="d-flex gap-2 flex-wrap">
        <span class="badge bg-label-secondary">${escapeHtml(ticketTypeLabel(data.ticket_type))}</span>
        <span class="badge bg-label-${ticketPriorityBadge(data.priority)}">${escapeHtml(ticketPriorityLabel(data.priority))}</span>
        <span class="badge bg-label-${ticketStatusBadge(data.status)}">${escapeHtml(ticketStatusLabel(data.status))}</span>
      </div>
    </div>
    <div class="ticket-detail-grid mb-4">
      <div><div class="small text-muted">${tt('tickets.author','Auteur')}</div><div>${escapeHtml(data.profiles?.full_name || data.profiles?.email || data.created_by_profile_id)}</div></div>
      <div><div class="small text-muted">${tt('tickets.created_at','Créé le')}</div><div>${new Date(data.created_at).toLocaleString()}</div></div>
      <div><div class="small text-muted">${tt('tickets.updated_at','Mis à jour le')}</div><div>${new Date(data.updated_at).toLocaleString()}</div></div>
      <div><div class="small text-muted">${tt('tickets.status','Statut')}</div><div>${escapeHtml(ticketStatusLabel(data.status))}</div></div>
    </div>
    <div>
      <div class="small text-muted mb-2">${tt('tickets.description','Description')}</div>
      <div class="ticket-rich-content">${data.description || ''}</div>
    </div>
  `;

  if (canAdmin(ctx.role)) {
    adminForm.classList.remove('d-none');
    userHint.textContent = tt('tickets.visibility_hint_admin','Les admins gèrent les tickets créés par les utilisateurs.');
    adminForm.status.value = data.status || 'open';
    adminForm.priority.value = data.priority || 'medium';
  } else {
    adminForm.classList.add('d-none');
    userHint.textContent = tt('tickets.visibility_hint_user','Seuls toi et les admins voyez ce ticket.');
  }

  const comments = await fetchTicketComments(ticketId);
  renderTicketComments(commentsHost, comments, ctx.role);
}

bindFormSubmit('ticket-comment-form', async () => {
  await commentEditor?.ready;
  const input = document.getElementById('ticket-comment-input');
  const body = commentEditor?.getHTML?.() || input.value;
  if (!stripHtml(body)) return;
  const { error } = await supabase.from('support_ticket_comments').insert({
    ticket_id: ticketId,
    author_profile_id: ctx.user.id,
    body
  });
  if (error) throw error;
  try {
    if (canAdmin(ctx.role)) {
      await notifyTicketOwnerComment({ ticketId, ownerProfileId: currentTicket?.created_by_profile_id, title: currentTicket?.title });
    } else {
      await notifyAdminsTicketComment({ ticketId, title: currentTicket?.title });
    }
  } catch (e) { console.warn(e); }
  input.value = '';
  commentEditor?.clear?.();
  showAlert(tt('tickets.comment_sent','Commentaire envoyé.'));
  await loadTicket();
});

bindFormSubmit('ticket-admin-form', async fd => {
  if (!canAdmin(ctx.role)) return;
  const payload = Object.fromEntries(fd.entries());
  const { error } = await supabase.from('support_tickets').update({
    status: payload.status,
    priority: payload.priority
  }).eq('id', ticketId);
  if (error) throw error;
  try {
    await notifyTicketOwnerUpdated({ ticketId, ownerProfileId: currentTicket?.created_by_profile_id, title: currentTicket?.title });
  } catch (e) { console.warn(e); }
  showAlert(tt('tickets.ticket_updated','Ticket mis à jour.'));
  await loadTicket();
});

await loadTicket();
document.addEventListener('app:language-changed', () => location.reload());
