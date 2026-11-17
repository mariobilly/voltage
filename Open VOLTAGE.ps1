$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appUrl = 'http://127.0.0.1:5173/'

function Test-VoltageServer {
    try {
        $response = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 1
        return $response.StatusCode -eq 200 -and $response.Content -match '<title>VOLTAGE'
    } catch {
        return $false
    }
}

try {
    if (-not (Test-VoltageServer)) {
        $node = (Get-Command node.exe -ErrorAction Stop).Source
        $vite = Join-Path $projectDir 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path -LiteralPath $vite)) {
            throw 'App dependencies are missing. Run npm.cmd install in the project folder.'
        }
        Start-Process -FilePath $node -ArgumentList @($vite, '--host', '127.0.0.1', '--port', '5173', '--strictPort') -WorkingDirectory $projectDir -WindowStyle Hidden | Out-Null
        for ($attempt = 0; $attempt -lt 40 -and -not (Test-VoltageServer); $attempt++) {
            Start-Sleep -Milliseconds 250
        }
    }
    if (-not (Test-VoltageServer)) {
        throw 'The local app server did not start. Port 5173 may already be in use.'
    }
    Start-Process -FilePath $appUrl | Out-Null
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'VOLTAGE could not open', 'OK', 'Error') | Out-Null
    exit 1
}
