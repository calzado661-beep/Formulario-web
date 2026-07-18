param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

function Normalize-Header([string]$Value) {
  if (-not $Value) { return '' }
  $decomposed = $Value.Trim().ToLowerInvariant().Normalize([Text.NormalizationForm]::FormD)
  $builder = [Text.StringBuilder]::new()
  foreach ($character in $decomposed.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($character) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($character)
    }
  }
  return ($builder.ToString() -replace '[^a-z0-9]+', ' ').Trim()
}

function Excel-Date($Cell) {
  $value = $Cell.Value2
  if ($value -is [double] -or $value -is [int]) {
    return [DateTime]::FromOADate([double]$value).ToString('yyyy-MM-dd')
  }
  $text = ([string]$Cell.Text).Trim()
  if (-not $text) { return $null }
  $parsed = [DateTime]::MinValue
  if ([DateTime]::TryParse($text, [Globalization.CultureInfo]::GetCultureInfo('es-PE'), [Globalization.DateTimeStyles]::None, [ref]$parsed)) {
    return $parsed.ToString('yyyy-MM-dd')
  }
  return $null
}

if (-not (Test-Path -LiteralPath $WorkbookPath)) { throw "No se encontro el archivo: $WorkbookPath" }

$excel = $null
$book = $null
$sheet = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $book = $excel.Workbooks.Open($WorkbookPath, 0, $true)
  $sheet = $book.Worksheets.Item('BASE')
  $columns = @{}
  for ($column = 1; $column -le $sheet.UsedRange.Columns.Count; $column++) {
    $columns[(Normalize-Header ([string]$sheet.Cells.Item(1, $column).Text))] = $column
  }
  foreach ($required in @('nombres apellidos', 'nombres', 'f ing', 'dni', 'fecha nac', 'puesto', 'estado', 'fecha salida')) {
    if (-not $columns.ContainsKey($required)) { throw "Falta la columna '$required' en la hoja BASE." }
  }

  $workers = @()
  for ($row = 2; $row -le $sheet.UsedRange.Rows.Count; $row++) {
    $fullName = ([string]$sheet.Cells.Item($row, $columns['nombres apellidos']).Text).Trim()
    $displayName = ([string]$sheet.Cells.Item($row, $columns['nombres']).Text).Trim()
    if (-not $displayName) { $displayName = $fullName }
    if (-not $displayName) { continue }
    $workers += [ordered]@{
      row = $row
      full_name = $fullName
      name = $displayName
      dni = (([string]$sheet.Cells.Item($row, $columns['dni']).Text) -replace '[^0-9]', '').Trim()
      birth_date = Excel-Date $sheet.Cells.Item($row, $columns['fecha nac'])
      entry_date = Excel-Date $sheet.Cells.Item($row, $columns['f ing'])
      exit_date = Excel-Date $sheet.Cells.Item($row, $columns['fecha salida'])
      position = ([string]$sheet.Cells.Item($row, $columns['puesto']).Text).Trim()
      state = ([string]$sheet.Cells.Item($row, $columns['estado']).Text).Trim()
    }
  }
  ConvertTo-Json -InputObject @($workers) -Depth 5 -Compress
} finally {
  if ($book) { $book.Close($false) }
  if ($excel) { $excel.Quit() }
  if ($sheet) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($sheet) }
  if ($book) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($book) }
  if ($excel) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
