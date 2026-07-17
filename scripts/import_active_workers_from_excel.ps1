param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath
)

$ErrorActionPreference = 'Stop'

function Read-EnvFile([string]$Path) {
  $values = @{}
  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) { continue }
    $index = $line.IndexOf('=')
    $name = $line.Substring(0, $index).Trim()
    $value = $line.Substring($index + 1).Trim().Trim('"').Trim("'")
    $values[$name] = $value
  }
  return $values
}

function Normalize-Text([string]$Value) {
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

function User-Slug([string]$Value) {
  return (Normalize-Text $Value) -replace '\s+', '.'
}

if (-not (Test-Path -LiteralPath $WorkbookPath)) {
  throw "No se encontro el archivo: $WorkbookPath"
}

$envValues = Read-EnvFile (Join-Path (Get-Location) '.env')
$url = $envValues['SUPABASE_URL'].TrimEnd('/')
$key = $envValues['SUPABASE_SECRET_KEY']
if (-not $url -or -not $key) { throw 'Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env.' }

$headers = @{
  apikey = $key
  Authorization = "Bearer $key"
  'User-Agent' = 'app-formulario-server-import/1.0'
}
$existing = Invoke-RestMethod -Uri "$url/rest/v1/usuarios?select=id,nombre,email&order=id.asc" -Headers $headers
$knownNames = @{}
$knownEmails = @{}
$maxId = [int64](($existing | Measure-Object -Property id -Maximum).Maximum)
foreach ($user in $existing) {
  $knownNames[(Normalize-Text ([string]$user.nombre))] = $true
  $knownEmails[[string]$user.email.ToLowerInvariant()] = $true
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$workers = @()
$activeTotal = 0
try {
  $book = $excel.Workbooks.Open($WorkbookPath, 0, $true)
  $sheet = $book.Worksheets.Item('BASE')
  $lastRow = $sheet.UsedRange.Rows.Count

  for ($row = 2; $row -le $lastRow; $row++) {
    $fullName = ([string]$sheet.Cells.Item($row, 2).Text).Trim()
    $displayName = ([string]$sheet.Cells.Item($row, 3).Text).Trim()
    $dni = ([string]$sheet.Cells.Item($row, 4).Text).Trim()
    $position = ([string]$sheet.Cells.Item($row, 18).Text).Trim()
    $state = (Normalize-Text ([string]$sheet.Cells.Item($row, 21).Text))
    if (-not $fullName -or $state -ne 'laborando') { continue }
    $activeTotal++
    if (-not $displayName) { $displayName = $fullName }
    if (-not $dni) { throw "Falta DNI para $displayName (fila $row)." }

    $normalizedName = Normalize-Text $displayName
    if ($knownNames.ContainsKey($normalizedName)) { continue }

    $baseUsername = User-Slug $displayName
    $username = $baseUsername
    $suffix = 2
    while ($knownEmails.ContainsKey($username)) {
      $username = "$baseUsername.$suffix"
      $suffix++
    }

    $normalizedPosition = Normalize-Text $position
    $role = if ($normalizedPosition -match 'lider.*equipo') {
      'jefe de equipo'
    } elseif ($normalizedPosition -match 'jefe') {
      'jefe de grupo'
    } else {
      'operante'
    }

    $birthValue = $sheet.Cells.Item($row, 5).Value2
    $birthDate = $null
    if ($birthValue -is [double] -or $birthValue -is [int]) {
      $birthDate = [DateTime]::FromOADate([double]$birthValue).ToString('yyyy-MM-dd')
    }

    $maxId++
    $workers += [ordered]@{
      id = $maxId
      nombre = $displayName
      email = $username
      password_hash = $dni.PadLeft(8, '0')
      rol = $role
      activo = $true
      fecha_cumpleanos = $birthDate
    }
    $knownNames[$normalizedName] = $true
    $knownEmails[$username] = $true
  }
} finally {
  if ($book) { $book.Close($false) }
  $excel.Quit()
  if ($sheet) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($sheet) }
  if ($book) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($book) }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

if ($workers.Count) {
  $insertHeaders = @{
    apikey = $key
    Authorization = "Bearer $key"
    'User-Agent' = 'app-formulario-server-import/1.0'
    Prefer = 'return=representation'
    'Content-Type' = 'application/json'
  }
  $body = ConvertTo-Json -InputObject @($workers) -Depth 5 -Compress
  $inserted = Invoke-RestMethod -Method Post -Uri "$url/rest/v1/usuarios" -Headers $insertHeaders -Body $body
} else {
  $inserted = @()
}

[ordered]@{
  active_rows = $activeTotal
  inserted = $inserted.Count
  skipped_existing = $activeTotal - $workers.Count
  users = @($inserted | ForEach-Object { [ordered]@{ id = $_.id; nombre = $_.nombre; usuario = $_.email; rol = $_.rol } })
} | ConvertTo-Json -Depth 5
