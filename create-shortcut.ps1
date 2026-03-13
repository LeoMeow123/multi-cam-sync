$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut("$env:USERPROFILE\Desktop\Multi-Cam-Sync.lnk")
$sc.TargetPath = "C:\Users\leli\Talmolab\2026-01-28-Camera-sync-system\multi-cam-sync\Multi-Cam-Sync.bat"
$sc.WorkingDirectory = "C:\Users\leli\Talmolab\2026-01-28-Camera-sync-system\multi-cam-sync"
$sc.Description = "Multi-Camera Sync System"
$sc.WindowStyle = 7
$sc.Save()
Write-Host "Desktop shortcut created!"
