import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function closeWindowsGame(pid: number): Promise<void> {
  const command = `
$ErrorActionPreference = 'Stop'
$game = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
if ($null -eq $game) { exit 0 }
$timer = [System.Diagnostics.Stopwatch]::StartNew()
do {
  $game.Refresh()
  if ($game.HasExited) { exit 0 }
  if ($game.CloseMainWindow()) {
    if ($game.WaitForExit(30000)) { exit 0 }
    exit 2
  }
  Start-Sleep -Milliseconds 250
} while ($timer.ElapsedMilliseconds -lt 12000)
exit 1
`;
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  await run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], {
    windowsHide: true,
    timeout: 47_000
  });
}
