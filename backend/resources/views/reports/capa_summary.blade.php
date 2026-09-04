@component('reports.partials.layout', ['data' => $data, 'tenant_name' => $tenant_name])
    <div class="kpi-row">
        <div class="kpi-box"><div class="lbl">Open CAPAs</div><div class="val">{{ $data['kpi']['open_count'] }}</div></div>
        <div class="kpi-box"><div class="lbl">Closed</div><div class="val">{{ $data['kpi']['closed_count'] }}</div></div>
        <div class="kpi-box"><div class="lbl">Overdue Open</div><div class="val" style="color:#991b1b;">{{ $data['kpi']['overdue_open'] }}</div></div>
        <div class="kpi-box"><div class="lbl">Ineffective</div><div class="val" style="color:#c2410c;">{{ $data['kpi']['ineffective_count'] }}</div></div>
        <div class="kpi-box"><div class="lbl">Avg Days to Close</div><div class="val">{{ $data['kpi']['avg_days_to_close'] ?? '—' }}</div></div>
        <div class="kpi-box"><div class="lbl">Median Days</div><div class="val">{{ $data['kpi']['median_days_to_close'] ?? '—' }}</div></div>
    </div>

    <h2 class="section">Monthly volume — opened vs closed</h2>
    @if (empty($data['monthly']))
        <div class="empty">No CAPA activity in this window.</div>
    @else
        <table class="data">
            <thead>
                <tr>
                    <th>Month</th>
                    <th>Opened</th>
                    <th>Closed</th>
                    <th style="width:50%">Bar (opened blue · closed green)</th>
                </tr>
            </thead>
            <tbody>
                @php $peak = max(1, collect($data['monthly'])->max(fn($m) => max($m['opened'], $m['closed']))); @endphp
                @foreach ($data['monthly'] as $m)
                    <tr>
                        <td>{{ $m['month'] }}</td>
                        <td>{{ $m['opened'] }}</td>
                        <td>{{ $m['closed'] }}</td>
                        <td>
                            <div class="bar-outer"><div class="bar-inner" style="width: {{ ($m['opened'] / $peak) * 100 }}%;"></div></div>
                            <div class="bar-outer" style="margin-top:2px;"><div class="bar-inner" style="width: {{ ($m['closed'] / $peak) * 100 }}%; background:#10b981;"></div></div>
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    <h2 class="section">Source breakdown</h2>
    @if (empty($data['source_breakdown']))
        <div class="empty">No CAPAs in this window.</div>
    @else
        <table class="data">
            <thead><tr><th>Source</th><th>Count</th></tr></thead>
            <tbody>
                @foreach ($data['source_breakdown'] as $src => $count)
                    <tr>
                        <td style="text-transform: capitalize;">{{ str_replace('_', ' ', $src) }}</td>
                        <td>{{ $count }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif
@endcomponent
