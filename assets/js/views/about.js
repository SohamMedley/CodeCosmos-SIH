/**
 * Code Cosmos · Team, approach, architecture and disclosure.
 */

import { h, clear, qs, toast, openDrawer, kv, icon } from '../components/ui.js';

/* Placeholder roster — replace the names with the real team before submission.
   The roles are the ones this prototype actually required. */
const TEAM = [
  ['Team Lead', 'Name Surname', 'System architecture, matching strategy, integration'],
  ['Member 2', 'Name Surname', 'Data engineering and the attribute ontology'],
  ['Member 3', 'Name Surname', 'Semantic embeddings and evaluation harness'],
  ['Member 4', 'Name Surname', 'Interface design and human-in-the-loop review'],
  ['Member 5', 'Name Surname', 'CNMC mapping and domain validation'],
  ['Member 6', 'Name Surname', 'Research, documentation and benchmarking']
];

const UNIQUE = [
  ['Semantic intelligence', 'Understands the engineering meaning of a description, not just its keywords.'],
  ['Fuzzy intelligence', 'Survives typos, word-order changes, glued specifications and truncated phrases.'],
  ['Technical-attribute intelligence', 'Reads designation, material, grade, dimensions, pressure class and rating out of free text.'],
  ['Unit-standardized comparison', '50 mm, 5 cm and 1.97 inch become the same number before anything is compared.'],
  ['Confidence-based decisions', 'Every recommendation is quantified, capped on decisive conflicts and fully explained.'],
  ['Human validation', 'Experts remain in the loop exactly where the AI is uncertain.'],
  ['CNMC mapping', 'The pipeline ends in a standardized code and master record, not just a duplicate flag.']
];

const ARCH = [
  ['database', 'Ingestion & normalization', 'Vendor names, part numbers, filler clauses and unicode noise are removed; shorthand is expanded against a CPSE vocabulary.'],
  ['tag', 'Attribute extraction', 'A 25-rule extractor family pulls designation, material, grade, dimension, rating and standard slots out of free text.'],
  ['scale', 'Unit standardization', 'A conversion table covering 12 physical quantities maps every numeric attribute to its SI base unit.'],
  ['semantic', 'Semantic embedding', 'tf-idf concept embeddings (64-d) with material-concept ontology expansion; 2-D PCA projection for the visualization.'],
  ['columns', 'Hybrid matching', 'Blocked candidate generation, then semantic + fuzzy + attribute scoring with decisive-conflict caps.'],
  ['duplicates', 'Clustering', 'Transitive closure over accepted matches produces one canonical item per engineering concept.'],
  ['checkSquare', 'Human validation', 'Only the uncertain band reaches a reviewer; approvals and rejections recompute clusters and metrics instantly.'],
  ['archive', 'CNMC harmonization', 'Deterministic code generation from the validated attribute set: class, type, material, size and variant segments.'],
  ['sparkles', 'Reusable knowledge base', 'Validated mappings persist so future runs start already calibrated against expert decisions.']
];

const BENEFITS = [
  ['Social', 'Expert effort shifts from comparing thousands of rows to reviewing a short, evidence-backed queue.'],
  ['Economic', 'Equivalent materials are found before a new requirement is raised, reducing duplicate procurement.'],
  ['Environmental', 'Better material reuse and less proliferation of near-identical stock items.'],
  ['Technical', 'Scalable, auditable, offline-capable processing that integrates with existing ERP / material-master systems.']
];

const ROADMAP = [
  ['done', 'Working now', ['Full normalization → CNMC pipeline in the browser', 'Hybrid matching with measured P/R/F1', 'Human review queue with audit trail', 'Master export (CSV / JSON)']],
  ['now', 'Next', ['Swap the surrogate encoder for fine-tuned Sentence-BERT', 'Load real CPSE extracts (CSV / ERP export)', 'Persist reviewer decisions across sessions', 'Official CNMC taxonomy file mapping']],
  ['next', 'Pilot', ['REST integration with ERP material-master APIs', 'Role-based review workflows and SLA tracking', 'Incremental learning from expert verdicts', 'Confidence recalibration per material family']],
  ['later', 'Scale', ['Distributed matching for million-row catalogues', 'Multilingual descriptions (Hindi / regional)', 'Bulk change-request generation for the master', 'Cross-CPSE shared material catalogue']]
];

export function initAbout(store) {
  const team = qs('#teamList');
  clear(team);
  TEAM.forEach(([role, name, focus], i) => {
    const initials = name === 'Name Surname' ? String(i + 1).padStart(2, '0') : name.split(' ').map((w) => w[0]).join('');
    team.append(h('li', {},
      h('span', { class: 'av', text: initials }),
      h('span', { class: 'tm-role', text: role }),
      h('b', { text: name }),
      h('small', { text: focus })
    ));
  });

  const unique = qs('#uniqueList');
  clear(unique);
  UNIQUE.forEach(([title, body]) => unique.append(h('div', {}, h('b', { text: `${title} — ` }), body)));

  const arch = qs('#archList');
  clear(arch);
  ARCH.forEach(([ico, title, body]) => arch.append(h('li', {}, h('i', {}, icon(ico, { size: 18 })), h('div', {}, h('b', { text: title }), h('p', { text: body })))));

  const ben = qs('#benefitGrid');
  clear(ben);
  BENEFITS.forEach(([title, body]) => ben.append(h('div', {}, h('b', { text: title }), h('p', { text: body }))));

  const rm = qs('#roadmap');
  clear(rm);
  ROADMAP.forEach(([state, title, items]) => rm.append(h('div', { class: `rm ${state}` },
    h('span', { text: state === 'done' ? 'delivered in this prototype' : state === 'now' ? 'in progress' : state }),
    h('b', { text: title }),
    h('ul', {}, items.map((i) => h('li', { text: i })))
  )));

  qs('#printPitch').addEventListener('click', () => {
    openDrawer('One-page pitch summary', () => [
      h('div', { class: 'dr-block' }, h('h4', { text: 'problem' }),
        h('p', { class: 'small', text: 'Different CPSEs record the same engineering material in different ways. Exact text comparison treats "Bearing 6205", "6205 Deep Groove Ball Bearing", "BALL BEARING, 6205" and "SKF 6205 BEARING" as four different materials.' })),
      h('div', { class: 'dr-block' }, h('h4', { text: 'core idea' }),
        h('p', { class: 'small', text: 'An AI-driven, human-in-the-loop system that converts inconsistent CPSE material records into standardized material knowledge by combining semantic similarity, fuzzy matching, technical-attribute extraction, unit normalization, confidence scoring, expert validation and CNMC code mapping.' })),
      h('div', { class: 'dr-block' }, h('h4', { text: 'pipeline' }),
        h('p', { class: 'small', text: 'Raw data → normalization → attribute extraction → unit standardization → embeddings → hybrid matching → duplicate detection → confidence scoring → AI recommendation / expert validation → validated master → CNMC mapping → reusable knowledge base.' })),
      h('div', { class: 'dr-block' }, h('h4', { text: 'differentiation' }),
        h('p', { class: 'small', text: 'Existing research asks "are these two products similar?". This system answers "are these materials equivalent, what technical attributes define them, what should they map to, and how confident are we?".' })),
      h('div', { class: 'dr-block' }, h('h4', { text: 'impact' }),
        h('p', { class: 'small', text: 'Faster harmonization, fewer duplicate records, improved master-data accuracy, better procurement decisions and a reusable standardized material knowledge base.' })),
      store.metrics ? h('div', { class: 'dr-block' }, h('h4', { text: 'measured on this run' }),
        kv([
          ['Legacy rows', String(store.metrics.records)],
          ['Duplicates collapsed', String(store.metrics.duplicateRecords)],
          ['Precision / Recall / F1', `${(store.metrics.precision * 100).toFixed(1)}% / ${(store.metrics.recall * 100).toFixed(1)}% / ${(store.metrics.f1 * 100).toFixed(1)}%`],
          ['Cluster purity', `${(store.metrics.clusterPurity * 100).toFixed(1)}%`],
          ['Expert effort removed', `${(store.metrics.reviewWorkloadReduction * 100).toFixed(1)}%`],
          ['Evaluation time', `${store.metrics.durationMs.toFixed(0)} ms (fully in-browser)`]
        ])) : null,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', onclick: () => window.print() }, 'Print / save as PDF'))
    ]);
    toast('info', 'One-pager opened', 'Use the print button to save it as a PDF for your submission.');
  });
}
