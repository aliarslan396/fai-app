@component('reports.partials.layout', ['data' => $data, 'tenant_name' => $tenant_name])
    <div class="kpi-row">
        <div class="kpi-box"><div class="lbl">Total NCRs</div><div class="val">{{ $data['total_ncrs'] }}</div></div>
        <div class="kpi-box"><div class="lbl">Unique Defects</div><div class="val">{{ $data['unique_defects'] }}</div></div>
        <div class="kpi-box"><div class="lbl">Defects for 80%</div><div class="val">{{ $data['top80_defects_count'] }}</div></div>
    </div>

    <h2 class="section">Defect frequency — 80/20 view</h2>
    @if (empty($data['rows']))
        <div class="empty">No NCRs in this window.</div>
    @else
        <table class="data">
            <thead>
                <tr>
                    <th style="width:6%">#</th>
                    <th style="width:22%">Defect Code</th>
                    <th style="width:10%">Count</th>
                    <th style="width:32%">Share</th>
                    <th style="width:15%">% of Total</th>
                    <th style="width:15%">Cumulative %</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($data['rows'] as $i => $r)
                    <tr>
                        <td>{{ $i + 1 }}</td>
                        <td><strong>{{ $r['defect_code'] }}</strong></td>
                        <td>{{ $r['count'] }}</td>
                        <td>
                            <div class="bar-outer">
                                <div class="bar-inner" style="width: {{ min(100, $r['pct'] * 2) }}%;"></div>
                            </div>
                        </td>
                        <td>{{ $r['pct'] }}%</td>
                        <td>{{ $r['cumulative_pct'] }}%</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
        <div class="footnote">
            AS9100 §9.3 — top {{ $data['top80_defects_count'] }} defect codes account for 80% of all NCRs in this period.
            Focus corrective action on these.
        </div>
    @endif
@endcomponent
