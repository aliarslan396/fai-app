@if (empty($sec['rows']))
    <div class="empty">No NCRs.</div>
@else
    <table class="data">
        <thead><tr><th>#</th><th>Defect Code</th><th>Count</th><th>%</th><th>Cumulative %</th></tr></thead>
        <tbody>
            @foreach ($sec['rows'] as $i => $r)
                <tr>
                    <td>{{ $i + 1 }}</td>
                    <td><strong>{{ $r['defect_code'] }}</strong></td>
                    <td>{{ $r['count'] }}</td>
                    <td>{{ $r['pct'] }}%</td>
                    <td>{{ $r['cumulative_pct'] }}%</td>
                </tr>
            @endforeach
        </tbody>
    </table>
@endif
