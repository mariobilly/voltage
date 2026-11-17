$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $projectDir 'Open VOLTAGE.ps1'
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'VOLTAGE - Live Visual Instrument.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '"'
$shortcut.WorkingDirectory = $projectDir
$shortcut.Description = 'Start VOLTAGE and open the live visual instrument'
$icon = Join-Path $projectDir 'assets\voltage.ico'
if (Test-Path -LiteralPath $icon) { $shortcut.IconLocation = "$icon,0" }
$shortcut.Save()
Write-Output $shortcutPath
