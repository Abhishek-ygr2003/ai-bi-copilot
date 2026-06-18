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

# Setup custom BI analyst model from local GGUF
Write-Host "Checking for custom local BI analyst model..." -ForegroundColor Cyan
$existingBiModel = ollama list 2>$null | Select-String "qwen2.5-bi-analyst"
if ($existingBiModel) {
    Write-Host "✅ qwen2.5-bi-analyst is already registered in Ollama" -ForegroundColor Green
} else {
    $ggufPath = Join-Path "finetune" "qwen2.5-bi-analyst-q8_0.gguf"
    $modelfilePath = Join-Path "finetune" "Modelfile"
    if (Test-Path $ggufPath) {
        Write-Host "Registering custom BI Specialist model (qwen2.5-bi-analyst) in Ollama..." -ForegroundColor Yellow
        Write-Host "Running: ollama create qwen2.5-bi-analyst -f $modelfilePath"
        ollama create qwen2.5-bi-analyst -f $modelfilePath
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Custom qwen2.5-bi-analyst model created successfully!" -ForegroundColor Green
        } else {
            Write-Host "❌ Failed to create qwen2.5-bi-analyst model" -ForegroundColor Red
        }
    } else {
        Write-Host "⚠️ Custom GGUF model not found at $ggufPath" -ForegroundColor Yellow
        Write-Host "  The app will fall back to HuggingFace or standard model if not registered." -ForegroundColor Gray
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
Write-Host "   ollama run qwen2.5-bi-analyst `"Hi`""
Write-Host ""
Write-Host "3. Start the BI Copilot app:" -ForegroundColor Yellow
Write-Host "   npm run dev"
Write-Host ""
Write-Host "4. Open http://localhost:3000 in your browser" -ForegroundColor Yellow
Write-Host ""
