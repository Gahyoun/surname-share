const $ = id => document.getElementById(id);
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const pp = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const pt = x => `${x >= 0 ? '+' : '−'}${Math.abs(100 * x).toFixed(2)}`;
const ci = (r, a, b, d = 2) => `${r[a].toFixed(d)}–${r[b].toFixed(d)}`;
const ko = x => Math.round(x).toLocaleString('ko-KR');
const pv = p => (p < 0.001 ? 'p<0.001' : `p=${p.toFixed(3)}`);
const NS = 'http://www.w3.org/2000/svg';
const INK = { IN: '--viz-chen-ink', KR: '--viz-zhang-ink' };
const ORDER = ['IN', 'KR'];

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (parent) parent.appendChild(node);
  return node;
}
function table(host, head, rows) {
  $(host).innerHTML = `<thead><tr>${head.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${r.thin ? ' class="thin"' : ''}>${r.cells.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
}
function showTip(event, html) {
  const tip = $('tip');
  tip.innerHTML = html;
  tip.style.display = 'block';
  tip.style.left = `${Math.min(event.clientX + 14, innerWidth - tip.offsetWidth - 8)}px`;
  tip.style.top = `${event.clientY + 14}px`;
}
const hideTip = () => { $('tip').style.display = 'none'; };

function drawTrend(D) {
  const svg = $('trend-chart');
  const W = 1000, H = 400, m = { t: 14, r: 170, b: 28, l: 54 };
  const lines = ORDER.flatMap(code => {
    const c = D.countries[code], set = `${c.name} 상위 ${D.primary}`, s = c.series;
    return [{ label: `${c.name} 성씨 집합`, ink: INK[code], rows: s.map(r => [r.year, r[set] / s[0][set]]) },
      { label: `${c.name} 소속`, ink: INK[code], dash: '6 5', rows: s.map(r => [r.year, r.pi / s[0].pi]) }];
  });
  const years = lines[0].rows.map(r => r[0]);
  const yMax = Math.ceil(Math.max(...lines.flatMap(l => l.rows.map(r => r[1]))));
  const x = v => m.l + (v - years[0]) * (W - m.l - m.r) / (years.at(-1) - years[0]);
  const y = v => H - m.b - v * (H - m.t - m.b) / yMax;
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.minWidth = '640px';
  for (let v = 0; v <= yMax; v += 1) {
    el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: css('--gk-border-light'), 'stroke-width': 1 }, svg);
    el('text', { x: m.l - 7, y: y(v) + 4, 'text-anchor': 'end' }, svg).textContent = `×${v}`;
  }
  years.forEach(v => { el('text', { x: x(v), y: H - 8, 'text-anchor': 'middle' }, svg).textContent = v; });
  lines.forEach(l => {
    el('path', { d: `M${l.rows.map(r => `${x(r[0])},${y(r[1])}`).join('L')}`, fill: 'none', stroke: css(l.ink), 'stroke-width': 2, 'stroke-dasharray': l.dash || 'none' }, svg);
    l.rows.forEach(r => {
      const dot = el('circle', { cx: x(r[0]), cy: y(r[1]), r: 5, fill: css(l.ink), stroke: css('--gk-bg'), 'stroke-width': 2 }, svg);
      dot.addEventListener('mousemove', e => showTip(e, `${esc(l.label)}, ${r[0]}년: ×${r[1].toFixed(2)}`));
      dot.addEventListener('mouseleave', hideTip);
    });
  });
  const labels = lines.map(l => ({ text: l.label, y: y(l.rows.at(-1)[1]) + 4 })).sort((a, b) => a.y - b.y);
  labels.forEach((l, i) => { if (i && l.y - labels[i - 1].y < 18) l.y = labels[i - 1].y + 18; });
  labels.forEach(l => { el('text', { x: W - m.r + 8, y: l.y, class: 'strong' }, svg).textContent = l.text; });
}

let current = 'IN';
function drawForest(D) {
  const c = D.countries[current], S = c.summary;
  const rows = c.fields.slice().sort((a, b) => b.e - a.e);
  const svg = $('forest');
  const W = 1000, row = 24, m = { t: 26, r: 40, b: 30, l: 330 }, H = m.t + m.b + row * rows.length;
  const lo = 0.1, hi = 50;
  const x = v => m.l + (Math.log(Math.min(hi, Math.max(lo, v))) - Math.log(lo)) * (W - m.l - m.r) / (Math.log(hi) - Math.log(lo));
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.minWidth = '640px';
  [0.1, 0.5, 1, 2, 5, 10, 50].forEach(v => {
    el('line', { x1: x(v), x2: x(v), y1: m.t, y2: H - m.b, stroke: css(v === 1 ? '--gk-text-subtle' : '--gk-border-light'), 'stroke-width': 1 }, svg);
    el('text', { x: x(v), y: H - 10, 'text-anchor': 'middle' }, svg).textContent = v;
  });
  el('line', { x1: x(S.mean_e), x2: x(S.mean_e), y1: m.t, y2: H - m.b, stroke: css(INK[current]), 'stroke-width': 2 }, svg);
  el('text', { x: x(S.mean_e), y: 16, 'text-anchor': 'middle', class: 'strong' }, svg).textContent = `평균 ${S.mean_e.toFixed(2)}`;
  rows.forEach((r, i) => {
    const cy = m.t + row * i + row / 2;
    const name = el('text', { x: m.l - 10, y: cy + 4, 'text-anchor': 'end' }, svg);
    name.textContent = r.name.length > 40 ? `${r.name.slice(0, 39)}…` : r.name;
    el('line', { x1: x(r.lo), x2: x(r.hi), y1: cy, y2: cy, stroke: css(INK[current]), 'stroke-width': 2, 'stroke-opacity': r.thin ? 0.4 : 1 }, svg);
    const dot = el('circle', { cx: x(r.e), cy, r: 5, fill: r.thin ? css('--gk-bg') : css(INK[current]), stroke: css(INK[current]), 'stroke-width': 2 }, svg);
    dot.addEventListener('mousemove', e => showTip(e, `${esc(r.name)}<br>E ${r.e.toFixed(2)} (${ci(r, 'lo', 'hi')})<br>hit ${r.hits_early} → ${r.hits_late}`));
    dot.addEventListener('mouseleave', hideTip);
  });
  table('field-table', ['Field', 'Hit 2000–04', 'Hit 2020–25', '비중 2000–04', '비중 2020–25', 'E', '95% CI'],
    rows.map(r => ({ thin: r.thin, cells: [esc(r.name), r.hits_early, r.hits_late, pp(r.share_early), pp(r.share_late), r.e.toFixed(2), ci(r, 'lo', 'hi')] })));
}
function bindCountry(D) {
  const host = $('seg-country');
  host.innerHTML = ORDER.map(code => `<button type="button" data-code="${code}" aria-pressed="${code === current}">${D.countries[code].name}</button>`).join('');
  host.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    current = b.dataset.code;
    host.querySelectorAll('button').forEach(o => o.setAttribute('aria-pressed', o === b));
    drawForest(D);
  }));
}

function render(D, C, V) {
  const set = c => c.rows.find(r => r.group === `${c.name} 상위 ${D.primary}`);
  const by = (c, end) => c.rows.find(r => r.group.endsWith(end));
  const I = D.countries.IN, K = D.countries.KR;
  const i = set(I), k = set(K), cn = C.overall.rows.find(r => r.group === `중국계 상위 ${D.primary}`);
  const span = (code, a, b) => V.periods.find(r => r.country === code && r.start === a && r.end === b);
  const kp1 = span('KR', D.first, 2015), kp2 = span('KR', 2015, D.last), ip1 = span('IN', D.first, 2015), ip2 = span('IN', 2015, D.last), cp1 = span('CN', D.first, 2015), cp2 = span('CN', 2015, D.last);
  const ks = by(K, '특이도 높은 성'), is = by(I, '특이도 높은 성'), k5 = by(K, '상위 5'), k50 = by(K, '상위 50');
  const pi = c => [c.series[0].pi, c.series.at(-1).pi, Math.max(...c.series.map(s => s.pi)), c.series.reduce((a, s) => (s.pi > a.pi ? s : a)).year];
  const [iPi0, iPi1] = pi(I), [kPi0, kPi1, kPeak, kYear] = pi(K);

  $('lede').innerHTML = `<strong>${D.first}년부터 ${D.last}년까지 인도 소속 제1저자에게 흔한 상위 ${D.primary}개 성씨의 초과 증가율 E는 ${i.e.toFixed(1)}(95% CI ${ci(i, 'lo', 'hi', 1)}), 한국 소속 기준 상위 ${D.primary}개는 ${k.e.toFixed(1)}(${ci(k, 'lo', 'hi', 1)})입니다.</strong> 같은 기준의 중국 소속 상위 ${D.primary}개(${cn.e.toFixed(1)})보다 작습니다. 구간을 나누면 달라지는 부분이 있습니다. 한국 집합은 ${D.first}–2015년에는 전체보다 빨랐지만(${kp1.e.toFixed(2)}, ${ci(kp1, 'lo', 'hi')}) 2015–${D.last}년에는 전체보다 느렸습니다(${kp2.e.toFixed(2)}, ${ci(kp2, 'lo', 'hi')}). 한국 집합의 변화는 소속 구성의 변화만으로 대체로 재현되지만, 인도 집합의 변화는 그렇지 않습니다.`;
  $('tiles').innerHTML = [[`인도 소속 상위 ${D.primary}`, i, '--viz-chen'], [`한국 소속 상위 ${D.primary}`, k, '--viz-zhang'], [`중국 소속 상위 ${D.primary}`, cn, '--viz-wang']].map(([label, r, tone]) =>
    `<div class="tile" style="--tile:var(${tone})"><span>${label}</span><b>E ${r.e.toFixed(2)}</b><small>${pp(r.share_first)} → ${pp(r.share_last)}</small></div>`).join('');
  $('scope').textContent = `E는 해당 성씨 집합의 증가율을 전체 논문의 증가율로 나눈 값이고, E=1이면 같은 속도입니다. '초과'는 기준선과의 비를 가리킬 뿐 과잉을 뜻하지 않습니다. 전체 core 논문은 ${D.first}–${D.last}년에 ×${D.growth_all.toFixed(1)} 늘었습니다. 연도별 표본은 시점당 약 1만 건입니다.`;

  $('define-text').textContent = `메인 페이지의 중국계 분석과 같은 절차를 따릅니다. 성씨 목록은 pooled core 표본에서 소속 국가가 인도인 제1저자(n=${ko(I.n)})와 한국인 제1저자(n=${ko(K.n)})의 빈도순으로 뽑고, 증가율은 이와 별개인 연도별 표본과 field 표본에서 측정합니다. 초과 증가율 E는 전체 제1저자 중 해당 성씨 비중의 기말 대 기초 비입니다. 두 국가의 성씨 구조는 크게 다릅니다. 상위 ${D.primary}개가 한국 소속 제1저자의 ${pp(K.coverage[D.primary], 0)}를 포괄하는 반면, 인도 소속에서는 ${pp(I.coverage[D.primary], 0)}만 포괄합니다. 따라서 인도 집합의 값은 인도 소속 연구자 전체가 아니라 그중 흔한 성씨 일부의 추세로 읽어야 합니다. 결과의 민감도를 확인하기 위해 집합 크기, 국가 특이도(표본에서 그 성씨의 해당 국가 소속 비율 ${pp(0.5, 0)} 이상), 초기 표본 기준 순위, 앞서 손으로 고른 8개 목록을 함께 제시합니다.`;
  table('set-table', ['집합', '성씨 수', `${D.first}년`, `${D.last}년`, 'Hit', 'E', '95% CI'], ORDER.flatMap(code => D.countries[code].rows).map(r => ({ cells: [esc(r.group), r.size, pp(r.share_first), pp(r.share_last), `${r.hits_first} → ${r.hits_last}`, r.e.toFixed(2), ci(r, 'lo', 'hi')] })));

  $('trend-text').textContent = `소속이 확인된 제1저자 중 인도 소속 비중은 ${D.first}년 ${pp(iPi0)}에서 ${D.last}년 ${pp(iPi1)}로 증가했습니다. 한국 소속 비중은 ${kYear}년 ${pp(kPeak)}까지 증가한 뒤 ${D.last}년 ${pp(kPi1)}로 줄었습니다(${D.first}년 ${pp(kPi0)}). 그림은 ${D.first}년 값을 1로 놓은 상대 변화이며, 실선은 상위 ${D.primary}개 성씨의 비중, 점선은 소속 비중입니다. 표본 시점이 6개뿐이므로 인접 시점 사이의 작은 변화에는 의미를 두지 않습니다.`;
  const legend = [['인도', '--viz-chen-ink'], ['한국', '--viz-zhang-ink']];
  $('legend-trend').innerHTML = legend.map(([l, c]) => `<span><i style="background:var(${c.replace('-ink', '')});border-color:var(${c})"></i>${l}</span>`).join('') + '<span>실선: 성씨 비중</span><span>점선: 소속 비중</span>';
  table('trend-table', ['연도', '인도 소속', `인도 집합 ${D.primary}개`, '한국 소속', `한국 집합 ${D.primary}개`], I.series.map((s, n) => ({ cells: [s.year, pp(s.pi), pp(s[`인도 상위 ${D.primary}`], 2), pp(K.series[n].pi), pp(K.series[n][`한국 상위 ${D.primary}`], 2)] })));

  $('null-text').innerHTML = `성씨는 국경을 넘습니다. Lee와 Han, Song은 한국과 중국에 모두 흔하고, Khan과 Patel은 표본에서 인도보다 다른 나라 소속이 더 많습니다. 이를 반영하기 위해 소속이 확인된 제1저자를 해당 국가, 중국, 그 외의 세 집단으로 나누고, 각 집단 안의 성씨 비중을 여섯 시점 평균으로 고정한 채 집단 크기만 바꾸는 null E<sub>null</sub>을 구성했습니다. 관측 E와의 비 E/E<sub>null</sub>이 1이면 소속 구성 변화만으로 증가를 재현할 수 있다는 뜻입니다. 95% CI는 시점별 다항 재표집 4,000회로 구했습니다. 인도 상위 ${D.primary}개의 비는 ${i.ratio.toFixed(2)}(${ci(i, 'ratio_lo', 'ratio_hi')})로 1을 벗어나며, 특이도 높은 성씨만 남겨도 ${is.ratio.toFixed(2)}(${ci(is, 'ratio_lo', 'ratio_hi')})입니다. 한국 상위 ${D.primary}개의 비는 ${k.ratio.toFixed(2)}(${ci(k, 'ratio_lo', 'ratio_hi')})로 1과 구분되지 않습니다. 이 결과는 구성 변화와 수치상 부합한다는 뜻이며, 구성 변화가 원인이라는 판단은 아닙니다.`;
  table('null-table', ['집합', '국가 안 E', '95% CI', '국가 밖 E', '95% CI', 'E (소속 확인)', 'E_null', 'E/E_null', '95% CI'], ORDER.flatMap(code => D.countries[code].rows).map(r => ({ cells: [esc(r.group), r.in_e.toFixed(2), ci(r, 'in_lo', 'in_hi'), r.out_e.toFixed(2), ci(r, 'out_lo', 'out_hi'), r.e_known.toFixed(2), r.e_null.toFixed(2), r.ratio.toFixed(2), ci(r, 'ratio_lo', 'ratio_hi')] })));

  const label = code => `${V.names[code]} 상위 ${V.size[code]}`;
  const CODES = ['CN', 'IN', 'KR'];
  const proxy = (code, year) => V.proxy.find(r => r.country === code && r.year === year);
  const order = code => V.order.find(r => r.country === code);
  const team = (code, name) => V.team.find(r => r.country === code && r.team === name);
  const std = code => V.standard.find(r => r.country === code);
  const miss = year => V.missing.find(r => r.country === 'CN' && r.year === year);
  const c0 = proxy('CN', D.first), c1 = proxy('CN', D.last), co = order('CN'), cn100 = C.overall.rows.find(r => r.group === '중국계 상위 100');
  $('validity-text').textContent = `E를 시점과 국가 사이에서 비교하려면 같은 측정값이 같은 대상을 가리켜야 합니다. 이 절은 그 전제를 소속 기록이라는 외부 기준으로 점검합니다. 중국 소속 상위 100개 집합을 함께 넣은 것은 세 집합을 같은 기준으로 비교하기 위해서입니다.`;
  $('proxy-text').textContent = `Precision은 집합에 속한 제1저자 중 실제로 그 국가 소속인 비율이고, recall은 그 국가 소속 제1저자 중 집합에 속한 비율입니다. 중국 상위 100개의 precision은 ${D.first}년 ${pp(c0.precision, 0)}에서 ${D.last}년 ${pp(c1.precision, 0)}로 크게 변했습니다. ${D.first}년에 이 성씨를 가진 제1저자의 대다수는 중국 밖 소속이었고, ${D.last}년에는 대부분 중국 소속입니다. 같은 성씨 집합이 시점마다 다른 모집단을 가리키는 셈입니다. 반면 국가 밖 저자에서 집합이 차지하는 비율은 ${pp(c0.other_rate)}와 ${pp(c1.other_rate)}로 안정적입니다. 또한 E(${cn100.e.toFixed(1)})는 소속 비중의 증가(${pp(c0.pi)} → ${pp(c1.pi)}, 약 ${(c1.pi / c0.pi).toFixed(0)}배)보다 작은데, 기초 시점의 분모에 중국 밖 저자가 많기 때문으로 해석됩니다. 인도 집합은 recall이 20% 안팎이고 한국 집합은 60%대여서, 세 집합의 E 크기를 곧바로 비교하는 것은 적절하지 않습니다.`;
  table('proxy-table', ['집합', '연도', 'π (소속 비중)', 'Precision', 'Recall', '국가 밖 비율', '국가 소속 n'], CODES.flatMap(code => [D.first, 2015, D.last].map(y => { const r = proxy(code, y); return { cells: [label(code), y, pp(r.pi), pp(r.precision, 0), pp(r.recall, 0), pp(r.other_rate), r.n_inside] }; })));
  $('period-text').textContent = `시작과 끝을 잇는 단일 E는 경로를 숨깁니다. 2015년을 기준으로 나누면 중국 집합은 두 구간 모두 전체보다 빨랐고(${cp1.e.toFixed(2)}, ${cp2.e.toFixed(2)}), 인도 집합은 ${ip1.e.toFixed(2)}에서 ${ip2.e.toFixed(2)}(${ci(ip2, 'lo', 'hi')})로 둔화했으며, 한국 집합은 ${kp1.e.toFixed(2)}에서 ${kp2.e.toFixed(2)}(${ci(kp2, 'lo', 'hi')})로 방향이 바뀌었습니다. 2015년은 한국 소속 비중이 표본에서 가장 높았던 시점을 보고 사후에 고른 구분점이므로, 이 대비는 탐색적 결과입니다.`;
  table('period-table', ['집합', '구간', '비중', 'Hit', 'E', '95% CI'], V.periods.map(r => ({ cells: [label(r.country), `${r.start}–${r.end}`, `${pp(r.share_first)} → ${pp(r.share_last)}`, `${r.hits_first} → ${r.hits_last}`, r.e.toFixed(2), ci(r, 'lo', 'hi')] })));
  const big = team('CN', '4명 이상'), solo = team('CN', '1명');
  $('team-text').textContent = `제1저자 자리의 의미는 팀 규모와 분야의 저자 표기 관행에 따라 다릅니다. 저자 4명 이상인 논문의 비중은 ${D.first}년 ${pp(big.weight_first, 0)}에서 ${D.last}년 ${pp(big.weight_last, 0)}로 늘었습니다. 중국 집합의 E는 4명 이상 논문에서 ${big.e.toFixed(2)}(${ci(big, 'lo', 'hi')}), 단독 논문에서 ${solo.e.toFixed(2)}(${ci(solo, 'lo', 'hi')})입니다. 인도·한국 집합에서는 이 차이가 나타나지 않습니다. 제1저자만 측정하므로 중간 저자나 교신저자로서의 참여는 포착되지 않으며, 알파벳순 표기 분야에서는 성씨 첫 글자에 따라 제1저자가 될 확률 자체가 달라질 수 있습니다.`;
  table('team-table', ['집합', '저자 수', `논문 비중 ${D.first}`, `논문 비중 ${D.last}`, 'Hit', 'E', '95% CI'], V.team.map(r => ({ cells: [label(r.country), r.team, pp(r.weight_first, 0), pp(r.weight_last, 0), `${r.hits_first} → ${r.hits_last}`, r.e.toFixed(2), ci(r, 'lo', 'hi')] })));
  const fw = code => `${V.names[code]} ${std(code).e_weighted.toFixed(2)} → ${std(code).e_early_weights.toFixed(2)}`;
  const rivals = [
    ['소속 국가 구성의 변화', '세 집단 null', `E/E_null 한국 ${k.ratio.toFixed(2)}, 인도 ${i.ratio.toFixed(2)}`, '한국은 부합, 인도는 잔차가 남음'],
    ['Field 구성의 변화', '2000–04년 field 가중치 고정', `${CODES.map(fw).join(', ')}`, '영향이 작음'],
    ['성이 앞에 기록된 이름', '첫 토큰이 집합에 속하는 이름을 추가 계수', `중국 ${co.e.toFixed(2)} → ${co.e_fixed.toFixed(2)}, 인도 ${order('IN').e.toFixed(2)} → ${order('IN').e_fixed.toFixed(2)}, 한국 ${order('KR').e.toFixed(2)} → ${order('KR').e_fixed.toFixed(2)}`, `중국 E는 일부 과대 가능. 오탐이 포함된 하한이므로 ${co.e_fixed.toFixed(1)}–${co.e.toFixed(1)} 범위로 읽음`],
    ['소속 미기재', '미기재 안의 비중 비교', `미기재율 ${pp(miss(D.first).unknown, 0)} → ${pp(miss(D.last).unknown, 0)}. ${D.last}년 중국 집합 비중은 기재 ${pp(miss(D.last).share_known, 0)}, 미기재 ${pp(miss(D.last).share_unknown, 0)}`, '결측이 무작위가 아님. 소속 기준 값은 근사치'],
    ['팀 규모와 저자 순서', '저자 수별 E', `중국 ${solo.e.toFixed(2)}(단독) ~ ${big.e.toFixed(2)}(4명 이상)`, '중국 집합은 대형 팀에서 더 크게 증가. 저자 순서 관행은 미검정'],
    ['연구자 수와 연구자당 논문 수', '검정 불가', '표본에 저자 ID 없음', '미해결'],
    ['색인 수록 범위의 변화', '검정 불가', 'Core sources의 국가별 편입 이력 미수집', '미해결']
  ];
  table('rival-table', ['경쟁 설명', '점검', '결과', '판단'], rivals.map(r => ({ cells: r })));

  const shift = (r, g) => r[`size_${g}`] + r[`within_${g}`];
  $('shift-text').textContent = `소속 확인 제1저자 중 비중의 변화량을 집단 크기 변화(between)와 집단 안 성씨 비중 변화(within)로 나눴습니다. 한국 상위 ${D.primary}개의 증가분 ${pt(k.delta)}%p 가운데 ${pt(shift(k, 'china'))}%p가 중국 소속에서 나옵니다. 이 값은 Lee·Han·Song처럼 중국에도 흔한 성씨 때문이며, 집합을 넓힐수록 커집니다. 상위 5개(E ${k5.e.toFixed(2)}, ${ci(k5, 'lo', 'hi')})와 특이도 높은 성씨(E ${ks.e.toFixed(2)}, ${ci(ks, 'lo', 'hi')})의 CI는 1을 포함하지만, 상위 50개는 E ${k50.e.toFixed(2)}까지 올라갑니다. 즉 한국 집합 E의 크기는 목록에 중국과 겹치는 성씨가 얼마나 들어가는지에 크게 좌우됩니다. 인도 상위 ${D.primary}개는 증가분 ${pt(i.delta)}%p 가운데 ${pt(i.size_country)}%p가 인도 소속 규모의 증가, ${pt(i.within_rest)}%p가 인도·중국 밖 소속 안의 비중 증가입니다. 후자는 파키스탄 등 다른 나라의 같은 성씨와 인도 밖에서 활동하는 연구자를 모두 포함하므로, 이 표본만으로는 둘을 구분할 수 없습니다.`;
  table('shift-table', ['집합', '변화량 (%p)', '해당 국가 between', '해당 국가 within', '중국', '그 외'], [i, k].map(r => ({ cells: [esc(r.group), pt(r.delta), pt(r.size_country), pt(r.within_country), pt(shift(r, 'china')), pt(shift(r, 'rest'))] })));

  const IS = I.summary, KS = K.summary;
  $('field-text').textContent = `field×기간 셀마다 600건을 추출한 표본에서 2000–04년 대비 2020–25년의 E를 구했습니다. 상위 ${D.primary}개 성씨의 2000–04년 hit가 ${D.thin}건 미만인 셀이 인도 ${IS.thin}개, 한국 ${KS.thin}개 field이므로 field별 추정은 대체로 불안정합니다. 빈 원과 흐린 선이 이런 field입니다. Random-effects 평균 E는 인도 ${IS.mean_e.toFixed(2)}(${ci(IS, 'mean_lo', 'mean_hi')}), 한국 ${KS.mean_e.toFixed(2)}(${ci(KS, 'mean_lo', 'mean_hi')})입니다. Field 간 이질성은 두 국가 모두 검출되지 않았습니다(인도 Q=${IS.Q.toFixed(1)}, ${pv(IS.p)}, I²=${pp(IS.I2, 0)}; 한국 Q=${KS.Q.toFixed(1)}, ${pv(KS.p)}, I²=${pp(KS.I2, 0)}). 이는 분야 간 차이가 없다는 뜻이 아니라 이 표본 크기로는 식별할 수 없다는 뜻입니다. ML 근사(AI + CV)의 E는 인도 ${IS.ml.e.toFixed(2)}(${ci(IS.ml, 'lo', 'hi')}), 한국 ${KS.ml.e.toFixed(2)}(${ci(KS.ml, 'lo', 'hi')})입니다.`;

  $('surname-text').textContent = `상위 ${D.primary}개 성씨의 시점별 hit는 대부분 수십 건 이하이므로 성씨 간 순위에 의미를 두지 않습니다. 특이도는 pooled 표본에서 그 성씨의 제1저자 가운데 해당 국가 소속의 비율입니다.`;
  table('surname-table', ['국가', '성씨', '특이도', `Hit ${D.first}`, `Hit ${D.last}`, 'E', '95% CI'], ORDER.flatMap(code => D.countries[code].surnames.map(r => ({ thin: r.hits_first < D.thin, cells: [D.countries[code].name, esc(r.surname), pp(r.specificity, 0), r.hits_first, r.hits_last, r.e.toFixed(2), ci(r, 'lo', 'hi')] }))));

  $('limits-body').innerHTML = [
    '<strong>성씨의 의미.</strong> 성씨는 국적이나 민족이 아닙니다. 이 페이지의 집합은 해당 국가 소속 저자에게 흔한 성씨라는 측정상의 정의입니다. 그래서 출신을 암시하는 표현 대신 소속 기준으로 표기합니다. 소속 국가도 논문에 기재된 제1저자의 소속일 뿐 출신을 뜻하지 않습니다.',
    `<strong>표본 크기.</strong> 목록을 뽑은 pooled 표본은 인도 소속 ${ko(I.n)}건, 한국 소속 ${ko(K.n)}건이며 2000–09년 논문은 각각 ${I.n_early}건, ${K.n_early}건입니다. 국가 안 E의 분모도 ${D.first}년에 인도 ${i.n_in_first}건, 한국 ${k.n_in_first}건뿐이어서 CI가 넓습니다. 전수 집계 전까지 소수 첫째 자리 이하의 차이는 해석하지 않습니다.`,
    '<strong>목록 선택 편향.</strong> Pooled 표본은 최근 논문의 비중이 커서 실제로 늘어난 성씨가 뽑히기 쉽습니다. 2000–09년 기준 목록은 이를 줄이지만 초기 표본이 작습니다.',
    '<strong>표기와 구조.</strong> 한국 성씨는 Lee·Yi·Rhee, Jung·Jeong·Chung처럼 로마자 표기가 나뉘며, 이 분석은 별개의 문자열로 셉니다. 인도는 지역·언어에 따라 성씨 구조가 달라 남인도의 부칭 이름 등은 포착이 약하고, 상위 목록의 포괄률도 낮습니다.',
    '<strong>지표의 범위.</strong> E는 core sources 색인 안의 비중 변화이며 수록 범위의 변화를 함께 반영합니다. 소속 미상 제1저자는 집단 분해에서 빠집니다. 인과 효과의 추정이 아닙니다.',
    '<strong>분석 단위.</strong> 단위는 사람이 아니라 논문의 제1저자 자리입니다. 표본에 저자 ID가 없어서 연구자 수가 늘었는지, 연구자당 제1저자 논문이 늘었는지 구분하지 못합니다. 이 값은 연구의 질이나 공헌도도 측정하지 않습니다.',
    '<strong>해석상의 주의.</strong> 이름 문자열의 집계이므로 특정 집단이 학계에 과다하게 진출했다는 주장의 근거가 될 수 없습니다. 개인을 분류하지 않으며, 집단 단위로만 보고합니다. 성씨 표는 표기별 빈도를 나타낼 뿐 해당 성씨를 가진 사람에 관한 정보가 아닙니다.',
    '<strong>재현성.</strong> <code>scripts/surname_share_others.py</code>와 <code>scripts/surname_share_validity.py</code>로 재현할 수 있으며, 이미 수집한 표본만 사용하므로 추가 API 호출이 없습니다.'
  ].map(x => `<li>${x}</li>`).join('');

  const REFS = [
    ['Freeman, R. B. & Huang, W. (2015). Collaborating with people like me: Ethnic coauthorship within the United States. <em>Journal of Labor Economics</em>, 33(S1), S289–S318.', '10.1086/678973', '미국 소속 논문의 저자 성씨를 민족 집단으로 분류해 1985–2008년 구성 변화와 동일 민족 협업을 분석했습니다. 2008년 미국 논문 저자 이름의 약 14%가 중국계, 약 8%가 인도계로 집계되었습니다.'],
    ['Xie, Q. & Freeman, R. B. (2023). Creating and connecting US and China science: Chinese diaspora and returnee researchers. NBER Working Paper 31306.', '10.3386/w31306', '중국 공안부의 성씨 목록과 병음 이름 규칙으로 저자를 식별해, 2018년 Scopus에서 재미 중국 출신 연구자가 미국 소속 논문의 27%에 참여했다고 추정했습니다.'],
    ['Liu, W., Tang, L., Gu, M. & Hu, G. (2014). Feature report on China: a bibliometric analysis of China-related articles. <em>Scientometrics</em>, 102, 503–517.', '10.1007/s11192-014-1371-y', '성씨 사전으로 해외 중국계 저자를 근사하면서, 다른 민족과 공유되는 성씨 때문에 과대추정될 수 있다고 지적했습니다.'],
    ['Kerr, W. R. (2008). Ethnic scientific communities and international technology diffusion. <em>Review of Economics and Statistics</em>, 90(3), 518–537.', '10.1162/rest.90.3.518', '미국 특허 발명자의 이름에서 민족을 추정해 국제 기술 확산을 분석한, 이름 기반 측정의 대표적 선행연구입니다.'],
    ['Harzing, A.-W. (2015). Health warning: might contain multiple personalities—the problem of homonyms in Thomson Reuters Essential Science Indicators. <em>Scientometrics</em>, 105, 2259–2270.', '10.1007/s11192-015-1699-y', 'Wang, Zhang, Li, Kim, Lee 같은 성씨가 고피인용 저자 순위를 왜곡할 수 있음을 보였습니다. 이 페이지가 성씨를 개인이 아닌 집단 지표로만 쓰는 이유입니다.'],
    ['Kim, J. & Diesner, J. (2016). Distortive effects of initial-based name disambiguation on measurements of large-scale coauthorship networks. <em>Journal of the Association for Information Science and Technology</em>, 67(6), 1446–1461.', '10.1002/asi.23489', '이니셜 기반 이름 식별이 공저 네트워크 측정을 왜곡하는 정도를 분석했습니다.'],
    ['Kozlowski, D., Murray, D. S., Bell, A., Hulsey, W., Larivière, V., Monroe-White, T. & Sugimoto, C. R. (2022). Avoiding bias when inferring race using name-based approaches. <em>PLOS ONE</em>, 17(3), e0264270.', '10.1371/journal.pone.0264270', '이름 기반 인종 추정의 타당도가 집단마다 다르고 문턱값 방식이 집단 비중을 왜곡할 수 있음을 보였습니다.'],
    ['Kim, L., Adolph, C., West, J. D. & Stovel, K. (2020). The influence of changing marginals on measures of inequality in scholarly citations: Evidence of bias and a resampling correction. <em>Sociological Science</em>, 7, 314–341.', '10.15195/v7.a13', '모집단의 총량이 바뀌면 지표 자체가 변할 수 있음을 인용 불평등에서 보였습니다. 이 페이지가 시점 간 비교 가능성을 따로 점검하는 근거입니다.'],
    ['Xie, Y., Zhang, C. & Lai, Q. (2014). China’s rise as a major contributor to science and technology. <em>Proceedings of the National Academy of Sciences</em>, 111(26), 9437–9442.', '10.1073/pnas.1407709111', '성씨 분석은 아니지만, 중국 과학 성장의 규모를 다룬 배경 연구입니다.']
  ];
  $('refs').innerHTML = REFS.map(([text, doi, note]) => `<li>${text} <a href="https://doi.org/${doi}">doi:${doi}</a><br>${note}</li>`).join('');

  bindCountry(D);
  const redraw = () => { drawTrend(D); drawForest(D); };
  const button = $('mode-toggle');
  const apply = on => {
    document.documentElement.setAttribute('data-krds-mode', on ? 'high-contrast' : 'light');
    button.setAttribute('aria-pressed', on);
    redraw();
  };
  let saved = null;
  try { saved = localStorage.getItem('krds-mode'); } catch (e) { saved = null; }
  apply(saved === 'high-contrast');
  button.addEventListener('click', () => {
    const on = document.documentElement.getAttribute('data-krds-mode') !== 'high-contrast';
    apply(on);
    try { localStorage.setItem('krds-mode', on ? 'high-contrast' : 'light'); } catch (e) { /* preference only */ }
  });
}

Promise.all(['others.json', 'common.json', 'validity.json'].map(f => fetch(f).then(r => r.json()))).then(([D, C, V]) => render(D, C, V));
