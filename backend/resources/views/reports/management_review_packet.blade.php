@component('reports.partials.layout', ['data' => $data, 'tenant_name' => $tenant_name])
    <h2 class="section">Executive summary</h2>
    <div class="kpi-row">
        <div class="kpi-box"><div class="lbl">Total NCRs</div><div class="val">{{ $data['exec_summary']['total_ncrs'] }}</div></div>
        <div class="kpi-box"><div class="lbl">Defects for 80%</div><div class="val">{{ $data['exec_summary']['top80_defects_count'] }}</div></div>
        <div class="kpi-box"><div class="lbl">Open CAPAs</div><div class="val">{{ $data['exec_summary']['capa_open'] }}</div></div>
        <div class="kpi-box"><div class="lbl">Overdue CAPAs</div><div class="val" style="color:#991b1b;">{{ $data['exec_summary']['capa_overdue'] }}</div></div>
        <div class="kpi-box">
            <div class="lbl">Gauge Compliance</div>
            <div class="val" style="color: {{ $data['exec_summary']['gauge_compliance_pct'] >= 95 ? '#065f46' : '#92400e' }};">
                {{ $data['exec_summary']['gauge_compliance_pct'] }}%
            </div>
        </div>
        <div class="kpi-box">
            <div class="lbl">FAI 1st-Pass</div>
            <div class="val" style="color: {{ $data['exec_summary']['fai_first_pass_rate'] >= 90 ? '#065f46' : '#92400e' }};">
                {{ $data['exec_summary']['fai_first_pass_rate'] }}%
            </div>
        </div>
    </div>
    <div class="footnote">AS9100 §9.3 Management Review — quarterly evidence packet</div>

    {{-- Full sections start on new pages so the review meeting can flip through --}}
    <pagebreak />
    <h2 class="section">1. NCR Pareto</h2>
    @include('reports.partials.pareto_inline', ['sec' => $data['sections']['ncr_pareto']])

    <pagebreak />
    <h2 class="section">2. CAPA Summary</h2>
    @include('reports.partials.capa_inline', ['sec' => $data['sections']['capa_summary']])

    <pagebreak />
    <h2 class="section">3. Gauge Compliance</h2>
    @include('reports.partials.gauge_inline', ['sec' => $data['sections']['gauge_compliance']])

    <pagebreak />
    <h2 class="section">4. FAI Status</h2>
    @include('reports.partials.fai_inline', ['sec' => $data['sections']['fai_status']])
@endcomponent
