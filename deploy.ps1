$ErrorActionPreference = "Stop"

Write-Host "Configuring Git Identity..."
git config user.email "simba@chewore.com"
git config user.name "Simba"

Write-Host "Initializing Git..."
git init

Write-Host "Adding files..."
git add .

Write-Host "Committing..."
git commit -m "Initial commit: Production-ready Leave Tracker for Railway"

Write-Host "Renaming branch to main..."
git branch -M main

Write-Host "Adding remote origin..."
git remote add origin https://github.com/m-simbai/leaf.git

Write-Host "Pushing to GitHub..."
git push -u origin main
