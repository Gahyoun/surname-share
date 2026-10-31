const SURNAMES = ['Zhang', 'Chen', 'Wang', 'Guo', 'Liu'];
const COLOR = { Zhang: '--viz-zhang-ink', Chen: '--viz-chen-ink', Wang: '--viz-wang-ink', Guo: '--viz-guo-ink', Liu: '--viz-liu-ink' };
const DOMAINS = {
  'Physical Sciences': { color: '--viz-phys-ink', fields: ['Engineering', 'Computer Science', 'Materials Science', 'Environmental Science', 'Physics and Astronomy', 'Chemistry', 'Mathematics', 'Earth and Planetary Sciences', 'Energy', 'Chemical Engineering'] },
  'Life Sciences': { color: '--viz-life-ink', fields: ['Biochemistry, Genetics and Molecular Biology', 'Agricultural and Biological Sciences', 'Neuroscience', 'Immunology and Microbiology', 'Pharmacology, Toxicology and Pharmaceutics'] },
  'Health Sciences': { color: '--viz-health-ink', fields: ['Medicine', 'Health Professions', 'Nursing', 'Dentistry', 'Veterinary'] },
  'Social Sciences': { color: '--viz-soc-ink', fields: ['Social Sciences', 'Psychology', 'Business, Management and Accounting', 'Economics, Econometrics and Finance', 'Decision Sciences', 'Arts and Humanities'] },
};
const FIELD_DOMAIN = {};
Object.entries(DOMAINS).forEach(([d, v]) => v.fields.forEach(f => { FIELD_DOMAIN[f] = d; }));

const fillOf = name => name.replace('-ink', '');
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const $ = id => document.getElementById(id);
const pct = (x, d = 2) => `${(100 * x).toFixed(d)}%`;
const fmt = x => Math.round(x).toLocaleString('ko-KR');
const millions = x => `${(x / 1e6).toFixed(1)}M`;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (parent) parent.appendChild(node);
  return node;
}

const tip = $('tip');
function showTip(event, html) {
  tip.innerHTML = html;
  tip.style.display = 'block';
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.min(event.clientX + 14, innerWidth - r.width - 8)}px`;
  tip.style.top = `${Math.min(event.clientY + 14, innerHeight - r.height - 8)}px`;
}
const hideTip = () => { tip.style.display = 'none'; };

function segmented(host, options, value, onChange) {
  host.innerHTML = '';
  options.forEach(([v, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', v === value);
    b.onclick = () => {
      [...host.children].forEach(c => c.setAttribute('aria-pressed', c === b));
      onChange(v);
    };
    host.appendChild(b);
  });
}

function legend(host, items) {
  host.innerHTML = items.map(([label, color]) => `<span><i style="background:var(${fillOf(color)});border-color:var(${color})"></i>${esc(label)}</span>`).join('');
}

Promise.all(['data.json', 'distribution.json', 'fields.json', 'retest.json'].map(f => fetch(f).then(r => r.json()))).then(([D, X, F, R]) => { init(D); renderDistribution(X, R, F); renderGrowth(F); renderRetest(R, X); bindMode(); });

function init(D) {
  const C = D.corpora;
  renderHeadline(D);
  renderAlluvial(D);
  renderLines(D);
  renderCoverage(D);
  renderTrendTable(C.core);
  renderDecomposition(C.core);
  renderFields(D);
  renderProse(D);
}

function renderHeadline(D) {
  const find = (c, s) => D.corpora[c].overall.find(d => d.surname === s);
  $('tiles').innerHTML = ['All five', ...SURNAMES].map(s => {
    const a = find('all', s), c = find('core', s);
    return `<div class="tile"${s === 'All five' ? '' : ` style="--tile:var(${fillOf(COLOR[s])})"`}><span>${s === 'All five' ? '다섯 성 합계' : `${s}`}</span><b>${pct(a.share)}</b>
      <small>전체 ≈ ${millions(a.papers)}편</small><small>core 2020–25: ${pct(c.recent_share)}</small></div>`;
  }).join('');
  const m = D.meta;
  $('scope').textContent = `상단 큰 숫자: OpenAlex 전체 article(1975–2025년, 약 ${millions(m.all.population)}편) 중 해당 성씨가 제1저자인 논문의 비중. 하단 작은 숫자: 주요 학술지 묶음인 CWTS core sources의 최근(2020–25년) 비중. 분석 표본 합계 ${(m.all.n_sample + m.core.n_sample).toLocaleString('ko-KR')}건.`;
}

let drawAlluvial = () => {};
function renderAlluvial(D) {
  const state = { corpus: 'core', surname: 'All five', mode: 'count', field: '' };
  const periods = D.meta.periods;
  const lookup = {};
  Object.entries(D.corpora).forEach(([k, c]) => { lookup[k] = new Map(c.cross.map(r => [`${r.surname}|${r.period}|${r.field}`, r])); });
  const fields = Object.keys(FIELD_DOMAIN);
  const pick = $('field-pick');
  fields.slice().sort().forEach(f => pick.add(new Option(f, f)));
  pick.onchange = () => { state.field = pick.value; applyHighlight(state.field); };
  segmented($('seg-corpus'), [['core', 'Core sources'], ['all', '전체 OpenAlex']], state.corpus, v => { state.corpus = v; draw(); });
  segmented($('seg-surname'), [['All five', '다섯 성'], ...SURNAMES.map(s => [s, s])], state.surname, v => { state.surname = v; draw(); });
  segmented($('seg-mode'), [['count', '추정 논문 수'], ['share', '기간별 100%']], state.mode, v => { state.mode = v; draw(); });
  legend($('legend-domain'), Object.entries(DOMAINS).map(([d, v]) => [d, v.color]));

  const svg = $('alluvial');
  const W = 1000, H = 560, top = 26, bottom = 8, left = 8, right = 200, nodeW = 12, gap = 1.5;
  let streams = [];

  function applyHighlight(field) {
    streams.forEach(s => { s.node.style.opacity = !field || s.field === field ? 1 : 0.13; });
  }

  function draw() {
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.minWidth = '720px';
    streams = [];
    const table = lookup[state.corpus];
    const value = (p, f) => { const c = table.get(`${state.surname}|${p}|${f}`); return c ? c.papers : 0; };
    const totals = periods.map(p => fields.reduce((a, f) => a + value(p, f), 0));
    const maxTotal = Math.max(...totals);
    const usable = H - top - bottom - gap * (fields.length - 1);
    const domainOrder = Object.keys(DOMAINS);
    const order = fields.slice().sort((a, b) => domainOrder.indexOf(FIELD_DOMAIN[a]) - domainOrder.indexOf(FIELD_DOMAIN[b]) || value(periods.at(-1), b) - value(periods.at(-1), a));
    const colX = i => left + i * (W - left - right - nodeW) / (periods.length - 1);
    const layout = periods.map((p, i) => {
      const scale = state.mode === 'share' ? usable / (totals[i] || 1) : usable / maxTotal;
      const spans = {};
      let y = top + (state.mode === 'share' ? 0 : (usable - totals[i] * scale) / 2);
      order.forEach(f => {
        const h = value(p, f) * scale;
        spans[f] = { y0: y, y1: y + h };
        y += h + (h > 0 ? gap : 0);
      });
      return spans;
    });
    order.forEach(f => {
      const color = css(DOMAINS[FIELD_DOMAIN[f]].color), fill = css(fillOf(DOMAINS[FIELD_DOMAIN[f]].color));
      const group = el('g', { class: 'flow' }, svg);
      for (let i = 0; i < periods.length - 1; i += 1) {
        const a = layout[i][f], b = layout[i + 1][f];
        const x0 = colX(i) + nodeW, x1 = colX(i + 1), mx = (x0 + x1) / 2;
        el('path', {
          d: `M${x0},${a.y0} C${mx},${a.y0} ${mx},${b.y0} ${x1},${b.y0} L${x1},${b.y1} C${mx},${b.y1} ${mx},${a.y1} ${x0},${a.y1} Z`,
          fill, 'fill-opacity': 0.8,
        }, group);
      }
      periods.forEach((p, i) => {
        const s = layout[i][f];
        if (s.y1 - s.y0 < 0.1) return;
        el('rect', { x: colX(i), y: s.y0, width: nodeW, height: Math.max(0.6, s.y1 - s.y0), rx: 1.5, fill: color }, group);
      });
      group.addEventListener('mousemove', event => {
        const box = svg.getBoundingClientRect();
        const x = (event.clientX - box.left) * W / box.width;
        let i = 0;
        periods.forEach((_, k) => { if (Math.abs(colX(k) + nodeW / 2 - x) < Math.abs(colX(i) + nodeW / 2 - x)) i = k; });
        const c = table.get(`${state.surname}|${periods[i]}|${f}`);
        if (!c) return;
        const label = state.surname === 'All five' ? '다섯 성' : state.surname;
        const share = totals[i] ? value(periods[i], f) / totals[i] : 0;
        showTip(event, `<b>${esc(f)}</b><br>${periods[i]} · ${label}<br>추정 ≈ ${fmt(c.papers)}편<br>field 내 비중 ${pct(c.share)} (95% CI ${pct(c.lo)}–${pct(c.hi)})<br>이 기간 ${label} 논문 중 ${pct(share, 1)}<br>표본 hit ${c.hits} / ${c.n}`);
      });
      group.addEventListener('mouseenter', () => applyHighlight(f));
      group.addEventListener('mouseleave', () => { hideTip(); applyHighlight(state.field); });
      group.addEventListener('click', () => { state.field = state.field === f ? '' : f; pick.value = state.field; applyHighlight(state.field); });
      streams.push({ node: group, field: f });
    });
    periods.forEach((p, i) => {
      const anchor = i === periods.length - 1 ? 'end' : i === 0 ? 'start' : 'middle';
      el('text', { x: i === periods.length - 1 ? colX(i) + nodeW : i === 0 ? colX(i) : colX(i) + nodeW / 2, y: 14, 'text-anchor': anchor }, svg).textContent = p.replace(/^(\d{4})-\d{2}(\d{2})$/, '$1–$2');
    });
    let lastY = -20;
    const end = layout[periods.length - 1];
    order.forEach(f => {
      const s = end[f], mid = (s.y0 + s.y1) / 2;
      if (s.y1 - s.y0 < 6 || mid - lastY < 13) return;
      el('text', { x: colX(periods.length - 1) + nodeW + 6, y: mid + 4 }, svg).textContent = f.length > 26 ? `${f.slice(0, 25)}…` : f;
      lastY = mid;
    });
    applyHighlight(state.field);
  }
  drawAlluvial = draw;
  draw();
}

function smooth(rows) {
  return rows.map((r, i) => {
    const part = rows.slice(Math.max(0, i - 1), i + 2);
    const mean = k => part.reduce((a, p) => a + p[k], 0) / part.length;
    return { ...r, share: mean('share'), lo: mean('lo'), hi: mean('hi') };
  });
}

function lineChart(svg, { series, W = 1000, H = 400, tip: tipText, tick, format }) {
  const m = { t: 14, r: 96, b: 28, l: 54 };
  const years = series[0].rows.map(r => r.year);
  const yMax = Math.ceil(Math.max(...series.flatMap(s => s.rows.map(r => r.hi ?? r.share))) / tick) * tick;
  const x = v => m.l + (v - years[0]) * (W - m.l - m.r) / (years.at(-1) - years[0]);
  const y = v => H - m.b - v * (H - m.t - m.b) / yMax;
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.minWidth = '640px';
  for (let v = 0; v <= yMax + 1e-9; v += tick) {
    el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: css('--gk-border-light'), 'stroke-width': 1 }, svg);
    el('text', { x: m.l - 7, y: y(v) + 4, 'text-anchor': 'end' }, svg).textContent = format ? format(v) : `${(v * 100).toFixed(tick < 0.01 ? 1 : 0)}%`;
  }
  years.filter(v => v % 5 === 0).forEach(v => { el('text', { x: x(v), y: H - 8, 'text-anchor': 'middle' }, svg).textContent = v; });
  series.forEach(s => {
    if (s.rows[0].lo !== undefined) {
      const band = [...s.rows.map(r => `${x(r.year)},${y(r.hi)}`), ...s.rows.slice().reverse().map(r => `${x(r.year)},${y(r.lo)}`)].join(' ');
      el('polygon', { points: band, fill: css(s.color), 'fill-opacity': 0.1 }, svg);
    }
    el('path', { d: `M${s.rows.map(r => `${x(r.year)},${y(r.share)}`).join('L')}`, fill: 'none', stroke: css(s.color), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-dasharray': s.dash || 'none' }, svg);
  });
  const labels = series.map(s => ({ s: s.label, y: y(s.rows.at(-1).share) + 4 })).sort((a, b) => a.y - b.y);
  labels.forEach((l, i) => { if (i && l.y - labels[i - 1].y < 14) l.y = labels[i - 1].y + 14; });
  labels.forEach(l => { el('text', { x: W - m.r + 7, y: l.y, class: 'strong' }, svg).textContent = l.s; });
  const cross = el('line', { y1: m.t, y2: H - m.b, stroke: css('--gk-text-subtle'), 'stroke-width': 1, visibility: 'hidden' }, svg);
  const hit = el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }, svg);
  hit.addEventListener('mousemove', event => {
    const box = svg.getBoundingClientRect();
    const px = (event.clientX - box.left) * W / box.width;
    const year = Math.max(years[0], Math.min(years.at(-1), Math.round(years[0] + (px - m.l) * (years.at(-1) - years[0]) / (W - m.l - m.r))));
    cross.setAttribute('x1', x(year)); cross.setAttribute('x2', x(year)); cross.setAttribute('visibility', 'visible');
    showTip(event, tipText(year));
  });
  hit.addEventListener('mouseleave', () => { hideTip(); cross.setAttribute('visibility', 'hidden'); });
}

let drawLines = () => {};
function renderLines(D) {
  legend($('legend-surname'), SURNAMES.map(s => [s, COLOR[s]]));
  const core = D.corpora.core.yearly.filter(d => d.year >= 2000);
  const series = SURNAMES.map(s => ({ label: s, color: COLOR[s], rows: smooth(core.filter(d => d.surname === s)) }));
  drawLines = () => lineChart($('lines'), {
    series, tick: 0.005,
    tip: year => {
      const rows = series.map(s => s.rows.find(r => r.year === year)).sort((a, b) => b.share - a.share);
      return `<b>${year}</b> (3년 이동평균)<br>${rows.map(r => `${r.surname} ${pct(r.share)} (${pct(r.lo)}–${pct(r.hi)})`).join('<br>')}`;
    },
  });
  drawLines();
}

let drawCoverage = () => {};
function renderCoverage(D) {
  const exact = D.exact.filter(r => r.year >= 2000);
  const toRows = (num, den) => exact.map(r => ({ year: r.year, share: r[num] / r[den] }));
  const series = [
    { label: 'Core', color: '--viz-zhang-ink', rows: toRows('core_cn', 'core_all') },
    { label: '전체 OpenAlex', color: '--viz-chen-ink', dash: '6 4', rows: toRows('all_cn', 'n_articles') },
  ];
  legend($('legend-coverage'), series.map(s => [s.label, s.color]));
  drawCoverage = () => lineChart($('coverage'), {
    series, H: 300, tick: 0.05,
    tip: year => `<b>${year}</b> · 중국 소속 저자 포함<br>${series.map(s => `${s.label} ${pct(s.rows.find(r => r.year === year).share, 1)}`).join('<br>')}`,
  });
  drawCoverage();
}

let drawRank = () => {};
let drawMix = () => {};
const NAME_KO = { 'All OpenAlex': '전체 OpenAlex', 'Core 2000-2025': 'Core 2000–25', 'Core, China': 'Core, 중국 소속', 'Core, non-China': 'Core, 그 외', 'Core 2000-2004': 'Core 2000–04', 'Core 2020-2025': 'Core 2020–25' };
const SYNTH_KO = { power: 'Power law', lognormal: 'Lognormal', mixture: '혼합 null' };
const num = (x, d = 2) => (x === null || x === undefined ? '—' : x.toFixed(d));
const pval = p => (p < 0.001 ? '<0.001' : p.toFixed(3));

function renderDistribution(X, R, F) {
  const fit = name => X.tails.find(t => t.name === name);
  const pooled = fit('Core 2000-2025'), china = fit('Core, China'), other = fit('Core, non-China');
  const syn = k => X.synthetic.find(s => s.kind === k);
  const M = X.mixture;
  const last = X.concentration.at(-1);
  const terms = { cc: last.pi ** 2 * M.y_china, cross: 2 * last.pi * (1 - last.pi) * M.y_cross, oo: (1 - last.pi) ** 2 * M.y_other };
  const termTotal = terms.cc + terms.cross + terms.oo;

  $('dist-lede').innerHTML = `<strong>결론부터 말하면, 저자 성씨 빈도 분포의 tail은 exponential보다 확실히 두껍지만(heavy-tailed), 엄밀한 의미의 power law를 따른다고 단정할 근거는 없습니다.</strong> 현재 표본 크기에서는 표준적인 power-law 적합도(GOF) 검정이 대안 분포인 lognormal 모집단조차 ${pct(syn('lognormal').reject_gof, 0)}밖에 기각하지 못하므로, 검정에서 기각되지 않았다는 사실만으로는 power law의 증거가 되지 못합니다. 표본을 대폭 늘려 집단별로 재검정하더라도 사전 판정 규칙에 따른 결론은 "판정 불가"입니다. 반면 통계적으로 훨씬 견고한 결과는 성씨 집중도 지표에서 확인됩니다. 무작위로 뽑은 두 논문의 제1저자 성씨가 서로 같을 확률인 Y₂(inverse participation ratio)의 시계열 증가는 중국 소속 비중 π라는 변수 하나로 거의 완벽하게 재현됩니다.`;
  $('dist-tiles').innerHTML = [
    [num(pooled.alpha), `Tail 지수 α`, `95% ${num(pooled.alpha_lo)}–${num(pooled.alpha_hi)} · n=${pooled.n_authors.toLocaleString('ko-KR')}`],
    [pct(syn('lognormal').reject_gof, 0), 'Lognormal 기각력', `합성 ${syn('lognormal').reps}회 · GOF p<0.1`],
    [`${Math.round(1 / M.y_china)} vs ${fmt(1 / M.y_other)}`, '유효 성 개수 1/Y₂', '중국 소속 vs 그 외'],
    [pct(M.null_fraction, 0), 'Y₂ 증가 재현', `π만 변화 · R²=${num(M.r2)}`],
  ].map(([v, a, b]) => `<div class="tile"><span>${a}</span><b>${v}</b><small>${b}</small></div>`).join('');

  // Rank-frequency on log-log axes.
  const seriesR = [
    { label: 'Core 2000–25', color: '--viz-phys-ink', key: 'Core 2000-2025' },
    { label: '중국 소속', color: '--viz-health-ink', key: 'Core, China' },
    { label: '그 외', color: '--viz-life-ink', key: 'Core, non-China' },
  ];
  legend($('legend-rank'), seriesR.map(s => [s.label, s.color]));
  $('rank-text').textContent = `성씨 빈도를 순위(rank)에 따라 log–log 축에 그리면 두 집단의 구조적 차이가 명확히 드러납니다. 중국 소속 집단의 곡선은 고유 성씨 ${china.n_surnames}개에서 일찍 끝나는 반면, 그 외(non-China) 집단의 곡선은 ${fmt(other.n_surnames)}개까지 길게 이어집니다. 전체(Core 2000–25) 곡선은 이질적인 두 분포가 합쳐진(pooled) 결과입니다. 상위 ${pooled.n_tail}개 성씨(tail 구간)에 적합시킨 점선의 Zipf 기울기는 −${num(pooled.zipf_exponent)}입니다. 빈도가 낮은 오른쪽 끝 구간은 유한 표본 추출(subsampling) 효과가 곡선 형태를 왜곡하는 영역이므로 해석에서 제외합니다.`;
  drawRank = () => {
    const svg = $('rank-chart');
    const W = 1000, H = 440, m = { t: 14, r: 96, b: 40, l: 56 };
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.minWidth = '640px';
    const xMax = 4.2, yMax = 2.6;
    const x = v => m.l + Math.log10(v) * (W - m.l - m.r) / xMax;
    const y = v => H - m.b - Math.log10(v) * (H - m.t - m.b) / yMax;
    [1, 10, 100].forEach(v => {
      el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: css('--gk-border-light'), 'stroke-width': 1 }, svg);
      el('text', { x: m.l - 7, y: y(v) + 4, 'text-anchor': 'end' }, svg).textContent = v;
    });
    [1, 10, 100, 1000, 10000].forEach(v => { el('text', { x: x(v), y: H - 20, 'text-anchor': 'middle' }, svg).textContent = v.toLocaleString('ko-KR'); });
    el('text', { x: (W - m.r + m.l) / 2, y: H - 3, 'text-anchor': 'middle' }, svg).textContent = '성의 순위';
    el('text', { x: 14, y: H / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${H / 2})` }, svg).textContent = '표본 내 빈도';
    seriesR.forEach(s => {
      const c = X.curves[s.key];
      const pts = c.rank.map((r, i) => `${x(r)},${y(c.freq[i])}`).join('L');
      el('path', { d: `M${pts}`, fill: 'none', stroke: css(s.color), 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
    });
    const fitLine = [1, pooled.n_tail].map(r => `${x(r)},${y(pooled.kmin * (r / pooled.n_tail) ** (-1 / (pooled.alpha - 1)))}`).join('L');
    el('path', { d: `M${fitLine}`, fill: 'none', stroke: css('--gk-text-bolder'), 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }, svg);
    seriesR.forEach((s, i) => {
      const c = X.curves[s.key];
      el('text', { x: x(c.rank.at(-1)), y: y(c.freq.at(-1)) - 8 - (i === 0 ? 15 : 0), 'text-anchor': 'end', class: 'strong' }, svg).textContent = s.label;
    });
    const hit = el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }, svg);
    hit.addEventListener('mousemove', event => {
      const box = svg.getBoundingClientRect();
      const px = (event.clientX - box.left) * W / box.width;
      const rank = 10 ** ((px - m.l) * xMax / (W - m.l - m.r));
      const lines = seriesR.map(s => {
        const c = X.curves[s.key];
        let i = 0;
        c.rank.forEach((r, j) => { if (Math.abs(Math.log(r / rank)) < Math.abs(Math.log(c.rank[i] / rank))) i = j; });
        return rank > c.rank.at(-1) * 1.2 ? `${s.label}: 범위 밖` : `${s.label}: ${c.freq[i]}회`;
      });
      showTip(event, `<b>순위 약 ${fmt(rank)}</b><br>${lines.join('<br>')}`);
    });
    hit.addEventListener('mouseleave', hideTip);
  };
  drawRank();

  // Tail fits.
  $('fit-text').textContent = `Clauset et al.(2009)의 표준 절차에 따라 이산형(discrete) power-law MLE와 KS 통계량 기반의 kmin 선택법을 적용하되, 표본 추출 왜곡이 지배하는 저빈도 구간을 배제하기 위해 하한을 kmin ≥ ${X.kmin_floor}로 제한했습니다. 아래 표의 R은 비내포(non-nested) 모형 비교를 위한 Vuong 통계량으로, R > 0이면 power law가, R < 0이면 대안 분포가 데이터를 더 잘 설명한다는 뜻입니다. 검정 결과 exponential 분포는 모든 표본에서 일관되게 기각되지만(R > 0), lognormal이나 stretched exponential 같은 다른 heavy-tailed 대안 분포들과 비교했을 때는 통계적으로 유의미한 우열이 가려지지 않습니다.`;
  const rows = X.tails.map(t => {
    if (t.alpha === null) return `<tr><td>${NAME_KO[t.name]}</td><td>${t.n_authors.toLocaleString('ko-KR')}</td><td colspan="7">빈도 ≥ ${X.kmin_floor}인 성이 50개 미만이라 적합하지 않음 (최대 빈도 ${t.k_max})</td></tr>`;
    const a = t.alternatives;
    return `<tr><td>${NAME_KO[t.name]}</td><td>${t.n_authors.toLocaleString('ko-KR')}</td><td>${t.kmin} (${t.n_tail})</td><td>${num(t.alpha)} (${num(t.alpha_lo)}–${num(t.alpha_hi)})</td><td>${num(t.gof_p)}</td><td>${num(a.exponential.R)} (${pval(a.exponential.p)})</td><td>${num(a.lognormal.R)} (${pval(a.lognormal.p)})</td><td>${num(a.stretched.R)} (${pval(a.stretched.p)})</td><td>${pval(a.cutoff.p)}</td></tr>`;
  }).join('');
  $('fit-table').innerHTML = `<thead><tr><th>표본</th><th>n</th><th>kmin (tail 성 수)</th><th>α (95%)</th><th>GOF p</th><th>R 대 exponential</th><th>R 대 lognormal</th><th>R 대 stretched</th><th>Cutoff LR p</th></tr></thead><tbody>${rows}</tbody>`;

  // Synthetic validation.
  $('synth-text').textContent = `실제 데이터를 해석하기에 앞서, 참값(ground truth)을 알고 있는 합성 모집단(synthetic population)에서 동일한 표본 크기(n=${X.n_core_equal.toLocaleString('ko-KR')})를 추출해 동일한 검정 절차를 반복 수행했습니다(모집단별 ${syn('lognormal').reps}회, GOF bootstrap은 회당 ${X.reps.synthetic_gof}회). 진짜 power law에서 추출한 표본에서는 지수 α가 정확히 복원되고 기각률(위양성)도 낮아 추정 알고리즘 자체는 정상적으로 작동합니다. 핵심 문제는 검정력(statistical power) 부족입니다. 참모집단이 lognormal이거나 혼합(mixture) null일 때도 GOF 검정이 이를 거의 기각하지 못합니다. 특히 혼합 null은 실제 중국 성씨 빈도 분포와 그 외 집단의 Y₂에 맞춘 lognormal 분포를 π=0.18 비율로 단순 결합한 모형으로, 내부에 power law 생성 메커니즘이 전혀 없는데도 겉보기 지수 α가 ${num(syn('mixture').alpha_lo)}–${num(syn('mixture').alpha_hi)} 구간으로 추정됩니다. 이는 실제 데이터에서 관측된 신뢰구간(${num(pooled.alpha_lo)}–${num(pooled.alpha_hi)})과 그대로 겹치는 범위입니다.`;
  $('synth-table').innerHTML = `<thead><tr><th>모집단</th><th>추정 α 중앙값 (95%)</th><th>Tail 성 수</th><th>GOF 기각률 (p&lt;0.1)</th><th>Lognormal 선호</th><th>Cutoff 선호</th></tr></thead><tbody>${['power', 'lognormal', 'mixture'].map(k => { const s = syn(k); return `<tr><td>${SYNTH_KO[k]}</td><td>${num(s.alpha_median)} (${num(s.alpha_lo)}–${num(s.alpha_hi)})</td><td>${fmt(s.n_tail_median)}</td><td>${pct(s.reject_gof, 0)}</td><td>${pct(s.prefers_lognormal, 0)}</td><td>${pct(s.prefers_cutoff, 0)}</td></tr>`; }).join('')}</tbody>`;

  // Mixture null.
  $('mix-text').textContent = `Y₂ = Σpₖ²는 무작위로 뽑은 두 논문의 제1저자 성씨가 서로 같을 확률로, 생태학의 Simpson 집중도이자 통계물리의 inverse participation ratio(IPR)에 해당합니다. S개의 성씨가 완전히 균등하게 분포하면 Y₂ = 1/S이고, 단 하나의 성씨만 존재하면 Y₂ = 1이 됩니다(따라서 역수인 1/Y₂는 '유효 성씨 수'로 해석할 수 있습니다). 전체 모집단이 중국 소속(비중 π)과 그 외(비중 1−π) 두 집단으로 구성될 때, 전체 집중도는 항등식 Y₂(π) = π²Y_c + (1−π)²Y_o + 2π(1−π)Y_x를 따릅니다. 여기서 집단 내 집중도(Y_c, Y_o)와 교차 집중도(Y_x)를 2000–25년 전체 기간 상수(${num(M.y_china, 4)}, ${num(M.y_other, 5)}, ${num(M.y_cross, 5)})로 고정하고 오직 연도별 중국 소속 비중 π만 변화시키면, 2000–04년에서 2020–25년 사이 실제 관측된 Y₂ 증가분(${(M.observed_change * 1e3).toFixed(2)}×10⁻³) 가운데 ${(M.null_change * 1e3).toFixed(2)}×10⁻³(${pct(M.null_fraction, 0)})가 그대로 재현됩니다. 이 혼합 null 곡선은 시계열 Y₂에 맞추어 적합(fitting)한 자유 parameter가 전혀 없는 순수 구성 모형입니다. 다만 2000–04년 구간에서는 예측치가 관측 95% CI 상단 바깥에 위치하는데, 이는 초기 표본에서 각 집단 내부의 성씨 분포가 전체 기간 평균과 다소 달랐을 가능성을 시사합니다. 최근(2020–25년) Y₂를 구성하는 성씨 일치 쌍의 기여도를 분해해 보면 중국–중국 저자 쌍이 ${pct(terms.cc / termTotal, 0)}, 교차 쌍이 ${pct(terms.cross / termTotal, 0)}, 그 외–그 외 쌍이 ${pct(terms.oo / termTotal, 0)}를 차지합니다.`;
  legend($('legend-mix'), [['연도별 측정값', '--viz-phys-ink'], ['혼합 null', '--gk-text-bolder']]);
  drawMix = () => {
    const svg = $('mix-chart');
    const W = 1000, H = 380, m = { t: 14, r: 24, b: 40, l: 72 };
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.minWidth = '640px';
    const xMax = 0.36, yMax = 0.005;
    const x = v => m.l + v * (W - m.l - m.r) / xMax;
    const y = v => H - m.b - v * (H - m.t - m.b) / yMax;
    for (let v = 0; v <= yMax + 1e-9; v += 0.001) {
      el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: css('--gk-border-light'), 'stroke-width': 1 }, svg);
      el('text', { x: m.l - 7, y: y(v) + 4, 'text-anchor': 'end' }, svg).textContent = v.toFixed(3);
    }
    [0, 0.1, 0.2, 0.3].forEach(v => { el('text', { x: x(v), y: H - 20, 'text-anchor': 'middle' }, svg).textContent = `${v * 100}%`; });
    el('text', { x: (W - m.r + m.l) / 2, y: H - 3, 'text-anchor': 'middle' }, svg).textContent = '중국 소속 제1저자 비중 π';
    const curve = [];
    for (let p = 0; p <= xMax + 1e-9; p += 0.005) curve.push(`${x(p)},${y(p * p * M.y_china + (1 - p) ** 2 * M.y_other + 2 * p * (1 - p) * M.y_cross)}`);
    el('path', { d: `M${curve.join('L')}`, fill: 'none', stroke: css('--gk-text-bolder'), 'stroke-width': 2 }, svg);
    X.annual.forEach(a => {
      const dot = el('circle', { cx: x(a.pi), cy: y(a.y2), r: 5, fill: css('--viz-phys-ink'), stroke: css('--gk-bg'), 'stroke-width': 2 }, svg);
      dot.addEventListener('mousemove', event => showTip(event, `<b>${a.year}</b><br>π ${pct(a.pi, 1)}<br>Y₂ ${a.y2.toFixed(5)}<br>혼합 null ${a.null.toFixed(5)}<br>n=${a.n_known}`));
      dot.addEventListener('mouseleave', hideTip);
    });
  };
  drawMix();
  $('mix-table').innerHTML = `<thead><tr><th>기간</th><th>π</th><th>Y₂ (95% CI)</th><th>혼합 null</th><th>중국 소속 Y_c</th><th>exp(H) 중국 소속</th><th>exp(H) 그 외</th><th>Coverage 그 외</th></tr></thead><tbody>${X.concentration.map(c => `<tr><td>${c.period.replace('-', '–')}</td><td>${pct(c.pi, 1)}</td><td>${c.y2_known.toFixed(5)} (${c.y2_known_lo.toFixed(5)}–${c.y2_known_hi.toFixed(5)})</td><td>${c.null_pooled.toFixed(5)}</td><td>${c.y_china.toFixed(4)}</td><td>${Math.round(c.hill1_china)} (n=${c.n_china})</td><td>≈ ${fmt(c.hill1_other)}</td><td>${pct(c.coverage_other, 0)}</td></tr>`).join('')}</tbody>`;
}

const annual = x => `${(100 * (Math.exp(x) - 1)).toFixed(1)}%`;
function renderTrendTable(core) {
  const rows = core.trends.map(t => {
    const name = t.surname === 'All five' ? '다섯 성 합계' : t.surname;
    return `<tr><td>${name}</td><td>${annual(t.growth)}</td><td>${annual(t.growth_lo)}–${annual(t.growth_hi)}</td><td>${t.break_lo}–${t.break_hi}</td></tr>`;
  }).join('');
  $('trend-table').innerHTML = `<thead><tr><th>성</th><th>연 성장률 2000–25</th><th>95% 구간</th><th>구조 변화 연도 95% 구간</th></tr></thead><tbody>${rows}</tbody>`;
}

function renderDecomposition(core) {
  const rows = core.decomposition.slice().reverse().map(d => `<tr><td>${d.surname === 'All five' ? '다섯 성 합계' : d.surname}</td><td>${pct(d.total_a)}</td><td>${pct(d.total_b)}</td>
    <td>${pct(d.s_cn_a, 1)} → ${pct(d.s_cn_b, 1)}</td><td>${pct(d.s_other_a)} → ${pct(d.s_other_b)}</td><td>+${(100 * d.change).toFixed(2)}pp</td><td>${(100 * d.china_composition).toFixed(2)}pp</td><td>${(100 * d.within).toFixed(2)}pp</td></tr>`).join('');
  $('decomp-table').innerHTML = `<thead><tr><th>성</th><th>2000–04</th><th>2020–25</th><th>중국 소속 내</th><th>그 외</th><th>변화</th><th>중국 비중 효과</th><th>집단 내 효과</th></tr></thead><tbody>${rows}</tbody>`;
}

function renderFields(D) {
  const state = { corpus: 'all', recent: true, sort: 'All five', desc: true };
  const columns = ['All five', ...SURNAMES];
  function draw() {
    const rows = D.corpora[state.corpus].by_field;
    const cell = new Map(rows.map(d => [`${d.surname}|${d.field}`, d]));
    const fields = [...new Set(rows.map(d => d.field))];
    const get = (s, f) => { const c = cell.get(`${s}|${f}`); return state.recent ? c.recent_share : c.share; };
    const max = Math.max(...fields.map(f => get('All five', f)));
    const single = Math.max(...fields.flatMap(f => SURNAMES.map(s => get(s, f))));
    const sorted = fields.slice().sort((a, b) => {
      const order = state.sort === 'field' ? a.localeCompare(b) : get(state.sort, a) - get(state.sort, b);
      return state.desc ? -order : order;
    });
    const head = `<tr><th><button data-k="field">Field</button></th><th>표본</th>${columns.map(c => `<th><button data-k="${c}">${c === 'All five' ? '합계' : c}${state.sort === c ? (state.desc ? ' ↓' : ' ↑') : ''}</button></th>`).join('')}</tr>`;
    const body = sorted.map(f => {
      const n = cell.get(`All five|${f}`).n_recent;
      const thin = state.recent && state.corpus === 'core' && n < 300;
      return `<tr${thin ? ' class="thin"' : ''}><td>${esc(f)}</td><td>${state.recent ? n.toLocaleString('ko-KR') : ''}</td>${columns.map(c => {
        const d = cell.get(`${c}|${f}`), v = get(c, f);
        const lo = state.recent ? d.recent_lo : d.lo, hi = state.recent ? d.recent_hi : d.hi;
        const alpha = (v / (c === 'All five' ? max : single)) * 100;
        return `<td title="95% CI ${pct(Math.max(0, lo))}–${pct(hi)}" style="background:color-mix(in srgb, var(--viz-zhang) ${alpha.toFixed(0)}%, transparent)">${pct(v)}</td>`;
      }).join('')}</tr>`;
    }).join('');
    $('field-table').innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
    $('field-table').querySelectorAll('th button').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.k;
        state.desc = state.sort === k ? !state.desc : k !== 'field';
        state.sort = k;
        draw();
      };
    });
  }
  segmented($('seg-field-corpus'), [['all', '전체 OpenAlex'], ['core', 'Core sources']], 'all', v => { state.corpus = v; draw(); });
  segmented($('seg-period'), [['recent', '2020–25'], ['all', '1975–2025 전체']], 'recent', v => { state.recent = v === 'recent'; draw(); });
  draw();
}

function renderProse(D) {
  const { all, core } = D.corpora;
  const a = s => all.overall.find(d => d.surname === s);
  const c = s => core.overall.find(d => d.surname === s);
  const t = s => core.trends.find(d => d.surname === s);
  const dec = s => core.decomposition.find(d => d.surname === s);
  const ex = y => D.exact.find(r => r.year === y);
  const liCore = core.top_recent.find(d => d.surname === 'Li');
  const pp = x => `${(100 * x).toFixed(2)}pp`;
  const cnShare = (y, k) => pct(ex(y)[k] / ex(y)[k === 'core_cn' ? 'core_all' : 'n_articles'], 1);
  const validity = core.validity;
  const five = dec('All five'), z = dec('Zhang');
  $('lede').innerHTML = `제1저자의 성씨가 Zhang인 논문은 전체 학술 논문의 약 <strong>${pct(a('Zhang').share, 1)}</strong>로, 대략 100편 중 1편꼴입니다. 대상을 최근(2020–25년) 주요 학술지(core sources)로 좁히면 이 비중은 ${pct(c('Zhang').recent_share, 1)}까지 올라갑니다. 흔히 함께 언급되는 Zhang·Chen·Wang·Guo·Liu 다섯 성씨를 합치면 전체 논문의 ${pct(a('All five').share, 1)}, 최근 주요 학술지 논문의 ${pct(c('All five').recent_share, 1)}를 차지합니다.`;
  $('alluvial-text').textContent = `아래 alluvial diagram에서 세로 기둥은 5년 단위 시기를, 기둥 사이를 잇는 줄기는 26개 학문 분야(field)를 나타냅니다. 특정 줄기에 마우스를 올리면 해당 field의 시계열 흐름이 강조되고, 클릭하면 강조 표시가 고정됩니다. 상단 버튼으로 모집단(core sources vs 전체 OpenAlex), 성씨, 높이 기준(추정 논문 수 vs 기간별 100% 비중)을 전환할 수 있습니다. 다만 1975–99년 구간은 core 표본이 연 200건뿐이어서 추정치의 표본 변동이 큽니다.`;
  $('ts-text').textContent = `Core sources 기준으로 다섯 성씨의 제1저자 비중 합계는 2000–04년 ${pct(five.total_a, 1)}에서 2020–25년 ${pct(five.total_b, 1)}로 커졌으며, 연평균 ${annual(t('All five').growth)}씩 증가했습니다. 성씨별로는 Wang(연 ${annual(t('Wang').growth)})과 Guo(${annual(t('Guo').growth)})의 증가세가 가파르고 Chen(${annual(t('Chen').growth)})이 가장 완만합니다. 한편 특정 연도를 기점으로 추세가 급변(structural break)했다고 볼 통계적 근거는 없습니다. 추세 변화 시점의 95% CI가 합계 기준 ${t('All five').break_lo}–${t('All five').break_hi}년으로 매우 넓게 나타나는데, 이는 특정 사건에 의한 굴절보다는 2000년대 내내 꾸준한 누적 증가가 이어졌음을 뜻합니다.`;
  $('coverage-text').textContent = `시계열 분석에서 전체 OpenAlex 대신 core sources를 기본 모집단으로 삼은 이유는 데이터베이스 수록 범위(coverage)의 변화 때문입니다. 전체 OpenAlex를 그대로 보면 2010년대 중반에 중국계 성씨 비중이 오히려 줄어드는 것처럼 나타나는데, 이는 실제 학계의 변화가 아니라 OpenAlex의 연도별 색인 구성이 달라진 데 따른 착시입니다. 실제로 중국 기관 소속 저자가 포함된 논문의 비중(표본이 아닌 전수 exact count 기준)을 비교해 보면, 전체 OpenAlex에서는 2011년 ${cnShare(2011, 'all_cn')}에서 2016년 ${cnShare(2016, 'all_cn')}로 급감하는 반면, 선별된 학술지 집합인 core sources에서는 같은 기간 ${cnShare(2011, 'core_cn')}에서 ${cnShare(2016, 'core_cn')}로 일관되게 상승합니다. 따라서 시계열 추세는 수록 기준이 안정적인 core sources에서 측정해야 왜곡을 피할 수 있습니다.`;
  $('why-text').innerHTML = `다섯 성씨의 비중이 급증한 현상은 기존 연구자 집단 안에서 특정 성씨가 흔해졌기 때문이 아니라, 학계 전체에서 중국 소속 연구자의 논문 비중이 크게 늘어난 결과입니다<sup><a href="#r4">4</a></sup>. 소속 기관이 확인된 core 논문 기준으로 중국 소속 제1저자의 비중(π)은 2000–04년 ${pct(five.pi_a, 1)}에서 2020–25년 ${pct(five.pi_b, 1)}로 급증했습니다. 전체 비중 변화를 '중국 소속 비중 증가 효과(중국 비중 효과)'와 '집단 내부의 성씨 비율 변화(집단 내 효과)'로 분해(decomposition)해 보면, 다섯 성씨 합계 증가분(+${pp(five.change)}) 가운데 ${pp(five.china_composition)}(${(100 * five.china_composition / five.change).toFixed(0)}%)가 중국 소속 저자 비중의 확대만으로 설명됩니다. 특히 Zhang은 전체 증가분(+${pp(z.change)})의 거의 전부(${pp(z.china_composition)})가 이 구성 효과에서 비롯됩니다. 또한 이 성씨들이 많이 분포한 학문 분야 자체가 비대해진 효과(field 간 구성 변화)는 ${pp(core.field_shift.between_fields)}에 불과해, 개별 field 내부에서 비중이 늘어난 몫(${pp(core.field_shift.within_fields)})이 변화를 압도합니다. 다만 이러한 분해는 산술적 기여도 계산(accounting decomposition)이며 인과 추정은 아닙니다.`;
  const af = f => all.by_field.find(d => d.field === f && d.surname === 'All five');
  const fr = f => `${f}(${pct(af(f).recent_share, 1)})`;
  const sorted = all.by_field.filter(d => d.surname === 'All five').sort((p, q) => q.recent_share - p.recent_share);
  const zf = all.by_field.filter(d => d.surname === 'Zhang').sort((p, q) => q.recent_share - p.recent_share)[0];
  $('field-text').textContent = `학문 분야별 단면 비교는 모든 field×기간 층(stratum)마다 2020–25년 표본 600건이 균일하게 확보된 전체 OpenAlex를 기본 기준으로 삼았습니다. 최근(2020–25년) 다섯 성씨 합계 비중은 ${fr(sorted[0].field)}, ${fr(sorted[1].field)}, ${fr(sorted[2].field)} 순으로 높고, 반대로 ${fr(sorted.at(-1).field)}와 ${fr(sorted.at(-2).field)}에서 가장 낮습니다. 단일 성씨로 Zhang만 보더라도 ${zf.field}(${pct(zf.recent_share, 1)})에서 비중이 가장 높게 나타납니다. 다만 field당 표본이 600건이므로 인접한 순위 간에는 95% CI가 서로 겹칩니다. 표의 각 셀에 마우스를 올리면 95% CI를 확인할 수 있으며, 모집단을 core sources로 전환하면 표본 크기가 300건 미만인 field는 해석에 주의하도록 흐리게 표시됩니다.`;
  $('method-body').innerHTML = `<ul>
    <li><strong>측정 정의.</strong> 각 논문의 제1저자(first author) 성씨를 기준으로 집계합니다. 관용적 표현인 "Zhang et al."을 엄밀하게 해석해 저자 3인 이상 논문으로 한정할 경우, 전체 OpenAlex에서 Zhang의 비중은 ${pct(a('Zhang').et_al_share)}, core sources에서는 ${pct(c('Zhang').et_al_share)}가 됩니다.</li>
    <li><strong>표본 설계와 추정량.</strong> OpenAlex API<sup><a href="#r1">1</a></sup>는 제1저자 성씨에 대한 직접 필터를 제공하지 않습니다. 따라서 전체 article 모집단은 26개 field × 10개 기간(5년 단위)의 260개 층(strata)에서 층당 최대 600건을, core sources 모집단은 연도별로 200–1,000건을 무작위 추출해 총 ${(D.meta.all.n_sample + D.meta.core.n_sample).toLocaleString('ko-KR')}건의 표본을 구축했습니다. 모집단 비중과 95% CI는 층화 가중치를 반영한 Hájek ratio estimator와 테일러 선형화 분산(linearized variance)으로 산출했으며, field가 배정되지 않은 논문(core 표본의 ${pct(D.meta.core.unfielded, 1)})은 분야별 분석 분모에서 제외했습니다.</li>
    <li><strong>외적 타당도 검증.</strong> Core sources의 2020–25년 중국 기관 소속 제1저자 가운데 중국 인구의 5대 성씨(Wang·Li·Zhang·Liu·Chen)가 차지하는 비중은 ${pct(validity.top5_share, 1)}(95% CI ${pct(validity.top5_lo, 1)}–${pct(validity.top5_hi, 1)})로, 2020년 중국 공안부 호적 인구 통계의 실제 비중(30.8%)과 오차 범위 내에서 일치합니다<sup><a href="#r7">7</a></sup>. 참고로 본문 주요 분석 대상 다섯 성씨에는 빠졌으나 실제로는 중국 2위 성씨인 Li의 경우, core 2020–25년 제1저자 비중이 ${pct(liCore.share)}로 Wang에 이어 두 번째로 높습니다.</li>
    <li><strong>분석 단위의 한계(성씨 ≠ 개인).</strong> 본 분석은 동명이인 식별(author disambiguation)을 수행하지 않고 성씨 문자열만 집계합니다<sup><a href="#r5">5,6</a></sup>. 분석 단위가 개별 연구자가 아닌 '논문'이므로 동명이인의 존재가 성씨 비중 추정치를 편향시키지는 않으나, 이 수치를 특정 개인의 다작(productivity) 결과로 해석해서는 안 됩니다.</li>
    <li><strong>로마자 표기 변이(romanization variants).</strong> 본 분석은 한자 성씨의 표준 한어병음 표기(Zhang, Chen, Wang, Guo, Liu)만 집계하며, 張의 Chang·Cheung이나 王의 Wong 같은 비표준·방언 로마자 표기는 합산하지 않았습니다. 이 변이 표기들을 모두 포함하더라도 core 2020–25년 기준 Zhang의 비중은 약 ${pp(core.aliases[0].alias_share)} 늘어나는 데 그칩니다. 반면 한국의 장(Chang)이나 동남아시아 화교권의 진(Tan) 등은 다른 성씨와 철자가 겹치므로 인위적으로 병합하지 않았습니다.</li>
    <li><strong>성명 parsing 규칙.</strong> 서구식 어순(이름–성)과 달리 "Zhang Wei"처럼 성씨가 앞에 놓이는 동아시아 어순 표기는, 로마자 한어병음 형태이면서 제1저자 소속이 중화권 기관(또는 소속 미상)인 경우에 한해 첫 토큰을 성씨로 인식했습니다. 소속 기관 정보가 누락된 논문이 상대적으로 많은 초기 연도(2000년대 초반 이전)에는 parsing 오차가 더 클 수 있습니다. 한자 원문으로 기재된 성명은 첫 글자를 성씨로 판별했습니다.</li>
    <li><strong>학문 분류 체계와 수록 범위.</strong> 학문 분야(field)는 OpenAlex의 primary topic을 Scopus ASJC 분류 체계에 매핑한 것으로, 논문의 제목·초록·인용 정보·저널명을 종합해 알고리즘으로 분류한 결과입니다<sup><a href="#r2">2</a></sup>. 서지 데이터베이스마다 수록 범위(coverage)가 상이하며<sup><a href="#r3">3</a></sup>, 본 페이지의 시계열 기준인 CWTS core sources는 국제 주요 학술지에 집중된 부분집합입니다.</li>
    <li><strong>성씨 분포 분석을 위한 등확률 부분표본.</strong> 이산형 power-law 적합에는 가중치가 없는 정수 빈도(integer counts)가 필요하므로, 층화 표본에 rejection sampling을 적용해 추출 확률이 동일한 부분표본(equal-probability subsample)을 구성했습니다(이에 따라 core 2000–25년 기준 유효 표본 크기는 약 15,600건이 됩니다). 라틴 문자 성씨만 분석에 포함하고 한자·가나·기타 문자 표기 및 비인명 토큰은 제외했으며, 제외된 레코드는 사유와 함께 별도 기록했습니다. 한편 로마자 병음 표기는 章(Zhang)과 張(Zhang)처럼 서로 다른 한자 성씨를 하나의 철자로 병합하므로, 실제 한자 성씨 기준보다 다양성을 낮게(집중도 Y₂는 높게) 측정하는 경향이 있습니다.</li>
    <li><strong>분야별 초과 증가율 분석의 표본과 통계 처리.</strong> Field 및 subfield×5년 셀마다 core sources에서 최대 600건을 무작위 추출했습니다. 초과 증가율 E의 95% CI는 두 기간 비중 비(ratio)에 대한 delta method(0건 셀 처리를 위한 Haldane 보정 포함)로 구했고, 다중비교에 따른 위양성 통제는 26개 field에 대해 Benjamini–Hochberg FDR 절차를 적용했습니다. 연도별 전체 논문 수와 중국 소속 저자 포함 논문 수는 표본 추정이 아닌 OpenAlex 전수 집계(exact count)입니다. 2000–04년 구간은 제1저자 소속 미상 비율이 높고 성씨별 비교가 라틴 문자 표기에 한정되므로 초기 추정치의 불확실성이 상대적으로 큽니다.</li>
    <li><strong>재현성(reproducibility).</strong> 데이터 수집과 분석 전 과정은 <code>scripts/surname_share_collect.py</code>, <code>scripts/surname_share_analyze.py</code>, <code>scripts/surname_share_distribution.py</code>, <code>scripts/surname_share_retest.py</code>, <code>scripts/surname_share_fields.py</code>로 재현할 수 있습니다. 2026-10-31 기준 OpenAlex 스냅샷을 사용했습니다.</li></ul>`;
  $('refs').innerHTML = REFS.map((r, i) => `<li id="r${i + 1}">${r}</li>`).join('');
}

const REFS = [
  'Priem, J., Piwowar, H., &amp; Orr, R. (2022). OpenAlex: A fully-open index of scholarly works, authors, venues, institutions, and concepts. <a href="https://arxiv.org/abs/2205.01833">arXiv</a>',
  'OpenAlex 문서. <a href="https://help.openalex.org/api-entities/topics">Topics</a>의 분류 방식과 <a href="https://help.openalex.org/api-entities/sources/source-object">Source object</a>의 <code>is_core</code>(CWTS Core sources 목록).',
  'Culbert, J. H., Hobert, A., Jahn, N., Haupka, N., Schmidt, M., Donner, P., &amp; Mayr, P. (2025). Reference coverage analysis of OpenAlex compared to Web of Science and Scopus. <em>Scientometrics</em>, 130(4), 2475–2492. <a href="https://doi.org/10.1007/s11192-025-05293-3">DOI</a>',
  'Xie, Y., Zhang, C., &amp; Lai, Q. (2014). China’s rise as a major contributor to science and technology. <em>PNAS</em>, 111(26), 9437–9442. <a href="https://doi.org/10.1073/pnas.1407709111">DOI</a>',
  'Harzing, A.-W. (2015). Health warning: might contain multiple personalities—the problem of homonyms in Thomson Reuters Essential Science Indicators. <em>Scientometrics</em>, 105(3), 2259–2270. <a href="https://doi.org/10.1007/s11192-015-1699-y">DOI</a>',
  'Kim, J., &amp; Diesner, J. (2016). Distortive effects of initial-based name disambiguation on measurements of large-scale coauthorship networks. <em>Journal of the Association for Information Science and Technology</em>, 67(6), 1446–1461. <a href="https://doi.org/10.1002/asi.23489">DOI</a>',
  '邵克 (2021-02-08). 公安部公布2020年百家姓排名：王李张刘陈依旧名列前五. 澎湃新闻. 《二〇二〇年全国姓名报告》을 인용한 기사. <a href="https://www.thepaper.cn/newsDetail_forward_11269566">기사 보기</a>',
  'Clauset, A., Shalizi, C. R., &amp; Newman, M. E. J. (2009). Power-law distributions in empirical data. <em>SIAM Review</em>, 51(4), 661–703. <a href="https://doi.org/10.1137/070710111">DOI</a>',
  'Vuong, Q. H. (1989). Likelihood ratio tests for model selection and non-nested hypotheses. <em>Econometrica</em>, 57(2), 307–333. <a href="https://doi.org/10.2307/1912557">DOI</a>',
  'Baek, S. K., Kiet, H. A. T., &amp; Kim, B. J. (2007). Family name distributions: Master equation approach. <em>Physical Review E</em>, 76(4), 046113. <a href="https://doi.org/10.1103/PhysRevE.76.046113">DOI</a>',
  'Zanette, D. H., &amp; Manrubia, S. C. (2001). Vertical transmission of culture and the distribution of family names. <em>Physica A</em>, 295(1–2), 1–8. <a href="https://doi.org/10.1016/S0378-4371(01)00046-2">DOI</a>',
  'Kim, B. J., &amp; Park, S. M. (2005). Distribution of Korean family names. <em>Physica A</em>, 347, 683–694. <a href="https://doi.org/10.1016/j.physa.2004.08.028">DOI</a>',
  'Stumpf, M. P. H., Wiuf, C., &amp; May, R. M. (2005). Subnets of scale-free networks are not scale-free: Sampling properties of networks. <em>PNAS</em>, 102(12), 4221–4224. <a href="https://doi.org/10.1073/pnas.0501179102">DOI</a>',
  'Chao, A., &amp; Shen, T.-J. (2003). Nonparametric estimation of Shannon’s index of diversity when there are unseen species in sample. <em>Environmental and Ecological Statistics</em>, 10, 429–443. <a href="https://doi.org/10.1023/A:1026096204727">DOI</a>',
  'Hill, M. O. (1973). Diversity and evenness: A unifying notation and its consequences. <em>Ecology</em>, 54(2), 427–432. <a href="https://doi.org/10.2307/1934352">DOI</a>',
];
