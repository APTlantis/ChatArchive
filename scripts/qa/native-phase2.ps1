param(
  [string]$Source,
  [string]$LiveLibrary = 'A:\ChatArchive',
  [string]$QaRoot,
  [string]$Executable
)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $Source) { $Source = Join-Path $workspace 'openai-export' }
if (-not $QaRoot) { $QaRoot = Join-Path $workspace '.qa' }
if (-not $Executable) { $Executable = Join-Path $workspace 'src-tauri\target\release\chatarchive.exe' }
$qaResolved = [IO.Path]::GetFullPath($QaRoot)
if (-not $qaResolved.StartsWith(($workspace + '\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'QA root escaped workspace' }
$library = Join-Path $qaResolved 'library'
if (Test-Path -LiteralPath $library) { Remove-Item -LiteralPath $library -Recurse -Force }
New-Item -ItemType Directory -Force -Path $library | Out-Null
& robocopy $LiveLibrary $library /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Library clone failed with robocopy code $LASTEXITCODE" }

$profile = Join-Path $qaResolved 'native-profile'
New-Item -ItemType Directory -Force -Path $profile | Out-Null
$oldAppData = $env:APPDATA; $oldLocalAppData = $env:LOCALAPPDATA
$env:APPDATA = Join-Path $profile 'Roaming'; $env:LOCALAPPDATA = Join-Path $profile 'Local'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9340'
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $profile 'WebView2'
New-Item -ItemType Directory -Force -Path $env:APPDATA,$env:LOCALAPPDATA | Out-Null

function Wait-NativeBridge {
  param([int]$Port, [int]$TimeoutSeconds = 30)
  $probe = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("Boolean(window.__TAURI_INTERNALS__?.invoke)"))
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    Start-Sleep -Milliseconds 200
    try {
      $available = & node scripts/qa/cdp-invoke.mjs $Port $probe 2>$null
      if ($LASTEXITCODE -eq 0 -and $available -eq 'true') { return }
    } catch {}
  } while ((Get-Date) -lt $deadline)
  throw 'Native Tauri bridge did not become ready'
}

$launch = [Diagnostics.Stopwatch]::StartNew()
$process = Start-Process -FilePath $Executable -PassThru -WindowStyle Hidden
try {
  $deadline = (Get-Date).AddSeconds(30)
  do { Start-Sleep -Milliseconds 200; try { $null = Invoke-RestMethod 'http://127.0.0.1:9340/json/list'; $ready = $true } catch { $ready = $false } } while (-not $ready -and (Get-Date) -lt $deadline)
  if (-not $ready) { throw 'Native WebView did not become ready' }
  Wait-NativeBridge -Port 9340
  $launch.Stop()
  $sourceJs = $Source.Replace('\','\\'); $libraryJs = $library.Replace('\','\\')
  $expression = "window.__TAURI_INTERNALS__.invoke('import_openai_export',{sourcePath:'$sourceJs',libraryPath:'$libraryJs'}).then(x=>({archiveId:x.archiveId,archiveTotals:x.index.totals,artifactTotals:x.artifacts.totals}))"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($expression))
  $importWatch = [Diagnostics.Stopwatch]::StartNew()
  $import = & node scripts/qa/cdp-invoke.mjs 9340 $encoded | ConvertFrom-Json
  $importWatch.Stop()
  $audit = & python scripts/qa/audit-library.py $library $Source | ConvertFrom-Json

  $stateExpression = "window.__TAURI_INTERNALS__.invoke('get_library_status').then(async s=>{const id=s.index.conversations.find(x=>!s.viewerState.favorites[x.id])?.id||s.index.conversations[0].id;await window.__TAURI_INTERNALS__.invoke('toggle_favorite',{conversationId:id});return {id}})"
  $stateEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($stateExpression))
  $state = & node scripts/qa/cdp-invoke.mjs 9340 $stateEncoded | ConvertFrom-Json
  Stop-Process -Id $process.Id -Force; Start-Sleep -Milliseconds 500
  $process = Start-Process -FilePath $Executable -PassThru -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(30); $ready=$false
  do { Start-Sleep -Milliseconds 200; try { $null = Invoke-RestMethod 'http://127.0.0.1:9340/json/list'; $ready = $true } catch { $ready = $false } } while (-not $ready -and (Get-Date) -lt $deadline)
  if (-not $ready) { throw 'Native WebView did not become ready after relaunch' }
  Wait-NativeBridge -Port 9340
  $verifyExpression = "window.__TAURI_INTERNALS__.invoke('get_library_status').then(s=>({configured:s.configured,favorite:Boolean(s.viewerState.favorites['$($state.id)']),documents:s.artifacts.totals.documents,assets:s.artifacts.totals.assets}))"
  $verifyEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($verifyExpression))
  $persistence = & node scripts/qa/cdp-invoke.mjs 9340 $verifyEncoded | ConvertFrom-Json
  if (-not $persistence.favorite -or $persistence.documents -ne 1624 -or $persistence.assets -ne 5823) { throw 'Native persistence verification failed' }

  $result = [ordered]@{status='pass'; coldLaunchMs=$launch.ElapsedMilliseconds; importMs=$importWatch.ElapsedMilliseconds; workingSetBytes=$process.WorkingSet64; import=$import; audit=$audit; persistence=$persistence}
  New-Item -ItemType Directory -Force -Path $qaResolved | Out-Null
  $result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $qaResolved 'native-results.json') -Encoding UTF8
  $result | ConvertTo-Json -Depth 12
} finally {
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  $env:APPDATA=$oldAppData; $env:LOCALAPPDATA=$oldLocalAppData
}
