param(
  [string]$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$outputRoot = Join-Path $WorkspaceRoot "benchmark-results\map\phase-6a-v2"
$sourcePath = Join-Path $outputRoot "source\crownlands-phase-6a-corrected-v2-1448x1086.png"
$qaRoot = Join-Path $outputRoot "qa"
$citiesPath = Join-Path $outputRoot "cities.json"
$startsPath = Join-Path $outputRoot "starting-candidates.json"

if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Missing corrected Phase 6A map: $sourcePath" }
New-Item -ItemType Directory -Path $qaRoot -Force | Out-Null

$source = [System.Drawing.Image]::FromFile($sourcePath)

function Save-Crop {
  param(
    [string]$Name,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height
  )
  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $destination = [System.Drawing.Rectangle]::new(0, 0, $Width, $Height)
    $sourceRect = [System.Drawing.Rectangle]::new($X, $Y, $Width, $Height)
    $graphics.DrawImage($source, $destination, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
    $bitmap.Save((Join-Path $qaRoot $Name), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

try {
  Save-Crop "03-north-edge-closeup.png" 0 0 1448 300
  Save-Crop "04-east-edge-closeup.png" 1148 0 300 1086
  Save-Crop "05-south-edge-closeup.png" 0 786 1448 300
  Save-Crop "06-west-edge-closeup.png" 0 0 300 1086

  Save-Crop "07-north-road-opening.png" 464 0 520 320
  Save-Crop "08-east-road-opening.png" 928 383 520 320
  Save-Crop "09-south-road-opening.png" 464 766 520 320
  Save-Crop "10-west-road-opening.png" 0 383 520 320
  Save-Crop "11-closed-edge-without-road.png" 0 0 500 320

  $cities = Get-Content -Raw -LiteralPath $citiesPath | ConvertFrom-Json
  $starts = Get-Content -Raw -LiteralPath $startsPath | ConvertFrom-Json
  $startingIds = @{}
  foreach ($candidate in $starts) { $startingIds[$candidate.cityId] = $true }

  $markerMap = [System.Drawing.Bitmap]::new($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($markerMap)
  $font = [System.Drawing.Font]::new("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
  $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(180, 20, 15, 10))
  $cityBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(210, 145, 79, 34))
  $startBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(220, 18, 124, 176))
  $outline = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(245, 255, 226, 159), 3)
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.DrawImage($source, 0, 0, $source.Width, $source.Height)
    for ($index = 0; $index -lt $cities.Count; $index += 1) {
      $city = $cities[$index]
      $x = [int]$city.x
      $y = [int]$city.y
      $graphics.FillEllipse($shadowBrush, $x - 23, $y - 18, 46, 35)
      $brush = if ($startingIds.ContainsKey($city.id)) { $startBrush } else { $cityBrush }
      $graphics.FillEllipse($brush, $x - 20, $y - 25, 40, 40)
      $graphics.DrawEllipse($outline, $x - 20, $y - 25, 40, 40)
      $label = [string]($index + 1)
      $size = $graphics.MeasureString($label, $font)
      $graphics.DrawString($label, $font, $textBrush, $x - $size.Width / 2, $y - 22 - $size.Height / 2)
    }
    $markerMap.Save((Join-Path $qaRoot "02-all-40-city-markers.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $outline.Dispose()
    $cityBrush.Dispose()
    $startBrush.Dispose()
    $shadowBrush.Dispose()
    $textBrush.Dispose()
    $font.Dispose()
    $graphics.Dispose()
    $markerMap.Dispose()
  }
} finally {
  $source.Dispose()
}

Write-Output "Rendered corrected Phase 6A edge, road, closed-border, and 40-city marker QA PNGs."
