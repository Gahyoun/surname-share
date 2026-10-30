const SURNAMES = ['Zhang', 'Chen', 'Wang', 'Guo', 'Liu'];
const COLOR = { Zhang: '--s-zhang', Chen: '--s-chen', Wang: '--s-wang', Guo: '--s-guo', Liu: '--s-liu' };
const DOMAINS = {
  'Physical Sciences': { color: '--d-phys', fields: ['Engineering', 'Computer Science', 'Materials Science', 'Environmental Science', 'Physics and Astronomy', 'Chemistry', 'Mathematics', 'Earth and Planetary Sciences', 'Energy', 'Chemical Engineering'] },
  'Life Sciences': { color: '--d-life', fields: ['Biochemistry, Genetics and Molecular Biology', 'Agricultural and Biological Sciences', 'Neuroscience', 'Immunology and Microbiology', 'Pharmacology, Toxicology and Pharmaceutics'] },
  'Health Sciences': { color: '--d-health', fields: ['Medicine', 'Health Professions', 'Nursing', 'Dentistry', 'Veterinary'] },
  'Social Sciences': { color: '--d-soc', fields: ['Social Sciences', 'Psychology', 'Business, Management and Accounting', 'Economics, Econometrics and Finance', 'Decision Sciences', 'Arts and Humanities'] },
};
const FIELD_DOMAIN = {};
Object.entries(DOMAINS).forEach(([d, v]) => v.fields.forEach(f => { FIELD_DOMAIN[f] = d; }));

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
  host.innerHTML = items.map(([label, color]) => `<span><i style="background:var(${color})"></i>${esc(label)}</span>`).join('');
}

Promise.all(['data.json', 'distribution.json'].map(f => fetch(f).then(r => r.json()))).then(([D, X]) => { init(D); renderDistribution(X); });

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
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { drawAlluvial(); drawLines(); drawCoverage(); drawRank(); drawMix(); });
}

function renderHeadline(D) {
  const find = (c, s) => D.corpora[c].overall.find(d => d.surname === s);
  $('tiles').innerHTML = ['All five', ...SURNAMES].map(s => {
    const a = find('all', s), c = find('core', s);
    return `<div class="tile"><span>${s === 'All five' ? '다섯 성 합계' : `${s}`}</span><b>${pct(a.share)}</b>
      <small>전체 ≈ ${millions(a.papers)}편</small><small>core 2020–25: ${pct(c.recent_share)}</small></div>`;
  }).join('');
  const m = D.meta;
  $('scope').textContent = `큰 수: OpenAlex article 전체(1975–2025, ${millions(m.all.population)}편) 중 제1저자 비중. 작은 수: CWTS core sources의 2020–25 비중. 표본 ${(m.all.n_sample + m.core.n_sample).toLocaleString('ko-KR')}건.`;
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
      const color = css(DOMAINS[FIELD_DOMAIN[f]].color);
      const group = el('g', { class: 'flow' }, svg);
      for (let i = 0; i < periods.length - 1; i += 1) {
        const a = layout[i][f], b = layout[i + 1][f];
        const x0 = colX(i) + nodeW, x1 = colX(i + 1), mx = (x0 + x1) / 2;
        el('path', {
          d: `M${x0},${a.y0} C${mx},${a.y0} ${mx},${b.y0} ${x1},${b.y0} L${x1},${b.y1} C${mx},${b.y1} ${mx},${a.y1} ${x0},${a.y1} Z`,
          fill: color, 'fill-opacity': 0.34,
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
      el('text', { x: colX(periods.length - 1) + nodeW + 6, y: mid + 4 }, svg).textContent = f.length > 30 ? `${f.slice(0, 29)}…` : f;
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

function lineChart(svg, { series, W = 1000, H = 400, tip: tipText, tick }) {
  const m = { t: 14, r: 96, b: 28, l: 46 };
  const years = series[0].rows.map(r => r.year);
  const yMax = Math.ceil(Math.max(...series.flatMap(s => s.rows.map(r => r.hi ?? r.share))) / tick) * tick;
  const x = v => m.l + (v - years[0]) * (W - m.l - m.r) / (years.at(-1) - years[0]);
  const y = v => H - m.b - v * (H - m.t - m.b) / yMax;
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.minWidth = '640px';
  for (let v = 0; v <= yMax + 1e-9; v += tick) {
    el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: css('--line'), 'stroke-width': 1 }, svg);
    el('text', { x: m.l - 7, y: y(v) + 4, 'text-anchor': 'end' }, svg).textContent = `${(v * 100).toFixed(tick < 0.01 ? 1 : 0)}%`;
  }
  years.filter(v => v % 5 === 0).forEach(v => { el('text', { x: x(v), y: H - 8, 'text-anchor': 'middle' }, svg).textContent = v; });
  series.forEach(s => {
    if (s.rows[0].lo !== undefined) {
      const band = [...s.rows.map(r => `${x(r.year)},${y(r.hi)}`), ...s.rows.slice().reverse().map(r => `${x(r.year)},${y(r.lo)}`)].join(' ');
      el('polygon', { points: band, fill: css(s.color), 'fill-opacity': 0.07 }, svg);
    }
    el('path', { d: `M${s.rows.map(r => `${x(r.year)},${y(r.share)}`).join('L')}`, fill: 'none', stroke: css(s.color), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-dasharray': s.dash || 'none' }, svg);
  });
  const labels = series.map(s => ({ s: s.label, y: y(s.rows.at(-1).share) + 4 })).sort((a, b) => a.y - b.y);
  labels.forEach((l, i) => { if (i && l.y - labels[i - 1].y < 14) l.y = labels[i - 1].y + 14; });
  labels.forEach(l => { el('text', { x: W - m.r + 7, y: l.y, class: 'strong' }, svg).textContent = l.s; });
  const cross = el('line', { y1: m.t, y2: H - m.b, stroke: css('--ink-3'), 'stroke-width': 1, visibility: 'hidden' }, svg);
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
    { label: 'Core', color: '--s-zhang', rows: toRows('core_cn', 'core_all') },
    { label: '전체 OpenAlex', color: '--s-chen', dash: '6 4', rows: toRows('all_cn', 'n_articles') },
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

function renderDistribution(X) {
  const fit = name => X.tails.find(t => t.name === name);
  const pooled = fit('Core 2000-2025'), china = fit('Core, China'), other = fit('Core, non-China');
  const syn = k => X.synthetic.find(s => s.kind === k);
  const M = X.mixture;
  const last = X.concentration.at(-1), first = X.concentration[0];
  const terms = { cc: last.pi ** 2 * M.y_china, cross: 2 * last.pi * (1 - last.pi) * M.y_cross, oo: (1 - last.pi) ** 2 * M.y_other };
  const termTotal = terms.cc + terms.cross + terms.oo;
  const hillChina = X.concentration.at(-1).hill1_china, hillOther = X.concentration.at(-1).hill1_other;

  $('dist-lede').innerHTML = `<strong>결론부터: 성 빈도는 exponential보다 확실히 두껍지만, power law라고 말할 근거는 없습니다.</strong> 이 표본 크기에서는 power-law 검정이 lognormal 모집단도 ${pct(syn('lognormal').reject_gof, 0)}만 기각해서, 기각되지 않았다는 사실이 거의 정보를 주지 않습니다. 대신 더 단단한 결과는 집중도 쪽에 있습니다. 두 논문의 제1저자 성이 겹칠 확률 $Y_2$의 증가는 중국 소속 비중 π 하나로 거의 재현됩니다.`.replace('$Y_2$', 'Y₂');
  $('dist-tiles').innerHTML = [
    [num(pooled.alpha), `Tail 지수 α`, `95% ${num(pooled.alpha_lo)}–${num(pooled.alpha_hi)} · n=${pooled.n_authors.toLocaleString('ko-KR')}`],
    [pct(syn('lognormal').reject_gof, 0), 'Lognormal 기각력', `합성 ${syn('lognormal').reps}회 · GOF p<0.1`],
    [`${Math.round(1 / M.y_china)} vs ${fmt(1 / M.y_other)}`, '유효 성 개수 1/Y₂', '중국 소속 vs 그 외'],
    [pct(M.null_fraction, 0), 'Y₂ 증가 재현', `π만 변화 · R²=${num(M.r2)}`],
  ].map(([v, a, b]) => `<div class="tile"><span>${a}</span><b>${v}</b><small>${b}</small></div>`).join('');

  // Rank-frequency on log-log axes.
  const seriesR = [
    { label: 'Core 2000–25', color: '--d-phys', key: 'Core 2000-2025' },
    { label: '중국 소속', color: '--d-health', key: 'Core, China' },
    { label: '그 외', color: '--d-life', key: 'Core, non-China' },
  ];
  legend($('legend-rank'), seriesR.map(s => [s.label, s.color]));
  $('rank-text').textContent = `중국 소속 곡선은 성 ${china.n_surnames}개에서 끝나고, 그 외 곡선은 ${fmt(other.n_surnames)}개까지 이어집니다. 전체 곡선은 이 둘의 합입니다. 위쪽 ${pooled.n_tail}개 성에 맞춘 점선의 기울기는 −${num(pooled.zipf_exponent)}입니다. 낮은 빈도 구간은 표본 추출이 모양을 만드는 영역이라 해석하지 않습니다.`;
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
      el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: css('--line'), 'stroke-width': 1 }, svg);
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
    el('path', { d: `M${fitLine}`, fill: 'none', stroke: css('--ink'), 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }, svg);
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
  $('fit-text').textContent = `Discrete power-law MLE와 KS 기반 kmin 선택(Clauset et al.)을 썼고, 표본 추출이 지배하는 구간을 빼기 위해 kmin ≥ ${X.kmin_floor}로 제한했습니다. 표의 R은 Vuong 통계량으로, 양수면 power law 쪽, 음수면 대안 쪽입니다. Exponential은 모든 표본에서 밀려나고(R>0), lognormal과 stretched exponential은 어느 쪽도 구분되지 않습니다.`;
  const rows = X.tails.map(t => {
    if (t.alpha === null) return `<tr><td>${NAME_KO[t.name]}</td><td>${t.n_authors.toLocaleString('ko-KR')}</td><td colspan="7">빈도 ≥ ${X.kmin_floor}인 성이 50개 미만이라 적합하지 않음 (최대 빈도 ${t.k_max})</td></tr>`;
    const a = t.alternatives;
    return `<tr><td>${NAME_KO[t.name]}</td><td>${t.n_authors.toLocaleString('ko-KR')}</td><td>${t.kmin} (${t.n_tail})</td><td>${num(t.alpha)} (${num(t.alpha_lo)}–${num(t.alpha_hi)})</td><td>${num(t.gof_p)}</td><td>${num(a.exponential.R)} (${pval(a.exponential.p)})</td><td>${num(a.lognormal.R)} (${pval(a.lognormal.p)})</td><td>${num(a.stretched.R)} (${pval(a.stretched.p)})</td><td>${pval(a.cutoff.p)}</td></tr>`;
  }).join('');
  $('fit-table').innerHTML = `<thead><tr><th>표본</th><th>n</th><th>kmin (tail 성 수)</th><th>α (95%)</th><th>GOF p</th><th>R 대 exponential</th><th>R 대 lognormal</th><th>R 대 stretched</th><th>Cutoff LR p</th></tr></thead><tbody>${rows}</tbody>`;

  // Synthetic validation.
  $('synth-text').textContent = `실제 데이터에 적용하기 전에, 정답을 아는 합성 모집단에서 같은 n=${X.n_core_equal.toLocaleString('ko-KR')}으로 같은 절차를 돌렸습니다(각 ${syn('lognormal').reps}회, GOF는 회당 ${X.reps.synthetic_gof}회). Power-law 입력의 α는 복원되고 위양성도 낮아 절차 자체는 건강합니다. 문제는 검정력입니다. Lognormal이나 혼합 null도 거의 기각되지 않습니다. 혼합 null은 측정된 중국 성 빈도와, 그 외 집단의 Y₂에 맞춘 lognormal을 π=0.18로 섞은 것으로, power law가 전혀 들어 있지 않은데도 α ${num(syn('mixture').alpha_lo)}–${num(syn('mixture').alpha_hi)}로 나옵니다. 실측 ${num(pooled.alpha_lo)}–${num(pooled.alpha_hi)}와 겹치는 값입니다.`;
  $('synth-table').innerHTML = `<thead><tr><th>모집단</th><th>추정 α 중앙값 (95%)</th><th>Tail 성 수</th><th>GOF 기각률 (p&lt;0.1)</th><th>Lognormal 선호</th><th>Cutoff 선호</th></tr></thead><tbody>${['power', 'lognormal', 'mixture'].map(k => { const s = syn(k); return `<tr><td>${SYNTH_KO[k]}</td><td>${num(s.alpha_median)} (${num(s.alpha_lo)}–${num(s.alpha_hi)})</td><td>${fmt(s.n_tail_median)}</td><td>${pct(s.reject_gof, 0)}</td><td>${pct(s.prefers_lognormal, 0)}</td><td>${pct(s.prefers_cutoff, 0)}</td></tr>`; }).join('')}</tbody>`;

  // Mixture null.
  $('mix-text').textContent = `Y₂ = Σpₖ²는 무작위로 고른 두 논문의 제1저자 성이 같을 확률이며, 통계물리의 inverse participation ratio입니다. 모든 성이 균등하면 1/S, 한 성뿐이면 1입니다. 두 집단이 섞이면 Y₂(π) = π²Y_c + (1−π)²Y_o + 2π(1−π)Y_x 가 항등식으로 성립합니다. Y_c, Y_o, Y_x를 2000–25 전체 값(${num(M.y_china, 4)}, ${num(M.y_other, 5)}, ${num(M.y_cross, 5)})으로 고정하고 π만 바꾸면, 2000–04에서 2020–25까지의 Y₂ 증가 ${(M.observed_change * 1e3).toFixed(2)}×10⁻³ 중 ${(M.null_change * 1e3).toFixed(2)}×10⁻³(${pct(M.null_fraction, 0)})가 재현됩니다. 이 곡선에는 Y₂에 맞춰 조정한 parameter가 없습니다. 예외도 있습니다. 2000–04의 예측값은 CI 위에 있어, 초기에는 그 집단의 내부 값이 전체 평균과 달랐을 수 있습니다. 2020–25의 Y₂에서는 중국-중국 쌍이 ${pct(terms.cc / termTotal, 0)}, 교차 쌍이 ${pct(terms.cross / termTotal, 0)}, 그 외-그 외 쌍이 ${pct(terms.oo / termTotal, 0)}를 차지합니다.`;
  legend($('legend-mix'), [['연도별 측정값', '--d-phys'], ['혼합 null', '--ink']]);
  drawMix = () => {
    const svg = $('mix-chart');
    const W = 1000, H = 380, m = { t: 14, r: 24, b: 40, l: 66 };
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.minWidth = '640px';
    const xMax = 0.36, yMax = 0.005;
    const x = v => m.l + v * (W - m.l - m.r) / xMax;
    const y = v => H - m.b - v * (H - m.t - m.b) / yMax;
    for (let v = 0; v <= yMax + 1e-9; v += 0.001) {
      el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: css('--line'), 'stroke-width': 1 }, svg);
      el('text', { x: m.l - 7, y: y(v) + 4, 'text-anchor': 'end' }, svg).textContent = v.toFixed(3);
    }
    [0, 0.1, 0.2, 0.3].forEach(v => { el('text', { x: x(v), y: H - 20, 'text-anchor': 'middle' }, svg).textContent = `${v * 100}%`; });
    el('text', { x: (W - m.r + m.l) / 2, y: H - 3, 'text-anchor': 'middle' }, svg).textContent = '중국 소속 제1저자 비중 π';
    const curve = [];
    for (let p = 0; p <= xMax + 1e-9; p += 0.005) curve.push(`${x(p)},${y(p * p * M.y_china + (1 - p) ** 2 * M.y_other + 2 * p * (1 - p) * M.y_cross)}`);
    el('path', { d: `M${curve.join('L')}`, fill: 'none', stroke: css('--ink'), 'stroke-width': 2 }, svg);
    X.annual.forEach(a => {
      const dot = el('circle', { cx: x(a.pi), cy: y(a.y2), r: 5, fill: css('--d-phys'), stroke: css('--bg'), 'stroke-width': 2 }, svg);
      dot.addEventListener('mousemove', event => showTip(event, `<b>${a.year}</b><br>π ${pct(a.pi, 1)}<br>Y₂ ${a.y2.toFixed(5)}<br>혼합 null ${a.null.toFixed(5)}<br>n=${a.n_known}`));
      dot.addEventListener('mouseleave', hideTip);
    });
  };
  drawMix();
  $('mix-table').innerHTML = `<thead><tr><th>기간</th><th>π</th><th>Y₂ (95% CI)</th><th>혼합 null</th><th>중국 소속 Y_c</th><th>exp(H) 중국 소속</th><th>exp(H) 그 외</th><th>Coverage 그 외</th></tr></thead><tbody>${X.concentration.map(c => `<tr><td>${c.period.replace('-', '–')}</td><td>${pct(c.pi, 1)}</td><td>${c.y2_known.toFixed(5)} (${c.y2_known_lo.toFixed(5)}–${c.y2_known_hi.toFixed(5)})</td><td>${c.null_pooled.toFixed(5)}</td><td>${c.y_china.toFixed(4)}</td><td>${Math.round(c.hill1_china)} (n=${c.n_china})</td><td>≈ ${fmt(c.hill1_other)}</td><td>${pct(c.coverage_other, 0)}</td></tr>`).join('')}</tbody>`;

  // Claim audit.
  const claims = [
    ['성 빈도의 tail은 exponential보다 두껍다', `적합한 ${X.tails.filter(t => t.alpha !== null).length}개 표본 모두 R>0, p≤${pval(Math.max(...X.tails.filter(t => t.alpha !== null).map(t => t.alternatives.exponential.p)))}`, '보였다 (관찰)'],
    ['Core 2000–25의 α는 약 ' + num(pooled.alpha), `95% ${num(pooled.alpha_lo)}–${num(pooled.alpha_hi)}, n=${pooled.n_authors.toLocaleString('ko-KR')}. 서술량이며 scale-free의 증거가 아님`, '측정값으로만 보고'],
    ['성 빈도는 power law다', `GOF 기각 안 됨, 그러나 lognormal 기각력 ${pct(syn('lognormal').reject_gof, 0)}`, '주장 불가. "구분되지 않는다"까지'],
    ['Y₂ 증가는 π 변화와 부합한다', `null 재현 ${pct(M.null_fraction, 0)}, R²=${num(M.r2)}, 5개 기간 중 ${M.periods_null_inside_ci}개가 CI 안`, '시사한다 (함의). 인과 아님'],
    ['중국 소속 집단의 성 다양성은 그 외보다 두 자릿수 작다', `1/Y₂ 약 ${Math.round(1 / M.y_china)} 대 ${fmt(1 / M.y_other)}. exp(H)는 약 ${Math.round(hillChina)} 대 ${fmt(hillOther)}이지만 그 외의 coverage가 ${pct(last.coverage_other, 0)}라 이 값은 불확실`, '보였다 (1/Y₂ 기준)'],
    ['차이의 기원은 새 성의 출현율이다', 'Baek et al.이 나라별 분포 차이에 대해 제시한 가설. 이 데이터로는 검정하지 않음', '추측. 출처 명시'],
  ];
  $('claim-table').innerHTML = `<thead><tr><th>주장</th><th>현재 근거</th><th>허용되는 최대 강도</th></tr></thead><tbody>${claims.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
  $('banned').innerHTML = '<strong>쓰면 안 되는 문장:</strong> "저자 성 분포는 scale-free다", "Zhang이 늘어난 원인은 …이다", "응축(condensation) 상전이가 일어났다". 앞의 둘은 이 데이터가 뒷받침하지 않고, 마지막은 시스템 크기에 대한 scaling을 재지 않았으므로 근거가 없습니다.';
  const life = [
    ['kmin 제한 없음, n≈4,300–15,000', 'α ≈ 3.2–3.6, 일부 표본은 kmin=1 선택', '재표본마다 α가 약 2.2와 약 3.5로 갈림', '철회. k=1 부근의 표본 추출 artifact'],
    ['복원 bootstrap', '2000–04 Y₂ CI 0.00051–0.00062', '점추정치 0.00035가 CI 밖', '교체. 중복 논문이 같은 성 쌍으로 세어짐. half-sample로 변경'],
    ['2000–04 값을 기준으로 고정, 중국 n=146', 'π가 Y₂ 증가의 67%를 설명', '2000–04의 중국 표본이 너무 작음', '교체. 전 기간 pooled 값 사용 후 ' + pct(M.null_fraction, 0)],
  ];
  $('life-table').innerHTML = `<thead><tr><th>시점</th><th>잠정 진술</th><th>확인 결과</th><th>처분</th></tr></thead><tbody>${life.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
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
        const alpha = (v / (c === 'All five' ? max : single)) * 42;
        return `<td title="95% CI ${pct(Math.max(0, lo))}–${pct(hi)}" style="background:color-mix(in srgb, var(--accent) ${alpha.toFixed(0)}%, transparent)">${pct(v)}</td>`;
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
  const coreField = f => core.by_field.find(d => d.field === f && d.surname === 'All five');
  const liCore = core.top_recent.find(d => d.surname === 'Li');
  const pp = x => `${(100 * x).toFixed(2)}pp`;
  const cnShare = (y, k) => pct(ex(y)[k] / ex(y)[k === 'core_cn' ? 'core_all' : 'n_articles'], 1);
  const validity = core.validity;
  const five = dec('All five'), z = dec('Zhang');
  $('lede').innerHTML = `제1저자 성이 Zhang인 논문은 전체 논문의 약 <strong>${pct(a('Zhang').share, 1)}</strong>로, 대략 100편에 1편입니다. 최근 주요 저널만 보면 ${pct(c('Zhang').recent_share, 1)}까지 올라갑니다. Zhang·Chen·Wang·Guo·Liu 다섯을 합치면 전체의 ${pct(a('All five').share, 1)}, 최근 주요 저널의 ${pct(c('All five').recent_share, 1)}입니다.`;
  $('alluvial-text').textContent = `각 세로 기둥은 기간, 줄기는 field입니다. 줄기에 마우스를 올리면 강조되고, 클릭하면 고정됩니다. Core 표본은 1975–99년에 연 200건뿐이라 이 구간의 줄기는 불안정합니다.`;
  $('ts-text').textContent = `Core sources에서 다섯 성의 합계는 2000–04년 ${pct(five.total_a, 1)}에서 2020–25년 ${pct(five.total_b, 1)}로 늘었고, 연 ${annual(t('All five').growth)}씩 성장했습니다. Wang(연 ${annual(t('Wang').growth)})과 Guo(${annual(t('Guo').growth)})가 빠르고 Chen(${annual(t('Chen').growth)})이 가장 느립니다. 특정 연도에 꺾였다고 말할 근거는 없습니다. 구조 변화 연도의 구간이 합계 기준 ${t('All five').break_lo}–${t('All five').break_hi}년으로 너무 넓습니다.`;
  $('coverage-text').textContent = `전체 OpenAlex만 보면 2010년대 중반에 비중이 줄어드는 것처럼 보이지만, 이는 수록 범위 변화입니다. 중국 소속 저자가 포함된 논문의 비중은 전체 OpenAlex에서 2011년 ${cnShare(2011, 'all_cn')}, 2016년 ${cnShare(2016, 'all_cn')}로 떨어지는 반면, core에서는 같은 기간 ${cnShare(2011, 'core_cn')}에서 ${cnShare(2016, 'core_cn')}로 오릅니다. 이 페이지의 추세는 그래서 core 기준입니다. 이 값은 표본이 아닌 exact count입니다.`;
  $('why-text').innerHTML = `성이 흔해진 것이 아니라 중국 논문이 늘어난 결과입니다<sup><a href="#r4">4</a></sup>. 소속이 확인된 논문 기준으로 중국 소속 제1저자 비중은 ${pct(five.pi_a, 1)}에서 ${pct(five.pi_b, 1)}로 늘었습니다. 다섯 성 합계의 증가 ${pp(five.change)} 중 ${pp(five.china_composition)}(${(100 * five.china_composition / five.change).toFixed(0)}%)가 이 구성 변화로 설명되고, Zhang은 거의 전부(${pp(z.china_composition)} / ${pp(z.change)})입니다. Field 구성 변화의 기여는 ${pp(core.field_shift.between_fields)}로, field 안에서 늘어난 몫 ${pp(core.field_shift.within_fields)}에 비해 작습니다. 이 분해는 기여도 계산이며 인과 추정은 아닙니다.`;
  const af = f => all.by_field.find(d => d.field === f && d.surname === 'All five');
  const fr = f => `${f} ${pct(af(f).recent_share, 1)}`;
  const sorted = all.by_field.filter(d => d.surname === 'All five').sort((p, q) => q.recent_share - p.recent_share);
  const zf = all.by_field.filter(d => d.surname === 'Zhang').sort((p, q) => q.recent_share - p.recent_share)[0];
  $('field-text').textContent = `Field 비교는 층마다 2020–25년 표본 600건이 보장되는 전체 OpenAlex를 기본으로 합니다. 다섯 성 합계는 ${fr(sorted[0].field)}, ${fr(sorted[1].field)}, ${fr(sorted[2].field)} 순으로 높고, ${fr(sorted.at(-1).field)}, ${fr(sorted.at(-2).field)}로 가장 낮습니다. Zhang만 보면 ${zf.field}가 ${pct(zf.recent_share, 1)}로 가장 높습니다. 표본이 600건이라 인접한 순위는 CI가 겹칩니다. 셀에 마우스를 올리면 95% CI가 나오고, core로 바꾸면 표본 300건 미만 행은 흐리게 표시됩니다.`;
  $('method').innerHTML = `<ul>
    <li><strong>정의.</strong> 제1저자 성으로 셉니다. 엄밀한 "et al."(저자 3인 이상)로 좁히면 전체 OpenAlex에서 Zhang은 ${pct(a('Zhang').et_al_share)}, core에서는 ${pct(c('Zhang').et_al_share)}입니다.</li>
    <li><strong>왜 표본인가.</strong> OpenAlex<sup><a href="#r1">1</a></sup>에는 제1저자 성 필터가 없습니다. 전체 article은 field×5년 260개 층에서 층당 최대 600건, core는 연도별 200–1,000건을 무작위 추출해 합계 ${(D.meta.all.n_sample + D.meta.core.n_sample).toLocaleString('ko-KR')}건을 얻었고, 층화 Hájek ratio estimator와 linearized variance로 95% CI를 계산했습니다. Field가 없는 논문은 분모에서 제외했습니다(core 표본의 ${pct(D.meta.core.unfielded, 1)}).</li>
    <li><strong>검증.</strong> Core 2020–25 중국 소속 제1저자 중 중국 5대 성(Wang·Li·Zhang·Liu·Chen)은 ${pct(validity.top5_share, 1)}(CI ${pct(validity.top5_lo, 1)}–${pct(validity.top5_hi, 1)})로, 2020년 호적 인구 통계의 30.8%와 일치합니다<sup><a href="#r7">7</a></sup>. 참고로 트윗 목록에 없는 Li가 core 2020–25에서 ${pct(liCore.share)}로 Wang 다음입니다.</li>
    <li><strong>성은 사람이 아닙니다.</strong> 같은 성·같은 이니셜의 다른 사람을 구분하지 않습니다<sup><a href="#r5">5,6</a></sup>. 여기서는 사람이 아니라 논문을 세므로 동명이인이 결과를 왜곡하지 않지만, "Zhang 한 사람의 논문"으로 읽으면 안 됩니다.</li>
    <li><strong>로마자 표기.</strong> 張의 Chang·Cheung, 王의 Wong처럼 다른 표기는 포함하지 않았습니다. 이들을 더해도 core 2020–25에서 Zhang은 약 ${pp(core.aliases[0].alias_share)} 늘어나는 정도입니다. 반대로 한국의 Chang이나 동남아의 Tan은 다른 성일 수 있어 합치지 않았습니다.</li>
    <li><strong>이름 parsing.</strong> "Zhang Wei"처럼 성이 앞에 오는 표기는 병음이고 소속이 중화권이거나 없을 때만 성으로 읽었습니다. 소속 미상 논문이 많은 초기 연도는 오차가 더 클 수 있습니다. 한자 표기는 첫 글자로 판단했습니다.</li>
    <li><strong>분류와 수록 범위.</strong> Field는 OpenAlex topic을 Scopus ASJC에 대응시킨 것으로, 제목·초록·저널명으로 분류한 결과입니다<sup><a href="#r2">2</a></sup>. OpenAlex의 수록 범위 자체도 데이터베이스마다 다르며<sup><a href="#r3">3</a></sup>, core는 주요 저널에 치우친 모집단입니다.</li>
    <li><strong>분포 분석의 표본.</strong> Power-law 적합에는 정수 빈도가 필요해서 rejection으로 등확률 부분표본을 만들었습니다. 그래서 n이 줄어듭니다(core 2000–25 약 15,600건). 라틴 문자 성만 쓰고 한자·가나·기타 문자 표기와 비인명 토큰은 제외했으며, 제외 행은 사유와 함께 저장했습니다. 병음은 章과 張처럼 다른 한자를 하나로 합치므로 중국 성의 다양성을 낮춰 잽니다.</li>
    <li><strong>재현.</strong> <code>scripts/surname_share_collect.py</code>, <code>scripts/surname_share_analyze.py</code>, <code>scripts/surname_share_distribution.py</code>. 2026-10-31 기준 데이터입니다.</li></ul>`;
  $('refs').innerHTML = REFS.map((r, i) => `<li id="r${i + 1}">${r}</li>`).join('');
}

const REFS = [
  'Priem, J., Piwowar, H., &amp; Orr, R. (2022). OpenAlex: A fully-open index of scholarly works, authors, venues, institutions, and concepts. arXiv:2205.01833. <a href="https://arxiv.org/abs/2205.01833">arxiv.org/abs/2205.01833</a>',
  'OpenAlex. Topics (classification of works); Source object (<code>is_core</code>: CWTS Core sources list). <a href="https://help.openalex.org/api-entities/topics">help.openalex.org/api-entities/topics</a>, <a href="https://help.openalex.org/api-entities/sources/source-object">source-object</a>',
  'Culbert, J. H., Hobert, A., Jahn, N., Haupka, N., Schmidt, M., Donner, P., &amp; Mayr, P. (2025). Reference coverage analysis of OpenAlex compared to Web of Science and Scopus. <em>Scientometrics</em>, 130(4), 2475–2492. <a href="https://doi.org/10.1007/s11192-025-05293-3">doi:10.1007/s11192-025-05293-3</a>',
  'Xie, Y., Zhang, C., &amp; Lai, Q. (2014). China’s rise as a major contributor to science and technology. <em>PNAS</em>, 111(26), 9437–9442. <a href="https://doi.org/10.1073/pnas.1407709111">doi:10.1073/pnas.1407709111</a>',
  'Harzing, A.-W. (2015). Health warning: might contain multiple personalities—the problem of homonyms in Thomson Reuters Essential Science Indicators. <em>Scientometrics</em>, 105(3), 2259–2270. <a href="https://doi.org/10.1007/s11192-015-1699-y">doi:10.1007/s11192-015-1699-y</a>',
  'Kim, J., &amp; Diesner, J. (2016). Distortive effects of initial-based name disambiguation on measurements of large-scale coauthorship networks. <em>Journal of the Association for Information Science and Technology</em>, 67(6), 1446–1461. <a href="https://doi.org/10.1002/asi.23489">doi:10.1002/asi.23489</a>',
  '邵克 (2021-02-08). 公安部公布2020年百家姓排名：王李张刘陈依旧名列前五. 澎湃新闻. 《二〇二〇年全国姓名报告》 인용. <a href="https://www.thepaper.cn/newsDetail_forward_11269566">thepaper.cn</a>',
  'Clauset, A., Shalizi, C. R., &amp; Newman, M. E. J. (2009). Power-law distributions in empirical data. <em>SIAM Review</em>, 51(4), 661–703. <a href="https://doi.org/10.1137/070710111">doi:10.1137/070710111</a>',
  'Vuong, Q. H. (1989). Likelihood ratio tests for model selection and non-nested hypotheses. <em>Econometrica</em>, 57(2), 307–333. <a href="https://doi.org/10.2307/1912557">doi:10.2307/1912557</a>',
  'Baek, S. K., Kiet, H. A. T., &amp; Kim, B. J. (2007). Family name distributions: Master equation approach. <em>Physical Review E</em>, 76(4), 046113. <a href="https://doi.org/10.1103/PhysRevE.76.046113">doi:10.1103/PhysRevE.76.046113</a>',
  'Zanette, D. H., &amp; Manrubia, S. C. (2001). Vertical transmission of culture and the distribution of family names. <em>Physica A</em>, 295(1–2), 1–8. <a href="https://doi.org/10.1016/S0378-4371(01)00046-2">doi:10.1016/S0378-4371(01)00046-2</a>',
  'Kim, B. J., &amp; Park, S. M. (2005). Distribution of Korean family names. <em>Physica A</em>, 347, 683–694. <a href="https://doi.org/10.1016/j.physa.2004.08.028">doi:10.1016/j.physa.2004.08.028</a>',
  'Stumpf, M. P. H., Wiuf, C., &amp; May, R. M. (2005). Subnets of scale-free networks are not scale-free: Sampling properties of networks. <em>PNAS</em>, 102(12), 4221–4224. <a href="https://doi.org/10.1073/pnas.0501179102">doi:10.1073/pnas.0501179102</a>',
  'Chao, A., &amp; Shen, T.-J. (2003). Nonparametric estimation of Shannon’s index of diversity when there are unseen species in sample. <em>Environmental and Ecological Statistics</em>, 10, 429–443. <a href="https://doi.org/10.1023/A:1026096204727">doi:10.1023/A:1026096204727</a>',
  'Hill, M. O. (1973). Diversity and evenness: A unifying notation and its consequences. <em>Ecology</em>, 54(2), 427–432. <a href="https://doi.org/10.2307/1934352">doi:10.2307/1934352</a>',
];
