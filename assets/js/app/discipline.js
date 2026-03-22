import { supabase } from './common.js';

export function buildDisciplineStats(rows = []) {
  return rows.reduce((acc, row) => {
    const status = row.attendance_status || 'present';
    if (status === 'present') acc.present += 1;
    if (status === 'absent_excused') acc.excused += 1;
    if (status === 'absent_unexcused') acc.absent += 1;
    acc.late += Number(row.late_minutes || 0);
    return acc;
  }, { present: 0, excused: 0, absent: 0, late: 0 });
}

export function normalizeLateConfig(teamConfig = {}) {
  const thresholdMinutes = Math.max(0, Number(teamConfig?.late_penalty_threshold_minutes || 0));
  const penaltyPoints = Math.max(0, Number(teamConfig?.late_penalty_points || 0));
  return { thresholdMinutes, penaltyPoints };
}

export function computeLatePenaltyState(attendanceRows = [], adjustedMinutes = 0, teamConfig = {}) {
  const totalLateMinutes = attendanceRows.reduce((sum, row) => sum + Math.max(0, Number(row.late_minutes || 0)), 0);
  const normalizedAdjustedMinutes = Math.max(0, Number(adjustedMinutes || 0));
  const effectiveLateMinutes = Math.max(0, totalLateMinutes - normalizedAdjustedMinutes);
  const { thresholdMinutes, penaltyPoints } = normalizeLateConfig(teamConfig);
  const penaltySteps = thresholdMinutes > 0 && penaltyPoints > 0 ? Math.floor(effectiveLateMinutes / thresholdMinutes) : 0;
  const penaltyTotal = penaltySteps > 0 ? -(penaltySteps * penaltyPoints) : 0;
  return {
    totalLateMinutes,
    adjustedMinutes: normalizedAdjustedMinutes,
    effectiveLateMinutes,
    thresholdMinutes,
    penaltyPoints,
    penaltySteps,
    penaltyTotal
  };
}

export async function recalcLatePenaltyForPlayer(playerId, { actorId = null, playerRow = null, attendanceRows = null, teamConfig = null, reason = '' } = {}) {
  if (!playerId) throw new Error('Player id manquant pour le recalcul du retard.');

  let player = playerRow;
  if (!player) {
    const { data, error } = await supabase
      .from('players')
      .select('id,team_id,current_points,late_adjusted_minutes,late_penalty_applied')
      .eq('id', playerId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error('Joueuse introuvable pour le recalcul du retard.');
    player = data;
  }

  let config = teamConfig;
  if (!config) {
    const { data, error } = await supabase
      .from('teams')
      .select('late_penalty_threshold_minutes,late_penalty_points')
      .eq('id', player.team_id || 0)
      .maybeSingle();
    if (error) throw error;
    config = data || {};
  }

  let attendance = attendanceRows;
  if (!attendance) {
    const { data, error } = await supabase
      .from('session_attendance')
      .select('late_minutes')
      .eq('player_id', playerId);
    if (error) throw error;
    attendance = data || [];
  }

  const oldApplied = Number(player.late_penalty_applied || 0);
  const state = computeLatePenaltyState(attendance, player.late_adjusted_minutes || 0, config);
  const newApplied = Number(state.penaltyTotal || 0);
  const diff = newApplied - oldApplied;

  if (diff !== 0 || Number(player.late_penalty_applied || 0) !== newApplied) {
    const nextPoints = Number(player.current_points || 0) + diff;
    const { error: updateError } = await supabase
      .from('players')
      .update({
        current_points: nextPoints,
        late_penalty_applied: newApplied
      })
      .eq('id', playerId);
    if (updateError) throw updateError;

    const historyLabel = reason || (diff < 0 ? 'Pénalité retard cumulée' : 'Ajustement pénalité retard');
    const { error: historyError } = await supabase.from('player_points_history').insert({
      player_id: playerId,
      delta: diff,
      label: historyLabel,
      source_type: 'late_penalty',
      created_by: actorId || null
    });
    if (historyError) throw historyError;
  }

  return {
    playerId,
    diff,
    previousPenaltyApplied: oldApplied,
    newPenaltyApplied: newApplied,
    state
  };
}
