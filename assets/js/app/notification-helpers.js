import { supabase } from './common.js';
import { getUserContext } from './auth.js';

function normalizeTeamId(teamId) {
  const n = Number(teamId);
  return Number.isFinite(n) ? n : null;
}

async function fetchProfilesMap(profileIds = []) {
  const unique = [...new Set(profileIds.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const { data, error } = await supabase.from('profiles').select('id,role,full_name,email').in('id', unique);
  if (error) throw error;
  return new Map((data || []).map(item => [String(item.id), item]));
}

export async function getTeamRecipients(teamId, { includePlayers = true, includeCoaches = true, excludeProfileId = null } = {}) {
  const normalizedTeamId = normalizeTeamId(teamId);
  if (!normalizedTeamId) return [];
  const recipients = [];
  const actor = excludeProfileId ? String(excludeProfileId) : null;

  if (includePlayers) {
    const { data, error } = await supabase.from('players').select('profile_id,full_name').eq('team_id', normalizedTeamId).not('profile_id', 'is', null);
    if (error) throw error;
    (data || []).forEach(item => {
      if (String(item.profile_id) === actor) return;
      recipients.push({ profile_id: item.profile_id, audience: 'player', full_name: item.full_name || '' });
    });
  }

  if (includeCoaches) {
    const { data, error } = await supabase.from('coaches').select('profile_id,full_name').eq('team_id', normalizedTeamId).not('profile_id', 'is', null);
    if (error) throw error;
    (data || []).forEach(item => {
      if (String(item.profile_id) === actor) return;
      recipients.push({ profile_id: item.profile_id, audience: 'coach', full_name: item.full_name || '' });
    });
  }

  const profilesMap = await fetchProfilesMap(recipients.map(item => item.profile_id));
  return recipients.map(item => ({
    ...item,
    role: profilesMap.get(String(item.profile_id))?.role || item.audience,
    profile: profilesMap.get(String(item.profile_id)) || null
  }));
}

function buildRoleAwareLink({ audience, links = {} }) {
  return audience === 'player'
    ? (links.player || links.default || null)
    : (links.coach || links.default || null);
}

export async function createNotificationsForRecipients(recipients = [], payloadBuilder) {
  if (!recipients.length) return 0;
  const rows = recipients.map(recipient => {
    const payload = payloadBuilder(recipient);
    return {
      profile_id: recipient.profile_id,
      type: payload.type || 'info',
      title: payload.title,
      body: payload.body,
      link_url: payload.link_url || null
    };
  }).filter(item => item.profile_id && item.title && item.body);
  if (!rows.length) return 0;
  const { error } = await supabase.from('notifications').insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function notifyTeamEvent({ teamId, eventType = 'info', title, body, links = {}, includePlayers = true, includeCoaches = true }) {
  const ctx = await getUserContext();
  const recipients = await getTeamRecipients(teamId, {
    includePlayers,
    includeCoaches,
    excludeProfileId: ctx.user?.id || null
  });
  return createNotificationsForRecipients(recipients, recipient => ({
    type: eventType,
    title,
    body,
    link_url: buildRoleAwareLink({ audience: recipient.audience, links })
  }));
}
