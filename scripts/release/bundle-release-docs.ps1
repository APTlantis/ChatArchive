param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$Version = '0.1.2',
  [string]$PackageVersion = '1.0.2.0',
  [switch]$IncludeMsix
)

$ErrorActionPreference = 'Stop'

function Get-Sha256File([string]$Path) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead((Resolve-Path -LiteralPath $Path).Path)
  try {
    return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '')
  } finally {
    $stream.Dispose()
    $sha.Dispose()
  }
}
function Get-RelativeProjectPath([string]$Root, [string]$File) {
  $rootFull = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\') + '\'
  $fileFull = (Resolve-Path -LiteralPath $File).Path
  if (-not $fileFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "File is outside the project root: $fileFull"
  }
  return $fileFull.Substring($rootFull.Length)
}

$projectRootPath = (Resolve-Path $ProjectRoot).Path
$outputRoot = Join-Path $projectRootPath 'src-tauri\target\release-docs'
$bundleName = "ChatArchive-v$Version-store-msix-docs"
$bundleDir = Join-Path $outputRoot $bundleName
$zipPath = Join-Path $outputRoot "$bundleName.zip"

if (Test-Path -LiteralPath $bundleDir) {
  Remove-Item -LiteralPath $bundleDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null

$relativeFiles = @(
  'README.md',
  'Project-README.md',
  'Project-Proposal.md',
  'Package.appxmanifest',
  'ChatArchive.manifest.toml',
  'docs\Release-v0.1.2-Scope.md',
  'docs\Phase2-QA-Report.md',
  'docs\ChatArchive-User-Guide.md',
  'docs\Tauri-Store-MSIX-Release-Playbook.md',
  'scripts\release\build-store-msix.ps1',
  'scripts\release\store-identity.template.json'
)

$trustPatterns = @(
  'trust\*.xml',
  'trust\*.hashmanifest.toml',
  'trust\*.hashmanifest.toml.asc',
  'trust\*.hashmanifest.toml.sphincs'
)

$evidencePatterns = @(
  '.qa\release-evidence\*.json',
  'src-tauri\target\store-msix\*.json'
)

$files = New-Object System.Collections.Generic.List[string]
foreach ($relative in $relativeFiles) {
  $full = Join-Path $projectRootPath $relative
  if (Test-Path -LiteralPath $full -PathType Leaf) {
    $files.Add($full)
  }
}
foreach ($pattern in ($trustPatterns + $evidencePatterns)) {
  Get-ChildItem -Path (Join-Path $projectRootPath $pattern) -File -ErrorAction SilentlyContinue | ForEach-Object {
    $files.Add($_.FullName)
  }
}

if ($IncludeMsix) {
  $msix = Join-Path $projectRootPath "src-tauri\target\store-msix\packages\Aptlantis.ChatArchive_$PackageVersion`_x64.msix"
  if (Test-Path -LiteralPath $msix -PathType Leaf) {
    $files.Add($msix)
  } else {
    throw "IncludeMsix was requested, but the MSIX was not found: $msix"
  }
}

$uniqueFiles = $files | Sort-Object -Unique
$entries = @()
foreach ($file in $uniqueFiles) {
  $relativePath = Get-RelativeProjectPath $projectRootPath $file
  $destination = Join-Path $bundleDir $relativePath
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
  Copy-Item -LiteralPath $file -Destination $destination -Force
  $item = Get-Item -LiteralPath $file
  $entries += [ordered]@{
    path = $relativePath.Replace('/', '\')
    size = $item.Length
    sha256 = Get-Sha256File $file
  }
}

$manifest = [ordered]@{
  project = 'ChatArchive'
  release = "v$Version"
  packageVersion = $PackageVersion
  generatedAt = (Get-Date).ToString('o')
  includeMsix = [bool]$IncludeMsix
  bundleName = $bundleName
  files = $entries
}
$manifestPath = Join-Path $bundleDir 'release-docs-manifest.json'
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $bundleDir '*') -DestinationPath $zipPath -Force

[ordered]@{
  bundleDirectory = $bundleDir
  zip = $zipPath
  fileCount = $entries.Count + 1
  zipSha256 = Get-Sha256File $zipPath
  zipSize = (Get-Item -LiteralPath $zipPath).Length
} | ConvertTo-Json -Depth 4

