import { initI18n, t } from './i18n.js';
await initI18n();
import { escapeHtml, formatDate, getQueryParam, setAppTitle, supabase } from './common.js';
setAppTitle('Export Game Plan');
const host = document.getElementById('host');
const id = getQueryParam('id');
const SECTION_LABELS = { standard:t('gp.standard','Standard'), top_plays:t('gp.top_plays','Top plays'), red_zone:t('gp.red_zone','Red zone'), third_down:t('gp.third_down','3rd down'), fourth_down:t('gp.fourth_down','4th down'), two_point:t('gp.two_point','2-point'), special_situation:t('gp.special_situation','Situation spéciale') };
const PRIORITY_LABELS = { normal:t('gp.normal','Normale'), important:t('gp.important','Importante'), urgent:t('gp.urgent','Urgente') };
const sideLabel = s => s==='offense'?'Offense':s==='defense'?'Defense':'Special Teams';
if (!id) { host.innerHTML = `<div>${t('page.match_detail','Match details')}</div>`; throw new Error('missing id'); }
const [{data:match,error:matchErr},{data:rows,error:rowsErr},{data:links,error:linksErr}] = await Promise.all([
  supabase.from('matches').select('*, teams(name)').eq('id', id).single(),
  supabase.from('match_tactics').select('*, tactics(id,title,formation,category,phase)').eq('match_id', id).order('side').order('priority_order'),
  supabase.from('match_tactic_diagrams').select('*').eq('match_id', id)
]);
if (matchErr) throw matchErr; if (rowsErr) throw rowsErr; if (linksErr && !String(linksErr.message||'').includes('relation')) throw linksErr;
const tacticIds = rows.map(r=>r.tactics?.id).filter(Boolean);
let diagrams = [];
if (tacticIds.length) {
  const {data,error} = await supabase.from('tactic_diagrams').select('*').in('tactic_id', tacticIds);
  if (error && !String(error.message||'').includes('relation')) throw error;
  diagrams = data || [];
}
const bySide = { offense:[], defense:[], special_teams:[] };
rows.forEach(r=>{ const side=r.side||'offense'; (bySide[side] ||= []).push(r); });
const counts={offense:bySide.offense.length, defense:bySide.defense.length, special_teams:bySide.special_teams.length};
const noteCard=(title,body)=>`<div class="gp-note-card"><div class="gp-note-title">${title}</div><div class="gp-note-body">${escapeHtml(body || '—')}</div></div>`;
const card = item => {
  const link = links.find(l=>String(l.tactic_id)===String(item.tactic_id));
  const diagram = diagrams.find(d=>String(d.id)===String(link?.diagram_id));
  const section=item.plan_section||'standard'; const importance=item.importance||'normal';
  return `<div class="gp-card">
    <div class="gp-card-top">
      <div>
        <div class="gp-card-title">${escapeHtml(item.tactics?.title || 'Tactique')}</div>
        <div class="meta">${escapeHtml(item.tactics?.formation || '—')} • ${escapeHtml(item.tactics?.category || '—')} • ${escapeHtml(item.tactics?.phase || item.side || '—')}</div>
        <div class="gp-chip-row">
          <span class="gp-chip">${t('gp.section','Section')}: ${escapeHtml(SECTION_LABELS[section] || t('gp.standard','Standard'))}</span>
          <span class="gp-chip priority-${escapeHtml(importance)}">${t('gp.priority','Priorité')}: ${escapeHtml(PRIORITY_LABELS[importance] || t('gp.normal','Normale'))}</span>
          ${diagram?.title ? `<span class="gp-chip">${t('board.diagram','Diagramme')}: ${escapeHtml(diagram.title)}</span>` : ''}
        </div>
      </div>
      <div class="gp-order">#${escapeHtml(item.priority_order || 1)}</div>
    </div>
    <div class="gp-note-inline"><strong>${t('gp.note','Note tactique')}:</strong> ${escapeHtml(item.notes || '—')}</div>
    ${diagram?.image_url ? `<div class="gp-image-wrap"><div class="gp-image-card"><img class="thumb" src="${diagram.image_url}" alt="diagram"></div></div>` : ''}
  </div>`;
};
host.innerHTML = `
  <div class="gp-cover">
    <div class="gp-title">${t('gp.gameplan','Game Plan tactique')}</div>
    <p class="gp-subtitle">${escapeHtml(match.teams?.name || '—')} • ${escapeHtml(match.opponent || 'Match')} • ${formatDate(match.match_date)} • ${escapeHtml(match.location || '—')}</p>
    <div class="gp-summary">
      <div class="gp-stat"><div class="gp-stat-label">${t('nav.tactics','Tactiques')}</div><div class="gp-stat-value">${rows.length}</div></div>
      <div class="gp-stat"><div class="gp-stat-label">Offense</div><div class="gp-stat-value">${counts.offense}</div></div>
      <div class="gp-stat"><div class="gp-stat-label">Defense</div><div class="gp-stat-value">${counts.defense}</div></div>
      <div class="gp-stat"><div class="gp-stat-label">Special Teams</div><div class="gp-stat-value">${counts.special_teams}</div></div>
    </div>
  </div>
  <div class="gp-note-grid">
    ${noteCard(t('gp.general_notes','Notes générales'), match.game_plan_notes)}
    ${noteCard(t('gp.offense_notes','Notes Offense'), match.offense_plan_notes)}
    ${noteCard(t('gp.defense_notes','Notes Defense / ST'), match.defense_plan_notes)}
  </div>
  ${Object.entries(bySide).map(([side,items]) => items.length ? `<div class="section-title">${sideLabel(side)}</div>${items.map(card).join('')}` : '').join('')}
  <div class="page-footer"><span>TactiBoard • ${t('gp.export_pdf','Exporter PDF')}</span><span>${escapeHtml(match.opponent || 'Match')} • ${formatDate(match.match_date)}</span></div>
`;
