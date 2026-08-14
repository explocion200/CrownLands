param(
  [string]$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Join-Path $WorkspaceRoot "benchmark-results\map\phase-6a-v3-directional"
$results = Get-Content -Raw -LiteralPath (Join-Path $root "directional-results.json") | ConvertFrom-Json

function Save-Crop {
  param([System.Drawing.Image]$Source, [string]$Path, [int]$X, [int]$Y, [int]$Width, [int]$Height)
  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.DrawImage($Source, [System.Drawing.Rectangle]::new(0, 0, $Width, $Height), [System.Drawing.Rectangle]::new($X, $Y, $Width, $Height), [System.Drawing.GraphicsUnit]::Pixel)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
}

foreach ($sample in $results.samples) {
  $sampleRoot = Join-Path $root ("samples\" + $sample.key)
  $qaRoot = Join-Path $sampleRoot "qa"
  New-Item -ItemType Directory -Path $qaRoot -Force | Out-Null
  $mapPath = Join-Path $WorkspaceRoot ($sample.map.path -replace "/", "\")
  $cities = Get-Content -Raw -LiteralPath (Join-Path $sampleRoot "cities.json") | ConvertFrom-Json
  $starts = Get-Content -Raw -LiteralPath (Join-Path $sampleRoot "starting-candidates.json") | ConvertFrom-Json
  $startingIds = @{}
  foreach ($candidate in $starts) { $startingIds[$candidate.cityId] = $true }
  $source = [System.Drawing.Image]::FromFile($mapPath)
  try {
    Save-Crop $source (Join-Path $qaRoot "03-edge-north.png") 0 0 1448 260
    Save-Crop $source (Join-Path $qaRoot "04-edge-east.png") 1188 0 260 1086
    Save-Crop $source (Join-Path $qaRoot "05-edge-south.png") 0 826 1448 260
    Save-Crop $source (Join-Path $qaRoot "06-edge-west.png") 0 0 260 1086
    Save-Crop $source (Join-Path $qaRoot "07-road-opening-north.png") 464 0 520 320

    $markers = [System.Drawing.Bitmap]::new($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($markers)
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
      $markers.Save((Join-Path $qaRoot "02-all-40-city-markers.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $outline.Dispose(); $cityBrush.Dispose(); $startBrush.Dispose(); $shadowBrush.Dispose(); $textBrush.Dispose(); $font.Dispose(); $graphics.Dispose(); $markers.Dispose()
    }

    $proof = [System.Drawing.Bitmap]::new(1000, 700, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $proofGraphics = [System.Drawing.Graphics]::FromImage($proof)
    $background = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(25, 24, 18))
    $labelBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(244, 234, 210))
    $labelFont = [System.Drawing.Font]::new("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
    try {
      $proofGraphics.FillRectangle($background, 0, 0, 1000, 700)
      $proofGraphics.DrawImage($source, [System.Drawing.Rectangle]::new(20, 35, 960, 125), [System.Drawing.Rectangle]::new(0, 0, 1448, 90), [System.Drawing.GraphicsUnit]::Pixel)
      $proofGraphics.DrawImage($source, [System.Drawing.Rectangle]::new(20, 540, 960, 125), [System.Drawing.Rectangle]::new(0, 996, 1448, 90), [System.Drawing.GraphicsUnit]::Pixel)
      $proofGraphics.DrawImage($source, [System.Drawing.Rectangle]::new(20, 180, 140, 340), [System.Drawing.Rectangle]::new(0, 0, 90, 1086), [System.Drawing.GraphicsUnit]::Pixel)
      $proofGraphics.DrawImage($source, [System.Drawing.Rectangle]::new(840, 180, 140, 340), [System.Drawing.Rectangle]::new(1358, 0, 90, 1086), [System.Drawing.GraphicsUnit]::Pixel)
      $proofGraphics.DrawString("TOP EDGE - SOURCE PIXEL 0", $labelFont, $labelBrush, 20, 8)
      $proofGraphics.DrawString("BOTTOM EDGE - SOURCE PIXEL 1085", $labelFont, $labelBrush, 20, 670)
      $proofGraphics.DrawString("LEFT", $labelFont, $labelBrush, 65, 160)
      $proofGraphics.DrawString("RIGHT", $labelFont, $labelBrush, 875, 160)
      $proof.Save((Join-Path $qaRoot "08-boundary-contact-proof.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $labelFont.Dispose(); $labelBrush.Dispose(); $background.Dispose(); $proofGraphics.Dispose(); $proof.Dispose() }
  } finally { $source.Dispose() }
}

foreach ($mode in @("clean", "cities")) {
  $contact = [System.Drawing.Bitmap]::new(1448, 1086, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $contactGraphics = [System.Drawing.Graphics]::FromImage($contact)
  $contactBackground = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(24, 23, 17))
  $contactLabelBackground = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(210, 24, 23, 17))
  $contactLabelBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(244, 234, 210))
  $contactFont = [System.Drawing.Font]::new("Georgia", 18, [System.Drawing.FontStyle]::Bold)
  try {
    $contactGraphics.FillRectangle($contactBackground, 0, 0, 1448, 1086)
    for ($index = 0; $index -lt $results.samples.Count; $index += 1) {
      $sample = $results.samples[$index]
      $column = $index % 2
      $row = [math]::Floor($index / 2)
      $x = 10 + $column * 719
      $y = 10 + $row * 538
      $imagePath = if ($mode -eq "clean") {
        Join-Path $WorkspaceRoot ($sample.map.path -replace "/", "\")
      } else {
        Join-Path $root ("samples\" + $sample.key + "\qa\02-all-40-city-markers.png")
      }
      $image = [System.Drawing.Image]::FromFile($imagePath)
      try { $contactGraphics.DrawImage($image, $x, $y, 709, 532) } finally { $image.Dispose() }
      $contactGraphics.FillRectangle($contactLabelBackground, $x + 8, $y + 8, 190, 34)
      $contactGraphics.DrawString($sample.key.ToString().ToUpperInvariant(), $contactFont, $contactLabelBrush, $x + 16, $y + 11)
    }
    $contact.Save((Join-Path $root ("directional-" + $mode + "-contact-sheet.png")), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $contactFont.Dispose(); $contactLabelBrush.Dispose(); $contactLabelBackground.Dispose(); $contactBackground.Dispose(); $contactGraphics.Dispose(); $contact.Dispose()
  }
}

Write-Output "Rendered directional Phase 6A QA for $($results.samples.Count) samples."
