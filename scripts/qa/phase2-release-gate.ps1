param(
  [switch]$SkipInstaller,
  [switch]$SkipStoreMsix
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$qa=Join-Path $root '.qa';New-Item -ItemType Directory -Force -Path $qa | Out-Null
$started=Get-Date
$steps=[ordered]@{}
Push-Location $root
try{
  & npm test;if($LASTEXITCODE){throw 'Vitest failed'};$steps.vitest='pass'
  & npm run build;if($LASTEXITCODE){throw 'Frontend build failed'};$steps.frontendBuild='pass'
  & cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check;if($LASTEXITCODE){throw 'Rust formatting failed'};$steps.rustfmt='pass'
  & cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings;if($LASTEXITCODE){throw 'Clippy failed'};$steps.clippy='pass'
  $env:CHATARCHIVE_IMPORT_SMOKE_SOURCE=Join-Path $root 'openai-export'
  & cargo test --manifest-path src-tauri/Cargo.toml;if($LASTEXITCODE){throw 'Rust tests failed'};$steps.rustTests='pass'
  & npx playwright test;if($LASTEXITCODE){throw 'Playwright failed'};$steps.playwright='pass'
  & npm run tauri:build;if($LASTEXITCODE){throw 'Tauri executable build failed'};$steps.tauriBuild='pass'
  $private=Get-ChildItem dist -File -Recurse|Where-Object {$_.FullName -match 'archive-data|archive-assets|archive-documents'}
  if($private){throw 'Private archive payload leaked into dist'};$steps.privacyPayload='pass'
  if(-not $SkipStoreMsix){& npm run release:msix;if($LASTEXITCODE){throw 'Store MSIX packaging failed'};$steps.storeMsix='pass'}else{$steps.storeMsix='skipped'}
  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/qa/native-phase2.ps1;if($LASTEXITCODE){throw 'Native QA failed'};$steps.native='pass'
  if(-not $SkipInstaller){& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/qa/installer-lifecycle.ps1;if($LASTEXITCODE){throw 'Historical installer lifecycle failed'};$steps.installer='pass'}else{$steps.installer='skipped'}
  $hashes=@()
  $msixResultPath=Join-Path $root 'src-tauri\target\store-msix\store-msix-results.json'
  if(Test-Path -LiteralPath $msixResultPath){
    $msixResult=Get-Content -LiteralPath $msixResultPath -Raw|ConvertFrom-Json
    $hashes+=@([ordered]@{path=$msixResult.package;sha256=$msixResult.sha256;bytes=$msixResult.bytes;kind='store-msix'})
  }
  $result=[ordered]@{status='pass';started=$started.ToString('o');finished=(Get-Date).ToString('o');steps=$steps;hashes=$hashes;note='Store publication, Microsoft certification, and Microsoft re-signing remain separate evidence gates.'}
  $result|ConvertTo-Json -Depth 8|Set-Content (Join-Path $qa 'release-gate-results.json') -Encoding UTF8
  $result|ConvertTo-Json -Depth 8
}catch{
  $result=[ordered]@{status='fail';started=$started.ToString('o');finished=(Get-Date).ToString('o');steps=$steps;error=$_.Exception.Message}
  $result|ConvertTo-Json -Depth 8|Set-Content (Join-Path $qa 'release-gate-results.json') -Encoding UTF8
  throw
}finally{Pop-Location}
