
import { supabase, escapeHtml, formatDate, personAvatarUrl } from './common.js';
import { getUserContext } from './auth.js';

export async function getPortalContext() {
  const ctx = await getUserContext();
  const profileId = ctx.user?.id;
  if (!profileId || !['coach', 'player'].includes(ctx.role)) {
    return { ...ctx, membership: null, teamId: null, teamName: null };
  }

  if (ctx.role === 'player') {
    const { data, error } = await supabase
      .from('players')
      .select('id, team_id, full_name, jersey_number, primary_position, secondary_position, status, captain_role, age, height_cm, weight_kg, profile_id, teams(name)')
      .eq('profile_id', profileId)
      .maybeSingle();
    if (error) throw error;
    return { ...ctx, membership: data || null, teamId: data?.team_id || null, teamName: data?.teams?.name || null };
  }

  const { data, error } = await supabase
    .from('coaches')
    .select('id, team_id, full_name, role, email, profile_id, teams(name)')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return { ...ctx, membership: data || null, teamId: data?.team_id || null, teamName: data?.teams?.name || null };
}

export async function fetchTeamBundle(teamId) {
  if (!teamId) return { team: null, players: [], coaches: [], tactics: [], sessions: [], matches: [] };
  const [teamRes, playersRes, coachesRes, tacticsRes, sessionsRes, matchesRes] = await Promise.all([
    supabase.from('teams').select('*').eq('id', teamId).maybeSingle(),
    supabase.from('players').select('id,profile_id,full_name,jersey_number,primary_position,status,image_url,captain_role,age,height_cm,weight_kg').eq('team_id', teamId).order('jersey_number', { ascending: true, nullsFirst: false }).order('full_name'),
    supabase.from('coaches').select('id,profile_id,full_name,role,email,image_url').eq('team_id', teamId).order('full_name'),
    supabase.from('tactics').select('id,title,phase,category,formation,status').eq('team_id', teamId).order('title'),
    supabase.from('sessions').select('id,title,session_date,start_time,location').eq('team_id', teamId).order('session_date', { ascending: false }),
    supabase.from('matches').select('id,opponent,match_date,location,competition_type').eq('team_id', teamId).order('match_date', { ascending: false })
  ]);
  for (const res of [teamRes, playersRes, coachesRes, tacticsRes, sessionsRes, matchesRes]) {
    if (res.error) throw res.error;
  }
  return {
    team: teamRes.data,
    players: playersRes.data || [],
    coaches: coachesRes.data || [],
    tactics: tacticsRes.data || [],
    sessions: sessionsRes.data || [],
    matches: matchesRes.data || []
  };
}

export function renderPortalEmpty(target, title, text) {
  if (!target) return;
  target.innerHTML = `<div class="card"><div class="card-body"><h5 class="mb-2">${escapeHtml(title)}</h5><p class="mb-0 text-muted">${escapeHtml(text)}</p></div></div>`;
}

export function roleBadge(role) {
  if (role === 'player') return '<span class="badge bg-label-info">Joueuse</span>';
  if (role === 'coach') return '<span class="badge bg-label-primary">Coach</span>';
  return '<span class="badge bg-label-secondary">Compte</span>';
}

export function tacticChips(tactics = []) {
  if (!tactics.length) return '<span class="text-muted">Aucune tactique</span>';
  return tactics.map(t => `<span class="tag-chip">${escapeHtml(t.title || '')}</span>`).join(' ');
}

export function cardMetric(id, label, value, icon = 'bx-grid-alt') {
  return `<div class="col-md-6 col-xl-3 mb-4"><div class="card"><div class="card-body"><div class="d-flex justify-content-between align-items-center"><div><span class="d-block mb-1">${escapeHtml(label)}</span><div class="metric-value" id="${id}">${escapeHtml(String(value))}</div></div><div class="avatar"><span class="avatar-initial rounded bg-label-primary"><i class="bx ${icon}"></i></span></div></div></div></div></div>`;
}

export function renderSimpleTable(target, headers, rowsHtml, emptyText='Aucune donnée.') {
  if (!target) return;
  target.innerHTML = `<div class="card"><div class="table-responsive text-nowrap"><table class="table align-middle"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rowsHtml || `<tr><td colspan="${headers.length}" class="table-empty">${escapeHtml(emptyText)}</td></tr>`}</tbody></table></div></div>`;
}

export function sessionLabel(item) {
  return `${formatDate(item.session_date)}${item.start_time ? ` · ${escapeHtml(item.start_time.slice(0,5))}` : ''}`;
}


export function normalizePosition(value='') { return String(value || '').trim().toLowerCase(); }
export function matchAssignmentsForPlayer(assignments = [], membership = null) {
  if (!membership) return [];
  const positions = [membership.primary_position, membership.secondary_position].filter(Boolean).map(normalizePosition);
  return assignments.filter(item => positions.includes(normalizePosition(item.position)));
}


export function buildReadState(tactic = {}, readEntry = null) {
  const version = Number(tactic?.version || 1);
  const seenVersion = Number(readEntry?.version_seen || 0);
  if (!readEntry) return { key: 'unseen', label: 'À lire', badge: 'danger', isSeen: false, isOutdated: true };
  if (seenVersion < version) return { key: 'outdated', label: 'À revoir', badge: 'warning', isSeen: true, isOutdated: true };
  return { key: 'seen', label: 'Vu', badge: 'success', isSeen: true, isOutdated: false };
}

export async function markTacticRead(tacticId, profileId, version) {
  if (!tacticId || !profileId) return;
  const { error } = await supabase
    .from('tactic_reads')
    .upsert({
      tactic_id: tacticId,
      profile_id: profileId,
      version_seen: Number(version || 1),
      read_at: new Date().toISOString()
    }, { onConflict: 'tactic_id,profile_id' });
  if (error) throw error;
}
