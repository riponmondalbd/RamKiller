Add-Type -AssemblyName System.Drawing

function Create-RoundedImage($srcPath, $dstPath, $size, $radius) {
    $img = [System.Drawing.Image]::FromFile($srcPath)
    
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    # Set high quality smoothing for anti-aliasing
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    
    $d = $radius * 2
    # Top left
    $path.AddArc(0, 0, $d, $d, 180, 90)
    # Top right
    $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    # Bottom right
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    # Bottom left
    $path.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    
    $g.SetClip($path)
    $g.DrawImage($img, 0, 0, $size, $size)
    
    $bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $path.Dispose()
    $g.Dispose()
    $bmp.Dispose()
    $img.Dispose()
}

$src = "d:\work\extenshion\RamKiller\icon_pro.png"
Create-RoundedImage -srcPath $src -dstPath "d:\work\extenshion\RamKiller\icon_128.png" -size 128 -radius 24
Create-RoundedImage -srcPath $src -dstPath "d:\work\extenshion\RamKiller\icon_48.png" -size 48 -radius 9
Create-RoundedImage -srcPath $src -dstPath "d:\work\extenshion\RamKiller\icon_16.png" -size 16 -radius 3
