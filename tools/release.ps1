# Builds, packages, and publishes a launcher release.
#
#   .\tools\release.ps1 -Version 0.1.0 -NoUpload     build and package only (to test the installer)
#   .\tools\release.ps1 -Version 0.1.0               build, package, and upload to GitHub
#
# The version must be higher than the previous release. Upload needs a GitHub token in $env:GITHUB_TOKEN.
param(
    [Parameter(Mandatory)][string]$Version,
    [switch]$NoUpload
)
$ErrorActionPreference = "Stop"

$repoUrl  = "https://github.com/nbz1559/Kestrel-Releases"
$root     = Split-Path $PSScriptRoot -Parent
$publish  = Join-Path $root "publish"
$releases = Join-Path $root "Releases"

Remove-Item $publish -Recurse -Force -ErrorAction SilentlyContinue

# Self-contained: players don't need .NET installed
dotnet publish "$root\src\Host\Host.csproj" -c Release --self-contained -r win-x64 -p:Version=$Version -o $publish
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }

# Fetch earlier releases so Velopack can build small delta updates.
# Before the very first release there is nothing to fetch, so an error here is fine.
if (-not $NoUpload) { vpk download github --repoUrl $repoUrl --outputDir $releases }

# --framework webview2 makes Setup.exe install the WebView2 runtime if the PC doesn't have it
vpk pack --packId KestrelLauncher --packVersion $Version --packDir $publish `
    --mainExe Kestrel.exe --packTitle "Kestrel Launcher" --framework webview2 `
    --runtime win-x64 --outputDir $releases
if ($LASTEXITCODE -ne 0) { throw "vpk pack failed" }

if ($NoUpload) { Write-Host "Built locally. The installer is in $releases"; return }

if (-not $env:GITHUB_TOKEN) { throw "Set `$env:GITHUB_TOKEN first (see the setup notes)." }
vpk upload github --repoUrl $repoUrl --token $env:GITHUB_TOKEN --publish `
    --releaseName "Kestrel Launcher $Version" --tag "v$Version" --outputDir $releases
if ($LASTEXITCODE -ne 0) { throw "vpk upload failed" }

Write-Host "Released $Version"