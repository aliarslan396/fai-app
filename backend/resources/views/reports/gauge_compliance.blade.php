@component('reports.partials.layout', ['data' => $data, 'tenant_name' => $tenant_name])
    <div class="kpi-row">
        <div class="kpi-box"><div class="lbl">Total Gauges</div><div class="val">{{ $data['kpi']['total_gauges'] }}</div></div>
        <div class="kpi-box"><div class="lbl">In Service</div><div class="val">{{ $data['kpi']['in_service'] }}</div></div>
        <div class="kpi-box">
            <div class="lbl">Current %</div>
            <div class="val" style="color: {{ $data['kpi']['current_pct'] >= 95 ? '#065f46' : ($data['kpi']['current_pct'] >= 85 ? '#92400e' : '#991b1b') }};">
                {{ $data['kpi']['current_pct'] }}%
            </div>
        </div>
        <div class="kpi-box"><div class="lbl">Overdue</div><div class="val" style="color:#991b1b;">{{ $data['kpi']['overdue_count'] }}</div></div>
        <div class="kpi-box"><div class="lbl">OOT Events</div><div class="val" style="color:#c2410c;">{{ $data['kpi']['oot_events'] }}</div></div>
    </div>

    <h2 class="section">Compliance by location</h2>
    @if (empty($data['by_location']))
        <div class="empty">No gauges registered.</div>
    @else
        <table class="data">
            <thead>
                <tr>
                    <th>Location</th>
                    <th>Total</th>
                    <th>Current</th>
                    <th>Due Soon</th>
                    <th>Overdue</th>
                    <th>OOS</th>
                    <th>Compliance %</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($data['by_location'] as $loc)
                    <tr>
                        <td><strong>{{ $loc['location'] }}</strong></td>
                        <td>{{ $loc['total'] }}</td>
                        <td>{{ $loc['current'] }}</td>
                        <td>{{ $loc['due'] }}</td>
                        <td>{{ $loc['overdue'] }}</td>
                        <td>{{ $loc['out_of_service'] }}</td>
                        <td>
                            <span class="pill {{ $loc['compliance_pct'] >= 95 ? 'pill-green' : ($loc['compliance_pct'] >= 85 ? 'pill-amber' : 'pill-red') }}">
                                {{ $loc['compliance_pct'] }}%
                            </span>
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    <h2 class="section">Overdue gauges — action required</h2>
    @if (empty($data['overdue_list']))
        <div class="empty">No overdue gauges. All in-service tools are current.</div>
    @else
        <table class="data">
            <thead>
                <tr>
                    <th>Gauge ID</th>
                    <th>Type</th>
                    <th>Location</th>
                    <th>Due Date</th>
                    <th>Days Overdue</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($data['overdue_list'] as $g)
                    <tr>
                        <td><strong>{{ $g['gauge_id'] }}</strong></td>
                        <td>{{ $g['type'] }}</td>
                        <td>{{ $g['location'] }}</td>
                        <td>{{ $g['next_cal_due'] }}</td>
                        <td><span class="pill pill-red">{{ $g['days_overdue'] }}</span></td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    <h2 class="section">Recent OOT events</h2>
    @if (empty($data['oot_history']))
        <div class="empty">No OOT assessments logged in this window.</div>
    @else
        <table class="data">
            <thead>
                <tr>
                    <th>Gauge</th>
                    <th>Type</th>
                    <th>Disposition</th>
                    <th>Assessed</th>
                    <th>Assessor</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($data['oot_history'] as $o)
                    <tr>
                        <td><strong>{{ $o['gauge_id'] }}</strong></td>
                        <td>{{ $o['type'] }}</td>
                        <td style="text-transform: capitalize;">{{ str_replace('_', ' ', $o['disposition']) }}</td>
                        <td>{{ \Carbon\Carbon::parse($o['assessed_at'])->format('Y-m-d') }}</td>
                        <td>{{ $o['assessor'] }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif
@endcomponent
