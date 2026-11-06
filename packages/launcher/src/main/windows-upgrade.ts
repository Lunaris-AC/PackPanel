import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export async function startWindowsUpgrade(input: {
  root: string; work: string; instanceId: string; token: string; sequence: number; userData: string;
}): Promise<void> {
  const data = Buffer.from(JSON.stringify({ ...input, pid: process.pid }), 'utf8').toString('base64');
  const command = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$cfg = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}')) | ConvertFrom-Json
$created = $false
$mutex = [Threading.Mutex]::new($true, ('Local\PackPanel-Setup-' + $cfg.instanceId), [ref]$created)
if (!$created) { $mutex.Dispose(); exit 1 }
$app = Join-Path $cfg.root 'app'
$old = Join-Path $cfg.root 'previous'
$next = Join-Path $cfg.work 'app'
$pending = Join-Path $cfg.root 'upgrade.pending'
$failed = Join-Path $cfg.root 'upgrade.failed'
$exe = Join-Path $app 'PackPanel.exe'
$ready = Join-Path $cfg.work 'helper.ready'
$health = Join-Path $cfg.root ('upgrade-ready-' + $cfg.token)
$argsToKeep = @()
if ($cfg.userData) { $argsToKeep += ('--user-data-dir="' + $cfg.userData + '"') }
$moved = $false
$new = $null
try {
  [IO.File]::WriteAllText($ready, 'ready')
  $running = Get-Process -Id $cfg.pid -ErrorAction SilentlyContinue
  if ($running -and !$running.WaitForExit(30000)) { exit 1 }
  if (!(Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'Current launcher missing' }
  if (!(Test-Path -LiteralPath (Join-Path $next 'PackPanel.exe') -PathType Leaf)) { throw 'Staged launcher missing' }
  if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Force -Recurse }
  [IO.File]::WriteAllText($pending, $cfg.token)
  [IO.Directory]::Move($app, $old)
  $moved = $true
  [IO.Directory]::Move($next, $app)
  $new = Start-Process -FilePath $exe -WorkingDirectory $app -ArgumentList ($argsToKeep + ('--packpanel-update-health=' + $cfg.token)) -PassThru
  $watch = [Diagnostics.Stopwatch]::StartNew()
  while (!(Test-Path -LiteralPath $health) -and !$new.HasExited -and $watch.ElapsedMilliseconds -lt 30000) { Start-Sleep -Milliseconds 150 }
  if (!(Test-Path -LiteralPath $health) -or $new.HasExited) { throw 'The updated launcher did not start' }
  Remove-Item -LiteralPath $pending -Force
  Remove-Item -LiteralPath $old -Force -Recurse -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $failed -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $cfg.root 'upgrade-cache\windows.zip') -Force -ErrorAction SilentlyContinue
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  [IO.File]::WriteAllText($failed, [string]$cfg.sequence)
  if ($moved) {
    if ($new -and !$new.HasExited) { Stop-Process -Id $new.Id -Force; $null = $new.WaitForExit(5000) }
    if (Test-Path -LiteralPath $app) { Remove-Item -LiteralPath $app -Force -Recurse }
    [IO.Directory]::Move($old, $app)
  }
  Remove-Item -LiteralPath $pending -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $exe -PathType Leaf) {
    if ($argsToKeep.Count) { Start-Process -FilePath $exe -WorkingDirectory $app -ArgumentList $argsToKeep }
    else { Start-Process -FilePath $exe -WorkingDirectory $app }
  }
  exit 1
} finally {
  Remove-Item -LiteralPath $health -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $cfg.work -Force -Recurse -ErrorAction SilentlyContinue
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
`;
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const diagnostics = path.join(input.root, 'upgrade-helper.log');
  // Start-Process gives the helper an independent lifetime after Electron exits.
  const broker = String.raw`
$ErrorActionPreference = 'Stop'
$command = $env:PACKPANEL_UPGRADE_COMMAND
Remove-Item Env:PACKPANEL_UPGRADE_COMMAND
Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile', '-NonInteractive', '-EncodedCommand', $command) -WindowStyle Hidden -RedirectStandardError (Join-Path $PWD 'upgrade-helper.log')
`;
  const processHandle = spawn(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(broker, 'utf16le').toString('base64')], {
    cwd: input.root,
    env: { ...process.env, PACKPANEL_UPGRADE_COMMAND: Buffer.from(command, 'utf16le').toString('base64') },
    stdio: 'ignore',
    windowsHide: true
  });
  let failure: Error | undefined;
  processHandle.once('error', error => { failure = error; });
  processHandle.unref();
  for (let i = 0; i < 120; i++) {
    if (fs.existsSync(path.join(input.work, 'helper.ready'))) return;
    if (failure || (processHandle.exitCode !== null && processHandle.exitCode !== 0)) break;
    await delay(100);
  }
  const detail = failure?.message || (fs.existsSync(diagnostics) ? fs.readFileSync(diagnostics, 'utf8').trim().slice(-1200) : '');
  throw new Error(`The Windows updater could not start (${processHandle.exitCode ?? 'timeout'})${detail ? `: ${detail}` : ''}`);
}
