# Launch the cockpit. By default it serves THIS repo (your course grows inside
# your clone). To serve a course that lives elsewhere, set HARNESS_REPO first:
#   $env:HARNESS_REPO = "C:\path\to\your\course"; .\cockpit.ps1
# NOTE: keep this file ASCII-only - Windows PowerShell 5.1 misreads BOM-less
# UTF-8, and a stray em-dash becomes a string-eating smart quote.
$cockpit = Join-Path $PSScriptRoot "cockpit"
if (-not (Test-Path (Join-Path $cockpit "node_modules"))) {
  Write-Host "[cockpit] first run - installing dependencies..."
  npm --prefix $cockpit install --no-fund --no-audit
}
npm --prefix $cockpit run dev
