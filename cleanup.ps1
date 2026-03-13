Get-Process | Where-Object { $_.Path -like '*multi_cam*' } | Stop-Process -Force
Start-Sleep -Seconds 2
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\multi_cam_sync"
Write-Host "Cleaned up old install"
