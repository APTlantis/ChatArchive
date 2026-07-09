param([string]$QaRoot)
$ErrorActionPreference='Stop'
$workspace=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if(-not $QaRoot){$QaRoot=Join-Path $workspace '.qa'}
$msi=Join-Path $workspace 'src-tauri\target\release\bundle\msi\ChatArchive_0.1.0_x64_en-US.msi'
$nsis=Join-Path $workspace 'src-tauri\target\release\bundle\nsis\ChatArchive_0.1.0_x64-setup.exe'
$installDir='C:\Program Files\ChatArchive'
$backup=Join-Path $QaRoot 'installed-backup'
$originalMsiBackup=Join-Path $QaRoot 'pretest-installed.msi'
$logs=Join-Path $QaRoot 'installer-logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$wasRunning=[bool](Get-Process chatarchive -ErrorAction SilentlyContinue)
Get-Process chatarchive -ErrorAction SilentlyContinue | Stop-Process -Force
if(Test-Path $backup){Remove-Item -LiteralPath $backup -Recurse -Force}
if(Test-Path $installDir){New-Item -ItemType Directory -Force -Path $backup | Out-Null; & robocopy $installDir $backup /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null}

function Get-ChatArchiveRegistrations {
  Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
    Where-Object DisplayName -eq 'ChatArchive'
}
$originalRegistration=Get-ChatArchiveRegistrations | Where-Object {$_.PSChildName -match '^\{'} | Select-Object -First 1
if($originalRegistration.LocalPackage -and (Test-Path $originalRegistration.LocalPackage)){Copy-Item $originalRegistration.LocalPackage $originalMsiBackup -Force}

function Invoke-Msi([string[]]$Arguments){
  $p=Start-Process msiexec.exe -ArgumentList $Arguments -PassThru -Wait -WindowStyle Hidden
  if($p.ExitCode -notin 0,3010){throw "msiexec failed: $($p.ExitCode)"}
}
function Invoke-Cdp([int]$Port,[string]$Expression){
  $encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Expression))
  & node scripts/qa/cdp-invoke.mjs $Port $encoded
  if($LASTEXITCODE -ne 0){throw 'Installed application CDP invocation failed'}
}
function Test-InstalledLaunch([int]$Port,[bool]$ConfigureLibrary=$false){
  $profile=Join-Path $QaRoot 'installer-profile'
  $oldA=$env:APPDATA;$oldL=$env:LOCALAPPDATA
  $env:APPDATA=Join-Path $profile 'Roaming';$env:LOCALAPPDATA=Join-Path $profile 'Local'
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$Port";$env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $profile 'WebView2'
  New-Item -ItemType Directory -Force -Path $env:APPDATA,$env:LOCALAPPDATA | Out-Null
  $registration=Get-ChatArchiveRegistrations | Where-Object InstallLocation | Select-Object -First 1
  $resolvedInstallDir=if($registration){$registration.InstallLocation.Trim('"').TrimEnd('\')}elseif(Test-Path (Join-Path $installDir 'chatarchive.exe')){$installDir}else{Join-Path $env:LOCALAPPDATA 'ChatArchive'}
  $p=Start-Process (Join-Path $resolvedInstallDir 'chatarchive.exe') -PassThru -WindowStyle Hidden
  try{
    $deadline=(Get-Date).AddSeconds(30);$ready=$false
    do{Start-Sleep -Milliseconds 250;try{$targets=Invoke-RestMethod "http://127.0.0.1:$Port/json/list";$ready=$true}catch{$ready=$false}}while(-not $ready -and (Get-Date)-lt $deadline)
    if(-not $ready){throw 'Installed application did not render'}
    $probeDeadline=(Get-Date).AddSeconds(30);$bridge=$false
    do{Start-Sleep -Milliseconds 200;try{$bridge=(Invoke-Cdp $Port "Boolean(window.__TAURI_INTERNALS__?.invoke)") -eq 'true'}catch{$bridge=$false}}while(-not $bridge -and (Get-Date)-lt $probeDeadline)
    if(-not $bridge){throw 'Installed application Tauri bridge did not become ready'}
    if($ConfigureLibrary){
      $library=(Join-Path $QaRoot 'library').Replace('\','\\')
      $status=Invoke-Cdp $Port "window.__TAURI_INTERNALS__.invoke('select_library_folder',{libraryPath:'$library'}).then(s=>({configured:s.configured,documents:s.artifacts?.totals?.documents}))" | ConvertFrom-Json
    }else{
      $status=Invoke-Cdp $Port "window.__TAURI_INTERNALS__.invoke('get_library_status').then(s=>({configured:s.configured,documents:s.artifacts?.totals?.documents}))" | ConvertFrom-Json
    }
    if(-not $status.configured -or $status.documents -ne 1624){throw 'Installed application did not retain the isolated library setting'}
  }finally{Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue;$env:APPDATA=$oldA;$env:LOCALAPPDATA=$oldL}
}

$results=[ordered]@{}
try{
  Invoke-Msi @('/i',"`"$msi`"",'/qn','/norestart',"/L*v `"$(Join-Path $logs 'msi-install.log')`"")
  Test-InstalledLaunch 9341 $true;$results.msiCleanInstall='pass'
  Invoke-Msi @('/i',"`"$msi`"",'/qn','/norestart','REINSTALL=ALL','REINSTALLMODE=vomus',"/L*v `"$(Join-Path $logs 'msi-replace.log')`"")
  Test-InstalledLaunch 9342;$results.msiSameVersion='pass'
  $product=(Get-ChildItem 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue|Get-ItemProperty|Where-Object DisplayName -eq 'ChatArchive'|Select-Object -First 1 -ExpandProperty PSChildName)
  Invoke-Msi @('/x',$product,'/qn','/norestart',"/L*v `"$(Join-Path $logs 'msi-uninstall.log')`"")
  if(Get-ChatArchiveRegistrations | Where-Object {$_.PSChildName -eq $product}){throw 'MSI uninstall registration remains'};$results.msiUninstall='pass'

  $p=Start-Process $nsis -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden;if($p.ExitCode -ne 0){throw "NSIS install failed: $($p.ExitCode)"}
  Test-InstalledLaunch 9343;$results.nsisCleanInstall='pass'
  $p=Start-Process $nsis -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden;if($p.ExitCode -ne 0){throw "NSIS replacement failed: $($p.ExitCode)"}
  Test-InstalledLaunch 9344;$results.nsisSameVersion='pass'
  $nsisDir=(Get-ChatArchiveRegistrations | Where-Object {$_.UninstallString -notmatch 'MsiExec'} | Select-Object -First 1).InstallLocation.Trim('"').TrimEnd('\')
  $uninstaller=Get-ChildItem $nsisDir -Filter '*uninstall*.exe' -File -ErrorAction SilentlyContinue|Select-Object -First 1
  if(-not $uninstaller){throw 'NSIS uninstaller not found'}
  $p=Start-Process $uninstaller.FullName -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden;if($p.ExitCode -ne 0){throw "NSIS uninstall failed: $($p.ExitCode)"}
  $results.nsisUninstall='pass'
  if(-not (Test-Path (Join-Path $QaRoot 'library\chatarchive.db'))){throw 'Installer lifecycle removed external QA library'}
  $results.externalLibraryPreserved='pass'
}finally{
  Get-Process chatarchive -ErrorAction SilentlyContinue|Stop-Process -Force
  $restorePackage=if(Test-Path $originalMsiBackup){$originalMsiBackup}else{$msi}
  Invoke-Msi @('/i',"`"$restorePackage`"",'/qn','/norestart',"/L*v `"$(Join-Path $logs 'restore-msi.log')`"")
  if(Test-Path $backup){& robocopy $backup $installDir /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null}
  if($wasRunning){Start-Process (Join-Path $installDir 'chatarchive.exe') -WindowStyle Hidden}
}
$results.status='pass';$results | ConvertTo-Json | Set-Content (Join-Path $QaRoot 'installer-results.json') -Encoding UTF8;$results | ConvertTo-Json
