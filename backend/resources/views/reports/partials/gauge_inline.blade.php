<div class="kpi-row">
    <div class="kpi-box"><div class="lbl">Total</div><div class="val">{{ $sec['kpi']['total_gauges'] }}</div></div>
    <div class="kpi-box"><div class="lbl">In Service</div><div class="val">{{ $sec['kpi']['in_service'] }}</div></div>
    <div class="kpi-box"><div class="lbl">Current %</div><div class="val">{{ $sec['kpi']['current_pct'] }}%</div></div>
    <div class="kpi-box"><div class="lbl">Overdue</div><div class="val" style="color:#991b1b;">{{ $sec['kpi']['overdue_count'] }}</div></div>
</div>

@if (! empty($sec['by_location']))
    <table class="data">
        <thead><tr><th>Location</th><th>Total</th><th>Current</th><th>Overdue</th><th>Compliance</th></tr></thead>
        <tbody>
            @foreach ($sec['by_location'] as $l)
                <tr>
                    <td><strong>{{ $l['location'] }}</strong></td>
                    <td>{{ $l['total'] }}</td>
                    <td>{{ $l['current'] }}</td>
                    <td>{{ $l['overdue'] }}</td>
                    <td>{{ $l['compliance_pct'] }}%</td>
                </tr>
            @endforeach
        </tbody>
    </table>
@endif
