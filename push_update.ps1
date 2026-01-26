$ErrorActionPreference = "Stop"

Write-Host "Adding files..."
git add .

Write-Host "Committing..."
git commit -m "Fix Express 5 routing crash: Use regex for catch-all"

Write-Host "Pushing to GitHub..."
git push
