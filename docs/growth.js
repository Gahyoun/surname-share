// Growth against all papers by field, and the re-test of the tail. Uses helpers from app.js.
const SUB_KO = {
  'Artificial Intelligence': 'AI',
  'Computer Vision and Pattern Recognition': 'Computer Vision',
  'Computer Networks and Communications': 'Computer Networks',
  'Information Systems': 'Information Systems',
};
const times = (x, d = 1) => `×${x.toFixed(d)}`;
const pp1 = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const period = p => p.replace('-', '–').replace(/(\d{4})–\d{2}(\d{2})/, '$1–$2');
const ko = n => n.toLocaleString('ko-KR');

let drawIndex = () => {}, drawForest = () => {}, drawCollapse = () => {}, drawPredict = () => {}, drawCommon = () => {}, drawCommonForest = () => {};

function renderGrowth(F) {
  const fields = F.growth.filter(g => g.level === 'field');
  const subs = F.growth.filter(g => g.level === 'subfield');
  const byName = n => F.growth.find(g => g.name === n);
  const five = F.surnames.rows.find(r => r.surname === 'All five');
  const zhang = F.surnames.rows.find(r => r.surname === 'Zhang');
  const li = F.surnames.rows.find(r => r.surname === 'Li');
  const H = F.heterogeneity, ml = F.ml, cs = byName('Computer Science'), S = F.scaling, P = F.physics, Q = F.prediction, C = Q.composition, K = F.clusters;
  const sorted = fields.slice().sort((a, b) => b.e - a.e);
  const nullOf = new Map(C.rows.map(r => [r.name, r]));
  const above = fields.filter(g => g.e_lo > 1).length;

  $('growth-lede').innerHTML = `<strong>2000년에서 2025년 사이 core sources 전체 논문 수는 ${F.surnames.growth_all.toFixed(1)}배로 늘어난 반면, 다섯 성씨의 제1저자 논문 수는 ${five.growth.toFixed(1)}배로 급증했습니다.</strong> 학계 전체 팽창 속도의 약 ${five.e.toFixed(1)}배에 달하는 초과 증가입니다. 5년 구간 평균(2000–04년 대비 2020–25년)으로 비교하면 전체 ${fields.length}개 field 가운데 ${above}개에서 초과 증가율 E의 95% CI 하한이 1을 상회하며, random-effects 평균 E는 ${H.mean_e.toFixed(1)}배입니다. 여기서 주목할 핵심 결과는 분야별 이질성이 아니라 보편성입니다. Field 간 E의 편차는 통계적으로 표본 추출 잡음과 구분되지 않으며(I²=${pp1(H.I2, 0)}), 전체 평균 증가 폭 역시 중국 소속 제1저자 비중(π)의 상승만으로 예측한 기준치(구성 null)와 정확히 부합합니다(E/E_null 중앙값 ${C.ratio_median.toFixed(2)}). 흔히 중국계 연구자 급증의 대표 사례로 거론되는 머신러닝(ML 근사: AI + CV) 분야는 다섯 성씨의 논문 수가 ${ml.growth_five.toFixed(0)}배로 폭발적으로 늘었지만, 같은 기간 분야 전체 규모도 ${ml.growth_all.toFixed(1)}배로 팽창했기 때문에 상대적 초과 증가율(E=${ml.e.toFixed(1)})은 학계 평균 수준에 머뭅니다.`;
  $('growth-tiles').innerHTML = [
    [times(F.surnames.growth_all), 'Core 전체 논문', `${F.surnames.first}→${F.surnames.last}, exact count`],
    [times(five.growth), '다섯 성 합계', `초과 증가 E ${five.e.toFixed(1)} (${five.e_lo.toFixed(1)}–${five.e_hi.toFixed(1)})`],
    [times(ml.growth_five, 0), 'ML 근사 (AI + CV)', `전체 ${times(ml.growth_all)}, E ${ml.e.toFixed(1)} (${ml.e_lo.toFixed(1)}–${ml.e_hi.toFixed(1)})`],
    [times(cs.growth_five, 0), 'Computer Science', `전체 ${times(cs.growth_all)}, E ${cs.e.toFixed(1)} (${cs.e_lo.toFixed(1)}–${cs.e_hi.toFixed(1)})`],
  ].map(([v, a, b], i) => `<div class="tile" style="--tile:var(${['--viz-phys', '--viz-chen', '--viz-wang', '--viz-zhang'][i]})"><span>${a}</span><b>${v}</b><small>${b}</small></div>`).join('');

  $('growth-def').textContent = `특정 성씨의 논문이 해당 학문 분야 전체의 팽창 속도보다 몇 배 빠르게 증가했는지를 측정하기 위해 '초과 증가율(excess growth ratio) E'를 정의합니다. 2000–04년 대비 2020–25년의 연평균 논문 수 증가 배율을 특정 성씨(G_성)와 분야 전체(G_전체)에서 각각 구해 나눈 비율(E = G_성 / G_전체)이며, 대수적으로는 해당 분야 내에서 그 성씨의 제1저자 비중이 몇 배로 커졌는지(후기 비중 / 초기 비중)와 정확히 일치합니다. E = 1이면 분야 전체의 성장 속도와 보조를 맞추었다는 뜻이고, E > 1이면 분야 평균보다 빠르게 비중을 넓혔다는 뜻입니다. 다만 초기(2000–04년) 비중이 매우 작은 분야에서는 표본 내 관측 건수(hit) 한두 건의 변동만으로도 분모가 요동쳐 E가 과장될 수 있으므로, 점추정치만 보지 말고 신뢰구간과 empirical Bayes 보정치를 함께 읽어야 합니다. 본 분석에서는 두 가지 기준선(baseline)을 함께 제시합니다. 첫째는 분야 성장과 동일한 속도인 E = 1이고, 둘째는 '구성 null(compositional null)'입니다. 구성 null은 다섯 성씨가 차지하는 집단 내 비중을 모든 field에서 상수(중국 소속 ${pp1(C.s_china)}, 그 외 ${pp1(C.s_other)})로 고정한 채 오직 각 field의 중국 소속 제1저자 비중(π) 변화만으로 예측한 기대 증가율로, 개별 field의 성씨 표본에 맞춰 조정한 자유 parameter가 전혀 없는 모형입니다.`;

  // Index chart from the self-weighted snapshots.
  const indexSeries = [
    { label: '전체 논문', color: '--gk-text-bolder', dash: '6 4', key: null },
    { label: '다섯 성', color: '--viz-phys-ink', key: 'All five' },
    { label: 'Zhang', color: COLOR.Zhang, key: 'Zhang' },
    { label: 'Wang', color: COLOR.Wang, key: 'Wang' },
    { label: 'Liu', color: COLOR.Liu, key: 'Liu' },
    { label: 'Chen', color: COLOR.Chen, key: 'Chen' },
  ].map(s => ({
    ...s,
    rows: F.surnames.series.map(r => ({ year: r.year, share: s.key ? r.index_all * r[s.key] / F.surnames.series[0][s.key] : r.index_all })),
  }));
  const counts = F.surnames.series.map(r => r.n);
  const countSpan = Math.min(...counts) === Math.max(...counts) ? `연 ${ko(counts[0])}건` : `연 ${ko(Math.min(...counts))}–${ko(Math.max(...counts))}건`;
  $('index-text').textContent = `5년 간격의 6개 기준 연도(2000–2025년)마다 추출한 대규모 core 표본(${countSpan})에서 성씨별 비중을 구하고, 여기에 연도별 전체 논문 수(exact count)를 곱해 2000년 수준을 1로 표준화한 양적 팽창 지수입니다. Guo는 기준 시점인 2000년 표본 내 hit 수가 ${F.surnames.rows.find(r => r.surname === 'Guo').hits_first}건뿐이어서 시계열 곡선의 분산이 과도하게 커지므로 그래프에서는 제외하고 아래 요약표에만 수록했습니다. 표 하단의 Li는 본문의 주요 5개 성씨에는 포함되지 않으나 대조군으로 함께 제시한 결과로, 초과 증가율 E가 ${li.e.toFixed(1)}(95% CI ${li.e_lo.toFixed(1)}–${li.e_hi.toFixed(1)}) 수준으로 나타나 Zhang(${zhang.e.toFixed(1)}, 95% CI ${zhang.e_lo.toFixed(1)}–${zhang.e_hi.toFixed(1)})과 동일한 증가세를 보입니다.`;
  legend($('legend-index'), indexSeries.map(s => [s.label, s.color]));
  drawIndex = () => lineChart($('index-chart'), {
    series: indexSeries, H: 400, tick: 5, format: v => `×${v}`,
    tip: year => {
      const near = indexSeries[0].rows.reduce((a, r) => (Math.abs(r.year - year) < Math.abs(a.year - year) ? r : a)).year;
      return `<b>${near}</b><br>${indexSeries.map(s => `${s.label} ${times(s.rows.find(r => r.year === near).share)}`).join('<br>')}`;
    },
  });
  drawIndex();
  $('surname-table').innerHTML = `<thead><tr><th scope="col">성</th><th scope="col">${F.surnames.first} 비중 (hit)</th><th scope="col">${F.surnames.last} 비중 (hit)</th><th scope="col">논문 수 증가</th><th scope="col">E (95% CI)</th></tr></thead><tbody>${F.surnames.rows.map(r => `<tr><td>${r.surname === 'All five' ? '다섯 성 합계' : r.surname}</td><td>${pct(r.share_first)} (${r.hits_first})</td><td>${pct(r.share_last)} (${r.hits_last})</td><td>${times(r.growth)}</td><td>${r.e.toFixed(1)} (${r.e_lo.toFixed(1)}–${r.e_hi.toFixed(1)})</td></tr>`).join('')}</tbody>`;

  // Forest plot.
  const top = sorted[0], low = sorted.at(-1);
  $('forest-text').innerHTML = `각 field×기간 셀마다 core sources에서 600건을 무작위 추출해 2000–04년 대비 2020–25년의 초과 증가율 E를 산출했습니다. OpenAlex의 상위 26개 field에는 머신러닝(ML)이 독립 분류로 존재하지 않으므로, Computer Science 산하 subfield인 Artificial Intelligence(1702)와 Computer Vision and Pattern Recognition(1707)을 결합해 'ML 근사' 지표를 구성했습니다(함께 비교한 4개 CS 세부 subfield는 상위 Computer Science와 중첩되므로 전체 다중비교 보정과 동질성 검정에서는 제외했습니다). 메타분석 동질성 검정 결과, 26개 field 간 E의 이질성은 통계적으로 유의하지 않습니다(Q=${H.Q.toFixed(1)}, df=${H.df}, p=${pval(H.p)}, I²=${pp1(H.I2, 0)}, τ=${H.tau.toFixed(2)}). Random-effects 평균 E는 ${H.mean_e.toFixed(1)}(95% CI ${H.mean_e_lo.toFixed(1)}–${H.mean_e_hi.toFixed(1)})입니다. 원시 추정치(raw E)만 보면 ${esc(top.name)}(${top.e.toFixed(1)})에서 가장 크고 ${esc(low.name)}(${low.e.toFixed(1)})에서 가장 작지만, 최상위권 분야들은 2000–04년 초기 표본의 hit 수가 극소수(${esc(top.name)} 기준 ${top.hits_early}건)여서 추정 분산이 매우 큰 경우입니다. 실제로 분야 간 진성 분산(τ)이 0에 가깝기 때문에 empirical Bayes shrinkage(수축 보정)를 적용하면 거의 모든 field의 추정치가 전체 평균(${H.mean_e.toFixed(1)}) 부근으로 수렴합니다. 물론 이는 분야 간 실제 차이가 완전히 0이라는 뜻이 아니라, 셀당 600건 규모의 표본 오차 범위 내에서는 분야별 고유 차이를 식별할 수 없다는 뜻입니다. ML 근사 분야의 E(${ml.e.toFixed(2)}, 95% CI ${ml.e_lo.toFixed(2)}–${ml.e_hi.toFixed(2)}) 역시 전체 field 평균과 겹치는데, 이는 2000–04년 당시 이미 다섯 성씨의 비중이 ${pp1(ml.share_early)}로 타 분야보다 높았던 기저 효과(base effect)가 작용했기 때문입니다. 아래 forest plot에서 세로 실선은 전체 field 평균을, 빈 마름모는 구성 null의 예측치를 나타냅니다.`;
  const state = { level: 'field', kind: 'raw' };
  const svg = $('forest');
  drawForest = () => {
    const pooledMl = { name: 'ML 근사 (AI + CV)', ...ml, e_shrunk: ml.e, e_shrunk_lo: ml.e_lo, e_shrunk_hi: ml.e_hi };
    const list = state.level === 'field' ? fields : [pooledMl, cs, ...subs];
    const get = r => (state.kind === 'raw' ? [r.e, r.e_lo, r.e_hi] : [r.e_shrunk, r.e_shrunk_lo, r.e_shrunk_hi]);
    const rows = list.slice().sort((a, b) => get(b)[0] - get(a)[0]);
    const W = 1000, step = 27, m = { t: 28, r: 40, b: 34, l: 320 }, H = m.t + m.b + step * rows.length;
    const lo = 0.7, hi = 40;
    const x = v => m.l + Math.log(Math.min(hi, Math.max(lo, v)) / lo) * (W - m.l - m.r) / Math.log(hi / lo);
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.minWidth = '640px';
    [1, 2, 4, 8, 16, 32].forEach(v => {
      el('line', { x1: x(v), x2: x(v), y1: m.t, y2: H - m.b, stroke: css(v === 1 ? '--gk-text-bolder' : '--gk-border-light'), 'stroke-width': 1, 'stroke-dasharray': v === 1 ? '6 4' : 'none' }, svg);
      el('text', { x: x(v), y: H - 12, 'text-anchor': 'middle' }, svg).textContent = v;
    });
    el('text', { x: x(1), y: 16, 'text-anchor': 'middle' }, svg).textContent = 'E = 1, 분야와 같은 속도';
    if (state.level === 'field') el('line', { x1: x(H_mean()), x2: x(H_mean()), y1: m.t, y2: H - m.b, stroke: css('--viz-phys-ink'), 'stroke-width': 2 }, svg);
    rows.forEach((r, i) => {
      const y = m.t + step * i + step / 2;
      const [e, a, b] = get(r);
      const ink = css(DOMAINS[FIELD_DOMAIN[r.name]]?.color ?? '--viz-zhang-ink');
      const name = SUB_KO[r.name] ?? r.name;
      el('text', { x: m.l - 12, y: y + 5, 'text-anchor': 'end' }, svg).textContent = name.length > 34 ? `${name.slice(0, 33)}…` : name;
      el('line', { x1: x(a), x2: x(b), y1: y, y2: y, stroke: ink, 'stroke-width': 2 }, svg);
      el('circle', { cx: x(e), cy: y, r: 6, fill: css(fillOf(DOMAINS[FIELD_DOMAIN[r.name]]?.color ?? '--viz-zhang-ink')), stroke: ink, 'stroke-width': 2 }, svg);
      const n = nullOf.get(r.name);
      if (n) el('path', { d: `M${x(n.e_null)},${y - 6}l6,6l-6,6l-6,-6Z`, fill: 'none', stroke: css('--gk-text-bolder'), 'stroke-width': 1.5 }, svg);
      const hit = el('rect', { x: 0, y: y - step / 2, width: W, height: step, fill: 'transparent' }, svg);
      hit.addEventListener('mousemove', event => showTip(event, `<b>${esc(name)}</b><br>전체 ${times(r.growth_all)}, 다섯 성 ${times(r.growth_five)}<br>비중 ${pct(r.share_early)} → ${pct(r.share_late)}<br>E ${r.e.toFixed(2)} (${r.e_lo.toFixed(2)}–${r.e_hi.toFixed(2)})<br>EB ${r.e_shrunk.toFixed(2)}${n ? `<br>구성 null ${n.e_null.toFixed(2)}` : ''}<br>hit ${r.hits_early} → ${r.hits_late}`));
      hit.addEventListener('mouseleave', hideTip);
    });
  };
  const H_mean = () => H.mean_e;
  segmented($('seg-forest-level'), [['field', '26개 field'], ['sub', 'CS·ML 세부']], state.level, v => { state.level = v; drawForest(); });
  segmented($('seg-forest-kind'), [['raw', '원시 E'], ['eb', 'Empirical Bayes']], state.kind, v => { state.kind = v; drawForest(); });
  drawForest();
  const row = g => {
    const n = nullOf.get(g.name);
    return `<tr><td>${esc(SUB_KO[g.name] ?? g.name)}</td><td>${times(g.growth_all)}</td><td>${times(g.growth_five)}</td><td>${pp1(g.share_early)} → ${pp1(g.share_late)}</td><td>${g.e.toFixed(2)} (${g.e_lo.toFixed(2)}–${g.e_hi.toFixed(2)})</td><td>${g.e_shrunk.toFixed(2)}</td><td>${n ? n.e_null.toFixed(2) : '—'}</td><td>${g.q === null || g.q === undefined ? '—' : pval(g.q)}</td><td>${pp1(g.pi_late, 0)}</td></tr>`;
  };
  $('growth-table').innerHTML = `<thead><tr><th scope="col">분야</th><th scope="col">전체 증가</th><th scope="col">다섯 성 증가</th><th scope="col">비중 변화</th><th scope="col">E (95% CI)</th><th scope="col">EB E</th><th scope="col">구성 null</th><th scope="col">FDR q</th><th scope="col">중국 포함 2020–25</th></tr></thead><tbody>${sorted.map(row).join('')}${subs.map(row).join('')}</tbody>`;

  // Scaling and collapse.
  $('scaling-text').textContent = `통계물리학의 scaling 관점에서 분야 전체 논문 수(N)와 다섯 성씨 논문 수(M)의 거듭제곱 관계(M ∝ N^β)를 검정해 보면, 시계열(longitudinal)과 횡단면(cross-sectional)에서 서로 다른 scaling 지수가 관찰됩니다. 동일한 field 안에서 시간이 흐르며 분야가 팽창할 때의 종단 지수는 β=${S.beta.toFixed(2)}(field cluster bootstrap 95% CI ${S.lo.toFixed(2)}–${S.hi.toFixed(2)})인 반면, 2020–25년 단일 시점에 여러 field를 가로질러 비교한 횡단면 지수는 β=${S.between_beta.toFixed(2)}(SE ${S.between_se.toFixed(2)})에 그칩니다. 즉 시계열에서는 뚜렷한 초선형(superlinear, β > 1) 관계가 나타나지만, 횡단면에서는 선형(β = 1)과 유의미하게 다르지 않습니다. 만약 학문 분야의 규모가 커질수록 구조적으로 특정 성씨로의 쏠림이 심화되는 내재적 법칙이 작동한다면 두 지수는 일치해야 합니다. 종단 지수와 횡단 지수가 괴리된다는 사실은, 관측된 초선형 증가가 분야 규모(size) 자체의 물리적 성질이 아니라 '분야 규모가 팽창한 지난 25년 동안 동시에 진행된 중국 소속 연구자 유입(시간 효과)'의 결과임을 보여줍니다. 따라서 여기서 추정된 β는 시계열 공변동을 요약하는 기술통계량일 뿐, 도시 물리학(urban scaling)에서 말하는 보편적 scaling 법칙으로 해석해서는 안 됩니다.`;
  const positive = F.collapse.filter(c => c.y2 > 0);
  $('collapse-text').textContent = `위 산점도의 점 하나는 개별 field×기간 셀(총 ${P.n_cells}개${P.n_cells > P.n_positive ? `, 관측 Y₂=0인 ${P.n_cells - P.n_positive}개 셀은 log 축 표시에서 제외` : ''})을 나타냅니다. 아래 분포 절에서 정의할 성씨 집중도(Y₂, 무작위 두 논문의 성씨 일치 확률)에 대해, 전체 표본에서 도출한 세 상수(Y_c, Y_o, Y_x)만 고정하고 각 셀의 중국 소속 비중(π)만 대입해 예측치를 구했습니다. 학문 분야와 시기가 전혀 다른 ${P.n_cells}개 셀인데도 관측된 Y₂가 혼합 null 예측 대각선 주위로 일제히 수렴(data collapse)하는 모습이 확인됩니다(Spearman ρ=${P.spearman.toFixed(2)}, R²=${P.r2.toFixed(2)}). 다만 half-sample bootstrap 95% CI 안에 이론 예측치가 포함되는 셀은 ${P.inside}/${P.n_cells}개(${pp1(P.inside / P.n_cells, 0)})로 명목 수준(95%)보다 약간 낮고, 관측치 평균도 예측치의 ${P.mean_ratio.toFixed(2)}배로 미세한 양(+)의 편차가 존재합니다. 이는 단일 변수 π만으로는 다 설명되지 않는 분야별 성씨 집중도 차이가 일부 남아 있음을 뜻하므로, 엄밀한 의미의 완전한 scaling collapse가 아니라 1차 근사(first-order approximation) 수준의 collapse로 이해하는 것이 타당합니다.`;
  drawCollapse = () => {
    const svg2 = $('collapse');
    const W = 1000, H2 = 480, m = { t: 14, r: 24, b: 44, l: 72 };
    const lo = 1e-4, hi = 2e-2;
    const sx = v => m.l + Math.log(v / lo) * (W - m.l - m.r) / Math.log(hi / lo);
    const sy = v => H2 - m.b - Math.log(v / lo) * (H2 - m.t - m.b) / Math.log(hi / lo);
    svg2.innerHTML = '';
    svg2.setAttribute('viewBox', `0 0 ${W} ${H2}`);
    svg2.style.minWidth = '640px';
    [1e-4, 1e-3, 1e-2].forEach(v => {
      el('line', { x1: m.l, x2: W - m.r, y1: sy(v), y2: sy(v), stroke: css('--gk-border-light'), 'stroke-width': 1 }, svg2);
      el('text', { x: m.l - 7, y: sy(v) + 5, 'text-anchor': 'end' }, svg2).textContent = v;
      el('text', { x: sx(v), y: H2 - 22, 'text-anchor': 'middle' }, svg2).textContent = v;
    });
    el('text', { x: (W - m.r + m.l) / 2, y: H2 - 3, 'text-anchor': 'middle' }, svg2).textContent = '혼합 null 예측 Y₂(π)';
    el('text', { x: 14, y: H2 / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${H2 / 2})` }, svg2).textContent = '관측 Y₂';
    el('line', { x1: sx(lo), y1: sy(lo), x2: sx(hi), y2: sy(hi), stroke: css('--gk-text-bolder'), 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }, svg2);
    positive.forEach(c => {
      const dot = el('circle', { cx: sx(Math.max(lo, c.predicted)), cy: sy(Math.max(lo, c.y2)), r: 6, fill: css('--viz-phys'), stroke: css('--viz-phys-ink'), 'stroke-width': 1.5 }, svg2);
      dot.addEventListener('mousemove', event => showTip(event, `<b>${esc(c.name)}</b><br>${period(c.period)}<br>π ${pp1(c.pi)}<br>Y₂ ${c.y2.toFixed(5)} (±${(1.96 * c.se).toFixed(5)})<br>예측 ${c.predicted.toFixed(5)}<br>n=${c.n}`));
      dot.addEventListener('mouseleave', hideTip);
    });
  };
  drawCollapse();

  // Prediction.
  $('predict-text').textContent = `그렇다면 어떤 학문 분야에서 초과 증가율 E가 더 높게 나타나는지를 데이터 사이언스 관점에서 예측할 수 있을까요? 각 field의 중국 소속 저자 포함 논문 비중(전수 exact count 기준)이 2000–04년에서 2020–25년 사이 얼마나 증가했는지를 logit 변환 변화량으로 놓고 E를 회귀 분석해 보았습니다. 표본 내에서는 약한 양의 상관관계(가중 상관계수 r=${Q.r_weighted.toFixed(2)}, 순열 검정 ${ko(20000)}회 기준 p=${pval(Q.p_perm)})를 보이지만, 표본 외 예측력을 평가하는 leave-one-field-out 교차검증 가중 R²는 ${Q.r2_cv.toFixed(2)}에 불과합니다. 각 분야 자체의 전체 논문 수 팽창 속도와 E 사이의 상관관계 역시 통계적으로 유의하지 않습니다(Spearman ρ=${Q.growth_rho.toFixed(2)}, p=${pval(Q.growth_p)}). 앞서 정의한 구성 null 예측치는 전체 ${C.n_fields}개 field 중 ${C.inside}개에서 관측 E의 95% CI 내부에 들어오며, 관측치 대 예측치 비율(E/E_null)의 중앙값도 ${C.ratio_median.toFixed(2)}(전수 exact π 적용 시 ${C.ratio_exact_median.toFixed(2)}) 수준으로 1에 매우 가깝습니다(다만 전체 카이제곱 적합도 검정에서는 p=${pval(C.chi2_p)} 수준의 미세한 잔차가 확인됩니다). 요약하면, "전 학문 분야에 걸친 평균적인 초과 증가의 크기는 중국 소속 비중의 확대로 정확히 설명되지만, 개별 field 간의 미세한 순위 차이는 표본 잡음이 지배적이어서 유의미하게 예측되지 않는다"는 것이 이 절의 결론입니다.`;
  drawPredict = () => {
    const svg3 = $('predict');
    const W = 1000, H3 = 440, m = { t: 14, r: 150, b: 44, l: 56 };
    const xs = Q.points.map(p => p.x), xLo = Math.floor(Math.min(...xs) - 0.2), xHi = Math.ceil(Math.max(...xs) + 0.2), lo = 1, hi = 16;
    const sx = v => m.l + (v - xLo) * (W - m.l - m.r) / (xHi - xLo);
    const sy = v => H3 - m.b - Math.log(v / lo) * (H3 - m.t - m.b) / Math.log(hi / lo);
    svg3.innerHTML = '';
    svg3.setAttribute('viewBox', `0 0 ${W} ${H3}`);
    svg3.style.minWidth = '640px';
    [1, 2, 4, 8, 16].forEach(v => {
      el('line', { x1: m.l, x2: W - m.r, y1: sy(v), y2: sy(v), stroke: css('--gk-border-light'), 'stroke-width': 1 }, svg3);
      el('text', { x: m.l - 7, y: sy(v) + 5, 'text-anchor': 'end' }, svg3).textContent = v;
    });
    for (let v = xLo; v <= xHi; v += 1) el('text', { x: sx(v), y: H3 - 22, 'text-anchor': 'middle' }, svg3).textContent = v;
    el('text', { x: (W - m.r + m.l) / 2, y: H3 - 3, 'text-anchor': 'middle' }, svg3).textContent = '중국 소속 포함 비중의 logit 변화, 2000–04 → 2020–25';
    el('text', { x: 14, y: H3 / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${H3 / 2})` }, svg3).textContent = '초과 증가율 E';
    const line = v => Math.exp(Q.intercept + Q.slope * v);
    el('line', { x1: sx(xLo), y1: sy(Math.max(lo, line(xLo))), x2: sx(xHi), y2: sy(Math.min(hi, line(xHi))), stroke: css('--gk-text-bolder'), 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }, svg3);
    Q.points.forEach(p => {
      const ink = DOMAINS[FIELD_DOMAIN[p.name]].color;
      const dot = el('circle', { cx: sx(p.x), cy: sy(Math.min(hi, p.e)), r: 7, fill: css(fillOf(ink)), stroke: css(ink), 'stroke-width': 1.5 }, svg3);
      dot.addEventListener('mousemove', event => showTip(event, `<b>${esc(p.name)}</b><br>E ${p.e.toFixed(2)}<br>logit 변화 ${p.x.toFixed(2)}`));
      dot.addEventListener('mouseleave', hideTip);
    });
    const ranked = Q.points.slice().sort((a, b) => b.e - a.e);
    ranked.slice(0, 3).forEach((p, i) => {
      const name = p.name.length > 18 ? `${p.name.slice(0, 17)}…` : p.name;
      const flip = i === 0;
      el('text', { x: sx(p.x) + (flip ? -11 : 11), y: sy(Math.min(hi, p.e)) + 5, 'text-anchor': flip ? 'end' : 'start' }, svg3).textContent = name;
    });
  };
  drawPredict();

  const sizes = Object.keys(K.profiles).map(k => K.members.filter(m => m.cluster === Number(k)).length);
  $('cluster-text').textContent = `추가로 26개 field의 시기별 비중 변화 궤적(trajectory) 형태를 기준으로 비지도 학습인 Ward clustering을 수행해 보았습니다. 외형상으로는 silhouette 점수 기준 ${K.k}개 군집(군집별 크기 ${sizes.join('·')}개, silhouette=${K.silhouette.toFixed(2)})이 도출됩니다. 그러나 "모든 field가 동일한 단일 평균 궤적을 따르고 오직 유한 표본 추출 잡음만 존재한다"는 귀무가설(null model) 하에서 시뮬레이션을 수행해도 silhouette 점수의 중앙값이 ${K.null_median.toFixed(2)}(p=${pval(K.null_p)})에 달해, 관측된 군집 구조는 무작위 표본 잡음과 전혀 구분되지 않습니다. 통계적 실체가 없는 군집에 사후적으로 이름을 붙이거나 목록을 제시하는 것은 전형적인 과적합(overfitting) 해석을 유발하므로, 본 페이지에서는 군집 분류표를 의도적으로 수록하지 않았습니다.`;
}

function renderCommon(C) {
  const O = C.overall, H = C.hetero, ml = C.ml;
  const row = label => O.rows.find(r => r.group === label);
  const top = row(`중국계 상위 ${C.primary}`), rest = row('그 외 상위 100'), kr = row('한국계 8개'), ind = row('인도계 8개'), spec = row('상위 100 중 특이도 높은 성'), variant = row('상위 100 + 표기 변형');
  const fieldRows = C.fields.filter(f => f.level === 'field').sort((a, b) => b.e - a.e);
  const subs = C.fields.filter(f => f.level === 'subfield').sort((a, b) => b.e - a.e);
  const pi = k => O.series.find(s => s.year === k).pi;
  $('common-lede').innerHTML = `<strong>중국 소속 저자에게 흔한 상위 ${C.primary}개 성은 ${O.first}년 core 제1저자의 ${pp1(top.share_first)}에서 ${O.last}년 ${pp1(top.share_last)}로 늘었습니다.</strong> 논문 수로는 ${times(top.growth)}로, 전체 논문의 ${times(O.growth_all)}보다 약 ${top.e.toFixed(1)}배(95% CI ${top.lo.toFixed(1)}–${top.hi.toFixed(1)}) 빠릅니다. 연 ${pp1(top.annual)}씩 전체보다 앞선 셈입니다. 같은 기간 그 외 상위 100개 성의 E는 ${rest.e.toFixed(2)}로 전체보다 느렸습니다. 다만 초과 증가는 중국 소속 저자 쪽에서 나타나고, 중국 밖 소속 저자 안에서 이 성들의 비중은 ${pp1(top.outside_first)}에서 ${pp1(top.outside_last)}로 거의 그대로입니다.`;
  $('common-tiles').innerHTML = [
    [times(O.growth_all), '전체 논문', `${O.first}→${O.last}, exact count`, '--viz-phys'],
    [times(top.growth), `중국계 상위 ${C.primary}개 성`, `비중 ${pp1(top.share_first)} → ${pp1(top.share_last)}`, '--viz-chen'],
    [top.e.toFixed(1), '초과 증가율 E', `95% CI ${top.lo.toFixed(1)}–${top.hi.toFixed(1)}`, '--viz-guo'],
    [top.outside_e.toFixed(2), '중국 밖 소속 안의 E', `95% CI ${top.outside_lo.toFixed(2)}–${top.outside_hi.toFixed(2)}`, '--viz-wang'],
  ].map(([v, a, b, c]) => `<div class="tile" style="--tile:var(${c})"><span>${a}</span><b>${v}</b><small>${b}</small></div>`).join('');
  $('common-def').textContent = `Zhang·Chen·Wang·Guo·Liu에는 중국에서 두 번째로 흔한 Li조차 빠져 있습니다. 그래서 성 목록을 손으로 고르지 않고, pooled core 표본의 중국 소속 제1저자(n=${ko(C.within.n_china)})에서 빈도순으로 뽑았습니다. 상위 5개가 중국 소속 제1저자의 ${pp1(C.coverage[5], 0)}, 20개가 ${pp1(C.coverage[20], 0)}, ${C.primary}개가 ${pp1(C.coverage[C.primary], 0)}를 차지해서, 주 분석은 상위 ${C.primary}개로 했습니다. 증가는 목록을 뽑은 표본이 아니라 연도별 core 표본(시점당 약 1만 건)과 field 표본에서 쟀기 때문에, 성을 고른 과정이 E를 부풀리지 않습니다.`;
  $('common-trend').textContent = `2000년의 소속 확인 제1저자 중 중국 소속은 ${pp1(pi(O.first))}, ${O.last}년에는 ${pp1(pi(O.last))}입니다. 상위 ${C.primary}개 성의 비중은 이 곡선을 따라 움직입니다. 집합을 5개에서 ${C.primary}개로 넓혀도 E는 ${Math.min(...[5, 10, 20, 50, 100].map(k => row(`중국계 상위 ${k}`).e)).toFixed(1)}–${Math.max(...[5, 10, 20, 50, 100].map(k => row(`중국계 상위 ${k}`).e)).toFixed(1)} 범위에 머뭅니다. 비교군을 보면 그 외 상위 100개 성은 ${rest.e.toFixed(2)}, 한국계 8개 성은 ${kr.e.toFixed(2)}, 인도계 8개 성은 ${ind.e.toFixed(2)}입니다. 성 목록의 모호함을 줄인 두 민감도도 결론을 바꾸지 않습니다. 중국 소속 비율 ${pp1(C.specific, 0)} 이상인 성만 남기면 E는 ${spec.e.toFixed(1)}, Chang·Wong·Hsu 같은 표기 변형을 더하면 ${variant.e.toFixed(1)}입니다.`;
  const series = [
    { label: `중국계 상위 ${C.primary}`, color: COLOR.Chen, key: top.group },
    { label: '중국 소속 비중 π', color: '--gk-text-bolder', dash: '6 4', key: 'pi' },
    { label: '중국 밖 소속 안', color: COLOR.Wang, key: `${top.group}|outside` },
    { label: '그 외 상위 100', color: COLOR.Zhang, key: rest.group },
    { label: '인도계 8개', color: COLOR.Guo, key: ind.group },
    { label: '한국계 8개', color: COLOR.Liu, key: kr.group },
  ].map(s => ({ ...s, rows: O.series.map(r => ({ year: r.year, share: r[s.key] })) }));
  legend($('legend-common'), series.map(s => [s.label, s.color]));
  drawCommon = () => lineChart($('common-chart'), {
    series, H: 420, tick: 0.05, right: 150,
    tip: year => {
      const near = series[0].rows.reduce((a, r) => (Math.abs(r.year - year) < Math.abs(a.year - year) ? r : a)).year;
      return `<b>${near}</b><br>${series.map(s => `${s.label} ${pp1(s.rows.find(r => r.year === near).share)}`).join('<br>')}`;
    },
  });
  drawCommon();
  $('common-table').innerHTML = `<thead><tr><th scope="col">성 집합</th><th scope="col">성 수</th><th scope="col">${O.first} 비중</th><th scope="col">${O.last} 비중</th><th scope="col">논문 수 증가</th><th scope="col">E (95% CI)</th><th scope="col">중국 밖 소속 안의 E</th></tr></thead><tbody>${O.rows.map(r => `<tr><td>${esc(r.group)}</td><td>${r.size}</td><td>${pp1(r.share_first)}</td><td>${pp1(r.share_last)}</td><td>${times(r.growth)}</td><td>${r.e.toFixed(2)} (${r.lo.toFixed(2)}–${r.hi.toFixed(2)})</td><td>${r.outside_e.toFixed(2)} (${r.outside_lo.toFixed(2)}–${r.outside_hi.toFixed(2)})</td></tr>`).join('')}</tbody>`;

  $('common-field-text').textContent = `${H.n}개 field 전부에서 E의 95% CI 하한이 1을 넘고, random-effects 평균은 ${H.mean_e.toFixed(1)}(${H.mean_lo.toFixed(1)}–${H.mean_hi.toFixed(1)})입니다. 성을 100개로 넓히니 hit가 늘어 다섯 성에서는 보이지 않던 field 차이가 드러납니다(Q=${H.Q.toFixed(1)}, df ${H.df}, p=${pval(H.p)}, I²=${pp1(H.I2, 0)}). 이 차이의 상당 부분은 출발점입니다. 2000–04년 비중이 높은 분야일수록 E가 낮습니다(Spearman ρ=${H.early_rho.toFixed(2)}, p=${pval(H.early_p)}). E에는 1/s라는 상한이 있어서, 이미 비중이 큰 분야는 같은 속도로 늘 수 없습니다. ML 근사는 비중이 ${pp1(ml.share_early)}에서 ${pp1(ml.share_late)}로 절대 수준이 가장 높은 축에 들지만, E는 ${ml.e.toFixed(2)}(${ml.lo.toFixed(2)}–${ml.hi.toFixed(2)})로 평균보다 낮습니다. 빈 마름모는 π만 바꾼 구성 null이고, ${H.n}개 중 ${H.null_inside}개 field의 CI 안에 듭니다(E/E_null 중앙값 ${H.ratio_median.toFixed(2)}). 분야 전체 증가율과 E의 관계는 뚜렷하지 않습니다(ρ=${H.growth_rho.toFixed(2)}, p=${pval(H.growth_p)}).`;
  drawCommonForest = () => {
    const svg = $('common-forest');
    const rows = [{ ...ml, ml: true }, ...fieldRows].sort((a, b) => b.e - a.e);
    const W = 1000, step = 27, m = { t: 28, r: 40, b: 34, l: 320 }, height = m.t + m.b + step * rows.length, lo = 0.7, hi = 32;
    const x = v => m.l + Math.log(Math.min(hi, Math.max(lo, v)) / lo) * (W - m.l - m.r) / Math.log(hi / lo);
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
    svg.style.minWidth = '640px';
    [1, 2, 4, 8, 16, 32].forEach(v => {
      el('line', { x1: x(v), x2: x(v), y1: m.t, y2: height - m.b, stroke: css(v === 1 ? '--gk-text-bolder' : '--gk-border-light'), 'stroke-width': 1, 'stroke-dasharray': v === 1 ? '6 4' : 'none' }, svg);
      el('text', { x: x(v), y: height - 12, 'text-anchor': 'middle' }, svg).textContent = v;
    });
    el('text', { x: x(1), y: 16, 'text-anchor': 'middle' }, svg).textContent = 'E = 1, 분야와 같은 속도';
    el('line', { x1: x(H.mean_e), x2: x(H.mean_e), y1: m.t, y2: height - m.b, stroke: css('--viz-phys-ink'), 'stroke-width': 2 }, svg);
    rows.forEach((r, i) => {
      const y = m.t + step * i + step / 2, color = DOMAINS[FIELD_DOMAIN[r.name]]?.color ?? '--viz-chen-ink', ink = css(color);
      const name = r.name.length > 34 ? `${r.name.slice(0, 33)}…` : r.name;
      el('text', { x: m.l - 12, y: y + 5, 'text-anchor': 'end', class: r.ml ? 'strong' : '' }, svg).textContent = name;
      el('line', { x1: x(r.lo), x2: x(r.hi), y1: y, y2: y, stroke: ink, 'stroke-width': 2 }, svg);
      el('circle', { cx: x(r.e), cy: y, r: 6, fill: css(fillOf(color)), stroke: ink, 'stroke-width': 2 }, svg);
      if (r.e_null) el('path', { d: `M${x(r.e_null)},${y - 6}l6,6l-6,6l-6,-6Z`, fill: 'none', stroke: css('--gk-text-bolder'), 'stroke-width': 1.5 }, svg);
      const hit = el('rect', { x: 0, y: y - step / 2, width: W, height: step, fill: 'transparent' }, svg);
      hit.addEventListener('mousemove', event => showTip(event, `<b>${esc(r.name)}</b><br>분야 전체 ${times(r.growth_all)}<br>비중 ${pp1(r.share_early)} → ${pp1(r.share_late)}<br>E ${r.e.toFixed(2)} (${r.lo.toFixed(2)}–${r.hi.toFixed(2)})${r.e_null ? `<br>구성 null ${r.e_null.toFixed(2)}` : ''}`));
      hit.addEventListener('mouseleave', hideTip);
    });
  };
  drawCommonForest();
  const fieldRow = f => `<tr><td>${esc(f.name)}</td><td>${times(f.growth_all)}</td><td>${pp1(f.share_early)} → ${pp1(f.share_late)}</td><td>${f.e.toFixed(2)} (${f.lo.toFixed(2)}–${f.hi.toFixed(2)})</td><td>${f.e_null ? f.e_null.toFixed(2) : '—'}</td></tr>`;
  $('common-field-table').innerHTML = `<thead><tr><th scope="col">분야</th><th scope="col">전체 증가</th><th scope="col">비중, 2000–04 → 2020–25</th><th scope="col">E (95% CI)</th><th scope="col">구성 null</th></tr></thead><tbody>${fieldRow(ml)}${subs.map(fieldRow).join('')}${fieldRows.map(fieldRow).join('')}</tbody>`;

  const sorted = C.surnames.slice().sort((a, b) => b.e - a.e);
  $('common-surname-text').textContent = `상위 20개 성은 빈도순으로 실었습니다. 성 하나의 hit는 수십 건이라 CI가 넓고 대부분 서로 겹칩니다. 표에서 E가 가장 큰 ${sorted[0].surname}의 ${O.first}년 hit는 ${sorted[0].hits_first}건뿐이므로, 성 사이의 순위는 해석하지 않습니다.`;
  $('common-surname-table').innerHTML = `<thead><tr><th scope="col">성</th><th scope="col">중국 소속 빈도 순위</th><th scope="col">${O.first} hit</th><th scope="col">${O.last} hit</th><th scope="col">E (95% CI)</th></tr></thead><tbody>${C.surnames.map(r => `<tr><td>${r.surname}</td><td>${r.rank}</td><td>${r.hits_first}</td><td>${r.hits_last}</td><td>${r.e.toFixed(1)} (${r.lo.toFixed(1)}–${r.hi.toFixed(1)})</td></tr>`).join('')}</tbody>`;
  $('common-limit').textContent = `성은 국적도 민족도 아닙니다. Lin, Tan, Yu 같은 성은 다른 문화권에도 있고, 표기가 같은 다른 한자를 구분하지 못합니다. "중국 밖 소속 안의 E"는 소속 기록만 나눈 값이라 해외 중국계 연구자의 수나 이주를 재지 않습니다. 이 값이 1에 가깝다는 것은 그 집단이 늘지 않았다는 뜻이 아니라, 중국 밖 저자 전체와 같은 속도로 늘었다는 뜻입니다. 2000년에는 제1저자의 약 ${pp1(1 - 0.759, 0)}가 소속 미상이라 이 값의 분모에서 빠졌습니다. 또한 core sources는 수록 범위가 바뀌는 모집단이므로, E는 중국 연구 활동량의 직접 측정이 아니라 이 색인에서의 비중 변화입니다. 표본이 시점당 약 1만 건이라 CI가 남아 있지만, 전수 집계로 바꿔도 줄어드는 것은 이 표본오차뿐입니다.`;
}

function renderRetest(R, X) {
  const fit = g => R.fits.find(f => f.group === g);
  const china = fit('China'), other = fit('non-China'), pooled = fit('Pooled'), O = R.out_of_sample;
  const verdictKo = { rejected: '순수 power law 기각', compatible: '부합', undecided: '판정 불가', descriptive: '기술 통계만' };
  const fixed = china.fixed.filter(k => k.p < 0.1).map(k => `kmin=${k.kmin}`).join(', ');
  $('retest-text').innerHTML = `표본 크기 부족으로 인한 검정력 문제를 해결하기 위해, 표본을 추가 수집하기 전에 판정 규칙(decision rule)을 사전 등록(pre-specification) 방식으로 고정했습니다. 주 검정은 순수 power law와 지수 절단(exponential cutoff) 모형 간의 nested likelihood ratio 검정(p &lt; 0.1이면 순수 power law 기각)으로 설정하고, 만약 기각되지 않더라도 동일한 표본 크기(n)의 합성 lognormal 모집단 ${R.reps.detection}회 시뮬레이션에서 기각률(탐지율)이 ${pp1(R.rule.target_detection, 0)} 이상 확보될 때만 "power law에 부합" 판정을 내리기로 규정했습니다. 검정력이 그 기준에 미달하면 "판정 불가(undecided)"로 분류합니다. 전체 합산(Pooled) 표본은 서로 다른 두 분포의 혼합이라 단일 모형 검정이 이론적으로 무의미하므로 기술통계만 보고합니다. 대규모 표본 재검정 결과는 아래 표와 같습니다. 그 외 집단(n=${ko(other.n)})은 '${verdictKo[other.verdict]}', 중국 소속 집단(n=${ko(china.n)}) 역시 '${verdictKo[china.verdict]}'로 나타났습니다. 대안 분포인 lognormal을 걸러내는 탐지율이 그 외 집단에서 ${pp1(other.detect_lognormal, 0)}, 중국 소속 집단에서 ${pp1(china.detect_lognormal, 0)}에 그쳐 사전 기준(${pp1(R.rule.target_detection, 0)})에 도달하지 못했기 때문입니다.${fixed ? ` 아울러 주 검정 외 민감도 분석을 보면, 중국 소속 집단은 KS 기준으로 선택된 kmin=${china.kmin}(tail 성씨 ${china.n_tail}개)에서는 cutoff가 기각되지 않으나 임계값을 낮춘 ${fixed} 구간에서는 오히려 cutoff 모형이 유의하게 우세합니다. 최종 판정은 사전 규칙에 따라 '판정 불가'로 유지하되, 결론이 kmin 임계값 선택에 민감하다는 점을 함께 명시합니다.` : ''}`;
  $('retest-table').innerHTML = `<thead><tr><th scope="col">집단</th><th scope="col">n</th><th scope="col">kmin (tail)</th><th scope="col">α (95%)</th><th scope="col">Cutoff LR p</th><th scope="col">GOF p</th><th scope="col">Lognormal 탐지율</th><th scope="col">판정</th></tr></thead><tbody>${[other, china, pooled].map(f => `<tr><td>${{ 'non-China': '그 외', China: '중국 소속', Pooled: 'Pooled' }[f.group]}</td><td>${ko(f.n)}</td><td>${f.kmin} (${f.n_tail})</td><td>${num(f.alpha)} (${num(f.alpha_lo)}–${num(f.alpha_hi)})</td><td>${pval(f.p)}</td><td>${num(f.gof_p)}</td><td>${f.detect_lognormal === null ? '—' : pp1(f.detect_lognormal, 0)}</td><td>${verdictKo[f.verdict]}</td></tr>`).join('')}</tbody>`;
  $('snapshot-table').innerHTML = `<caption class="note">혼합 null 모형의 표본 외(out-of-sample) 검증 결과. 집단 내·교차 상수(Y_c, Y_o, Y_x)는 기존 표본에서 추정된 값으로 고정하고, 새로 수집한 독립 연도별 표본의 중국 소속 비중(π)만 대입해 예측치를 산출했습니다. 무보정 예측만으로 실제 관측된 Y₂ 증가분의 ${pp1(O.fraction, 0)}가 재현되며(R²=${num(O.r2)}), ${O.n_snapshots}개 기준 시점 중 ${O.inside}개가 관측 95% CI 내부에 들어옵니다.</caption><thead><tr><th scope="col">연도</th><th scope="col">n</th><th scope="col">π</th><th scope="col">Y₂ (95% CI)</th><th scope="col">혼합 null</th><th scope="col">CI 안</th></tr></thead><tbody>${R.snapshots.map(s => `<tr><td>${s.snapshot}</td><td>${ko(s.n)}</td><td>${pp1(s.pi)}</td><td>${s.y2_known.toFixed(5)} (${s.y2_known_lo.toFixed(5)}–${s.y2_known_hi.toFixed(5)})</td><td>${s.predicted.toFixed(5)}</td><td>${s.inside ? '예' : '아니요'}</td></tr>`).join('')}</tbody>`;
}

function bindMode() {
  const root = document.documentElement, button = $('mode-toggle');
  const apply = high => {
    root.dataset.krdsMode = high ? 'high-contrast' : 'light';
    button.setAttribute('aria-pressed', high);
    [drawAlluvial, drawLines, drawCoverage, drawRank, drawMix, drawIndex, drawForest, drawCollapse, drawPredict, drawCommon, drawCommonForest].forEach(f => f());
  };
  let saved = null;
  try { saved = localStorage.getItem('krds-mode'); } catch (e) { saved = null; }
  if (saved === 'high-contrast') apply(true);
  button.onclick = () => {
    const high = root.dataset.krdsMode !== 'high-contrast';
    apply(high);
    try { localStorage.setItem('krds-mode', high ? 'high-contrast' : 'light'); } catch (e) { /* preference only */ }
  };
}
