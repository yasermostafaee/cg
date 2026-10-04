# INSTALLER-DESIGN-01 (P-063) - drives CG Setup's window through UI Automation, the way a person
# would: it finds the window by its title, reads every element the window exposes, presses its
# controls, moves focus and types keys, and captures the window as it is on screen.
#
# Windows PowerShell 5.1 (every runner has it), System.Windows.Automation. One command per run; the
# answer is one JSON line on stdout. ASCII only: this file is read in the system codepage.
#
#   setup-uia.ps1 -Title "<window title>" -Cmd <command> [-Arg <value>] [-Timeout <s>]
#     wait                  the window, and the page's title element (`title`) present
#     dump                  every element: automationId, control type, name, enabled, focused, status
#     invoke  <automationId> press a button or link (InvokePattern), waiting for it to be enabled
#     toggle  <automationId> flip a check box (TogglePattern)
#     set     <automationId>=<text>  type into a field (ValuePattern.SetValue) - RELEASE-0111-01 Part A
#     select  <automationId> choose a radio button (SelectionItemPattern.Select)
#     until   <text>        wait until an element's name contains <text>
#     focus                 bring the window to the foreground (UIA SetFocus, then the Win32 call)
#     keys    <sendkeys>    focus the window, then type (System.Windows.Forms.SendKeys syntax)
#     shot    <file.png>    capture the window and a margin around it (its shadow and corners)
#     rect                  the window's bounds, in screen pixels
param(
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$Cmd,
  [string]$Arg = '',
  [int]$Timeout = 60
)
$ErrorActionPreference = 'Stop'
# The answer is UTF-8: the window's words carry a middle dot, which the console code page loses.
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing, System.Windows.Forms
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class CgSetupWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  public struct RECT { public int L, T, R, B; }
}
"@
$AE = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]

function Out-Json($o) { $o | ConvertTo-Json -Compress -Depth 4 }
function Fail($m) { Out-Json @{ ok = $false; error = $m }; exit 3 }

$deadline = (Get-Date).AddSeconds($Timeout)
function Window {
  while ((Get-Date) -lt $deadline) {
    $c = New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, $Title)
    $w = $AE::RootElement.FindFirst($Scope::Children, $c)
    if ($w) { return $w }
    Start-Sleep -Milliseconds 200
  }
  Fail "no window '$Title'"
}
function Element($w, $aid, [switch]$Enabled) {
  while ((Get-Date) -lt $deadline) {
    $c = New-Object System.Windows.Automation.PropertyCondition($AE::AutomationIdProperty, $aid)
    try { $e = $w.FindFirst($Scope::Descendants, $c) } catch { $e = $null }
    if ($e -and (-not $Enabled -or $e.Current.IsEnabled)) { return $e }
    Start-Sleep -Milliseconds 200
  }
  Fail "no$(if ($Enabled) { ' enabled' }) element '$aid'"
}
function Elements($w) {
  $out = @()
  try { $all = $w.FindAll($Scope::Descendants, [System.Windows.Automation.Condition]::TrueCondition) } catch { return $out }
  foreach ($e in $all) {
    try {
      $c = $e.Current
      # RELEASE-0111-01 Part A - a field's text, a check box's state, a radio button's choice.
      $value = $null; $state = $null; $selected = $null; $p = $null
      if ($e.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) { $value = $p.Current.Value }
      if ($e.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$p)) { $state = "$($p.Current.ToggleState)" }
      if ($e.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$p)) { $selected = $p.Current.IsSelected }
      $out += [pscustomobject]@{
        id = $c.AutomationId; type = $c.ControlType.ProgrammaticName.Replace('ControlType.', ''); name = $c.Name
        enabled = $c.IsEnabled; focused = $c.HasKeyboardFocus; status = $c.ItemStatus
        value = $value; state = $state; selected = $selected
      }
    } catch { }
  }
  $out
}
function Bring($w) {
  try { $w.SetFocus() } catch { }
  [void][CgSetupWin]::SetForegroundWindow([IntPtr]$w.Current.NativeWindowHandle)
  Start-Sleep -Milliseconds 300
}

$w = Window
switch ($Cmd) {
  'wait' { [void](Element $w 'title'); Out-Json @{ ok = $true } }
  'dump' { Out-Json @{ ok = $true; elements = @(Elements $w) } }
  'invoke' {
    $e = Element $w $Arg -Enabled
    $e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    Out-Json @{ ok = $true }
  }
  'toggle' {
    $e = Element $w $Arg -Enabled
    $p = $e.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
    $p.Toggle()
    Start-Sleep -Milliseconds 200
    Out-Json @{ ok = $true; state = "$($p.Current.ToggleState)" }
  }
  'set' {
    $i = $Arg.IndexOf('=')
    if ($i -lt 1) { Fail "set needs <automationId>=<text>" }
    $aid = $Arg.Substring(0, $i)
    $e = Element $w $aid -Enabled
    $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($Arg.Substring($i + 1))
    Start-Sleep -Milliseconds 300
    # Read back through a FRESH element: an edit that clears a refusal line changes the page, and the
    # element found before it no longer belongs to it.
    $value = $null
    try { $value = (Element $w $aid).GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch { }
    Out-Json @{ ok = $true; value = $value }
  }
  'select' {
    $e = Element $w $Arg -Enabled
    $e.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
    Start-Sleep -Milliseconds 300
    $selected = $null
    try { $selected = (Element $w $Arg).GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Current.IsSelected } catch { }
    Out-Json @{ ok = $true; selected = $selected }
  }
  'until' {
    while ((Get-Date) -lt $deadline) {
      $hit = @(Elements $w | Where-Object { $_.name -like "*$Arg*" })
      if ($hit.Count -gt 0) { Out-Json @{ ok = $true; elements = @(Elements $w) }; exit 0 }
      Start-Sleep -Milliseconds 300
    }
    Fail "no element reads '$Arg'"
  }
  'focus' {
    Bring $w
    $fg = [CgSetupWin]::GetForegroundWindow()
    Out-Json @{ ok = ($fg -eq [IntPtr]$w.Current.NativeWindowHandle) }
  }
  'keys' {
    Bring $w
    [System.Windows.Forms.SendKeys]::SendWait($Arg)
    Start-Sleep -Milliseconds 400
    Out-Json @{ ok = $true }
  }
  'rect' {
    $r = $w.Current.BoundingRectangle
    Out-Json @{ ok = $true; x = $r.X; y = $r.Y; width = $r.Width; height = $r.Height }
  }
  'shot' {
    Bring $w
    Start-Sleep -Milliseconds 500
    $r = $w.Current.BoundingRectangle
    $m = 28
    $bmp = New-Object System.Drawing.Bitmap ([int]$r.Width + 2 * $m), ([int]$r.Height + 2 * $m)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $how = 'screen'
    try {
      $g.CopyFromScreen([int]$r.X - $m, [int]$r.Y - $m, 0, 0, $bmp.Size)
    } catch {
      # No composed desktop to copy from: ask the window to draw itself instead.
      $how = 'printwindow'
      $h = [IntPtr]$w.Current.NativeWindowHandle
      $dc = $g.GetHdc()
      [void][CgSetupWin]::PrintWindow($h, $dc, 2)
      $g.ReleaseHdc($dc)
    }
    $bmp.Save($Arg, [System.Drawing.Imaging.ImageFormat]::Png)
    Out-Json @{ ok = $true; how = $how; width = [int]$r.Width; height = [int]$r.Height }
  }
  default { Fail "unknown command $Cmd" }
}
