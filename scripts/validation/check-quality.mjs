#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { project: process.cwd(), mode: 'Auto', init: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project' || a === '-p') {
      args.project = path.resolve(argv[++i] || '.');
    } else if (a === '--mode' || a === '-m') {
      const m = (argv[++i] || 'Auto').toLowerCase();
      args.mode = m === 'preview' ? 'Preview' : m === 'release' ? 'Release' : 'Auto';
    } else if (a === '--init') {
      args.init = true;
    }
  }
  return args;
}

function isPlaceholder(val) {
  if (!val || !val.trim()) return true;
  const v = val.trim();
  return ['-', '—', 'N/A', 'TBD', 'TODO', 'Pending', 'pending', '...'].includes(v);
}

function parseMarkdownTables(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const rows = [];
  let headers = null;
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      headers = null;
      return;
    }
    const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (!cells.length) return;
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return;
    if (!headers) {
      headers = cells;
      return;
    }
    rows.push({ lineNumber: idx + 1, headers, cells });
  });
  return rows;
}

function writeStarterFiles(targetDir) {
  const vibekitDir = path.join(targetDir, '.vibekit');
  fs.mkdirSync(vibekitDir, { recursive: true });

  const checklistPath = path.join(targetDir, 'CHECKLIST.md');
  if (!fs.existsSync(checklistPath)) {
    fs.writeFileSync(
      checklistPath,
      `# Project Requirement Checklist\n\n| ID | Category | Requirement | Priority | Status | Verification | Evidence |\n|---|---|---|---|---|---|---|\n| REQ-01 | Core | Example core user workflow works end-to-end | must | planned | Define test or browser check | Pending implementation |\n`,
      'utf8'
    );
    console.log(`Created starter ${checklistPath}`);
  }

  const qualityPath = path.join(targetDir, 'QUALITY_CASES.md');
  if (!fs.existsSync(qualityPath)) {
    fs.writeFileSync(
      qualityPath,
      `# Quality Verification Cases\n\n| ID | Requirement | Risk | Scenario | Method | Result | Status | Evidence |\n|---|---|---|---|---|---|---|---|\n| QC-01 | REQ-01 | must | Primary user flow completes and persists cleanly | Automated test / Browser | Pending execution | blocked | Starter template created by check-quality.mjs --init |\n`,
      'utf8'
    );
    console.log(`Created starter ${qualityPath}`);
  }

  const statePath = path.join(vibekitDir, 'STATE.md');
  if (!fs.existsSync(statePath)) {
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    fs.writeFileSync(
      statePath,
      `# Project State\n\n- **Project**: ${path.basename(targetDir)}\n- **Objective**: Initialize project tracking\n- **PRD**: PRD.md\n- **Stack**: Pending detection\n- **Workflow Status**: BUILDING\n- **Current Stage**: Stage 0 — Understand\n- **Execution Mode**: AUTO\n- **Preview URL**: None yet\n- **Live URL**: Not deployed\n- **Last Updated**: ${now}\n\n## Completed Requirements\n- None yet.\n\n## Remaining Requirements\n- Inspect PRD and repository manifests; populate CHECKLIST.md.\n\n## Important Decisions\n- Recorded in .vibekit/DECISIONS.md.\n\n## Current Implementation State\n- Initialized starter checklist and verification ledgers.\n\n## Known Bugs\n- None recorded.\n\n## Test Results\n- Not run yet.\n\n## External Blockers\n- None recorded.\n\n## Next Actions\n- Decompose PRD requirements into CHECKLIST.md.\n`,
      'utf8'
    );
    console.log(`Created starter ${statePath}`);
  }
}

function checkLegacy(projectDir) {
  const errors = [];
  const ledger = path.join(projectDir, 'QUALITY_CASES.md');
  const regLedger = path.join(projectDir, 'REGRESSION_RUNS.md');
  const rows = [];

  if (!fs.existsSync(ledger)) {
    errors.push(`Missing ${ledger}`);
  } else {
    const lines = fs.readFileSync(ledger, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      const t = line.trim();
      if (!t.startsWith('|')) return;
      const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      if (cells[0] === 'ID' || cells[0] === '---' || /^:?-+:?$/.test(cells[0])) return;
      if (cells.length !== 10) {
        errors.push(`Line ${i + 1}: expected 10 cells, found ${cells.length}.`);
        return;
      }
      rows.push({
        ID: cells[0],
        Requirement: cells[1],
        Risk: cells[2].toLowerCase(),
        Iteration: cells[3],
        Scenario: cells[4],
        Expected: cells[5],
        Method: cells[6],
        Actual: cells[7],
        Status: cells[8].toLowerCase(),
        Evidence: cells[9]
      });
    });

    if (!rows.length) errors.push('No test cases found in the ten-column Markdown table.');
    const seenIds = new Set();
    const seenScens = new Set();
    for (const r of rows) {
      for (const k of ['ID', 'Requirement', 'Risk', 'Iteration', 'Scenario', 'Expected', 'Method', 'Actual', 'Status', 'Evidence']) {
        if (!r[k] || r[k] === '-') errors.push(`${r.ID}: ${k} is empty.`);
      }
      if (seenIds.has(r.ID)) errors.push(`Duplicate case ID: ${r.ID}`);
      seenIds.add(r.ID);
      const sk = `${r.Requirement}|${r.Scenario}`.toLowerCase().replace(/\s+/g, ' ');
      if (seenScens.has(sk)) errors.push(`Repeated scenario for ${r.Requirement}: ${r.Scenario}`);
      seenScens.add(sk);
      if (!['1', '2', '3', '4'].includes(r.Iteration)) errors.push(`${r.ID}: iteration must be 1-4.`);
      if (!['must', 'high', 'artifact', 'optional'].includes(r.Risk)) errors.push(`${r.ID}: risk must be must, high, artifact, or optional.`);
      if (!['passed', 'failed', 'blocked'].includes(r.Status)) errors.push(`${r.ID}: status must be passed, failed, or blocked.`);
    }

    for (const round of ['1', '2', '3']) {
      const count = rows.filter((r) => r.Iteration === round).length;
      if (count === 0) errors.push(`Iteration ${round} has no new executed cases.`);
      console.log(`Iteration ${round}: ${count} distinct cases recorded`);
    }

    const byReq = new Map();
    for (const r of rows.filter((x) => ['must', 'high', 'artifact'].includes(x.Risk))) {
      if (!byReq.has(r.Requirement)) byReq.set(r.Requirement, []);
      byReq.get(r.Requirement).push(r);
    }
    if (!byReq.size) errors.push('No Must requirements are represented.');
    for (const [reqName, group] of byReq.entries()) {
      const risks = [...new Set(group.map((g) => g.Risk))];
      if (risks.length !== 1) {
        errors.push(`${reqName}: inconsistent risk labels.`);
        continue;
      }
      const risk = risks[0];
      const minCount = risk === 'high' ? 6 : risk === 'must' ? 3 : 1;
      if (group.length < minCount) errors.push(`${reqName}: ${group.length} cases; needs at least ${minCount}.`);
      if (risk !== 'artifact') {
        for (const round of ['1', '2', '3']) {
          if (!group.some((g) => g.Iteration === round)) errors.push(`${reqName}: no new case in iteration ${round}.`);
        }
      }
      for (const g of group) {
        if (g.Status !== 'passed') errors.push(`${g.ID}: Must case is ${g.Status}, not passed.`);
      }
      console.log(`${reqName} (${risk}): ${group.length} distinct cases`);
    }
  }

  const regRows = [];
  if (!fs.existsSync(regLedger)) {
    errors.push(`Missing ${regLedger}`);
  } else {
    const lines = fs.readFileSync(regLedger, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      const t = line.trim();
      if (!t.startsWith('|')) return;
      const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      if (cells[0] === 'Iteration' || cells[0] === '---' || /^:?-+:?$/.test(cells[0])) return;
      if (cells.length !== 7) {
        errors.push(`Regression line ${i + 1}: expected 7 cells, found ${cells.length}.`);
        return;
      }
      regRows.push({
        Iteration: cells[0],
        Suite: cells[1],
        CaseIDs: cells[2],
        Method: cells[3],
        Actual: cells[4],
        Status: cells[5].toLowerCase(),
        Evidence: cells[6]
      });
    });
  }

  const coreRows = regRows.filter((r) => r.Suite === 'CORE');
  if (!coreRows.length) errors.push('No CORE regression runs were recorded.');
  if (coreRows.length) {
    const iter1 = coreRows.find((r) => r.Iteration === '1');
    if (!iter1) {
      errors.push('CORE suite was not established in iteration 1.');
    } else {
      const coreIds = iter1.CaseIDs.split(',').map((s) => s.trim()).filter(Boolean);
      if (coreIds.length !== new Set(coreIds).size) errors.push('CORE case ID list contains duplicates.');
      for (const id of coreIds) {
        const matches = rows.filter((r) => r.ID === id);
        if (matches.length !== 1) errors.push(`CORE case ID ${id} is missing or duplicated in QUALITY_CASES.md.`);
        else if (matches[0].Iteration !== '1') errors.push(`CORE case ID ${id} was not established in iteration 1.`);
      }
      const expected = [...coreIds].sort().join(',');
      for (const cr of coreRows) {
        const actual = cr.CaseIDs.split(',').map((s) => s.trim()).filter(Boolean).sort().join(',');
        if (actual !== expected) errors.push(`CORE case IDs changed in iteration ${cr.Iteration}.`);
        if (!['passed', 'failed', 'blocked'].includes(cr.Status)) errors.push(`CORE iteration ${cr.Iteration}: invalid status.`);
      }
      const rounds = ['1', '2', '3'];
      if (rows.some((r) => r.Iteration === '4')) rounds.push('4');
      const seenEv = new Set();
      for (const round of rounds) {
        const runs = coreRows.filter((r) => r.Iteration === round);
        if (!runs.length) {
          errors.push(`CORE suite was not rerun in iteration ${round}.`);
          continue;
        }
        const last = runs[runs.length - 1];
        if (last.Status !== 'passed') errors.push(`CORE iteration ${round} ended ${last.Status}, not passed.`);
        if (seenEv.has(last.Evidence)) errors.push(`CORE iteration ${round} reused an earlier evidence reference.`);
        seenEv.add(last.Evidence);
        console.log(`CORE iteration ${round}: ${last.Status} (${coreIds.length} same cases)`);
      }
    }
  }

  if (errors.length) {
    console.log('QUALITY GATE (LEGACY): NOT READY');
    errors.forEach((e) => console.log(`- ${e}`));
    process.exit(1);
  }
  console.log(`QUALITY GATE (LEGACY): READY (${rows.length} distinct executed cases plus repeated CORE checks)`);
  process.exit(0);
}

const args = parseArgs(process.argv.slice(2));
if (args.init) {
  writeStarterFiles(args.project);
  process.exit(0);
}

if (!fs.existsSync(args.project)) {
  console.error(`Project path does not exist: ${args.project}`);
  process.exit(1);
}

const qualityPath = path.join(args.project, 'QUALITY_CASES.md');
const checklistPath = path.join(args.project, 'CHECKLIST.md');
const regressionPath = path.join(args.project, 'REGRESSION_RUNS.md');

let useLegacy = fs.existsSync(regressionPath);
if (!useLegacy && fs.existsSync(qualityPath)) {
  const head = fs.readFileSync(qualityPath, 'utf8').split(/\r?\n/).slice(0, 40).join('\n');
  if (/\|\s*Iteration\s*\|/.test(head) && /\|\s*Expected\s*\|/.test(head)) {
    useLegacy = true;
  }
}

if (useLegacy) {
  checkLegacy(args.project);
}

const errors = [];
const checklistItems = [];
const caseRows = [];

if (!fs.existsSync(checklistPath) && !fs.existsSync(qualityPath)) {
  errors.push(`Neither CHECKLIST.md nor QUALITY_CASES.md was found in ${args.project}. Run --init or complete planning first.`);
}

if (fs.existsSync(checklistPath)) {
  for (const row of parseMarkdownTables(checklistPath)) {
    if (row.cells.length < 5) {
      errors.push(`CHECKLIST.md line ${row.lineNumber}: expected at least 5 columns, found ${row.cells.length}.`);
      continue;
    }
    let prio = row.cells[3].toLowerCase();
    if (prio === 'should') prio = 'standard';
    if (prio === 'nice') prio = 'optional';
    const status = row.cells[4].toLowerCase();
    if (!['high', 'must', 'standard', 'artifact', 'optional'].includes(prio)) {
      errors.push(`CHECKLIST.md ${row.cells[0]}: invalid priority '${prio}'.`);
    }
    if (!['planned', 'implementing', 'implemented-unverified', 'verified', 'passed', 'failed', 'blocked'].includes(status)) {
      errors.push(`CHECKLIST.md ${row.cells[0]}: invalid status '${status}'.`);
    }
    checklistItems.push({
      ID: row.cells[0],
      Category: row.cells[1],
      Requirement: row.cells[2],
      Priority: prio,
      Status: status,
      Verification: row.cells[5] || '',
      Evidence: row.cells[6] || ''
    });
  }
}

if (fs.existsSync(qualityPath)) {
  const seenIds = new Set();
  const seenScens = new Set();
  for (const row of parseMarkdownTables(qualityPath)) {
    if (row.cells.length !== 8) {
      errors.push(`QUALITY_CASES.md line ${row.lineNumber}: expected 8 columns, found ${row.cells.length}.`);
      continue;
    }
    const item = {
      ID: row.cells[0],
      Requirement: row.cells[1],
      Risk: row.cells[2].toLowerCase(),
      Scenario: row.cells[3],
      Method: row.cells[4],
      Result: row.cells[5],
      Status: row.cells[6].toLowerCase(),
      Evidence: row.cells[7]
    };
    for (const k of Object.keys(item)) {
      if (isPlaceholder(item[k])) errors.push(`QUALITY_CASES.md ${item.ID}: field '${k}' is empty or placeholder.`);
    }
    if (seenIds.has(item.ID)) errors.push(`QUALITY_CASES.md: duplicate case ID ${item.ID}.`);
    seenIds.add(item.ID);
    const sk = `${item.Requirement}|${item.Scenario}`.toLowerCase().replace(/\s+/g, ' ');
    if (seenScens.has(sk)) errors.push(`QUALITY_CASES.md: duplicate scenario for ${item.Requirement}.`);
    seenScens.add(sk);
    if (!['high', 'must', 'standard', 'artifact', 'optional'].includes(item.Risk)) {
      errors.push(`QUALITY_CASES.md ${item.ID}: invalid risk '${item.Risk}'.`);
    }
    if (!['passed', 'verified', 'failed', 'blocked', 'planned', 'implementing', 'implemented-unverified'].includes(item.Status)) {
      errors.push(`QUALITY_CASES.md ${item.ID}: invalid status '${item.Status}'.`);
    }
    caseRows.push(item);
  }
}

const hasBlockers = caseRows.some((r) => r.Status === 'blocked') || checklistItems.some((r) => r.Status === 'blocked');
const effectiveMode = args.mode === 'Auto' ? (hasBlockers ? 'Preview' : 'Release') : args.mode;
console.log(`Quality Mode: ${effectiveMode} (requested: ${args.mode})`);

for (const req of checklistItems) {
  if (!['high', 'must'].includes(req.Priority)) continue;
  const matches = caseRows.filter((c) => c.Requirement === req.ID || c.Requirement === req.Requirement);
  if (!matches.length) {
    if (!['verified', 'passed'].includes(req.Status) || isPlaceholder(req.Verification) || isPlaceholder(req.Evidence)) {
      errors.push(`Mandatory item ${req.ID} (${req.Priority}) has no case in QUALITY_CASES.md and lacks verified inline evidence.`);
    }
  }
  if (effectiveMode === 'Release') {
    if (!['verified', 'passed'].includes(req.Status)) {
      errors.push(`CHECKLIST.md ${req.ID} (${req.Priority}) has status '${req.Status}'; Release mode requires 'verified' or 'passed'.`);
    }
    if (req.Priority === 'high' && matches.length > 0 && matches.length < 2) {
      errors.push(`High-risk item ${req.ID} has only ${matches.length} case(s); Release mode requires at least 2.`);
    }
  } else {
    if (!['verified', 'passed', 'blocked'].includes(req.Status)) {
      errors.push(`CHECKLIST.md ${req.ID} (${req.Priority}) has status '${req.Status}'; Preview mode requires 'verified', 'passed', or documented 'blocked'.`);
    } else if (req.Status === 'blocked' && isPlaceholder(req.Evidence)) {
      errors.push(`CHECKLIST.md ${req.ID} is marked blocked without blocker explanation.`);
    }
  }
}

const reqGroups = new Map();
for (const c of caseRows.filter((r) => ['high', 'must'].includes(r.Risk))) {
  if (!reqGroups.has(c.Requirement)) reqGroups.set(c.Requirement, []);
  reqGroups.get(c.Requirement).push(c);
}

if (!checklistItems.length && !caseRows.length) {
  errors.push('No verification records found.');
}
if (caseRows.length > 0 && !reqGroups.size && !checklistItems.some((r) => ['high', 'must'].includes(r.Priority))) {
  errors.push('At least one high or must requirement must be represented.');
}

for (const [reqId, grp] of reqGroups.entries()) {
  const risks = [...new Set(grp.map((g) => g.Risk))];
  if (risks.length !== 1) {
    errors.push(`QUALITY_CASES.md ${reqId}: inconsistent risk tiers across rows.`);
    continue;
  }
  if (effectiveMode === 'Release' && risks[0] === 'high' && grp.length < 2) {
    errors.push(`QUALITY_CASES.md ${reqId} (high): only ${grp.length} case recorded; Release mode requires at least 2.`);
  }
}

for (const row of caseRows) {
  if (!['high', 'must'].includes(row.Risk)) continue;
  if (effectiveMode === 'Release') {
    if (!['passed', 'verified'].includes(row.Status)) {
      errors.push(`QUALITY_CASES.md ${row.ID} (${row.Risk}): status is '${row.Status}', expected 'passed' or 'verified' for Release.`);
    }
  } else {
    if (!['passed', 'verified', 'blocked'].includes(row.Status)) {
      errors.push(`QUALITY_CASES.md ${row.ID} (${row.Risk}): status is '${row.Status}', expected 'passed', 'verified', or documented 'blocked'.`);
    }
    if (row.Status === 'blocked' && row.Evidence.trim().length < 8) {
      errors.push(`QUALITY_CASES.md ${row.ID}: blocked status requires a clear blocker explanation in Evidence.`);
    }
  }
}

console.log(`Checklist items: ${checklistItems.length} | Quality cases: ${caseRows.length}`);

if (errors.length) {
  console.log('QUALITY GATE: NOT READY');
  errors.forEach((e) => console.log(`- ${e}`));
  process.exit(1);
}

console.log(`QUALITY GATE: READY (${caseRows.length} quality case(s), ${checklistItems.length} checklist item(s), mode: ${effectiveMode})`);
