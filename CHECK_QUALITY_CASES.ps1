param(
  [string]$Project = (Get-Location).Path,
  [ValidateSet('Auto', 'Preview', 'Release')]
  [string]$Mode = 'Auto',
  [switch]$Init
)

$ErrorActionPreference = 'Stop'

function Write-StarterFiles {
  param([string]$TargetDir)

  $vibekitDir = Join-Path $TargetDir '.vibekit'
  New-Item -ItemType Directory -Path $TargetDir, $vibekitDir -Force | Out-Null

  $checklistPath = Join-Path $TargetDir 'CHECKLIST.md'
  if (-not (Test-Path -LiteralPath $checklistPath)) {
@"
# Project Requirement Checklist

| ID | Category | Requirement | Priority | Status | Verification | Evidence |
|---|---|---|---|---|---|---|
| REQ-01 | Core | Example core user workflow works end-to-end | must | planned | Define test or browser check | Pending implementation |
"@ | Set-Content -LiteralPath $checklistPath -Encoding UTF8
    Write-Output "Created starter $checklistPath"
  }

  $qualityPath = Join-Path $TargetDir 'QUALITY_CASES.md'
  if (-not (Test-Path -LiteralPath $qualityPath)) {
@"
# Quality Verification Cases

| ID | Requirement | Risk | Scenario | Method | Result | Status | Evidence |
|---|---|---|---|---|---|---|---|
| QC-01 | REQ-01 | must | Primary user flow completes and persists cleanly | Automated test / Browser | Pending execution | blocked | Starter template created by CHECK_QUALITY_CASES.ps1 -Init |
"@ | Set-Content -LiteralPath $qualityPath -Encoding UTF8
    Write-Output "Created starter $qualityPath"
  }

  $statePath = Join-Path $vibekitDir 'STATE.md'
  if (-not (Test-Path -LiteralPath $statePath)) {
@"
# Project State

- **Project**: $(Split-Path -Leaf (Resolve-Path -LiteralPath $TargetDir))
- **Objective**: Initialize project tracking
- **PRD**: PRD.md
- **Stack**: Pending detection
- **Workflow Status**: BUILDING
- **Current Stage**: Stage 0 — Understand
- **Execution Mode**: AUTO
- **Preview URL**: None yet
- **Live URL**: Not deployed
- **Last Updated**: $(Get-Date -Format 'yyyy-MM-dd HH:mm')

## Completed Requirements
- None yet.

## Remaining Requirements
- Inspect PRD and repository manifests; populate CHECKLIST.md.

## Important Decisions
- Recorded in .vibekit/DECISIONS.md.

## Current Implementation State
- Initialized starter checklist and verification ledgers.

## Known Bugs
- None recorded.

## Test Results
- Not run yet.

## External Blockers
- None recorded.

## Next Actions
- Decompose PRD requirements into CHECKLIST.md.
"@ | Set-Content -LiteralPath $statePath -Encoding UTF8
    Write-Output "Created starter $statePath"
  }
}

function Test-IsPlaceholder {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $true }
  $v = $Value.Trim()
  return $v -in @('-', '—', 'N/A', 'TBD', 'TODO', 'Pending', 'pending', '...')
}

function Parse-MarkdownTables {
  param([string]$FilePath)
  $tables = @()
  if (-not (Test-Path -LiteralPath $FilePath)) { return $tables }
  $lines = Get-Content -LiteralPath $FilePath
  $headers = $null
  $lineNumber = 0
  foreach ($line in $lines) {
    $lineNumber++
    if ($line -notmatch '^\s*\|') {
      $headers = $null
      continue
    }
    $cells = @($line.Trim().Trim('|').Split('|') | ForEach-Object { $_.Trim() })
    if ($cells.Count -eq 0) { continue }
    $isSeparator = $true
    foreach ($c in $cells) {
      if ($c -notmatch '^:?-{2,}:?$') { $isSeparator = $false; break }
    }
    if ($isSeparator) { continue }
    if ($null -eq $headers) {
      $headers = $cells
      continue
    }
    $tables += [pscustomobject]@{
      LineNumber = $lineNumber
      Headers = $headers
      Cells = $cells
    }
  }
  return $tables
}

function Invoke-LegacyQualityCheck {
  param([string]$TargetDir)
  $errors = [System.Collections.Generic.List[string]]::new()
  $rows = @()

  $ledger = Join-Path $TargetDir 'QUALITY_CASES.md'
  if (-not (Test-Path -LiteralPath $ledger)) {
    $errors.Add("Missing $ledger")
  } else {
    $lines = Get-Content -LiteralPath $ledger
    $lineNumber = 0
    foreach ($line in $lines) {
      $lineNumber++
      if ($line -notmatch '^\s*\|') { continue }
      $cells = @($line.Trim().Trim('|').Split('|') | ForEach-Object { $_.Trim() })
      if ($cells[0] -in @('ID','---') -or $cells[0] -match '^:?-+:?$') { continue }
      if ($cells.Count -ne 10) { $errors.Add("Line ${lineNumber}: expected 10 cells, found $($cells.Count)."); continue }
      $rows += [pscustomobject]@{
        ID=$cells[0]; Requirement=$cells[1]; Risk=$cells[2].ToLowerInvariant()
        Iteration=$cells[3]; Scenario=$cells[4]; Expected=$cells[5]
        Method=$cells[6]; Actual=$cells[7]; Status=$cells[8].ToLowerInvariant()
        Evidence=$cells[9]
      }
    }

    if ($rows.Count -eq 0) { $errors.Add('No test cases found in the ten-column Markdown table.') }
    $seenIDs = @{}
    $seenScenarios = @{}
    foreach ($row in $rows) {
      foreach ($field in @('ID','Requirement','Risk','Iteration','Scenario','Expected','Method','Actual','Status','Evidence')) {
        if ([string]::IsNullOrWhiteSpace($row.$field) -or $row.$field -eq '-') { $errors.Add("$($row.ID): $field is empty.") }
      }
      if ($seenIDs.ContainsKey($row.ID)) { $errors.Add("Duplicate case ID: $($row.ID)") } else { $seenIDs[$row.ID] = $true }
      $scenarioKey = ($row.Requirement + '|' + $row.Scenario).ToLowerInvariant() -replace '\s+', ' '
      if ($seenScenarios.ContainsKey($scenarioKey)) { $errors.Add("Repeated scenario for $($row.Requirement): $($row.Scenario)") } else { $seenScenarios[$scenarioKey] = $true }
      if ($row.Iteration -notin @('1','2','3','4')) { $errors.Add("$($row.ID): iteration must be 1-4.") }
      if ($row.Risk -notin @('must','high','artifact','optional')) { $errors.Add("$($row.ID): risk must be must, high, artifact, or optional.") }
      if ($row.Status -notin @('passed','failed','blocked')) { $errors.Add("$($row.ID): status must be passed, failed, or blocked after execution.") }
    }

    foreach ($round in 1..3) {
      $count = @($rows | Where-Object { $_.Iteration -eq [string]$round }).Count
      if ($count -eq 0) { $errors.Add("Iteration $round has no new executed cases.") }
      Write-Output "Iteration ${round}: $count distinct cases recorded"
    }

    $mustGroups = @($rows | Where-Object { $_.Risk -in @('must','high','artifact') } | Group-Object Requirement)
    if ($mustGroups.Count -eq 0) { $errors.Add('No Must requirements are represented.') }
    foreach ($group in $mustGroups) {
      $riskValues = @($group.Group | Select-Object -ExpandProperty Risk -Unique)
      if ($riskValues.Count -ne 1) { $errors.Add("$($group.Name): inconsistent risk labels."); continue }
      $risk = $riskValues[0]
      $minimum = if ($risk -eq 'high') { 6 } elseif ($risk -eq 'must') { 3 } else { 1 }
      if ($group.Count -lt $minimum) { $errors.Add("$($group.Name): $($group.Count) cases; needs at least $minimum.") }
      if ($risk -ne 'artifact') {
        foreach ($round in 1..3) {
          if (@($group.Group | Where-Object { $_.Iteration -eq [string]$round }).Count -eq 0) {
            $errors.Add("$($group.Name): no new case in iteration $round.")
          }
        }
      }
      foreach ($row in $group.Group) {
        if ($row.Status -ne 'passed') { $errors.Add("$($row.ID): Must case is $($row.Status), not passed.") }
      }
      Write-Output "$($group.Name) ($risk): $($group.Count) distinct cases"
    }
  }

  $regressionLedger = Join-Path $TargetDir 'REGRESSION_RUNS.md'
  $regressionRows = @()
  if (-not (Test-Path -LiteralPath $regressionLedger)) {
    $errors.Add("Missing $regressionLedger")
  } else {
    $lineNumber = 0
    foreach ($line in (Get-Content -LiteralPath $regressionLedger)) {
      $lineNumber++
      if ($line -notmatch '^\s*\|') { continue }
      $cells = @($line.Trim().Trim('|').Split('|') | ForEach-Object { $_.Trim() })
      if ($cells[0] -in @('Iteration','---') -or $cells[0] -match '^:?-+:?$') { continue }
      if ($cells.Count -ne 7) { $errors.Add("Regression line ${lineNumber}: expected 7 cells, found $($cells.Count)."); continue }
      $regressionRows += [pscustomobject]@{
        Iteration=$cells[0]; Suite=$cells[1]; CaseIDs=$cells[2]
        Method=$cells[3]; Actual=$cells[4]; Status=$cells[5].ToLowerInvariant()
        Evidence=$cells[6]
      }
    }
  }

  $coreRows = @($regressionRows | Where-Object { $_.Suite -eq 'CORE' })
  if ($coreRows.Count -eq 0) { $errors.Add('No CORE regression runs were recorded.') }
  if ($coreRows.Count -gt 0) {
    $iter1Core = @($coreRows | Where-Object { $_.Iteration -eq '1' })
    if ($iter1Core.Count -eq 0) {
      $errors.Add('CORE suite was not established in iteration 1.')
    } else {
      $coreIDs = @($iter1Core[0].CaseIDs.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
      if ($coreIDs.Count -ne @($coreIDs | Select-Object -Unique).Count) { $errors.Add('CORE case ID list contains duplicates.') }
      foreach ($id in $coreIDs) {
        $case = @($rows | Where-Object { $_.ID -eq $id })
        if ($case.Count -ne 1) { $errors.Add("CORE case ID $id is missing or duplicated in QUALITY_CASES.md.") }
        elseif ($case[0].Iteration -ne '1') { $errors.Add("CORE case ID $id was not established in iteration 1.") }
      }
      if ($mustGroups) {
        foreach ($group in @($mustGroups | Where-Object { $_.Group[0].Risk -in @('must','high') })) {
          if (@($group.Group | Where-Object { $_.ID -in $coreIDs }).Count -eq 0) {
            $errors.Add("CORE suite omits $($group.Name).")
          }
        }
      }
      $expectedIDs = (@($coreIDs | Sort-Object) -join ',')
      foreach ($row in $coreRows) {
        $actualIDs = (@($row.CaseIDs.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Sort-Object) -join ',')
        if ($actualIDs -ne $expectedIDs) { $errors.Add("CORE case IDs changed in iteration $($row.Iteration).") }
        foreach ($field in @('Iteration','CaseIDs','Method','Actual','Status','Evidence')) {
          if ([string]::IsNullOrWhiteSpace($row.$field) -or $row.$field -eq '-') { $errors.Add("CORE iteration $($row.Iteration): $field is empty.") }
        }
        if ($row.Iteration -notin @('1','2','3','4')) { $errors.Add("CORE iteration $($row.Iteration) is invalid.") }
        if ($row.Status -notin @('passed','failed','blocked')) { $errors.Add("CORE iteration $($row.Iteration): invalid status.") }
      }
      $requiredRounds = @(1,2,3)
      if (@($rows | Where-Object { $_.Iteration -eq '4' }).Count -gt 0) { $requiredRounds += 4 }
      $evidenceSeen = @{}
      foreach ($round in $requiredRounds) {
        $runs = @($coreRows | Where-Object { $_.Iteration -eq [string]$round })
        if ($runs.Count -eq 0) { $errors.Add("CORE suite was not rerun in iteration $round."); continue }
        $last = $runs[-1]
        if ($last.Status -ne 'passed') { $errors.Add("CORE iteration $round ended $($last.Status), not passed.") }
        if ($evidenceSeen.ContainsKey($last.Evidence)) { $errors.Add("CORE iteration $round reused an earlier evidence reference.") }
        else { $evidenceSeen[$last.Evidence] = $true }
        Write-Output "CORE iteration ${round}: $($last.Status) ($($coreIDs.Count) same cases)"
      }
    }
  }

  if ($errors.Count -gt 0) {
    Write-Output 'QUALITY GATE (LEGACY): NOT READY'
    foreach ($item in $errors) { Write-Output "- $item" }
    exit 1
  }
  Write-Output "QUALITY GATE (LEGACY): READY ($($rows.Count) distinct executed cases plus repeated CORE checks)"
  exit 0
}

if ($Init) {
  Write-StarterFiles -TargetDir $Project
  exit 0
}

if (-not (Test-Path -LiteralPath $Project)) {
  throw "Project path does not exist: $Project"
}

$qualityPath = Join-Path $Project 'QUALITY_CASES.md'
$checklistPath = Join-Path $Project 'CHECKLIST.md'
$regressionPath = Join-Path $Project 'REGRESSION_RUNS.md'

# Detect legacy 10-column / REGRESSION_RUNS format cleanly
$useLegacy = $false
if (Test-Path -LiteralPath $regressionPath) {
  $useLegacy = $true
} elseif (Test-Path -LiteralPath $qualityPath) {
  $rawHead = (Get-Content -LiteralPath $qualityPath -TotalCount 40) -join "`n"
  if ($rawHead -match '\|\s*Iteration\s*\|' -and $rawHead -match '\|\s*Expected\s*\|') {
    $useLegacy = $true
  }
}

if ($useLegacy) {
  Invoke-LegacyQualityCheck -TargetDir $Project
}

# Modern Risk-Based VibeKit Verification
$errors = [System.Collections.Generic.List[string]]::new()
$checklistItems = @()
$caseRows = @()

if (-not (Test-Path -LiteralPath $checklistPath) -and -not (Test-Path -LiteralPath $qualityPath)) {
  $errors.Add("Neither CHECKLIST.md nor QUALITY_CASES.md was found in $Project. Run CHECK_QUALITY_CASES.ps1 -Init or complete planning first.")
}

if (Test-Path -LiteralPath $checklistPath) {
  $parsedChecklist = Parse-MarkdownTables -FilePath $checklistPath
  foreach ($row in $parsedChecklist) {
    if ($row.Cells.Count -lt 5) {
      $errors.Add("CHECKLIST.md line $($row.LineNumber): expected at least 5 columns, found $($row.Cells.Count).")
      continue
    }
    $id = $row.Cells[0]
    $cat = $row.Cells[1]
    $req = $row.Cells[2]
    $prio = $row.Cells[3].ToLowerInvariant()
    $status = $row.Cells[4].ToLowerInvariant()
    $verification = if ($row.Cells.Count -ge 6) { $row.Cells[5] } else { '' }
    $evidence = if ($row.Cells.Count -ge 7) { $row.Cells[6] } else { '' }
    if ($prio -notin @('high','must','standard','artifact','optional','should','nice')) {
      $errors.Add("CHECKLIST.md ${id}: invalid priority '$prio' (expected high, must, standard, artifact, or optional).")
    }
    if ($prio -eq 'should') { $prio = 'standard' }
    if ($prio -eq 'nice') { $prio = 'optional' }
    if ($status -notin @('planned','implementing','implemented-unverified','verified','passed','failed','blocked')) {
      $errors.Add("CHECKLIST.md ${id}: invalid status '$status'.")
    }
    $checklistItems += [pscustomobject]@{
      ID=$id; Category=$cat; Requirement=$req; Priority=$prio; Status=$status; Verification=$verification; Evidence=$evidence
    }
  }
}

if (Test-Path -LiteralPath $qualityPath) {
  $parsedQuality = Parse-MarkdownTables -FilePath $qualityPath
  $seenCaseIDs = @{}
  $seenScenarios = @{}
  foreach ($row in $parsedQuality) {
    if ($row.Cells.Count -ne 8) {
      $errors.Add("QUALITY_CASES.md line $($row.LineNumber): expected 8 columns (| ID | Requirement | Risk | Scenario | Method | Result | Status | Evidence |), found $($row.Cells.Count).")
      continue
    }
    $item = [pscustomobject]@{
      ID=$row.Cells[0]
      Requirement=$row.Cells[1]
      Risk=$row.Cells[2].ToLowerInvariant()
      Scenario=$row.Cells[3]
      Method=$row.Cells[4]
      Result=$row.Cells[5]
      Status=$row.Cells[6].ToLowerInvariant()
      Evidence=$row.Cells[7]
    }
    foreach ($field in @('ID','Requirement','Risk','Scenario','Method','Result','Status','Evidence')) {
      if (Test-IsPlaceholder -Value $item.$field) {
        $errors.Add("QUALITY_CASES.md $($item.ID): field '$field' is empty or placeholder.")
      }
    }
    if ($seenCaseIDs.ContainsKey($item.ID)) {
      $errors.Add("QUALITY_CASES.md: duplicate case ID $($item.ID).")
    } else {
      $seenCaseIDs[$item.ID] = $true
    }
    $scenKey = ($item.Requirement + '|' + $item.Scenario).ToLowerInvariant() -replace '\s+', ' '
    if ($seenScenarios.ContainsKey($scenKey)) {
      $errors.Add("QUALITY_CASES.md: duplicate scenario for $($item.Requirement): $($item.Scenario)")
    } else {
      $seenScenarios[$scenKey] = $true
    }
    if ($item.Risk -notin @('high','must','standard','artifact','optional')) {
      $errors.Add("QUALITY_CASES.md $($item.ID): invalid risk '$($item.Risk)'.")
    }
    if ($item.Status -notin @('passed','verified','failed','blocked','planned','implementing','implemented-unverified')) {
      $errors.Add("QUALITY_CASES.md $($item.ID): invalid status '$($item.Status)'.")
    }
    $caseRows += $item
  }
}

# Resolve effective mode
$hasDocumentedBlockers = (@($caseRows | Where-Object { $_.Status -eq 'blocked' }).Count -gt 0) -or (@($checklistItems | Where-Object { $_.Status -eq 'blocked' }).Count -gt 0)
$effectiveMode = $Mode
if ($Mode -eq 'Auto') {
  $effectiveMode = if ($hasDocumentedBlockers) { 'Preview' } else { 'Release' }
}
Write-Output "Quality Mode: $effectiveMode (requested: $Mode)"

# Cross-check CHECKLIST.md mandatory items
foreach ($req in $checklistItems) {
  if ($req.Priority -notin @('high','must')) { continue }
  $matchingCases = @($caseRows | Where-Object { $_.Requirement -eq $req.ID -or $_.Requirement -eq $req.Requirement })
  if ($matchingCases.Count -eq 0) {
    if ($req.Status -notin @('verified','passed') -or (Test-IsPlaceholder -Value $req.Verification) -or (Test-IsPlaceholder -Value $req.Evidence)) {
      $errors.Add("Mandatory item $($req.ID) ($($req.Priority)) has no verification case in QUALITY_CASES.md and lacks verified inline evidence in CHECKLIST.md.")
    }
  }
  if ($effectiveMode -eq 'Release') {
    if ($req.Status -notin @('verified','passed')) {
      $errors.Add("CHECKLIST.md $($req.ID) ($($req.Priority)) has status '$($req.Status)'; Release mode requires 'verified' or 'passed'.")
    }
    if ($req.Priority -eq 'high' -and $matchingCases.Count -gt 0 -and $matchingCases.Count -lt 2) {
      $errors.Add("High-risk item $($req.ID) has only $($matchingCases.Count) case(s) in QUALITY_CASES.md; Release mode requires at least 2 (e.g. happy path + failure/auth boundary).")
    }
  } else {
    if ($req.Status -notin @('verified','passed','blocked')) {
      $errors.Add("CHECKLIST.md $($req.ID) ($($req.Priority)) has status '$($req.Status)'; Preview mode requires 'verified', 'passed', or documented 'blocked'.")
    } elseif ($req.Status -eq 'blocked' -and (Test-IsPlaceholder -Value $req.Evidence)) {
      $errors.Add("CHECKLIST.md $($req.ID) is marked blocked but lacks blocker explanation in Evidence.")
    }
  }
}

# Validate QUALITY_CASES.md cases
$mandatoryGroups = @($caseRows | Where-Object { $_.Risk -in @('high','must') } | Group-Object Requirement)
if ($checklistItems.Count -eq 0 -and $caseRows.Count -eq 0) {
  $errors.Add('No verification records found.')
}
if ($caseRows.Count -gt 0 -and $mandatoryGroups.Count -eq 0 -and (@($checklistItems | Where-Object { $_.Priority -in @('high','must') }).Count -eq 0)) {
  $errors.Add('At least one high or must requirement must be represented in CHECKLIST.md or QUALITY_CASES.md.')
}

foreach ($group in $mandatoryGroups) {
  $risks = @($group.Group | Select-Object -ExpandProperty Risk -Unique)
  if ($risks.Count -ne 1) {
    $errors.Add("QUALITY_CASES.md $($group.Name): inconsistent risk tiers across rows.")
    continue
  }
  $risk = $risks[0]
  if ($effectiveMode -eq 'Release' -and $risk -eq 'high' -and $group.Count -lt 2) {
    $errors.Add("QUALITY_CASES.md $($group.Name) (high): only $($group.Count) case recorded; Release mode requires at least 2 scenarios.")
  }
}

foreach ($row in $caseRows) {
  if ($row.Risk -notin @('high','must')) { continue }
  if ($effectiveMode -eq 'Release') {
    if ($row.Status -notin @('passed','verified')) {
      $errors.Add("QUALITY_CASES.md $($row.ID) ($($row.Risk)): status is '$($row.Status)', expected 'passed' or 'verified' for Release.")
    }
  } else {
    if ($row.Status -notin @('passed','verified','blocked')) {
      $errors.Add("QUALITY_CASES.md $($row.ID) ($($row.Risk)): status is '$($row.Status)', expected 'passed', 'verified', or documented 'blocked' for Preview.")
    }
    if ($row.Status -eq 'blocked' -and $row.Evidence.Trim().Length -lt 8) {
      $errors.Add("QUALITY_CASES.md $($row.ID): blocked status requires a clear blocker explanation in Evidence.")
    }
  }
}

Write-Output "Checklist items: $($checklistItems.Count) | Quality cases: $($caseRows.Count)"

if ($errors.Count -gt 0) {
  Write-Output 'QUALITY GATE: NOT READY'
  foreach ($item in $errors) { Write-Output "- $item" }
  exit 1
}

Write-Output "QUALITY GATE: READY ($($caseRows.Count) quality case(s), $($checklistItems.Count) checklist item(s), mode: $effectiveMode)"
exit 0
