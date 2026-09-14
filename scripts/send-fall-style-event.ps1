$nodePath = "C:\Program Files\nodejs\node.exe"
$senderScript = Join-Path $PSScriptRoot "resend-discount-emails.mjs"

& $nodePath $senderScript --apply --code=FALL10 --campaign=fall_style_event_2026 --expires-at=2026-09-22T01:00:00.000Z
exit $LASTEXITCODE
