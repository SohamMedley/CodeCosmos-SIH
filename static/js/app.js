/* Code Cosmos — same-origin, dependency-free interface. No key ever reaches the browser. */
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const percent = (value) => `${Math.round(Number(value || 0) * 100)}%`;
  const number = (value) => Number(value || 0).toLocaleString('en-IN');
  const pages = {
    overview: ['OVERVIEW', 'A single source of material truth.'],
    harmonize: ['HARMONIZE', 'Bring your records into focus.'],
    review: ['REVIEW QUEUE', 'Evidence first. Expert decision always.'],
    master: ['MATERIAL MASTER', 'Validated knowledge, ready to reuse.'],
    lab: ['INTELLIGENCE LAB', 'Compare descriptions in real time.'],
    method: ['HOW IT WORKS', 'An end-to-end path to trustworthy data.'],
    settings: ['INTEGRATION', 'A transparent look under the hood.'],
  };
  const labels = {
    family: 'Family', bearing_code: 'Bearing code', bearing_seal: 'Seal / shield', bearing_clearance: 'Clearance',
    thread_mm: 'Thread', length_mm: 'Length', grade: 'Grade', material: 'Material',
    dn: 'Nominal Ø', pn: 'Pressure', schedule: 'Schedule',
    area_mm2: 'Area', cores: 'Cores', manufacturer: 'Maker',
  };
  const specOrder = Object.keys(labels);
  const state = {
    data: {records: [], candidates: [], references: [], stats: {}, integration: {}, activity: []},
    page: 'overview', reviewFilter: 'pending', selectedCandidateId: null,
    recordPage: 1, masterTab: 'validated', materialFile: null, referenceFile: null,
    aiChoiceInitialized: false, busy: false,
  };

  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(path, {cache: 'no-store', ...options});
    } catch (_) {
      throw new Error('The server is unreachable. Please try again.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }
  function json(body) { return {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}; }
  function toast(message, type = 'success') {
    const element = document.createElement('div');
    element.className = `toast ${type}`;
    element.innerHTML = `${icon(type === 'error' ? 'alert' : type === 'warning' ? 'info' : 'check')}<span>${esc(message)}</span>`;
    $('#toastRegion').append(element);
    setTimeout(() => element.remove(), 5400);
  }
  function buttonBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    button.classList.toggle('is-loading', busy);
  }
  function showConfirm(title, text, actionLabel = 'Continue') {
    return new Promise((resolve) => {
      const backdrop = $('#confirmBackdrop');
      $('#confirmTitle').textContent = title;
      $('#confirmText').textContent = text;
      $('#confirmProceed').textContent = actionLabel;
      backdrop.hidden = false;
      $('#confirmCancel').focus();
      const finish = (result) => {
        backdrop.hidden = true;
        $('#confirmProceed').removeEventListener('click', accept);
        $('#confirmCancel').removeEventListener('click', cancel);
        backdrop.removeEventListener('click', outside);
        document.removeEventListener('keydown', escapeKey);
        resolve(result);
      };
      const accept = () => finish(true);
      const cancel = () => finish(false);
      const outside = (event) => { if (event.target === backdrop) finish(false); };
      const escapeKey = (event) => { if (event.key === 'Escape') finish(false); };
      $('#confirmProceed').addEventListener('click', accept);
      $('#confirmCancel').addEventListener('click', cancel);
      backdrop.addEventListener('click', outside);
      document.addEventListener('keydown', escapeKey);
    });
  }
  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#sidebarScrim').hidden = true;
  }
  function showPage(page, candidateId = null, push = true) {
    if (!pages[page]) page = 'overview';
    if (candidateId !== null) {
      $('#reviewSearch').value = '';
      state.selectedCandidateId = Number(candidateId);
      const candidate = state.data.candidates.find((item) => item.id === state.selectedCandidateId);
      if (candidate && candidate.status !== 'pending') state.reviewFilter = 'all';
      if (page === 'review') renderReview();
    }
    state.page = page;
    $$('[data-page]').forEach((section) => {
      const visible = section.dataset.page === page;
      section.hidden = !visible;
      section.classList.toggle('is-active', visible);
    });
    $$('[data-nav]').forEach((button) => button.classList.toggle('is-active', button.dataset.nav === page && button.classList.contains('nav-item')));
    $('#breadcrumbPage').textContent = pages[page][0];
    $('#topbarSubtitle').textContent = pages[page][1];
    if (push && location.hash !== `#${page}`) history.pushState({page}, '', `#${page}`);
    closeSidebar();
    window.scrollTo({top: 0, behavior: 'smooth'});
  }
  async function refresh() {
    state.data = await api('/api/state');
    if (!state.aiChoiceInitialized) {
      const configured = state.data.integration.configured;
      $('#workspaceUseAi').checked = configured;
      $('#labUseAi').checked = configured;
      state.aiChoiceInitialized = true;
    }
    renderAll();
  }
  function renderAll() {
    const {stats, integration} = state.data;
    $('#queueBadge').textContent = number(stats.pending);
    $('#metricRecords').textContent = number(stats.records);
    $('#metricCandidates').textContent = number(stats.candidates);
    $('#metricPending').textContent = number(stats.pending);
    $('#metricApproved').textContent = number(stats.approved);
    $('#metricSources').textContent = number(stats.sources?.length);
    $('#metricMapped').textContent = number(stats.mapped);
    $('#integrationLabel').textContent = integration.configured ? 'Groq connected' : 'Local engine';
    $('#integrationPill').classList.toggle('connected', integration.configured);
    $('#settingsAiBadge').textContent = integration.configured ? 'CONNECTED' : 'LOCAL MODE';
    $('#settingsAiBadge').classList.toggle('connected', integration.configured);
    $('#settingsModel').textContent = integration.model || '—';
    $('#settingsKeyStatus').textContent = integration.configured ? 'Configured on server' : 'Not configured';
    const run = stats.last_run;
    const runText = run ? `Last run: ${number(run.candidates)} candidates · ${number(run.ai_enriched)} Groq-enriched pairs · ${esc(run.mode === 'demo' ? 'demo / local' : run.mode.replace('_', ' '))}` : 'No analysis run yet.';
    $('#runSummary').innerHTML = runText;
    renderOverview();
    renderRecords();
    renderReview();
    renderMaster();
  }
  function renderOverview() {
    const candidates = state.data.candidates.filter((item) => item.status !== 'rejected').sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.score - a.score);
    const top = candidates.slice(0, 4);
    $('#overviewMatches').innerHTML = top.length ? top.map((pair) => `
      <div class="overview-match-row" role="button" tabindex="0" data-open-candidate="${pair.id}" aria-label="Review match between ${esc(pair.left.description)} and ${esc(pair.right.description)}">
        <div class="match-pair"><span><small>${esc(pair.left.source)}</small>${esc(pair.left.description)}</span><span><small>${esc(pair.right.source)}</small>${esc(pair.right.description)}</span></div>
        <div class="match-score ${pair.tier === 'review' ? 'review' : ''}">${percent(pair.score)}<small>${pair.status === 'pending' ? (pair.tier === 'fast_track' ? 'FAST-TRACK' : 'REVIEW') : pair.status.toUpperCase()}</small></div>
        ${icon('arrow-up')}
      </div>`).join('') : `<div class="empty-state">${icon('merge')}<strong>No candidates yet</strong><p>Import records or run an analysis to build a shortlist.</p></div>`;
    const strongest = candidates[0];
    $('#topScore').textContent = strongest ? percent(strongest.score) : '—';
    $('#topScoreDial').style.setProperty('--score', strongest ? Math.round(strongest.score * 100) : 0);
    const names = [['vector', 'Normalized vector'], ['fuzzy', 'Fuzzy similarity'], ['technical', 'Technical fit']];
    const focus = candidates.slice(0, 5);
    $('#signalBars').innerHTML = names.map(([key, label]) => {
      const value = focus.length ? focus.reduce((sum, item) => sum + Number(item.signals[key] || 0), 0) / focus.length : 0;
      return `<div class="signal-mini-row"><span>${label}</span><div><i style="width:${Math.round(value * 100)}%"></i></div><b>${focus.length ? percent(value) : '—'}</b></div>`;
    }).join('');
  }
  function shortAttrs(attrs) {
    return specOrder.filter((key) => key !== 'manufacturer' && attrs?.[key] !== undefined).slice(0, 4).map((key) => `<span>${esc(labels[key])}: ${esc(displayAttr(key, attrs[key]))}</span>`).join('') || '<span class="no-attrs">No explicit specs detected</span>';
  }
  function displayAttr(key, value) {
    if (key === 'thread_mm' || key === 'length_mm') return `${value} mm`;
    if (key === 'area_mm2') return `${value} mm²`;
    if (key === 'dn') return `DN ${value}`;
    if (key === 'pn') return `PN ${value}`;
    return String(value);
  }
  function renderRecords() {
    const {records, stats} = state.data;
    const source = $('#sourceFilter');
    const previous = source.value;
    source.innerHTML = `<option value="">All sources</option>${(stats.sources || []).map((s) => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('')}`;
    if ([...source.options].some((option) => option.value === previous)) source.value = previous;
    const query = $('#recordSearch').value.toLowerCase().trim();
    const filtered = records.filter((item) => (!source.value || item.source === source.value) && (!query || `${item.description} ${item.source} ${item.external_id} ${item.normalized}`.toLowerCase().includes(query)));
    const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
    state.recordPage = Math.min(state.recordPage, pageCount);
    const shown = filtered.slice((state.recordPage - 1) * 12, state.recordPage * 12);
    $('#recordsBody').innerHTML = shown.length ? shown.map((item) => `<tr><td class="record-description">${esc(item.description)}</td><td class="record-source">${esc(item.source)}<small>${esc(item.external_id || '—')}</small></td><td><div class="attribute-pills">${shortAttrs(item.attributes)}</div></td><td><span class="status-ready">Parsed</span></td></tr>`).join('') : '<tr><td colspan="4" class="table-empty">No records match this view.</td></tr>';
    $('#recordsCountTag').textContent = `${number(stats.records)} records`;
    $('#recordsShown').textContent = filtered.length ? `Showing ${(state.recordPage - 1) * 12 + 1}–${Math.min(filtered.length, state.recordPage * 12)} of ${number(filtered.length)} records` : 'No records';
    $('#recordsPageLabel').textContent = `${state.recordPage} / ${pageCount}`;
    $('#recordsPrev').disabled = state.recordPage === 1;
    $('#recordsNext').disabled = state.recordPage === pageCount;
  }
  function visibleCandidates() {
    const query = $('#reviewSearch').value.toLowerCase().trim();
    return state.data.candidates.filter((pair) => (state.reviewFilter === 'all' || pair.status === state.reviewFilter) && (!query || `${pair.left.description} ${pair.right.description} ${pair.left.source} ${pair.right.source} ${pair.suggested_code || ''}`.toLowerCase().includes(query)));
  }
  function renderReview() {
    const {candidates, stats} = state.data;
    $('#reviewFastCount').textContent = number(candidates.filter((pair) => pair.status === 'pending' && pair.tier === 'fast_track').length);
    $('#reviewPendingCount').textContent = number(stats.pending);
    $('#reviewDoneCount').textContent = number((stats.approved || 0) + (stats.rejected || 0));
    $$('[data-filter]').forEach((button) => button.classList.toggle('is-active', button.dataset.filter === state.reviewFilter));
    const visible = visibleCandidates();
    $('#queueCount').textContent = number(visible.length);
    if (!visible.some((pair) => pair.id === state.selectedCandidateId)) state.selectedCandidateId = visible[0]?.id || null;
    const container = $('#reviewList');
    const scroll = container.scrollTop;
    container.innerHTML = visible.length ? visible.map((pair) => `
      <button class="queue-item ${state.selectedCandidateId === pair.id ? 'is-selected' : ''}" data-candidate="${pair.id}" aria-label="Inspect ${esc(pair.left.description)} and ${esc(pair.right.description)}">
        <span class="queue-item-content"><span class="queue-item-meta">${esc(pair.left.source)} <b>/</b> ${esc(pair.right.source)} <span class="mini-status ${pair.status === 'pending' ? pair.tier === 'review' ? 'review' : '' : pair.status}">${pair.status !== 'pending' ? pair.status.toUpperCase() : pair.tier === 'fast_track' ? 'FAST-TRACK' : 'REVIEW'}</span></span><strong>${esc(pair.left.description)}</strong><span class="queue-second">${esc(pair.right.description)}</span></span>
        <span class="queue-item-score ${pair.tier === 'review' ? 'review-score' : ''}">${percent(pair.score)}<small>MATCH SCORE</small></span>
      </button>`).join('') : `<div class="empty-state">${icon('check')}<strong>${state.reviewFilter === 'pending' ? 'All caught up' : 'No matches here'}</strong><p>${state.reviewFilter === 'pending' ? 'Your review queue is empty. Explore approved links or analyze more records.' : 'Try another filter or search term.'}</p></div>`;
    container.scrollTop = scroll;
    renderDetail();
  }
  function specMatrix(a, b) {
    const keys = specOrder.filter((key) => a?.[key] !== undefined || b?.[key] !== undefined);
    if (!keys.length) return '<div class="loading-placeholder">No explicit attributes were found.</div>';
    return `<div class="spec-table">${keys.map((key) => {
      const av = a?.[key], bv = b?.[key];
      const same = av !== undefined && bv !== undefined && String(av) === String(bv);
      return `<div class="spec-row"><span>${esc(labels[key])}</span><span class="${av === undefined ? 'unknown' : ''}">${av === undefined ? 'Not stated' : esc(displayAttr(key, av))}</span><span class="${bv === undefined ? 'unknown' : ''}">${bv === undefined ? 'Not stated' : esc(displayAttr(key, bv))}</span><i class="${same ? '' : 'missing'}">${same ? icon('check') : '—'}</i></div>`;
    }).join('')}</div>`;
  }
  function signalRows(signals) {
    return [['vector', 'Local vector'], ['fuzzy', 'Fuzzy text'], ['technical', 'Technical fit'], ...(signals.groq !== null && signals.groq !== undefined ? [['groq', 'Groq opinion']] : [])].map(([key, title]) => `<div class="detail-signal"><span>${title}</span><div><i style="width:${Math.round(Number(signals[key] || 0) * 100)}%"></i></div><b>${percent(signals[key])}</b></div>`).join('');
  }
  function renderDetail() {
    const pair = state.data.candidates.find((item) => item.id === state.selectedCandidateId);
    if (!pair) {
      $('#reviewDetail').innerHTML = `<div class="empty-detail">${icon('merge')}<h3>Select a candidate</h3><p>Its supporting evidence will appear here.</p></div>`;
      return;
    }
    const refs = state.data.references.filter((ref) => !pair.left.attributes.family || !ref.attributes.family || ref.attributes.family === pair.left.attributes.family);
    const currentCode = pair.mapping_code || pair.suggested_code || '';
    const choices = refs.map((ref) => `<option value="${esc(ref.code)}" ${ref.code === currentCode ? 'selected' : ''}>${esc(ref.code)}${ref.is_demo ? ' · illustrative' : ''} — ${esc(ref.description)}</option>`).join('');
    const reviewed = pair.status === 'pending' ? '' : `<div class="reviewed-banner ${pair.status === 'rejected' ? 'rejected' : ''}">${icon(pair.status === 'approved' ? 'check' : 'close')} ${pair.status === 'approved' ? 'Approved by a reviewer' : 'Rejected by a reviewer'}${pair.reviewed_at ? ` · ${esc(pair.reviewed_at)} UTC` : ''}${pair.mapping_code ? ` · ${esc(pair.mapping_code)}` : ''}</div>`;
    $('#reviewDetail').innerHTML = `
      <div class="detail-top"><div><div class="section-kicker">EVIDENCE INSPECTOR / #${pair.id}</div><h3>Are these the same material?</h3><p>${pair.engine === 'groq_assisted' ? 'Groq-assisted reasoning + deterministic safety checks' : 'Local matching · no external model used for this pair'}</p></div><div class="detail-score ${pair.tier === 'review' ? 'review-score' : ''}"><strong>${percent(pair.score)}</strong><small>MATCH SCORE</small></div></div>
      ${reviewed}
      <div class="detail-pair"><div class="detail-material"><small>A / ${esc(pair.left.source)} · ${esc(pair.left.external_id || 'NO ID')}</small><strong>${esc(pair.left.description)}</strong><span>${esc(pair.left.normalized)}</span></div><span class="detail-vs">VS</span><div class="detail-material"><small>B / ${esc(pair.right.source)} · ${esc(pair.right.external_id || 'NO ID')}</small><strong>${esc(pair.right.description)}</strong><span>${esc(pair.right.normalized)}</span></div></div>
      <div class="detail-section-title">Extracted technical attributes <small>A / B</small></div>${specMatrix(pair.left.attributes, pair.right.attributes)}
      <div class="detail-section-title">Match signals <small>HEURISTIC, NOT A PROBABILITY</small></div>${signalRows(pair.signals)}
      <div class="detail-section-title">Supporting evidence <small>${pair.matched.length} SHARED FACTS</small></div><div class="evidence-list">${pair.matched.map((item) => `<span class="evidence-chip">${icon('check')}${esc(item)}</span>`).join('') || '<span class="evidence-chip warning-chip">Limited shared specification evidence</span>'}${pair.warnings.map((item) => `<span class="evidence-chip warning-chip">${icon('alert')}${esc(item)}</span>`).join('')}</div>
      ${pair.ai_reason ? `<div class="ai-reason"><strong>Groq's second opinion:</strong> ${esc(pair.ai_reason)}</div>` : ''}
      <div class="decision-box"><strong>The decision is yours.</strong><p>Choose a trusted reference code if appropriate. Approving without one keeps the link validated but unmapped.</p><label for="mappingSelect">REFERENCE CODE ${pair.suggested_code ? '· RECOMMENDED: ' + esc(pair.suggested_code) : '· NONE SUGGESTED'}</label><select id="mappingSelect" class="mapping-select"><option value="" ${!currentCode ? 'selected' : ''}>No code yet · validate link only</option>${choices}</select><label for="reviewNote">REVIEW NOTE / OPTIONAL</label><textarea id="reviewNote" maxlength="500" placeholder="Why do these materials belong together?">${esc(pair.reviewer_note || '')}</textarea><div class="decision-actions"><button class="btn btn-outline" data-decision="rejected" data-id="${pair.id}">${icon('close')} Reject</button><button class="btn btn-primary" data-decision="approved" data-id="${pair.id}">${icon('check')} ${pair.status === 'approved' ? 'Update approval' : 'Approve match'}</button></div><small class="decision-footnote">${refs.some((ref) => ref.is_demo) ? 'DEMO codes are illustrative placeholders, not official CNMC codes. ' : ''}All decisions are written to the audit trail.</small></div>`;
  }
  function renderMaster() {
    const {candidates, references, stats} = state.data;
    $('#masterApproved').textContent = number(stats.approved);
    $('#masterMapped').textContent = number(stats.mapped);
    $('#masterRefs').textContent = number(stats.references);
    $('#referenceCount').textContent = `${number(references.length)} codes`;
    $$('[data-master-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.masterTab === state.masterTab));
    $('#validatedView').hidden = state.masterTab !== 'validated';
    $('#referenceView').hidden = state.masterTab !== 'references';
    const approved = candidates.filter((item) => item.status === 'approved');
    $('#validatedCount').textContent = `${number(approved.length)} validated`;
    $('#validatedList').innerHTML = approved.length ? approved.map((pair) => {
      const ref = references.find((item) => item.code === pair.mapping_code);
      return `<div class="validated-row"><div><strong>${esc(pair.left.description)}</strong><small>vs. ${esc(pair.right.description)} · ${esc(pair.left.source)} / ${esc(pair.right.source)}</small></div><span class="${pair.mapping_code ? '' : 'unmapped'}" title="${ref?.is_demo ? 'Illustrative code, not official CNMC' : ''}">${esc(pair.mapping_code || 'NOT MAPPED')}${ref?.is_demo ? ' *' : ''}</span><div class="validated-score">${percent(pair.score)}</div><button data-open-candidate="${pair.id}">View / edit</button></div>`;
    }).join('') + (approved.some((item) => references.find((ref) => ref.code === item.mapping_code)?.is_demo) ? '<div class="signal-footnote">* Illustrative demonstration code; not an official CNMC identifier.</div>' : '') : `<div class="empty-state">${icon('database')}<strong>Your validated master starts here.</strong><p>Approve a candidate in the review queue to add the first trusted link.</p><button class="btn btn-outline btn-sm" data-nav="review">Go to review queue ${icon('arrow')}</button></div>`;
    $('#referenceList').innerHTML = references.length ? references.map((ref) => `<div class="reference-row"><div><strong>${esc(ref.code)}</strong><span>${esc(ref.description)}</span></div><span class="demo-pill ${ref.is_demo ? '' : 'real'}">${ref.is_demo ? 'DEMO ONLY' : 'IMPORTED'}</span></div>`).join('') : `<div class="empty-state">${icon('database')}<strong>No codes imported</strong><p>Import a reference CSV to enable code suggestions.</p></div>`;
  }
  function renderCompare(result) {
    const blocked = result.conflicts.length > 0;
    const title = blocked ? 'A technical conflict blocks this match.' : result.eligible ? result.tier === 'fast_track' ? 'Strong candidate. Human review next.' : 'Possible match. Review the gaps.' : 'Not enough evidence to recommend a match.';
    const subtitle = blocked ? 'Similar wording cannot override a different engineering specification.' : 'This score is an explainable similarity ranking, not a calibrated probability.';
    const ref = result.reference;
    const lines = result.conflicts.map((item) => `<div class="blocker-item">${icon('alert')}${esc(item)}</div>`).join('');
    const evidence = [...result.matched.map((item) => `<span class="evidence-chip">${icon('check')}${esc(item)}</span>`), ...result.warnings.map((item) => `<span class="evidence-chip warning-chip">${icon('alert')}${esc(item)}</span>`)].join('');
    const attributes = (side) => Object.entries(result.attributes[side]).map(([key, value]) => `<span class="evidence-chip">${esc(labels[key] || key)}: ${esc(displayAttr(key, value))}</span>`).join('') || '<span class="evidence-chip warning-chip">No explicit attributes detected</span>';
    $('#compareResult').className = 'panel lab-result';
    $('#compareResult').innerHTML = `<div class="lab-result-head"><div class="lab-score-orb ${blocked ? 'blocked' : result.tier === 'review' ? 'review' : ''}"><strong>${percent(result.score)}</strong><small>MATCH SCORE</small></div><div><div class="section-kicker">${blocked ? 'SPECIFICATION GUARDRAIL ACTIVATED' : result.engine === 'groq_assisted' ? 'GROQ + HYBRID ENGINE' : 'LOCAL HYBRID ENGINE'}</div><h3>${title}</h3><p>${subtitle}</p></div></div>
      ${result.warning ? `<div class="reviewed-banner">${icon('info')} ${esc(result.warning)}</div>` : ''}
      ${blocked ? `<div class="lab-evidence"><div class="detail-section-title">Why this match was blocked</div><div class="blocker-list">${lines}</div></div>` : ''}
      <div class="lab-result-grid"><div class="lab-box"><div class="section-kicker">MATERIAL A / NORMALIZED</div><p class="mono">${esc(result.normalized.left)}</p><h4>Extracted attributes</h4><div class="evidence-list">${attributes('left')}</div></div><div class="lab-box"><div class="section-kicker">MATERIAL B / NORMALIZED</div><p class="mono">${esc(result.normalized.right)}</p><h4>Extracted attributes</h4><div class="evidence-list">${attributes('right')}</div></div></div>
      <div class="lab-evidence"><div class="detail-section-title">Signal breakdown <small>0–100 SCALE</small></div>${signalRows(result.signals)}</div>
      ${evidence ? `<div class="lab-evidence"><div class="detail-section-title">What the engine noticed</div><div class="evidence-list">${evidence}</div></div>` : ''}
      ${result.ai_reason ? `<div class="ai-reason"><strong>Groq's second opinion:</strong> ${esc(result.ai_reason)}</div>` : ''}
      ${ref ? `<div class="lab-reference">Possible reference: <b>${esc(ref.code)}</b>${ref.is_demo ? ' · illustrative code, not official CNMC' : ' · imported catalog'}. A reviewer must confirm this link.</div>` : ''}`;
    $('#compareResult').scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }
  async function runAnalysis(button) {
    if (state.busy) return;
    state.busy = true;
    buttonBusy(button, true);
    try {
      const result = await api('/api/analysis/run', json({use_ai: $('#workspaceUseAi').checked}));
      await refresh();
      toast(`${number(result.run.candidates)} candidates found · ${number(result.run.ai_enriched)} Groq-enriched`);
      if (result.run.warning) toast(result.run.warning, 'warning');
      state.reviewFilter = 'pending';
      state.selectedCandidateId = null;
      renderReview();
      showPage('review');
    } catch (error) { toast(error.message, 'error'); }
    finally { state.busy = false; buttonBusy(button, false); }
  }
  async function review(id, decision, button) {
    if (state.busy) return;
    const mappingCode = $('#mappingSelect')?.value || null;
    const note = $('#reviewNote')?.value || '';
    state.busy = true;
    buttonBusy(button, true);
    try {
      const response = await api(`/api/candidates/${id}/review`, json({decision, mapping_code: mappingCode, note}));
      await refresh();
      toast(response.message);
    } catch (error) { toast(error.message, 'error'); }
    finally { state.busy = false; buttonBusy(button, false); }
  }
  async function compareMaterials() {
    const button = $('#compareButton');
    if (state.busy) return;
    state.busy = true;
    buttonBusy(button, true);
    try {
      const result = await api('/api/compare', json({left: $('#compareA').value, right: $('#compareB').value, use_ai: $('#labUseAi').checked}));
      renderCompare(result);
      if (result.warning) toast(result.warning, 'warning');
    } catch (error) { toast(error.message, 'error'); }
    finally { state.busy = false; buttonBusy(button, false); }
  }
  function setMaterialFile(file) {
    state.materialFile = file || null;
    $('#selectedMaterialFile').textContent = file ? file.name : 'UTF-8 CSV · MAX 2 MB · UP TO 1,000 ROWS';
    $('#materialDrop').classList.toggle('selected', !!file);
    $('#importMaterials').disabled = !file;
  }
  function setReferenceFile(file) {
    state.referenceFile = file || null;
    $('#selectedReferenceFile').textContent = file ? file.name : 'Choose a reference CSV';
    $('#importReferences').disabled = !file;
  }
  function updateImportMode() {
    const append = $('#importMode').value === 'append';
    $('#importButtonLabel').textContent = append ? 'Import & add records' : 'Import & replace workspace';
    $('#importModeHelp').innerHTML = append
      ? 'Columns: <code>description</code> required; <code>source</code> and <code>external_id</code> optional. Adding retains validated links and code assignments. Total workspace limit: 1,000 records.'
      : 'Columns: <code>description</code> required; <code>source</code> and <code>external_id</code> optional. Replace clears review decisions but keeps the reference library.';
  }
  async function importMaterials() {
    if (!state.materialFile || state.busy) return;
    const mode = $('#importMode').value;
    const confirmed = mode === 'append' || await showConfirm('Replace your workspace?', 'Importing will replace current material records, candidate matches and review decisions. Your reference library will stay.', 'Import records');
    if (!confirmed) return;
    const button = $('#importMaterials'); state.busy = true; buttonBusy(button, true);
    const form = new FormData(); form.append('file', state.materialFile); form.append('mode', mode);
    try {
      const response = await api('/api/import/records', {method: 'POST', body: form});
      setMaterialFile(null); $('#materialFile').value = '';
      state.recordPage = 1;
      $('#importMode').value = 'append'; updateImportMode();
      await refresh();
      toast(response.message);
      if (response.run?.warning) toast(response.run.warning, 'warning');
    } catch (error) { toast(error.message, 'error'); }
    finally { state.busy = false; buttonBusy(button, false); button.disabled = !state.materialFile; }
  }
  async function importReferences() {
    if (!state.referenceFile || state.busy) return;
    const confirmed = await showConfirm('Replace reference codes?', 'This clears current code assignments, but keeps your approved/rejected match decisions. Import only a catalog you are authorized to use.', 'Replace codes');
    if (!confirmed) return;
    const button = $('#importReferences'); state.busy = true; buttonBusy(button, true);
    const form = new FormData(); form.append('file', state.referenceFile); form.append('confirm', 'REPLACE_REFERENCES');
    try {
      const response = await api('/api/import/references', {method: 'POST', body: form});
      setReferenceFile(null); $('#referenceFile').value = '';
      await refresh();
      toast(response.message);
    } catch (error) { toast(error.message, 'error'); }
    finally { state.busy = false; buttonBusy(button, false); button.disabled = !state.referenceFile; }
  }
  async function resetDemo() {
    if (state.busy) return;
    const confirmed = await showConfirm('Restore demo workspace?', 'This permanently replaces current records, reference codes and review decisions with the illustrative sample dataset.', 'Restore demo');
    if (!confirmed) return;
    const button = $('#resetDemo'); state.busy = true; buttonBusy(button, true);
    try {
      const response = await api('/api/demo/reset', json({confirm: 'RESET_DEMO'}));
      state.selectedCandidateId = null; state.recordPage = 1;
      $('#recordSearch').value = ''; $('#reviewSearch').value = '';
      $('#importMode').value = 'replace'; updateImportMode();
      await refresh();
      toast(response.message);
    } catch (error) { toast(error.message, 'error'); }
    finally { state.busy = false; buttonBusy(button, false); }
  }
  const examples = {
    equivalent: ['Bearing 6205', '6205 Deep Groove Ball Bearing'],
    different: ['Bearing 6205', 'Bearing 6206'],
    units: ['SS Bolt M10 x 50 mm Grade 8.8', 'Stainless Steel Hex Bolt M10 x 5 cm Gr 8.8'],
    grade: ['SS Bolt M10 x 50 mm Grade 8.8', 'SS Hex Bolt M10 x 50 mm Grade 10.9'],
  };
  function selectExample(key) {
    if (!examples[key]) return;
    [$('#compareA').value, $('#compareB').value] = examples[key];
    $('#compareResult').className = 'lab-result-placeholder';
    $('#compareResult').innerHTML = `<div class="placeholder-orb">${icon('orbit')}</div><strong>Ready to compare.</strong><p>Run the engine to inspect the evidence.</p>`;
  }
  function bindEvents() {
    document.addEventListener('click', (event) => {
      const nav = event.target.closest('[data-nav]');
      if (nav) { showPage(nav.dataset.nav); return; }
      const open = event.target.closest('[data-open-candidate]');
      if (open) { showPage('review', open.dataset.openCandidate); return; }
      const select = event.target.closest('[data-candidate]');
      if (select) { state.selectedCandidateId = Number(select.dataset.candidate); renderReview(); return; }
      const filter = event.target.closest('[data-filter]');
      if (filter) { state.reviewFilter = filter.dataset.filter; state.selectedCandidateId = null; renderReview(); return; }
      const tab = event.target.closest('[data-master-tab]');
      if (tab) { state.masterTab = tab.dataset.masterTab; renderMaster(); return; }
      const example = event.target.closest('[data-example]');
      if (example) { selectExample(example.dataset.example); return; }
      const decision = event.target.closest('[data-decision]');
      if (decision) { review(Number(decision.dataset.id), decision.dataset.decision, decision); return; }
      const analysis = event.target.closest('[data-action="analyze"]');
      if (analysis) { runAnalysis(analysis); return; }
      const guardrail = event.target.closest('[data-action="guardrail"]');
      if (guardrail) { showPage('lab'); selectExample('different'); compareMaterials(); }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.closest('[data-open-candidate]')) event.target.click();
    });
    $('#mobileMenu').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#sidebarScrim').hidden = false; });
    $('#sidebarScrim').addEventListener('click', closeSidebar);
    $('#recordSearch').addEventListener('input', () => { state.recordPage = 1; renderRecords(); });
    $('#sourceFilter').addEventListener('change', () => { state.recordPage = 1; renderRecords(); });
    $('#recordsPrev').addEventListener('click', () => { state.recordPage--; renderRecords(); });
    $('#recordsNext').addEventListener('click', () => { state.recordPage++; renderRecords(); });
    $('#reviewSearch').addEventListener('input', () => { state.selectedCandidateId = null; renderReview(); });
    $('#materialFile').addEventListener('change', (event) => setMaterialFile(event.target.files[0]));
    $('#importMode').addEventListener('change', updateImportMode);
    $('#materialDrop').addEventListener('click', () => $('#materialFile').click());
    $('#materialDrop').addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#materialFile').click(); } });
    for (const eventName of ['dragenter', 'dragover']) $('#materialDrop').addEventListener(eventName, (event) => { event.preventDefault(); $('#materialDrop').classList.add('dragging'); });
    for (const eventName of ['dragleave', 'drop']) $('#materialDrop').addEventListener(eventName, (event) => { event.preventDefault(); $('#materialDrop').classList.remove('dragging'); });
    $('#materialDrop').addEventListener('drop', (event) => setMaterialFile(event.dataTransfer.files[0]));
    $('#importMaterials').addEventListener('click', importMaterials);
    $('#workspaceAnalyze').addEventListener('click', (event) => runAnalysis(event.currentTarget));
    $('#resetDemo').addEventListener('click', resetDemo);
    $('#chooseReference').addEventListener('click', () => $('#referenceFile').click());
    $('#referenceFile').addEventListener('change', (event) => setReferenceFile(event.target.files[0]));
    $('#importReferences').addEventListener('click', importReferences);
    $('#compareButton').addEventListener('click', compareMaterials);
    window.addEventListener('popstate', () => showPage(location.hash.slice(1), null, false));
  }
  bindEvents();
  showPage(location.hash.slice(1) || 'overview', null, false);
  refresh().catch((error) => toast(`Could not load workspace: ${error.message}`, 'error'));
})();
