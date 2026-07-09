param([switch]$SkipInstaller)
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
  & npm run tauri:build;if($LASTEXITCODE){throw 'Tauri build failed'};$steps.tauriBuild='pass'
  $private=Get-ChildItem dist -File -Recurse|Where-Object {$_.FullName -match 'archive-data|archive-assets|archive-documents'}
  if($private){throw 'Private archive payload leaked into dist'};$steps.privacyPayload='pass'
  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/qa/native-phase2.ps1;if($LASTEXITCODE){throw 'Native QA failed'};$steps.native='pass'
  if(-not $SkipInstaller){& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/qa/installer-lifecycle.ps1;if($LASTEXITCODE){throw 'Installer lifecycle failed'};$steps.installer='pass'}else{$steps.installer='skipped'}
  $bundles=@('src-tauri\target\release\bundle\msi\ChatArchive_0.1.0_x64_en-US.msi','src-tauri\target\release\bundle\nsis\ChatArchive_0.1.0_x64-setup.exe')
  $hashes=Get-FileHash -Algorithm SHA256 $bundles|ForEach-Object{[ordered]@{path=$_.Path;sha256=$_.Hash;bytes=(Get-Item $_.Path).Length}}
  $result=[ordered]@{status='pass';started=$started.ToString('o');finished=(Get-Date).ToString('o');steps=$steps;hashes=$hashes}
  $result|ConvertTo-Json -Depth 8|Set-Content (Join-Path $qa 'release-gate-results.json') -Encoding UTF8
  $result|ConvertTo-Json -Depth 8
}catch{
  $result=[ordered]@{status='fail';started=$started.ToString('o');finished=(Get-Date).ToString('o');steps=$steps;error=$_.Exception.Message}
  $result|ConvertTo-Json -Depth 8|Set-Content (Join-Path $qa 'release-gate-results.json') -Encoding UTF8
  throw
}finally{Pop-Location}
