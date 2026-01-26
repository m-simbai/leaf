$ErrorActionPreference = "Stop"

Write-Host "Adding files..."
git add .

Write-Host "Committing..."
git commit -m "Fix mixed content error: Use relative API paths"

Write-Host "Pushing to GitHub..."
git push
