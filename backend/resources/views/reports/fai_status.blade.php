@component('reports.partials.layout', ['data' => $data, 'tenant_name' => $tenant_name])
    <div class="kpi-row">
        <div class="kpi-box"><div class="lbl">Total FAIs</div><div class="val">{{ $data['kpi']['total'] }}</div></div>
        <div class="kpi-box"><div class="lbl">Accepted</div><div class="val" style="color:#065f46;">{{ $data['kpi']['accepted'] }}</div></div>
        <div class="kpi-box"><div class="lbl">In Work</div><div class="val">{{ $data['kpi']['in_work'] }}</div></div>
        <div class="kpi-box"><div class="lbl">Submitted</div><div class="val" style="color:#1e40af;">{{ $data['kpi']['submitted'] }}</div></div>
        <div class="kpi-box"><div class="lbl">Returned</div><div class="val" style="color:#991b1b;">{{ $data['kpi']['returned'] }}</div></div>
        <div class="kpi-box">
            <div class="lbl">1st-Pass Accept %</div>
            <div class="val" style="color: {{ $data['kpi']['first_pass_rate'] >= 90 ? '#065f46' : '#92400e' }};">
                {{ $data['kpi']['first_pass_rate'] }}%
            </div>
        </div>
    </div>

    <h2 class="section">By customer</h2>
    @if (empty($data['by_customer']))
        <div class="empty">No FAIs in this window.</div>
    @else
        <table class="data">
            <thead>
                <tr>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Accepted</th>
                    <th>In Work</th>
                    <th>Submitted</th>
                    <th>Returned</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($data['by_customer'] as $customer => $stats)
                    <tr>
                        <td><strong>{{ $customer }}</strong></td>
                        <td>{{ $stats['total'] }}</td>
                        <td>{{ $stats['accepted'] }}</td>
                        <td>{{ $stats['in_work'] }}</td>
                        <td>{{ $stats['submitted'] }}</td>
                        <td>{{ $stats['returned'] }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    <h2 class="section">FAI list</h2>
    @if (empty($data['rows']))
        <div class="empty">—</div>
    @else
        <table class="data">
            <thead>
                <tr>
                    <th>FAI #</th>
                    <th>Part</th>
                    <th>Rev</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Created</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($data['rows'] as $r)
                    <tr>
                        <td><strong>{{ $r['fai_number'] }}</strong></td>
                        <td>{{ $r['part_number'] }}</td>
                        <td>{{ $r['revision'] }}</td>
                        <td>{{ $r['customer'] }}</td>
                        <td>
                            @php
                                $pill = match($r['status']) {
                                    'accepted' => 'pill-green',
                                    'submitted' => 'pill-blue',
                                    'returned' => 'pill-red',
                                    default => 'pill-slate',
                                };
                            @endphp
                            <span class="pill {{ $pill }}" style="text-transform: capitalize;">{{ str_replace('_', ' ', $r['status']) }}</span>
                        </td>
                        <td>{{ $r['created_at'] }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif
@endcomponent
