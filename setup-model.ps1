# Setup script for Local LLM Model (Windows PowerShell)
# Run this to install and configure the recommended model for your GTX 1650

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Local LLM Setup for GTX 1650 (4GB VRAM)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Ollama is installed
$ollamaPath = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollamaPath) {
    Write-Host "❌ Ollama is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Ollama first:" -ForegroundColor Yellow
    Write-Host "  1. Visit https://ollama.ai"
    Write-Host "  2. Download and install Ollama for Windows"
    Write-Host "  3. Restart your terminal (as Administrator)"
    Write-Host ""
    Write-Host "After installation, run this script again."
    exit 1
}

Write-Host "✅ Ollama is installed" -ForegroundColor Green
Write-Host ""

# Display system info
Write-Host "System Info:" -ForegroundColor Cyan
Write-Host "  - GPU: GTX 1650 4GB"
Write-Host "  - Recommended Model: phi3:mini (3.8GB)"
Write-Host ""

# Check if model is already installed
$existingModel = ollama list 2>$null | Select-String "phi3:mini"
if ($existingModel) {
    Write-Host "✅ phi3:mini is already installed" -ForegroundColor Green
} else {
    Write-Host "Installing recommended model: phi3:mini" -ForegroundColor Yellow
    Write-Host "This will download ~3.8GB..."
    Write-Host ""
    
    ollama pull phi3:mini
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Model installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to install model" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Next Steps" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Start Ollama server (keep running):" -ForegroundColor Yellow
Write-Host "   ollama serve"
Write-Host ""
Write-Host "2. In another terminal, verify it works:" -ForegroundColor Yellow
Write-Host "   ollama run phi3:mini `"Hello`""
Write-Host ""
Write-Host "3. Start the BI Copilot app:" -ForegroundColor Yellow
Write-Host "   npm run dev"
Write-Host ""
Write-Host "4. Open http://localhost:5173 in your browser" -ForegroundColor Yellow
Write-Host ""
