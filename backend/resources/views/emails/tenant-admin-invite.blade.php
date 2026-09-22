<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Welcome to {{ $tenant->name }} on FAI Manager</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;line-height:1.55;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6fb;">
        <tr>
            <td align="center" style="padding:32px 16px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                    <tr>
                        <td style="background:#1F4E79;padding:24px 32px;color:#ffffff;">
                            <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.75;">FAI Manager</div>
                            <div style="font-size:20px;font-weight:600;margin-top:4px;">Your workspace is ready</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:32px;">
                            <p style="margin:0 0 16px;font-size:15px;">Hi {{ $adminName }},</p>
                            <p style="margin:0 0 16px;font-size:15px;">
                                An admin account has been created for you at
                                <strong>{{ $tenant->name }}</strong> on FAI Manager, the aerospace
                                quality-management platform. Your workspace is provisioned and ready to use.
                            </p>

                            <div style="margin:24px 0;padding:16px 20px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;">
                                <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;">Email</div>
                                <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;margin-top:2px;">{{ $adminEmail }}</div>

                                <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin-top:14px;">One-time password</div>
                                <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;margin-top:2px;color:#b45309;">{{ $adminPassword }}</div>
                                <div style="font-size:12px;color:#9ca3af;margin-top:6px;">Change this on first login.</div>
                            </div>

                            <div style="text-align:center;margin:28px 0;">
                                <a href="{{ $loginUrl }}"
                                   style="display:inline-block;background:#1F4E79;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">
                                    Sign in to your workspace
                                </a>
                            </div>

                            <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Or copy this link:</p>
                            <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#374151;word-break:break-all;">{{ $loginUrl }}</p>

                            <hr style="border:0;border-top:1px solid #e5e7eb;margin:32px 0 20px;">

                            <p style="margin:0;font-size:12px;color:#9ca3af;">
                                Not expecting this invite? Reply to this email and let us know.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
