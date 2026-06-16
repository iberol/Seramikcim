# ==== AYARLAR ====

$odaPath = "C:\Program Files\ODA\ODAFileConverter 27.1.0\ODAFileConverter.exe"

# DWG dosyalarının bulunduğu klasör
$inputFolder = Split-Path -Parent $MyInvocation.MyCommand.Path

# çıktı klasörü
$outputFolder = Join-Path $inputFolder "png_out"

# oluştur
if (!(Test-Path $outputFolder)) {
    New-Item -ItemType Directory -Path $outputFolder | Out-Null
}

Write-Host ""
Write-Host "ODA Converter başlatılıyor..." -ForegroundColor Cyan

# ==== DWG -> DXF ====
# ODA PNG export doğrudan her versiyonda stabil olmayabiliyor
# önce DXF üretip sonra PNG alacağız

$dxfFolder = Join-Path $inputFolder "dxf_temp"

if (!(Test-Path $dxfFolder)) {
    New-Item -ItemType Directory -Path $dxfFolder | Out-Null
}

Write-Host "DWG -> DXF dönüştürülüyor..."

& "$odaPath" `
$inputFolder `
$dxfFolder `
"ACAD2018" `
"DXF" `
"1" `
"1"

Write-Host "DXF -> PNG dönüştürülüyor..."

Get-ChildItem $dxfFolder -Filter *.dxf | ForEach-Object {

    $pngFile = Join-Path $outputFolder ($_.BaseName + ".png")

    magick -density 300 "$($_.FullName)" "$pngFile"

    Write-Host "Oluşturuldu -> $pngFile"
}

Write-Host ""
Write-Host "Tamamlandı." -ForegroundColor Green
Write-Host "PNG klasörü:"
Write-Host $outputFolder