<div class="kpi-row">
    <div class="kpi-box"><div class="lbl">Total</div><div class="val">{{ $sec['kpi']['total'] }}</div></div>
    <div class="kpi-box"><div class="lbl">Accepted</div><div class="val" style="color:#065f46;">{{ $sec['kpi']['accepted'] }}</div></div>
    <div class="kpi-box"><div class="lbl">Returned</div><div class="val" style="color:#991b1b;">{{ $sec['kpi']['returned'] }}</div></div>
    <div class="kpi-box"><div class="lbl">1st Pass</div><div class="val">{{ $sec['kpi']['first_pass_rate'] }}%</div></div>
</div>

@if (! empty($sec['by_customer']))
    <table class="data">
        <thead><tr><th>Customer</th><th>Total</th><th>Accepted</th><th>Returned</th></tr></thead>
        <tbody>
            @foreach ($sec['by_customer'] as $customer => $stats)
                <tr>
                    <td><strong>{{ $customer }}</strong></td>
                    <td>{{ $stats['total'] }}</td>
                    <td>{{ $stats['accepted'] }}</td>
                    <td>{{ $stats['returned'] }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>
@endif
