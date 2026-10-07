const { execFile } = require('child_process')

// Output and error messages in UTF-8, so non-ASCII names and localized errors arrive intact.
const UTF8 = '[Console]::OutputEncoding = [Text.Encoding]::UTF8; '

/*
 * Runs a fixed PowerShell script. Values such as paths never become part of the script text: they
 * are passed as DX_* environment variables, so no file name can be read as code.
 */
function powershell(script, values = {}, signal = undefined) {
  const env = { ...process.env }
  for (const [name, value] of Object.entries(values)) env['DX_' + name] = value
  return new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', UTF8 + script],
    { windowsHide: true, env, signal }, (error, stdout, stderr) => error ? reject(new Error(stderr.trim().split(/\r?\n/)[0] || error.message)) : resolve(stdout)))
}

// Zips files and folders with .NET, which handles files over 2 GB; a failed archive is removed.
const ZIP_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open($env:DX_DEST, 'Create')
try {
  foreach ($p in ($env:DX_PATHS | ConvertFrom-Json)) {
    $item = Get-Item -LiteralPath $p -Force
    $base = (Split-Path -Parent $item.FullName).TrimEnd('\\').Length + 1
    $entries = if ($item.PSIsContainer) { @($item) + @(Get-ChildItem -LiteralPath $p -Recurse -Force) } else { @($item) }
    foreach ($e in $entries) {
      $name = $e.FullName.Substring($base).Replace('\\', '/')
      if (-not $e.PSIsContainer) { [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $e.FullName, $name, 'Optimal') }
      elseif (-not (Get-ChildItem -LiteralPath $e.FullName -Force | Select-Object -First 1)) { [void]$zip.CreateEntry($name + '/') }
    }
  }
} catch { $zip.Dispose(); Remove-Item -LiteralPath $env:DX_DEST -Force; throw }
$zip.Dispose()`

const UNZIP_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::ExtractToDirectory($env:DX_SRC, $env:DX_DEST)`

// signal stops the work; the caller removes what was written.
const zip = (paths, dest, signal) => powershell(ZIP_SCRIPT, { PATHS: JSON.stringify(paths), DEST: dest }, signal)
const unzip = (src, dest, signal) => powershell(UNZIP_SCRIPT, { SRC: src, DEST: dest }, signal)

module.exports = { powershell, zip, unzip }
