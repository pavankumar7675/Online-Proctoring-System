# Start Backend Server for Online Proctoring System
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Online Proctoring - Backend Server" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check if virtual environment exists
if (-Not (Test-Path ".\.venv\Scripts\Activate.ps1")) {
    # Fix: use ASCII-only string text to avoid quote terminator issues from encoding glitches.
    Write-Host "[WARN] Virtual environment not found. Creating..." -ForegroundColor Yellow
    py -3.10 -m venv .venv
    Write-Host "[OK] Virtual environment created`n" -ForegroundColor Green
}

# Activate virtual environment
Write-Host "[INFO] Activating virtual environment..." -ForegroundColor Yellow
& ".\.venv\Scripts\Activate.ps1"

# Check if requirements are installed in .venv
Write-Host "[INFO] Checking dependencies..." -ForegroundColor Yellow
$pipList = & ".\.venv\Scripts\pip.exe" list

if ($pipList -notmatch "flask-cors") {
    Write-Host "[WARN] Dependencies not installed. Installing with correct order..." -ForegroundColor Yellow

    # Install protobuf FIRST to avoid version conflicts
    & ".\.venv\Scripts\pip.exe" install protobuf==3.20.3

    # Then install everything else
    & ".\.venv\Scripts\pip.exe" install -r requirements.txt
    Write-Host "[OK] Dependencies installed`n" -ForegroundColor Green
} else {
    Write-Host "[OK] Dependencies verified`n" -ForegroundColor Green
}

# Start server banner
Write-Host "[INFO] Starting backend server..." -ForegroundColor Green
Write-Host "   Server will run on http://localhost:5000" -ForegroundColor Cyan
Write-Host "   Press Ctrl+C to stop`n" -ForegroundColor Yellow

# Optional anti-spoof model auto-configuration
$defaultAntiSpoofModel = ".\models\anti_spoof.onnx"
if (-Not $env:ANTI_SPOOF_MODEL_PATH -and (Test-Path $defaultAntiSpoofModel)) {
    $env:ANTI_SPOOF_MODEL_PATH = (Resolve-Path $defaultAntiSpoofModel).Path
    if (-Not $env:ANTI_SPOOF_OUTPUT_MODE) {
        $env:ANTI_SPOOF_OUTPUT_MODE = "auto"
    }

    Write-Host "[OK] Anti-spoof model detected and configured:" -ForegroundColor Green
    Write-Host "   ANTI_SPOOF_MODEL_PATH=$($env:ANTI_SPOOF_MODEL_PATH)" -ForegroundColor Cyan
    Write-Host "   ANTI_SPOOF_OUTPUT_MODE=$($env:ANTI_SPOOF_OUTPUT_MODE)`n" -ForegroundColor Cyan
} elseif (-Not $env:ANTI_SPOOF_MODEL_PATH) {
    # Fix: keep if/elseif braces explicit and balanced to avoid parser block errors.
    Write-Host "[INFO] Anti-spoof model is not configured." -ForegroundColor Yellow
    Write-Host "   To enable it, place your model at .\models\anti_spoof.onnx" -ForegroundColor Yellow
    Write-Host "   or set ANTI_SPOOF_MODEL_PATH before starting the backend.`n" -ForegroundColor Yellow
}

# Fix: valid call-operator syntax for executable path + script argument.
& ".\.venv\Scripts\python.exe" "server.py"
