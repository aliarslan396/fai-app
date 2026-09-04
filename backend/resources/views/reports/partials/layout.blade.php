<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{{ $data['title'] ?? 'FAI Report' }}</title>
<style>
    body { font-family: DejaVu Sans, sans-serif; font-size: 9pt; color: #1a1a1a; }
    .brand-band { background: #1F4E79; color: #fff; padding: 8px 14px; margin-bottom: 12px; }
    .brand-band h1 { margin: 0 0 2px 0; font-size: 14pt; font-weight: 600; }
    .brand-band .sub { font-size: 8pt; opacity: 0.85; }
    .meta-strip { display: block; margin-bottom: 10px; font-size: 8pt; color: #666; }
    .meta-strip strong { color: #1a1a1a; }
    .kpi-row { margin: 8px 0 14px 0; }
    .kpi-box { display: inline-block; border: 1px solid #d4d4d8; padding: 6px 10px; margin-right: 6px; margin-bottom: 4px; min-width: 90px; }
    .kpi-box .lbl { font-size: 7pt; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-box .val { font-size: 14pt; font-weight: 700; color: #1F4E79; }
    h2.section { font-size: 11pt; color: #1F4E79; border-bottom: 1.5px solid #1F4E79; padding-bottom: 3px; margin: 14px 0 6px 0; }
    table.data { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    table.data th { background: #f4f4f5; text-align: left; padding: 5px 8px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid #d4d4d8; }
    table.data td { padding: 5px 8px; border-bottom: 1px solid #f0f0f0; font-size: 9pt; }
    table.data tr:nth-child(even) td { background: #fafafa; }
    .pill { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 8pt; font-weight: 600; }
    .pill-green { background: #d1fae5; color: #065f46; }
    .pill-amber { background: #fef3c7; color: #92400e; }
    .pill-red { background: #fee2e2; color: #991b1b; }
    .pill-blue { background: #dbeafe; color: #1e40af; }
    .pill-slate { background: #e5e7eb; color: #374151; }
    .bar-outer { background: #f4f4f5; height: 10px; width: 100%; position: relative; overflow: hidden; border-radius: 2px; }
    .bar-inner { background: #1F4E79; height: 100%; }
    .footnote { font-size: 7pt; color: #999; margin-top: 4px; font-style: italic; }
    .empty { padding: 12px; text-align: center; color: #999; font-style: italic; font-size: 9pt; }
</style>
</head>
<body>
<div class="brand-band">
    <h1>{{ $data['title'] ?? 'FAI Report' }}</h1>
    <div class="sub">{{ $tenant_name }} · {{ \Carbon\Carbon::parse($data['generated_at'])->format('M d, Y H:i') }}</div>
</div>

<div class="meta-strip">
    <strong>Period:</strong>
    {{ \Carbon\Carbon::parse($data['window']['from'])->format('M d, Y') }}
    &rarr;
    {{ \Carbon\Carbon::parse($data['window']['to'])->format('M d, Y') }}
</div>

{{ $slot ?? '' }}
</body>
</html>
