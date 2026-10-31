# Surname share: 성씨로 본 제1저자 비중의 변화

"Zhang et al."은 전체 논문의 몇 %일까요? 이 저장소는 [OpenAlex](https://openalex.org) 표본으로 특정 성씨가 제1저자인 논문의 비중을 추정하고, 그 비중이 전체 논문의 증가 속도와 비교해 얼마나 빨리 변했는지 분석합니다.

- 메인 페이지: <https://gahyoun.github.io/surname-share/>
- 인도·한국 소속 성씨 서브페이지: <https://gahyoun.github.io/surname-share/others.html>
- 결과 기준일: 2026-10-31

> **먼저 읽어 주세요.** 이 분석의 단위는 사람이 아니라 **논문의 제1저자 자리에 기록된 성씨 문자열**입니다. 성씨는 국적이나 민족이 아니며, 이 값은 연구의 질이나 공헌도를 측정하지 않습니다. 특정 집단이 학계에 과다하게 진출했다는 주장의 근거로 쓸 수 없습니다. 자세한 내용은 [해석할 때 주의할 점](#12-해석할-때-주의할-점)에 있습니다.

## 목차

1. [핵심 결과](#1-핵심-결과)
2. [저장소 구성](#2-저장소-구성)
3. [데이터와 표본](#3-데이터와-표본)
4. [성씨 추출](#4-성씨-추출)
5. [비중 추정](#5-비중-추정)
6. [초과 증가율 E](#6-초과-증가율-e)
7. [분야 간 차이](#7-분야-간-차이)
8. [구성 변화 null과 분해](#8-구성-변화-null과-분해)
9. [통계물리 분석](#9-통계물리-분석)
10. [데이터과학 분석](#10-데이터과학-분석)
11. [측정 타당성 점검](#11-측정-타당성-점검)
12. [해석할 때 주의할 점](#12-해석할-때-주의할-점)
13. [재현 방법](#13-재현-방법)
14. [참고문헌](#14-참고문헌)

## 1. 핵심 결과

### 다섯 성씨의 비중

트윗에서 언급된 Zhang, Chen, Wang, Guo, Liu를 제1저자로 하는 논문의 비중입니다. Core sources는 OpenAlex가 CWTS 기준으로 표시한 학술지 묶음입니다. 전체 색인은 2015년 전후로 수록 범위가 크게 변하므로, 시계열에는 core sources를 기준 모집단으로 사용합니다.

| 성씨 | Core 전체 기간 | Core 2020–25 | 전체 OpenAlex 전체 기간 |
|---|---:|---:|---:|
| Zhang | 1.14% | 1.82% | 1.02% |
| Chen | 0.91% | 1.34% | 0.74% |
| Wang | 1.41% | 2.43% | 1.32% |
| Guo | 0.22% | 0.43% | 0.21% |
| Liu | 0.90% | 1.47% | 0.78% |
| **다섯 성 합계** | **4.58%** | **7.49%** | **4.07%** |

### 성씨 집합별 초과 증가율

E는 2000년에서 2025년 사이에 성씨 집합의 비중이 몇 배가 되었는지를 나타내며, 전체 논문보다 몇 배 빠르게 늘었는지와 같은 값입니다. E=1이면 전체 논문과 같은 속도입니다. 같은 기간 core 전체 논문은 약 3.3배 늘었습니다.

| 집합 | 2000년 비중 | 2025년 비중 | E (95% CI) |
|---|---:|---:|---:|
| 중국 소속 상위 100개 | 7.3% | 31.7% | 4.33 (4.01–4.67) |
| 중국 소속 상위 5개 (호적 인구 상위 5개와 동일) | | | 4.56 (3.99–5.21) |
| 2000–09년 기준 상위 20개 | | | 4.65 (4.19–5.17) |
| 트윗의 다섯 성 | | | 4.25 (3.67–4.91) |
| 인도 소속 상위 20개 | 0.7% | 1.8% | 2.66 (2.00–3.53) |
| 한국 소속 상위 20개 | 1.7% | 2.5% | 1.43 (1.17–1.73) |

세 집합의 E 크기를 곧바로 순위로 읽으면 안 됩니다. 집합이 해당 국가 소속 저자를 포괄하는 비율이 크게 다르기 때문입니다([11절](#11-측정-타당성-점검)).

### 네 가지 해석

1. **중국 집합의 증가는 중국 소속 비중의 증가와 함께 움직입니다.** 소속이 확인된 제1저자 중 중국 소속은 2.7%에서 32.4%로 늘었고, 중국 밖 소속 제1저자 안에서 상위 100개 성씨의 비중은 5.4%에서 5.8%로 거의 그대로입니다.
2. **E는 한 집단의 성장률이 아닙니다.** 중국 상위 100개 집합에서 실제 중국 소속의 비율은 2000년 29%에서 2025년 88%로 바뀌었습니다. 기초 시점과 기말 시점이 가리키는 모집단이 다릅니다.
3. **한국 집합은 구간에 따라 방향이 다릅니다.** E는 2000–2015년 1.76, 2015–2025년 0.81(0.68–0.96)입니다. 후자는 전체 논문보다 느렸다는 뜻입니다. 2015년은 데이터를 본 뒤 고른 구분점이므로 탐색적 결과입니다.
4. **인도 집합의 증가는 소속 구성 변화만으로 재현되지 않습니다.** 관측 E와 null의 비가 1.59(1.18–2.17)입니다. 한국은 1.01(0.85–1.20)입니다.

## 2. 저장소 구성

```text
docs/       GitHub Pages로 배포되는 페이지
  index.html, app.js, growth.js   메인 페이지
  others.html, others.js          인도·한국 소속 성씨 서브페이지
  style.css, primitives.css, semantic.css   KRDS 기반 스타일
  *.json                          분석 스크립트가 만든 페이지 데이터
scripts/    수집과 분석 스크립트
data/       원자료와 단계별 산출물 (커밋하지 않음, 실행하면 생성)
```

| 스크립트 | 단계 | 하는 일 | 출력 |
|---|---|---|---|
| `surname_share_collect.py` | S1–S2 | OpenAlex 집계와 표본 수집 | `data/` |
| `surname_share_analyze.py` | S3–S6 | 성씨 추출, 비중 추정, 시계열 | `data.json` |
| `surname_share_distribution.py` | S7–S11 | 꼬리 적합, 집중도, 혼합 null | `distribution.json` |
| `surname_share_retest.py` | S13–S16 | 더 큰 표본으로 사전 규칙에 따른 재검정 | `retest.json` |
| `surname_share_fields.py` | S17–S22 | 분야별 E, 스케일링, 데이터과학 분석 | `fields.json` |
| `surname_share_common.py` | S23–S26 | 중국 소속 성씨 집합의 E | `common.json` |
| `surname_share_others.py` | S27–S31 | 인도·한국 소속 성씨 집합의 E | `others.json` |
| `surname_share_validity.py` | S32–S38 | 측정 타당성 점검 | `validity.json` |

모든 처리는 번호가 붙은 단계로 나뉘고, 남긴 행과 제외한 행이 함께 저장되며, `data/STEP_LOG.csv`에 입력과 출력 행 수가 기록됩니다.

## 3. 데이터와 표본

OpenAlex는 제1저자 성씨로 직접 거르는 기능을 제공하지 않습니다. 그래서 전수 집계 대신 표본을 뽑고, 정확한 총량은 API의 집계값을 사용합니다. 대상은 `type:article`이고 저자가 1명 이상인 논문입니다.

| 표본 | 구성 | 용도 |
|---|---|---|
| S1, S1b, S1c | 층별·연도별 정확한 논문 수 | 층 크기, 전체 증가율 |
| S2 | field×기간 층별 표본, 총 156,000건 | 전체 OpenAlex 비중 |
| S2b | Core sources 연도별 표본, 총 31,000건 | Core 비중과 시계열 |
| S2c | 2000·2005·2010·2015·2020·2025년 표본, 시점당 약 1만 건 | E 측정 |
| S2d | 2000–2025년 pooled 표본, 약 3만 건 | 성씨 목록 선정, 꼬리 분석 |
| S2e | field×기간 셀당 600건, 총 약 9만 건 | 분야별 E |

성씨 목록을 뽑는 표본(S2d)과 증가율을 재는 표본(S2c, S2e)을 분리한 이유는, 표본 잡음 때문에 우연히 많이 뽑힌 성씨가 "많이 늘어난 성씨"로 측정되는 선택 효과를 막기 위해서입니다. 분야는 논문의 `primary_topic`에서 가져오며, OpenAlex의 상위 분류 26개 field를 사용합니다. ML은 독립 field가 아니므로 Artificial Intelligence와 Computer Vision and Pattern Recognition 두 subfield를 합쳐 근사합니다.

## 4. 성씨 추출

제1저자의 원문 이름(`raw_name`)과 표시 이름(`display_name`)에서 다음 순서로 성씨를 정합니다. 어떤 규칙이 적용됐는지는 `rule` 열에 남습니다.

| 규칙 | 예시 입력 | 처리 |
|---|---|---|
| `cjk` | 张伟 | 첫 한자를 로마자로 변환 |
| `comma` | Zhang, Wei | 쉼표 앞을 성씨로 사용 |
| `trailing_initials` | Zhang W. | 뒤가 모두 이니셜이면 첫 토큰 |
| `caps_first` | ZHANG Wei | 첫 토큰이 대문자면 첫 토큰 |
| `family_first_pinyin` | Zhang Wei | 목표 성씨가 앞에 있고 나머지가 병음이며 소속이 중화권이거나 미상이면 첫 토큰 |
| `last_token` | Wei Zhang | 마지막 토큰 |
| `display_fallback` | 기관명이 든 이름 등 | 표시 이름의 마지막 토큰 |

라틴 문자가 아니거나 너무 짧은 값, 사람 이름이 아닌 값은 제외하고 이유와 함께 별도 파일에 저장합니다. `family_first_pinyin`은 목표 성씨 6개에만 적용되므로, 다른 성씨에서 성이 앞에 기록된 이름은 놓칩니다. 이 영향은 [11절](#11-측정-타당성-점검)에서 잽니다.

## 5. 비중 추정

### 층화 Hájek 추정량

층마다 뽑힌 비율이 다르므로 각 논문에 가중치를 줍니다.

$$
w_i = \frac{N_h}{n_h}, \qquad
\hat{p} = \frac{\sum_i w_i\, d_i\, x_i}{\sum_i w_i\, d_i}
$$

- $N_h$: 층 $h$의 실제 논문 수, $n_h$: 그 층에서 뽑은 논문 수
- $x_i$: 논문 $i$의 제1저자가 해당 성씨이면 1, 아니면 0
- $d_i$: 논문이 관심 영역(예: 특정 field나 기간)에 속하면 1

**해석.** $w_i$는 "뽑힌 논문 한 편이 모집단의 몇 편을 대표하는가"입니다. 큰 층에서 뽑힌 논문일수록 가중치가 큽니다. 즉 $\hat{p}$는 가중 평균이며, 표본 구성의 불균형을 모집단 구성으로 되돌린 값입니다.

### 분산

비율 추정량이므로 선형화 변수 $z_i = d_i(x_i - \hat{p})$를 써서 층별 분산을 합칩니다.

$$
\widehat{\mathrm{Var}}(\hat{p}) =
\frac{1}{\hat{N}^2} \sum_h N_h^2 \left(1 - \frac{n_h}{N_h}\right) \frac{s_{zh}^2}{n_h}
$$

**해석.** $s_{zh}^2$는 층 안에서 $z$가 흩어진 정도이고, $(1 - n_h/N_h)$는 유한 모집단 보정입니다. 층을 거의 다 뽑았다면 불확실성이 줄어듭니다. 95% CI는 $\hat{p} \pm 1.96\,\mathrm{SE}$입니다.

### 시계열 추세

비중을 logit으로 바꾸고, 기울기가 한 번 바뀌는 연속 구간선형 모형을 맞춥니다.

$$
\mathrm{logit}(p_t) = a + b\,(t-\tau) + c\,(t-\tau)_+
$$

**해석.** $(t-\tau)_+$는 $t > \tau$일 때만 $t-\tau$이고 그 전에는 0입니다. 따라서 $\tau$ 이전 기울기는 $b$, 이후 기울기는 $b+c$입니다. $\tau$는 격자 탐색으로 잔차제곱합이 가장 작은 연도를 고릅니다. 비중을 logit으로 바꾸면 비중이 낮을 때의 기울기가 대략 연간 상대 증가율로 읽힙니다.

## 6. 초과 증가율 E

### 정의

$$
E = \frac{G_{\text{group}}}{G_{\text{all}}}
  = \frac{s_L N_L / (s_E N_E)}{N_L / N_E}
  = \frac{s_L}{s_E}
$$

- $s_E, s_L$: 기초 시점과 기말 시점의 비중
- $N_E, N_L$: 기초 시점과 기말 시점의 전체 논문 수

**해석.** 분자는 성씨 집합의 논문이 몇 배 늘었는지, 분모는 전체 논문이 몇 배 늘었는지입니다. $N$이 약분되어 E는 결국 **비중의 비**입니다. '초과'는 기준선과의 비를 가리킬 뿐 과잉을 뜻하지 않습니다.

연율은 $E^{1/T} - 1$입니다. 예를 들어 $T=25$년에 $E=4.33$이면 매년 약 6.0%씩 전체를 앞선 셈입니다.

### 신뢰구간

hit가 0인 셀이 있으면 로그가 정의되지 않으므로 Haldane 보정을 적용합니다. $h$는 hit 수, $n$은 표본 크기입니다.

$$
h' = h + \tfrac{1}{2}, \quad n' = n + 1, \qquad
\log \hat{E} = \log\frac{h_L'/n_L'}{h_E'/n_E'}
$$

$$
\widehat{\mathrm{Var}}(\log \hat{E}) =
\frac{1}{h_E'} - \frac{1}{n_E'} + \frac{1}{h_L'} - \frac{1}{n_L'}
$$

**해석.** 분산의 대부분은 $1/h$에서 나옵니다. 즉 불확실성을 결정하는 것은 전체 표본 크기보다 **hit 수**입니다. 초기 시점 hit가 몇 건뿐인 셀의 E는 커 보여도 믿기 어렵습니다. CI는 로그 척도에서 $\pm 1.96\,\mathrm{SE}$를 구한 뒤 지수 변환하므로 좌우가 비대칭입니다.

### E의 상한과 odds ratio

$s_L \le 1$이므로 $E \le 1/s_E$입니다. 초기 비중이 큰 분야는 E가 커질 여지가 산술적으로 좁습니다. 이 영향을 줄이기 위해 상한이 없는 odds ratio도 함께 계산합니다.

$$
\mathrm{OR} = \frac{s_L / (1-s_L)}{s_E / (1-s_E)}
$$

## 7. 분야 간 차이

### 이질성 검정

$y_i = \log E_i$, $v_i$를 그 분산, $w_i = 1/v_i$라 하면 다음과 같습니다.

$$
Q = \sum_i w_i (y_i - \bar{y}_w)^2, \qquad
I^2 = \max\!\left(0, \frac{Q - \mathrm{df}}{Q}\right), \qquad
\tau^2 = \max\!\left(0, \frac{Q - \mathrm{df}}{\sum w_i - \sum w_i^2 / \sum w_i}\right)
$$

**해석.** 분야 간 진짜 차이가 없어도 표본 오차만으로 $Q$는 자유도 정도의 값을 가집니다. $I^2$는 관측된 흩어짐 중 표본 오차로 설명되지 않는 몫이고, $\tau^2$는 그 진짜 차이의 분산입니다(DerSimonian–Laird 추정). Random-effects 평균은 가중치를 $1/(v_i + \tau^2)$로 바꿔 계산합니다.

| 집합 | field 평균 E | Q (df 25) | I² | 해석 |
|---|---:|---:|---:|---|
| 다섯 성 | 2.98 (2.66–3.34) | 25.3 | 1% | 차이가 식별되지 않음 |
| 중국 상위 100, E 척도 | 3.23 (2.94–3.54) | 55.7 | 55% | 차이가 검출됨 |
| 중국 상위 100, OR 척도 | 중앙값 3.98 | 37.3 | 33% | 약해짐 (p=0.054) |
| 인도 상위 20 | 1.89 (1.50–2.39) | 24.1 | 0% | 식별되지 않음 |
| 한국 상위 20 | 1.18 (1.00–1.39) | 30.5 | 18% | 식별되지 않음 |

식별되지 않는다는 것은 차이가 없다는 뜻이 아니라, 셀당 600건으로는 구분할 수 없다는 뜻입니다.

### Empirical Bayes 수축

$$
\tilde{y}_i = \mu + B_i (y_i - \mu), \qquad B_i = \frac{\tau^2}{\tau^2 + v_i}
$$

**해석.** 분산이 큰 분야일수록 $B_i$가 작아져 평균 쪽으로 끌려옵니다. 표본 오차가 큰 극단값을 그대로 믿지 않겠다는 장치입니다. 다섯 성에서는 $\tau$가 0에 가까워 거의 모든 분야가 평균 부근으로 모입니다.

### 다중 비교

26개 field의 p값에 Benjamini–Hochberg 보정을 적용합니다. CS 세부 subfield는 Computer Science와 겹치므로 보정과 동질성 검정에서 제외합니다.

### 초기 비중과 E의 상관

중국 상위 100개에서 2000–04년 비중과 E의 Spearman 상관은 ρ=−0.80이지만, 이 값을 그대로 읽으면 안 됩니다. 초기 비중이 E의 분모이기 때문에, 초기 표본의 잡음만으로도 음의 상관이 생깁니다.

그래서 초기 표본을 초기하 분포로 둘로 나누어, 한쪽으로 초기 비중을 다른 쪽으로 E를 계산하는 split-half 검정을 2,000회 반복했습니다. 두 값이 잡음을 공유하지 않게 됩니다.

| 척도 | 원래 ρ | Split-half ρ (95% 구간) |
|---|---:|---:|
| E | −0.80 | −0.55 (−0.77 ~ −0.31) |
| Odds ratio | | −0.24 (−0.53 ~ 0.00) |

"초기 비중이 높은 분야일수록 덜 늘었다"는 패턴의 상당 부분은 잡음과 척도에서 비롯됩니다.

## 8. 구성 변화 null과 분해

### 두 집단 null

"집단 안의 성씨 비중은 그대로이고 집단 크기만 변했다면 E는 얼마일까?"를 계산합니다. $\pi$는 중국 소속 비중, $s_c$와 $s_o$는 중국 소속과 그 외에서의 성씨 비중입니다.

$$
E_{\text{null}} =
\frac{\pi_L s_c + (1-\pi_L) s_o}{\pi_E s_c + (1-\pi_E) s_o}
$$

**해석.** 전체 비중을 두 집단의 가중 평균으로 쓴 식입니다. $s_c$와 $s_o$는 pooled 표본에서 고정하므로 field 셀에 맞춰 적합한 값이 아닙니다. 다섯 성에서는 21/26개 field, 상위 100개에서는 15/26개 field가 CI 안에 들고 E/E_null 중앙값은 각각 1.02와 1.10입니다. 그러나 전체 적합도 $\sum_i z_i^2 \sim \chi^2_{26}$는 다섯 성 p=0.012, 상위 100개 p<0.001로 기각됩니다. 구성 변화는 평균적 크기와 부합할 뿐, field별 값을 정확히 재현하는 모형은 아닙니다.

### 세 집단 null

Lee, Han, Song처럼 한국과 중국에 모두 흔한 성씨가 있으므로, 인도·한국 분석은 해당 국가($c$), 중국, 그 외의 세 집단으로 나눕니다.

$$
E_{\text{null}} =
\frac{\sum_{g} \pi_{g,L}\, \bar{s}_g}{\sum_{g} \pi_{g,E}\, \bar{s}_g}
$$

$\bar{s}_g$는 집단 $g$ 안의 성씨 비중을 여섯 시점에 걸쳐 합산한 값입니다. CI는 시점별 다항 재표집 4,000회로 구합니다. 비 $E/E_{\text{null}}$이 1이면 구성 변화만으로 재현할 수 있다는 뜻입니다. 이는 수치상 부합한다는 뜻이지 구성 변화가 원인이라는 판단은 아닙니다.

### Shift-share 분해

소속 확인 제1저자 안의 비중 변화를 나눕니다. 윗줄은 두 시점의 평균입니다.

$$
\Delta s =
\sum_g \underbrace{\Delta\pi_g\, \overline{s_g}}_{\text{between}} +
\sum_g \underbrace{\overline{\pi_g}\, \Delta s_g}_{\text{within}}
$$

**해석.** between은 집단 크기가 변해서 생긴 몫이고, within은 집단 안에서 성씨 비중이 변해서 생긴 몫입니다. 한국 상위 20개의 증가분 0.80%p 가운데 0.51%p가 중국 소속에서 나옵니다. 중국에도 흔한 성씨가 목록에 들어 있기 때문이며, 그래서 집합을 상위 50개로 넓히면 E가 2.40까지 오릅니다. 한국 특이도가 높은 성씨만 남기면 E는 1.21(0.98–1.51)입니다.

## 9. 통계물리 분석

성씨를 "이름이라는 자원에 논문이 쌓이는 과정"으로 보고 분포를 살핍니다.

### 성씨 빈도 분포의 꼬리

성씨가 논문 $k$편에 나타날 확률의 꼬리를 이산 power law로 적합합니다.

$$
P(k) = \frac{k^{-\alpha}}{\zeta(\alpha, k_{\min})}, \qquad k \ge k_{\min}
$$

- $\alpha$: 꼬리 지수, 작을수록 아주 흔한 성씨가 많음
- $k_{\min}$: power law가 시작되는 지점, KS 거리를 최소화해 선택
- $\zeta(\alpha, k_{\min})$: 확률의 합이 1이 되게 하는 Hurwitz zeta 함수

Clauset et al. (2009)의 절차를 따라 적합도를 semi-parametric bootstrap으로 검정하고, Vuong 정규화 우도비로 lognormal, stretched exponential, exponential, cutoff가 있는 power law와 비교합니다. 가중치가 있는 표본에서는 빈도 분포가 왜곡되므로 rejection 단계로 등확률 부분표본을 만든 뒤 적합합니다.

**사전 판정 규칙.** 자료를 보기 전에 다음 규칙을 정했습니다.

- cutoff 우도비 검정이 $p < 0.1$이면 기각
- 그렇지 않고 탐지력이 80% 이상이면 부합
- 그렇지 않고 탐지력이 80% 미만이면 **판단 유보**

**결과.** 중국 밖 소속(n=20,641, $k_{\min}=5$에서 $\alpha \approx 2.61$)은 lognormal 탐지력 28%, 중국 소속(n=4,525)은 39%로, 두 집단 모두 판단 유보입니다. 이 표본 크기로는 power law와 lognormal을 구분할 수 없습니다. "성씨 분포는 power law다"라고 말할 수 없습니다.

### 집중도와 혼합 null

무작위로 고른 두 논문의 제1저자 성씨가 같을 확률을 $Y_2$라 합니다.

$$
Y_2 = \sum_i p_i^2, \qquad N_{\text{eff}} = \frac{1}{Y_2}
$$

**해석.** $Y_2$는 물리학의 inverse participation ratio입니다. $1/Y_2$는 "성씨가 모두 같은 빈도라면 몇 종류가 있는 셈인가"를 뜻하는 유효 성씨 수입니다. 표본에서는 같은 논문을 두 번 세지 않도록 불편추정량을 씁니다. Hill number $e^{H}$도 함께 계산하며, 관측되지 않은 희귀 성씨는 Chao–Shen 보정으로 다룹니다.

두 집단이 섞이면 $Y_2$는 다음처럼 예측됩니다.

$$
Y_2(\pi) = \pi^2 Y_c + (1-\pi)^2 Y_o + 2\pi(1-\pi) Y_{co}
$$

**해석.** 두 논문을 뽑을 때 둘 다 중국 소속일 확률 $\pi^2$, 둘 다 그 외일 확률 $(1-\pi)^2$, 하나씩일 확률 $2\pi(1-\pi)$에 각 경우의 일치 확률을 곱한 식입니다. $Y_c, Y_o, Y_{co}$를 고정하면 $\pi$ 하나로 $Y_2$의 변화가 예측됩니다. 표본 외 시점 검정에서 관측 변화의 89%를 재현했고 R²=0.98이며, 6개 시점 중 4개가 CI 안에 듭니다. Field×기간 130개 셀에서도 R²=0.91로 한 곡선 위에 모입니다. 표준오차는 복원추출이 만드는 가짜 일치를 피하기 위해 half-sample 방식으로 구합니다.

### 스케일링

다섯 성의 논문 수 $F$와 분야 규모 $N$의 관계를 봅니다.

$$
\log F_{ft} = \beta \log N_{ft} + c_f + \varepsilon_{ft}
$$

**해석.** $\beta = 1$이면 성씨 논문이 분야와 같은 속도로 늡니다. Field 고정효과를 뺀 시간 내 기울기는 $\beta = 2.00$(1.77–2.31)이고, 2020–25년 분야 간 기울기는 $1.12$입니다. 한 분야가 커지는 시기에 성씨 논문은 더 빨리 늘지만, 같은 시점에서 큰 분야가 작은 분야보다 비중이 크지는 않습니다. 시간 내 기울기는 중국 소속 비중의 상승과 겹치므로 메커니즘으로 해석하지 않습니다.

## 10. 데이터과학 분석

- **Leave-one-field-out 예측.** 분야의 $\Delta\mathrm{logit}\,\pi$로 다섯 성의 $\log E$를 설명하는 가중회귀를 한 분야씩 빼고 반복합니다. 교차검증 R²는 0.04로, 분야별 값을 예측할 힘이 거의 없습니다.
- **순열 검정.** 가중 상관 $r=0.40$은 20,000회 순열에서 $p=0.034$입니다. 관계의 방향은 있으나 예측력은 약합니다.
- **궤적 군집화.** Ward 군집으로 $k=3$, silhouette 0.39를 얻었지만, 공통 궤적 이항 null의 중앙값 0.40과 같은 수준입니다($p=0.51$). 분야가 뚜렷한 유형으로 나뉜다는 증거는 없습니다.

군집은 알고리즘이 언제나 만들어 내므로, null 없이 군집 자체를 결과로 삼지 않았습니다.

## 11. 측정 타당성 점검

성씨 집합을 "그 국가 소속 제1저자"의 대리지표로 쓸 수 있는지, 시점과 국가 사이에 비교할 수 있는지를 소속 기록으로 점검합니다.

### Precision과 recall

$$
\text{precision} = P(\text{소속} \mid \text{집합}), \qquad
\text{recall} = P(\text{집합} \mid \text{소속})
$$

**해석.** Precision은 집합에 속한 저자 중 실제로 그 국가 소속인 비율, recall은 그 국가 소속 저자 중 집합에 속한 비율입니다.

| 집합 | Precision 2000 | Precision 2025 | Recall 2000 | Recall 2025 |
|---|---:|---:|---:|---:|
| 중국 상위 100 | 29% | 88% | 80% | 90% |
| 인도 상위 20 | 43% | 67% | 16% | 19% |
| 한국 상위 20 | 48% | 57% | 61% | 65% |

Precision이 크게 변한다는 것은 같은 집합이 시점마다 다른 사람들을 가리킨다는 뜻입니다. 소속 비중이 약 12배 늘었는데 E가 4.3인 이유도 기초 시점의 분모에 중국 밖 저자가 많기 때문으로 해석됩니다.

### 구간별 E

| 집합 | 2000–2015 | 2015–2025 | 2000–2025 |
|---|---:|---:|---:|
| 중국 상위 100 | 2.35 (2.16–2.55) | 1.84 (1.75–1.94) | 4.33 (4.01–4.67) |
| 인도 상위 20 | 2.18 (1.62–2.92) | 1.22 (0.98–1.52) | 2.66 (2.00–3.53) |
| 한국 상위 20 | 1.76 (1.46–2.13) | 0.81 (0.68–0.96) | 1.43 (1.17–1.73) |

E는 구간끼리 곱해집니다. 그래서 단일 E는 경로를 숨깁니다.

### 경쟁 설명 점검

| 경쟁 설명 | 점검 | 결과 | 판단 |
|---|---|---|---|
| 소속 국가 구성의 변화 | 세 집단 null | E/E_null 한국 1.01, 인도 1.59 | 한국은 부합, 인도는 잔차가 남음 |
| Field 구성의 변화 | field 가중치 고정 | 중국 3.20→3.06, 인도 1.97→1.91, 한국 1.23→1.20 | 영향이 작음 |
| 성이 앞에 기록된 이름 | 첫 토큰이 집합에 속하면 추가 계수 | 중국 4.33→3.96, 인도 2.66→2.61, 한국 1.43→1.40 | 중국 E는 일부 과대 가능. 오탐이 섞인 하한이므로 4.0–4.3으로 읽음 |
| 소속 미기재 | 미기재 안의 비중 비교 | 미기재율 24%→10%, 2025년 중국 집합 비중은 기재 33%, 미기재 19% | 결측이 무작위가 아님 |
| 팀 규모 | 저자 수별 E | 중국 단독 2.79, 4명 이상 5.09 | 중국 집합은 대형 팀에서 더 크게 증가 |
| 성씨 목록 선택 편향 | 표본과 무관한 목록 | 호적 상위 5개 4.56, 2000–09년 기준 상위 20개 4.65 | 결론이 유지됨 |
| 연구자 수와 연구자당 논문 수 | 검정 불가 | 표본에 저자 ID 없음 | 미해결 |
| 색인 수록 범위의 변화 | 검정 불가 | Core sources의 국가별 편입 이력 미수집 | 미해결 |

호적 인구 상위 5개(王·李·张·刘·陈)는 2020년 호적 인구 기준 보도([더페이퍼](https://www.thepaper.cn/newsDetail_forward_11269566), [중국신문망](https://www.chinanews.com.cn/cul/2021/02-09/9409049.shtml))로 확인했습니다. 6위 이하는 공식 순위를 확인하지 못해 쓰지 않았습니다.

## 12. 해석할 때 주의할 점

- **성씨는 국적이나 민족이 아닙니다.** 이 저장소의 집합은 "해당 국가 소속 저자에게 흔한 성씨"라는 측정상의 정의입니다. 그래서 '중국계', '인도계', '한국계' 대신 소속 기준으로 표기합니다.
- **소속은 출신이 아닙니다.** 소속 국가는 논문에 적힌 제1저자의 기관 소재지이며, 이주나 출생지를 뜻하지 않습니다.
- **단위는 사람이 아닙니다.** 연구자 수가 늘었는지, 연구자당 제1저자 논문이 늘었는지 구분하지 못합니다. 동명이인 식별도 하지 않습니다.
- **제1저자만 봅니다.** 중간 저자나 교신저자로서의 참여는 포착되지 않습니다. 알파벳순 표기 분야에서는 성씨 첫 글자가 제1저자 확률에 영향을 줄 수 있습니다.
- **E는 인과 효과가 아닙니다.** 이 분석은 기술 통계입니다. 제도나 정책이 원인이라는 주장을 뒷받침하지 않습니다.
- **로마자 표기가 나뉩니다.** Lee·Yi·Rhee, Jung·Jeong·Chung은 별개의 문자열로 셉니다. 같은 표기의 다른 한자는 구분하지 못합니다.
- **포괄률이 다릅니다.** 인도 상위 20개는 인도 소속 저자의 21%만 포괄합니다. 인도 집합의 값은 인도 소속 연구자 전체의 추세가 아닙니다.
- **작은 수를 주의하세요.** 2000년의 국가 안 표본은 인도 132건, 한국 101건입니다. 인도 분석에서는 26개 field 중 24개의 2000–04년 hit가 10건 미만입니다. 성씨별 순위에는 의미를 두지 않습니다.
- **낙인을 주의하세요.** 이 값은 이름 문자열의 집계입니다. 개인을 분류하지 않으며, 특정 집단에 대한 주장으로 옮겨서는 안 됩니다.

## 13. 재현 방법

필요한 환경은 Python 3과 `numpy`, `pandas`, `scipy`입니다. 수집 스크립트는 OpenAlex 안내에 따라 연락용 메일을 환경 변수로 받습니다. 실제 메일 주소로 바꿔 실행하세요.

```bash
OPENALEX_MAILTO=you@example.org python scripts/surname_share_collect.py
OPENALEX_MAILTO=you@example.org python scripts/surname_share_collect.py --snapshots
OPENALEX_MAILTO=you@example.org python scripts/surname_share_collect.py --pooled
OPENALEX_MAILTO=you@example.org python scripts/surname_share_collect.py --fields
```

API 응답은 `data/cache/`에 저장되므로, 일일 사용량에 걸려 중단되면 다음 날 같은 명령을 다시 실행해 이어갈 수 있습니다. 수집 옵션은 한 번에 하나씩 실행합니다.

분석은 다음 순서로 실행합니다. 뒤 단계가 앞 단계의 산출물을 읽으므로 순서를 지켜야 합니다.

```bash
python scripts/surname_share_analyze.py
python scripts/surname_share_distribution.py
python scripts/surname_share_retest.py
python scripts/surname_share_fields.py
python scripts/surname_share_common.py
python scripts/surname_share_others.py
python scripts/surname_share_validity.py
```

`distribution`과 `retest`는 부트스트랩 때문에 오래 걸립니다. 동작만 확인할 때는 `--quick`을 붙이면 반복 수를 줄입니다. 이때 결과 JSON도 축소된 반복 수의 값으로 바뀌므로, 공개용 값은 `--quick` 없이 다시 실행해 만들어야 합니다.

페이지는 로컬 서버로 확인합니다.

```bash
python -m http.server 8000 --directory docs
```

**재현의 범위.** 원자료 `data/`는 저장소에 포함하지 않습니다. 난수 시드는 고정되어 있지만 OpenAlex는 계속 갱신되므로, 다시 수집하면 값이 조금 달라질 수 있습니다. 공개된 숫자는 2026-10-31에 수집한 표본 기준입니다.

## 14. 참고문헌

**방법**

- Clauset, A., Shalizi, C. R. & Newman, M. E. J. (2009). Power-law distributions in empirical data. *SIAM Review*, 51(4), 661–703. [doi:10.1137/070710111](https://doi.org/10.1137/070710111)
- DerSimonian, R. & Laird, N. (1986). Meta-analysis in clinical trials. *Controlled Clinical Trials*, 7(3), 177–188. [doi:10.1016/0197-2456(86)90046-2](https://doi.org/10.1016/0197-2456(86)90046-2)
- Benjamini, Y. & Hochberg, Y. (1995). Controlling the false discovery rate. *Journal of the Royal Statistical Society: Series B*, 57(1), 289–300. [doi:10.1111/j.2517-6161.1995.tb02031.x](https://doi.org/10.1111/j.2517-6161.1995.tb02031.x)
- Priem, J., Piwowar, H. & Orr, R. (2022). OpenAlex: A fully-open index of scholarly works, authors, venues, institutions, and concepts. [arXiv:2205.01833](https://arxiv.org/abs/2205.01833)
- Kim, L., Adolph, C., West, J. D. & Stovel, K. (2020). The influence of changing marginals on measures of inequality in scholarly citations. *Sociological Science*, 7, 314–341. [doi:10.15195/v7.a13](https://doi.org/10.15195/v7.a13)

**관련 연구**

- Freeman, R. B. & Huang, W. (2015). Collaborating with people like me: Ethnic coauthorship within the United States. *Journal of Labor Economics*, 33(S1), S289–S318. [doi:10.1086/678973](https://doi.org/10.1086/678973)
- Xie, Q. & Freeman, R. B. (2023). Creating and connecting US and China science: Chinese diaspora and returnee researchers. NBER Working Paper 31306. [doi:10.3386/w31306](https://doi.org/10.3386/w31306)
- Liu, W., Tang, L., Gu, M. & Hu, G. (2014). Feature report on China: a bibliometric analysis of China-related articles. *Scientometrics*, 102, 503–517. [doi:10.1007/s11192-014-1371-y](https://doi.org/10.1007/s11192-014-1371-y)
- Kerr, W. R. (2008). Ethnic scientific communities and international technology diffusion. *Review of Economics and Statistics*, 90(3), 518–537. [doi:10.1162/rest.90.3.518](https://doi.org/10.1162/rest.90.3.518)
- Harzing, A.-W. (2015). Health warning: might contain multiple personalities—the problem of homonyms in Thomson Reuters Essential Science Indicators. *Scientometrics*, 105, 2259–2270. [doi:10.1007/s11192-015-1699-y](https://doi.org/10.1007/s11192-015-1699-y)
- Kim, J. & Diesner, J. (2016). Distortive effects of initial-based name disambiguation on measurements of large-scale coauthorship networks. *Journal of the Association for Information Science and Technology*, 67(6), 1446–1461. [doi:10.1002/asi.23489](https://doi.org/10.1002/asi.23489)
- Kozlowski, D. et al. (2022). Avoiding bias when inferring race using name-based approaches. *PLOS ONE*, 17(3), e0264270. [doi:10.1371/journal.pone.0264270](https://doi.org/10.1371/journal.pone.0264270)
- Xie, Y., Zhang, C. & Lai, Q. (2014). China's rise as a major contributor to science and technology. *PNAS*, 111(26), 9437–9442. [doi:10.1073/pnas.1407709111](https://doi.org/10.1073/pnas.1407709111)
