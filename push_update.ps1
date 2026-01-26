$ErrorActionPreference = "Stop"

Write-Host "Adding files..."
git add .

Write-Host "Committing..."
git commit -m "Fix server startup: Move imports to top and clean structure"

Write-Host "Pushing to GitHub..."
git push
