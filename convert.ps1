Add-Type -AssemblyName System.Drawing
$imagePath = Join-Path $PSScriptRoot "icon_pro.png"

$img = [System.Drawing.Image]::FromFile($imagePath)

$new16 = New-Object System.Drawing.Bitmap 16, 16
$g16 = [System.Drawing.Graphics]::FromImage($new16)
$g16.DrawImage($img, 0, 0, 16, 16)
$new16.Save((Join-Path $PSScriptRoot "icon_16.png"), [System.Drawing.Imaging.ImageFormat]::Png)

$new48 = New-Object System.Drawing.Bitmap 48, 48
$g48 = [System.Drawing.Graphics]::FromImage($new48)
$g48.DrawImage($img, 0, 0, 48, 48)
$new48.Save((Join-Path $PSScriptRoot "icon_48.png"), [System.Drawing.Imaging.ImageFormat]::Png)

$new128 = New-Object System.Drawing.Bitmap 128, 128
$g128 = [System.Drawing.Graphics]::FromImage($new128)
$g128.DrawImage($img, 0, 0, 128, 128)
$new128.Save((Join-Path $PSScriptRoot "icon_128.png"), [System.Drawing.Imaging.ImageFormat]::Png)

$img.Dispose()
$new16.Dispose()
$new48.Dispose()
$new128.Dispose()
$g16.Dispose()
$g48.Dispose()
$g128.Dispose()
