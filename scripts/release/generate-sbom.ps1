param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$OutputRoot,
  [string]$NpmToolVersion = '4.1.0',
  [string]$CargoToolVersion = '0.5.7'
)

$ErrorActionPreference = 'Stop'
if (-not $OutputRoot) { $OutputRoot = Join-Path $ProjectRoot 'artifacts\sbom' }
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

# Tool versions are arguments so the exact generator version is recorded with each release.
# Do not silently install a Rust tool into the operator profile: prepare it explicitly with
# `cargo install cargo-cyclonedx --version <recorded-version>` before invoking this script.
$cargoCyclonedx = Get-Command cargo-cyclonedx -ErrorAction SilentlyContinue
if (-not $cargoCyclonedx) {
  throw "cargo-cyclonedx $CargoToolVersion is required. Install that exact version, then rerun."
}

Push-Location $ProjectRoot
try {
  & npx --yes "@cyclonedx/cyclonedx-npm@$NpmToolVersion" --output-file (Join-Path $OutputRoot 'chatarchive-frontend.cdx.json') --output-format JSON
  if ($LASTEXITCODE) { throw 'CycloneDX npm SBOM generation failed.' }
  & cargo cyclonedx --manifest-path src-tauri\Cargo.toml --format json --output-cdx (Join-Path $OutputRoot 'chatarchive-rust.cdx.json')
  if ($LASTEXITCODE) { throw 'cargo-cyclonedx SBOM generation failed.' }
  [ordered]@{
    productVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
    npmToolVersion = $NpmToolVersion
    cargoToolVersion = $CargoToolVersion
    generatedAt = (Get-Date).ToString('o')
    files = @('chatarchive-frontend.cdx.json', 'chatarchive-rust.cdx.json')
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputRoot 'sbom-generation.json') -Encoding UTF8
} finally {
  Pop-Location
}
