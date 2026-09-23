# templates/expand-template.ps1
# Prepares ac-offer-template.xlsm for the CRM: inserts extra item rows in every
# item sheet (Excel itself does the insert, so every formula, total, name and
# Sum(Total) reference stays correct). Run it again whenever a NEW version of the
# offer file is copied over ac-offer-template.xlsm:
#
#   powershell -ExecutionPolicy Bypass -File templates\expand-template.ps1
#
# Capacities below MUST match SHEETS in utils/quotationXlsm.js.
$file = Join-Path $PSScriptRoot "ac-offer-template.xlsm"
$plan = @(
  @{ sheet = "Split";              first = 7; last = 25; target = 100; cols = "A:N" },
  @{ sheet = "Outdoor";            first = 8; last = 28; target = 100; cols = "A:N" },
  @{ sheet = "Indoor";             first = 8; last = 57; target = 200; cols = "A:N" },
  @{ sheet = "Controllers";        first = 7; last = 17; target = 50;  cols = "A:N" },
  @{ sheet = "CCU";                first = 3; last = 23; target = 100; cols = "A:N" },
  @{ sheet = "FCU";                first = 3; last = 23; target = 100; cols = "A:N" },
  @{ sheet = "Heat Pump";          first = 3; last = 10; target = 50;  cols = "A:N" },
  @{ sheet = "Package";            first = 3; last = 23; target = 100; cols = "A:N" },
  @{ sheet = "AHU";                first = 3; last = 10; target = 50;  cols = "A:N" },
  @{ sheet = "Chillers";           first = 3; last = 10; target = 50;  cols = "A:N" },
  @{ sheet = "Installation Price"; first = 32; last = 39; target = 20; cols = "A:H" }   # Separations block
)
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.AutomationSecurity = 3; $xl.EnableEvents = $false
try {
  $wb = $xl.Workbooks.Open($file)
  foreach ($p in $plan) {
    $ws = $wb.Worksheets.Item($p.sheet)
    $have = $p.last - $p.first + 1
    $k = $p.target - $have
    if ($k -le 0) { Write-Output ("{0}: already {1} rows" -f $p.sheet, $have); continue }
    # Guard: only expand once (the row after `last` must still be the template's spacer/total row).
    $probe = $ws.Cells.Item($p.last + 1, 4).Formula
    if ($probe -match 'ROW\(') { Write-Output ("{0}: looks already expanded - skipped" -f $p.sheet); continue }
    $src = $p.last - 1
    # Insert k rows at `last` (pushes the original last row down), then copy the
    # row above into the new rows: formats + formulas, input columns stay blank.
    $ws.Range(("{0}:{1}" -f $p.last, ($p.last + $k - 1))).Insert(-4121) | Out-Null   # xlShiftDown
    $c = $p.cols.Split(':')
    $ws.Range(("{0}{1}:{2}{1}" -f $c[0], $src, $c[1])).Copy() | Out-Null
    $dst = $ws.Range(("{0}{1}:{2}{3}" -f $c[0], $p.last, $c[1], ($p.last + $k - 1)))
    $dst.PasteSpecial(-4104) | Out-Null                                                # xlPasteAll
    $ws.Range("A1").Copy() | Out-Null   # clears the marching-ants copy state
    $ws.Range(("{0}:{1}" -f $p.last, ($p.last + $k - 1))).RowHeight = $ws.Rows.Item($src).RowHeight
    Write-Output ("{0}: inserted {1} rows -> items {2}-{3}" -f $p.sheet, $k, $p.first, ($p.last + $k))
  }
  $wb.Worksheets.Item("General").Activate()
  $wb.Save()
  Write-Output "saved $file"
} catch { Write-Output ("ERROR: {0}" -f $_.Exception.Message) }
finally { if ($wb) { $wb.Close($false) }; $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
