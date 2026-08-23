param(
  [string]$IdentityConfig,
  [string]$OutputRoot,
  [string]$CertificatePath,
  [string]$CertificatePassword,
  [switch]$SkipAppBuild,
  [switch]$AllowUnreservedIdentity
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $IdentityConfig) { $IdentityConfig = Join-Path $PSScriptRoot 'store-identity.json' }
if (-not $OutputRoot) { $OutputRoot = Join-Path $root 'src-tauri\target\store-msix' }

function Find-WindowsSdkTool {
  param([string]$Name)
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $sdkRoot = 'C:\Program Files (x86)\Windows Kits\10\bin'
  $tool = Get-ChildItem -Path $sdkRoot -Recurse -Filter $Name -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\' } |
    Sort-Object FullName -Descending |
    Select-Object -First 1
  if (-not $tool) { throw "$Name was not found. Install the Windows SDK or put $Name on PATH." }
  return $tool.FullName
}

function Assert-Value {
  param([string]$Name, [object]$Value)
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { throw "Missing Store identity value: $Name" }
  if ([string]$Value -match 'REPLACE_WITH_|TODO|PLACEHOLDER') { throw "Store identity value still contains a placeholder: $Name" }
}

function Xml-Attr {
  param([string]$Value)
  return [Security.SecurityElement]::Escape($Value)
}

if (-not (Test-Path -LiteralPath $IdentityConfig)) {
  throw "Store identity config not found: $IdentityConfig. Copy scripts\release\store-identity.template.json to scripts\release\store-identity.json and fill it from Partner Center."
}

$identity = Get-Content -LiteralPath $IdentityConfig -Raw | ConvertFrom-Json
if (-not $identity.storeIdentityReserved -and -not $AllowUnreservedIdentity) {
  throw 'Store identity is not marked reserved. Set storeIdentityReserved=true only after copying exact Partner Center identity values, or pass -AllowUnreservedIdentity for local packaging smoke tests.'
}

Assert-Value 'package.name' $identity.package.name
Assert-Value 'package.publisher' $identity.package.publisher
Assert-Value 'package.version' $identity.package.version
Assert-Value 'package.processorArchitecture' $identity.package.processorArchitecture
Assert-Value 'app.id' $identity.app.id
Assert-Value 'app.executable' $identity.app.executable
Assert-Value 'app.displayName' $identity.app.displayName
Assert-Value 'app.description' $identity.app.description
Assert-Value 'publisherDisplayName' $identity.publisherDisplayName
Assert-Value 'visualAssets.sourceDirectory' $identity.visualAssets.sourceDirectory
Assert-Value 'targetDeviceFamily.name' $identity.targetDeviceFamily.name
Assert-Value 'targetDeviceFamily.minVersion' $identity.targetDeviceFamily.minVersion
Assert-Value 'targetDeviceFamily.maxVersionTested' $identity.targetDeviceFamily.maxVersionTested

$allowedArchitectures = @('x64', 'x86', 'arm64', 'neutral')
if ($identity.package.processorArchitecture -notin $allowedArchitectures) {
  throw "Unsupported processorArchitecture '$($identity.package.processorArchitecture)'. Use one of: $($allowedArchitectures -join ', ')."
}
if ($identity.package.version -notmatch '^[1-9][0-9]{0,4}\.([0-9]{1,5})\.([0-9]{1,5})\.0$') {
  throw "Package version '$($identity.package.version)' must use Store-compatible four-part form with the fourth segment set to 0."
}

$makeAppx = Find-WindowsSdkTool 'makeappx.exe'
$makePri = Find-WindowsSdkTool 'makepri.exe'
$signtool = $null
if ($CertificatePath) { $signtool = Find-WindowsSdkTool 'signtool.exe' }

Push-Location $root
try {
  if (-not $SkipAppBuild) {
    & npx tauri build --no-bundle
    if ($LASTEXITCODE) { throw 'Tauri release build failed.' }
  }

  $exeSource = Join-Path $root "src-tauri\target\release\$($identity.app.executable)"
  if (-not (Test-Path -LiteralPath $exeSource)) { throw "Built executable not found: $exeSource" }

  $stage = Join-Path $OutputRoot 'stage'
  $packageDir = Join-Path $OutputRoot 'packages'
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $stage, $packageDir | Out-Null

  Copy-Item -LiteralPath $exeSource -Destination (Join-Path $stage $identity.app.executable) -Force
  $assetSource = Join-Path $root $identity.visualAssets.sourceDirectory
  if (-not (Test-Path -LiteralPath $assetSource)) { throw "Visual asset source directory not found: $assetSource" }
  Copy-Item -LiteralPath $assetSource -Destination (Join-Path $stage 'Assets') -Recurse -Force

  $manifestPath = Join-Path $stage 'AppxManifest.xml'
  $manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap uap10 rescap">
  <Identity
    Name="$(Xml-Attr $identity.package.name)"
    Publisher="$(Xml-Attr $identity.package.publisher)"
    Version="$(Xml-Attr $identity.package.version)"
    ProcessorArchitecture="$(Xml-Attr $identity.package.processorArchitecture)" />
  <Properties>
    <DisplayName>$(Xml-Attr $identity.app.displayName)</DisplayName>
    <PublisherDisplayName>$(Xml-Attr $identity.publisherDisplayName)</PublisherDisplayName>
    <Logo>$(Xml-Attr $identity.visualAssets.logo)</Logo>
    <uap10:PackageIntegrity>
      <uap10:Content Enforcement="on" />
    </uap10:PackageIntegrity>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="$(Xml-Attr $identity.targetDeviceFamily.name)" MinVersion="$(Xml-Attr $identity.targetDeviceFamily.minVersion)" MaxVersionTested="$(Xml-Attr $identity.targetDeviceFamily.maxVersionTested)" />
  </Dependencies>
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  <Applications>
    <Application Id="$(Xml-Attr $identity.app.id)" Executable="$(Xml-Attr $identity.app.executable)" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="$(Xml-Attr $identity.app.displayName)"
        Description="$(Xml-Attr $identity.app.description)"
        BackgroundColor="transparent"
        Square150x150Logo="$(Xml-Attr $identity.visualAssets.square150x150Logo)"
        Square44x44Logo="$(Xml-Attr $identity.visualAssets.square44x44Logo)">
        <uap:DefaultTile Wide310x150Logo="$(Xml-Attr $identity.visualAssets.wide310x150Logo)" />
      </uap:VisualElements>
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
"@
  Set-Content -LiteralPath $manifestPath -Value $manifest -Encoding UTF8

  $priConfig = Join-Path $stage 'priconfig.xml'
  & $makePri createconfig /cf $priConfig /dq en-US /Overwrite | Out-Null
  if ($LASTEXITCODE) { throw 'makepri createconfig failed.' }
  & $makePri new /pr $stage /cf $priConfig /of (Join-Path $stage 'resources.pri') /Overwrite | Out-Null
  if ($LASTEXITCODE) { throw 'makepri new failed.' }
  Remove-Item -LiteralPath $priConfig -Force

  $packageName = "$($identity.package.name)_$($identity.package.version)_$($identity.package.processorArchitecture).msix"
  $packagePath = Join-Path $packageDir $packageName
  & $makeAppx pack /d $stage /p $packagePath /o /v
  if ($LASTEXITCODE) { throw 'makeappx pack failed.' }

  $signed = $false
  if ($CertificatePath) {
    if (-not (Test-Path -LiteralPath $CertificatePath)) { throw "Certificate not found: $CertificatePath" }
    $signArgs = @('sign', '/fd', 'SHA256', '/f', $CertificatePath)
    if ($CertificatePassword) { $signArgs += @('/p', $CertificatePassword) }
    $signArgs += $packagePath
    & $signtool @signArgs
    if ($LASTEXITCODE) { throw 'signtool signing failed.' }
    $signed = $true
  }

  $hash = Get-FileHash -LiteralPath $packagePath -Algorithm SHA256
  $result = [ordered]@{
    status = 'pass'
    package = $packagePath
    sha256 = $hash.Hash
    bytes = (Get-Item -LiteralPath $packagePath).Length
    signedForLocalSideload = $signed
    storeIdentityReserved = [bool]$identity.storeIdentityReserved
    appExecutable = $identity.app.executable
    processorArchitecture = $identity.package.processorArchitecture
    manifest = $manifestPath
    note = 'Local self-signing is sideload evidence only. Store submission, Microsoft certification, and Microsoft re-signing remain separate release gates.'
  }
  $resultPath = Join-Path $OutputRoot 'store-msix-results.json'
  $result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resultPath -Encoding UTF8
  $result | ConvertTo-Json -Depth 6
} finally {
  Pop-Location
}
