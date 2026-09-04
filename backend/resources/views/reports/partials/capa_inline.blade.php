<div class="kpi-row">
    <div class="kpi-box"><div class="lbl">Open</div><div class="val">{{ $sec['kpi']['open_count'] }}</div></div>
    <div class="kpi-box"><div class="lbl">Closed</div><div class="val">{{ $sec['kpi']['closed_count'] }}</div></div>
    <div class="kpi-box"><div class="lbl">Overdue</div><div class="val" style="color:#991b1b;">{{ $sec['kpi']['overdue_open'] }}</div></div>
    <div class="kpi-box"><div class="lbl">Avg Days</div><div class="val">{{ $sec['kpi']['avg_days_to_close'] ?? '—' }}</div></div>
</div>

@if (! empty($sec['monthly']))
    <table class="data">
        <thead><tr><th>Month</th><th>Opened</th><th>Closed</th></tr></thead>
        <tbody>
            @foreach ($sec['monthly'] as $m)
                <tr><td>{{ $m['month'] }}</td><td>{{ $m['opened'] }}</td><td>{{ $m['closed'] }}</td></tr>
            @endforeach
        </tbody>
    </table>
@endif
