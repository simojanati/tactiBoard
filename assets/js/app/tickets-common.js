
import { escapeHtml, supabase } from './common.js';

const tt = (key, fallback='') => (window.t ? window.t(key, fallback) : fallback || key);

export const TICKET_TYPES = ['bug','support','improvement','update'];
export const TICKET_PRIORITIES = ['low','medium','high','urgent'];
export const TICKET_STATUSES = ['open','in_progress','waiting_user','resolved','closed'];

export function ticketTypeLabel(value='support'){
  return tt(`tickets.type_${value}`, value);
}
export function ticketPriorityLabel(value='medium'){
  return tt(`tickets.priority_${value}`, value);
}
export function ticketStatusLabel(value='open'){
  return tt(`tickets.status_${value}`, value);
}
export function ticketPriorityBadge(value='medium'){
  const map={low:'secondary',medium:'info',high:'warning',urgent:'danger'};
  return map[value] || 'secondary';
}
export function ticketStatusBadge(value='open'){
  const map={open:'primary',in_progress:'warning',waiting_user:'info',resolved:'success',closed:'secondary'};
  return map[value] || 'secondary';
}

export async function fetchTicketComments(ticketId){
  const { data, error } = await supabase
    .from('support_ticket_comments')
    .select('id,ticket_id,author_profile_id,body,created_at,updated_at')
    .eq('ticket_id', ticketId)
    .order('created_at');
  if (error) throw error;
  const profileMap = await fetchProfilesByIds((data || []).map(item => item.author_profile_id));
  return (data || []).map(item => ({
    ...item,
    profiles: profileMap.get(String(item.author_profile_id)) || null
  }));
}


export function renderTicketComments(target, comments=[], currentRole='player'){
  if (!target) return;
  if (!comments.length){
    target.innerHTML = `<div class="text-muted">${tt('tickets.none_comments','Aucun commentaire pour le moment.')}</div>`;
    return;
  }
  target.innerHTML = comments.map(item => {
    const authorRole = item.profiles?.role || '';
    const bubbleClass = authorRole === 'admin' ? 'admin' : 'user';
    const authorName = item.profiles?.full_name || item.profiles?.email || item.author_profile_id;
    return `
      <div class="ticket-thread-card mb-3">
        <div class="ticket-comment-bubble ${bubbleClass} mb-0">
          <div class="ticket-meta">${escapeHtml(authorName)}${authorRole ? ` · ${escapeHtml(authorRole)}` : ''} · ${new Date(item.created_at).toLocaleString()}</div>
          <div class="ticket-rich-content">${item.body || ''}</div>
        </div>
      </div>
    `;
  }).join('');
}



export async function fetchProfilesByIds(profileIds = []) {
  const unique = [...new Set((profileIds || []).filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const { data, error } = await supabase.from('profiles').select('id,full_name,email,role').in('id', unique);
  if (error) throw error;
  return new Map((data || []).map(item => [String(item.id), item]));
}

export async function notifyAdminTicketCreated({ ticketId, title }) {
  const { data: admins, error } = await supabase.from('profiles').select('id').eq('role', 'admin');
  if (error) throw error;
  if (!ticketId || !(admins || []).length) return 0;
  return insertNotificationRows((admins || []).map(admin => ({
    profile_id: admin.id,
    type: 'update',
    title: tt('tickets.notify_admin_title', 'Nouveau ticket support'),
    body: tt('tickets.notify_admin_body', 'Un nouveau ticket “{title}” a été créé.').replace('{title}', title || `#${ticketId}`),
    link_url: `ticket-detail.html?id=${ticketId}`
  })));
}

export async function notifyTicketOwnerUpdated({ ticketId, ownerProfileId, title }) {
  if (!ownerProfileId) return 0;
  return insertNotificationRows([{
    profile_id: ownerProfileId,
    type: 'update',
    title: tt('tickets.notify_user_update_title', 'Ticket mis à jour'),
    body: tt('tickets.notify_user_update_body', 'Ton ticket “{title}” a été mis à jour par un admin.').replace('{title}', title || `#${ticketId}`),
    link_url: `ticket-detail.html?id=${ticketId}`
  }]);
}


async function insertNotificationRows(rows = []) {
  const safeRows = (rows || []).filter(item => item?.profile_id && item?.title && item?.body).map(item => ({
    profile_id: item.profile_id,
    type: item.type || 'update',
    title: item.title,
    body: item.body,
    link_url: item.link_url || null
  }));
  if (!safeRows.length) return 0;
  const { error } = await supabase.from('notifications').insert(safeRows);
  if (error) throw error;
  return safeRows.length;
}

export async function notifyAdminsTicketComment({ ticketId, title }) {
  const { data: admins, error } = await supabase.from('profiles').select('id').eq('role', 'admin');
  if (error) throw error;
  return insertNotificationRows((admins || []).map(admin => ({
    profile_id: admin.id,
    type: 'update',
    title: tt('tickets.notify_admin_comment_title', 'Nouveau commentaire ticket'),
    body: tt('tickets.notify_admin_comment_body', 'Un utilisateur a ajouté un commentaire sur le ticket “{title}”.').replace('{title}', title || `#${ticketId}`),
    link_url: `ticket-detail.html?id=${ticketId}`
  })));
}

export async function notifyTicketOwnerComment({ ticketId, ownerProfileId, title }) {
  if (!ownerProfileId) return 0;
  return insertNotificationRows([{
    profile_id: ownerProfileId,
    type: 'update',
    title: tt('tickets.notify_user_comment_title', 'Réponse sur ton ticket'),
    body: tt('tickets.notify_user_comment_body', 'Un admin a ajouté un commentaire sur ton ticket “{title}”.').replace('{title}', title || `#${ticketId}`),
    link_url: `ticket-detail.html?id=${ticketId}`
  }]);
}
