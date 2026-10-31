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

let drawIndex = () => {}, drawForest = () => {}, drawCollapse = () => {}, drawPredict = () => {};

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

  $('growth-lede').innerHTML = `<strong>2000년에서 2025년 사이 core 전체 논문은 ${times(F.surnames.growth_all)} 늘었고, 다섯 성의 제1저자 논문은 ${times(five.growth)} 늘었습니다.</strong> 전체 증가의 약 ${five.e.toFixed(1)}배 속도입니다. 기간 평균(2000–04 → 2020–25)으로 보면 ${fields.length}개 field 중 ${above}개에서 초과 증가율 E의 95% CI가 1을 넘고, field 평균은 ${H.mean_e.toFixed(1)}배입니다. 눈에 띄는 결과는 차이가 아니라 공통성입니다. Field 사이의 E 차이는 표본 잡음과 구분되지 않고(I²=${pp1(H.I2, 0)}), 평균 크기는 중국 소속 제1저자 비중 변화만으로 계산한 값과 같은 수준입니다(E/E_null 중앙값 ${C.ratio_median.toFixed(2)}). ML 근사는 논문 수가 ${times(ml.growth_five, 0)}로 크게 늘었지만 분야 자체가 ${times(ml.growth_all)} 커져서 E는 ${ml.e.toFixed(1)}에 그칩니다.`;
  $('growth-tiles').innerHTML = [
    [times(F.surnames.growth_all), 'Core 전체 논문', `${F.surnames.first}→${F.surnames.last}, exact count`],
    [times(five.growth), '다섯 성 합계', `초과 증가 E ${five.e.toFixed(1)} (${five.e_lo.toFixed(1)}–${five.e_hi.toFixed(1)})`],
    [times(ml.growth_five, 0), 'ML 근사 (AI + CV)', `전체 ${times(ml.growth_all)}, E ${ml.e.toFixed(1)} (${ml.e_lo.toFixed(1)}–${ml.e_hi.toFixed(1)})`],
    [times(cs.growth_five, 0), 'Computer Science', `전체 ${times(cs.growth_all)}, E ${cs.e.toFixed(1)} (${cs.e_lo.toFixed(1)}–${cs.e_hi.toFixed(1)})`],
  ].map(([v, a, b], i) => `<div class="tile" style="--tile:var(${['--viz-phys', '--viz-chen', '--viz-wang', '--viz-zhang'][i]})"><span>${a}</span><b>${v}</b><small>${b}</small></div>`).join('');

  $('growth-def').textContent = `개념: 어떤 성의 논문이 그 분야 전체보다 몇 배 빨리 늘었는가. 형식화: 기간 평균 연간 논문 수의 비 G = N(2020–25)/N(2000–04)을 성과 분야 전체에서 각각 구하면, 초과 증가율 E = G_성 / G_전체 이고 이는 제1저자 비중의 비 s(2020–25)/s(2000–04)와 같습니다. 극한: E = 1은 분야와 같은 속도, E < 1은 뒤처짐입니다. 초기 비중 s가 작으면 hit 한두 건에 E가 크게 움직이므로, 작은 분야의 큰 E는 그대로 읽지 않습니다. Null은 둘입니다. 첫째는 E = 1입니다. 둘째는 구성 null로, 전 분야 공통의 집단 내 비중(중국 소속 ${pp1(C.s_china)}, 그 외 ${pp1(C.s_other)})을 고정하고 각 field의 중국 소속 제1저자 비중 π만 바꿉니다. 이 null에는 field 표본에 맞춘 parameter가 없습니다.`;

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
  $('index-text').textContent = `연도별 core 표본(연 ${ko(Math.min(...counts))}–${ko(Math.max(...counts))}건, 같은 확률로 추출)에서 비중을 구하고, 전체 논문의 exact count를 곱해 2000년을 1로 둔 지수입니다. 5년 간격 6개 시점입니다. Guo는 2000년 hit이 ${F.surnames.rows.find(r => r.surname === 'Guo').hits_first}건뿐이라 그림에서 빼고 표에만 두었습니다. 트윗 목록에는 없지만 비교를 위해 Li를 표에 넣었습니다. Li의 E는 ${li.e.toFixed(1)}(${li.e_lo.toFixed(1)}–${li.e_hi.toFixed(1)})로 Zhang의 ${zhang.e.toFixed(1)}(${zhang.e_lo.toFixed(1)}–${zhang.e_hi.toFixed(1)})과 겹칩니다.`;
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
  $('forest-text').innerHTML = `각 field·period 셀은 무작위 600건이고, E는 2000–04와 2020–25의 비중 비입니다. ML은 OpenAlex에 분류가 없어 subfield Artificial Intelligence(1702)와 Computer Vision and Pattern Recognition(1707)의 합으로 근사했습니다. 네 subfield는 Computer Science의 부분집합이라 field와 독립이 아니며, 다중비교 보정과 동질성 검정에서 뺐습니다. Field 사이의 이질성은 Q=${H.Q.toFixed(1)}(df ${H.df}, p=${pval(H.p)}), I²=${pp1(H.I2, 0)}, τ=${H.tau.toFixed(2)}입니다. Random-effects 평균 E는 ${H.mean_e.toFixed(1)}(${H.mean_e_lo.toFixed(1)}–${H.mean_e_hi.toFixed(1)})입니다. 원시값은 ${esc(top.name)}이 ${top.e.toFixed(1)}로 가장 크고 ${esc(low.name)}이 ${low.e.toFixed(1)}로 가장 작지만, 상단의 큰 값들은 2000–04년 hit가 적은 분야입니다(${esc(top.name)} ${top.hits_early}건). τ가 0에 가까워 empirical Bayes 값은 거의 전부 ${H.mean_e.toFixed(1)} 근처로 모입니다. 이것은 field 차이가 없다는 증거가 아니라, 셀당 600건으로는 차이를 구분할 수 없다는 뜻입니다. ML 근사의 E는 ${ml.e.toFixed(2)}(${ml.e_lo.toFixed(2)}–${ml.e_hi.toFixed(2)})로 평균과 겹치고, 2000–04년 비중이 이미 ${pp1(ml.share_early)}로 높았습니다. 세로 실선은 field 평균, 빈 마름모는 구성 null의 예측입니다. 마름모는 field 수준에만 있습니다.`;
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
  $('scaling-text').textContent = `시스템 크기에 대한 scaling을 보면 시간과 공간이 다른 답을 줍니다. 같은 field 안에서 기간이 지날 때 log(다섯 성 논문)을 log(분야 논문)에 회귀한 within 지수는 β=${S.beta.toFixed(2)}(field 재추출 95% ${S.lo.toFixed(2)}–${S.hi.toFixed(2)})로 1보다 큽니다. 반면 2020–25년 한 시점에서 field를 가로지른 지수는 β=${S.between_beta.toFixed(2)}(SE ${S.between_se.toFixed(2)})로 1과 구분되지 않습니다. 큰 분야일수록 이 성들이 많다면 두 지수가 같아야 합니다. 두 값이 다르므로 초선형은 크기의 성질로 읽을 수 없고, 분야 크기와 함께 시간이 움직인 결과로 읽는 쪽이 자연스럽습니다. 여기서 β는 서술량이며 대도시 scaling 같은 법칙이 아닙니다.`;
  const positive = F.collapse.filter(c => c.y2 > 0);
  $('collapse-text').textContent = `각 점은 field×기간 셀 하나입니다(${P.n_cells}개, Y₂=0인 ${P.n_cells - P.n_positive}개는 log 축에서 빠짐). 앞 절에서 전 분야 pooled로 고정한 Y_c, Y_o, Y_x에 각 셀의 π만 넣은 값과 관측 Y₂를 비교했습니다. Spearman ρ=${P.spearman.toFixed(2)}, R²=${P.r2.toFixed(2)}로 분야가 달라도 한 곡선 근처에 모이고, 셀의 ${P.inside}/${P.n_cells}개(${pp1(P.inside / P.n_cells, 0)})가 half-sample 95% CI 안에 예측을 포함합니다. 관측 합은 예측의 ${P.mean_ratio.toFixed(2)}배입니다. CI 안 비율이 명목 95%보다 낮으므로 분야별 성 구성 차이가 일부 남아 있고, 이 곡선은 근사적 collapse이지 보편 법칙이 아닙니다.`;
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
  $('predict-text').textContent = `Field 간 E의 차이를 중국 소속 저자 포함 논문 비중의 logit 변화(exact count)로 예측했습니다. 가중 상관은 r=${Q.r_weighted.toFixed(2)}, 순열 ${ko(20000)}회 p=${pval(Q.p_perm)}입니다. Leave-one-field-out 예측의 가중 R²는 ${Q.r2_cv.toFixed(2)}로, 표본 안의 상관보다 훨씬 작습니다. 분야 전체 증가율과 E의 Spearman 상관은 ρ=${Q.growth_rho.toFixed(2)}(p=${pval(Q.growth_p)})입니다. 구성 null은 ${C.inside}/${C.n_fields}개 field에서 관측 E의 95% CI 안에 들고, E/E_null의 중앙값은 ${C.ratio_median.toFixed(2)}입니다(exact π로 바꾸면 ${C.ratio_exact_median.toFixed(2)}). 다만 26개 field를 합친 적합도 검정은 p=${pval(C.chi2_p)}로 구성 null을 정확한 모형으로 받아들이지 않습니다. 즉 평균 수준은 구성 변화와 같은 크기이지만, field별 차이를 맞히는 예측력은 사실상 없습니다.`;
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
  $('cluster-text').textContent = `궤적의 모양으로 26개 field를 Ward clustering하면 silhouette 기준 k=${K.k}, 크기 ${sizes.join('·')}, silhouette ${K.silhouette.toFixed(2)}입니다. 모든 field가 같은 궤적을 따르고 표본 잡음만 다르다는 null의 중앙값은 ${K.null_median.toFixed(2)}, p=${pval(K.null_p)}로 이 묶음은 잡음과 구분되지 않습니다. 그래서 군집에 이름을 붙이지 않고 목록도 싣지 않습니다.`;
}

function renderRetest(R, X) {
  const fit = g => R.fits.find(f => f.group === g);
  const china = fit('China'), other = fit('non-China'), pooled = fit('Pooled'), O = R.out_of_sample;
  const verdictKo = { rejected: '순수 power law 기각', compatible: '부합', undecided: '판정 불가', descriptive: '기술 통계만' };
  const fixed = china.fixed.filter(k => k.p < 0.1).map(k => `kmin=${k.kmin}`).join(', ');
  $('retest-text').innerHTML = `표본을 늘리기 전에 판정 규칙을 고정했습니다. 주 검정은 cutoff nested likelihood ratio(p&lt;0.1이면 기각)이고, 기각되지 않으면 같은 n의 lognormal 모집단을 ${R.reps.detection}회 합성해 탐지율이 ${pp1(R.rule.target_detection, 0)} 이상일 때만 "부합"이라고 씁니다. 그 아래면 "판정 불가"입니다. Pooled는 혼합 때문에 답이 정해져 있지 않아 기술 통계로만 둡니다. 결과는 표와 같습니다. 그 외 집단(n=${ko(other.n)})은 ${verdictKo[other.verdict]}, 중국 소속 집단(n=${ko(china.n)})은 ${verdictKo[china.verdict]}입니다. 그 외 집단의 lognormal 탐지율은 ${pp1(other.detect_lognormal, 0)}, 중국 소속 집단은 ${pp1(china.detect_lognormal, 0)}입니다.${fixed ? ` 주 검정 밖의 민감도로, 중국 소속 집단은 KS가 고른 kmin=${china.kmin}(tail ${china.n_tail}개)에서는 기각되지 않지만 더 낮은 ${fixed}에서는 cutoff가 유의합니다. 판정은 사전 규칙을 따르되, 이 결과는 kmin 선택에 민감하다고 적습니다.` : ''}`;
  $('retest-table').innerHTML = `<thead><tr><th scope="col">집단</th><th scope="col">n</th><th scope="col">kmin (tail)</th><th scope="col">α (95%)</th><th scope="col">Cutoff LR p</th><th scope="col">GOF p</th><th scope="col">Lognormal 탐지율</th><th scope="col">판정</th></tr></thead><tbody>${[other, china, pooled].map(f => `<tr><td>${{ 'non-China': '그 외', China: '중국 소속', Pooled: 'Pooled' }[f.group]}</td><td>${ko(f.n)}</td><td>${f.kmin} (${f.n_tail})</td><td>${num(f.alpha)} (${num(f.alpha_lo)}–${num(f.alpha_hi)})</td><td>${pval(f.p)}</td><td>${num(f.gof_p)}</td><td>${f.detect_lognormal === null ? '—' : pp1(f.detect_lognormal, 0)}</td><td>${verdictKo[f.verdict]}</td></tr>`).join('')}</tbody>`;
  $('snapshot-table').innerHTML = `<caption class="note">혼합 null의 표본 외 검정. Y_c·Y_o·Y_x는 이전 표본에서 고정하고, 새 연도별 표본의 π만 넣었습니다. 예측이 관측 변화의 ${pp1(O.fraction, 0)}, R²=${num(O.r2)}, ${O.inside}/${O.n_snapshots}개 시점이 CI 안.</caption><thead><tr><th scope="col">연도</th><th scope="col">n</th><th scope="col">π</th><th scope="col">Y₂ (95% CI)</th><th scope="col">혼합 null</th><th scope="col">CI 안</th></tr></thead><tbody>${R.snapshots.map(s => `<tr><td>${s.snapshot}</td><td>${ko(s.n)}</td><td>${pp1(s.pi)}</td><td>${s.y2_known.toFixed(5)} (${s.y2_known_lo.toFixed(5)}–${s.y2_known_hi.toFixed(5)})</td><td>${s.predicted.toFixed(5)}</td><td>${s.inside ? '예' : '아니요'}</td></tr>`).join('')}</tbody>`;
}

function bindMode() {
  const root = document.documentElement, button = $('mode-toggle');
  const apply = high => {
    root.dataset.krdsMode = high ? 'high-contrast' : 'light';
    button.setAttribute('aria-pressed', high);
    [drawAlluvial, drawLines, drawCoverage, drawRank, drawMix, drawIndex, drawForest, drawCollapse, drawPredict].forEach(f => f());
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
