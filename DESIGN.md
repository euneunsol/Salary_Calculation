---
name: 오마모리 근무·급여 관리
description: 다도·와비사비 세계 위에 승인을 "도장을 찍는 행위"로 그리는 오마모리(OMAMORI TEA HOUSE) 매장 운영 도구
colors:
  paper: "#f4efe3"
  paper-light: "#fbf8f1"
  shell: "#eee6d4"
  ink: "#2a2724"
  ink-soft: "#5c5548"
  hairline: "#ddd3bd"
  brand-50: "#e9f0e9"
  brand-100: "#cfe0d1"
  brand-500: "#4b7857"
  brand-600: "#3f6b4a"
  brand-700: "#335a3d"
  brand-900: "#22301f"
  stamp: "#b7472a"
  stamp-ink: "#8f3520"
  stamp-tint: "#f7e3dc"
  celadon: "#6b8a95"
  celadon-tint: "#e6edee"
  celadon-text: "#3d525c"
  ochre: "#a3742f"
  ochre-tint: "#f2e6d3"
  ochre-text: "#7a5320"
  rust: "#8b3a3a"
  rust-tint: "#f3e1de"
  rust-text: "#6e2e2e"
typography:
  wordmark:
    fontFamily: "Shippori Mincho, Pretendard, serif"
    fontWeight: 700
  body:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Segoe UI, Malgun Gothic, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.brand-600}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.brand-700}"
  button-danger:
    backgroundColor: "{colors.rust}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
---

# Design System: 오마모리 근무·급여 관리

## Overview

**Creative North Star: "한코 결재 (Hanko Seal)"**

오마모리(OMAMORI TEA HOUSE)는 대구·경주 지역에 매장을 계속 늘려가는 카페·티하우스 체인이다. 이 앱은 그 매장들의 근무·급여를 관리하는 실사용 업무 도구이며, 디자인의 출발점은 일본 다도·와비사비의 절제된 세계에 "결재 도장을 찍는" 행위를 얹는 것이다. 근무기록을 승인하는 행위는 실제로 서류에 도장(印)을 찍는 감각으로 표현되고, 나머지 화면은 무명천·화지 톤의 차분한 배경 위에서 최대한 조용히 물러난다.

이 시스템은 브랜드를 위해 업무 흐름을 희생하지 않는다. Operate(업무 수행) 모드의 규율 — 절제된 색, 하나의 서체 패밀리, 익숙한 폼 컨트롤, 조밀한 데이터 레이아웃 — 이 항상 우선하고, 오마모리다움은 로고 워드마크·브랜드 그린 액센트·승인 스탬프라는 세 개의 정확한 지점에만 집중된다.

이전 세션에서 임시로 적용됐던 인디고/보라 그라디언트 SaaS 대시보드 톤은 전면 폐기됐다 — 그 화려한 블러 블롭과 보라색 계열은 오마모리와 무관한 범용 SaaS 클리셰였고, 이번 방향이 명시적으로 거부하는 대상이다.

**Key Characteristics:**
- 무명천·화지 톤의 따뜻한 베이지 배경, 순백 없음
- 오마모리 로고에서 채취한 그린 하나만 브랜드 액센트로 사용
- "승인"은 색이 아니라 붉은 원형 한코 스탬프로 표현되는 유일한 상태
- 그림자는 얕고 부드럽게, 장식적 블러·글로우 없음
- 아이콘은 전부 선으로 그린 SVG, 이모지·유니코드 기호 금지

## Colors

무명천 위에 그린 하나, 청자·황토·주인(朱印) 세 개의 보조 색이 상태를 나눠 맡는 절제된 팔레트.

### Primary
- **오마모리 그린** (`brand-600` #3f6b4a): 주요 버튼, 내비게이션 활성 상태, 링크. `brand-700` #335a3d은 확정·성공 액션(급여 확정 등)에, `brand-900` #22301f는 대시보드 히어로 패널의 짙은 배경에 쓴다.

### Secondary
- **주인(朱印) 다홍** (`stamp` #b7472a): 오직 한코 결재 스탬프 컴포넌트 전용. 다른 어떤 버튼·배지에도 이 색을 재사용하지 않는다 — 재사용하는 순간 "승인 = 도장"이라는 유일한 의미가 희석된다.

### Tertiary
- **청자 회청** (`celadon` #6b8a95): 제출됨/정보성 상태(SUBMITTED, CALCULATED). **황토** (`ochre` #a3742f): 대기·수정요청 상태. 둘 다 연한 tint 배경(`celadon-tint`/`ochre-tint`) 위에 짙은 text 색을 얹는 뱃지 패턴으로만 쓴다.

### Neutral
- **무명천 아이보리** (`paper` #f4efe3): 카드·모달 배경.
- **옅은 화지** (`paper-light` #fbf8f1): 입력 필드 배경 — 카드보다 한 톤 밝아 폼 컨트롤의 경계가 보인다.
- **말린 짚 베이지** (`shell` #eee6d4): 앱 전체 배경, 테이블 헤더, 보조 패널.
- **먹색** (`ink` #2a2724): 본문 텍스트. **옅은 먹색** (`ink-soft` #5c5548): 보조 텍스트, 대비 6.4:1로 WCAG AA 통과.
- **마른 짚 경계선** (`hairline` #ddd3bd): 모든 border, 장식용 divider.
- **탁한 벽돌빛** (`rust` #8b3a3a): 반려·삭제 등 파괴적 액션 전용. 주인 다홍(`stamp`)과 색상값이 명확히 달라 "승인"과 "위험"이 절대 헷갈리지 않는다.

### Named Rules
**The One Stamp Rule.** 주인 다홍(`stamp` 계열)은 한코 결재 컴포넌트 밖에서 절대 재사용하지 않는다. 버튼도, 뱃지도, 강조 텍스트도 안 된다. 이 색이 화면에 보이면 "승인이 방금 일어났다"는 뜻이어야 한다.

## Typography

**Body Font:** Pretendard (시스템 산세리프 폴백)
**Wordmark Font:** Shippori Mincho (OMAMORI 로고타이프 전용)

**Character:** 업무 화면 전체는 Pretendard 하나로 통일한다 — Operate 규율상 데이터·라벨·버튼에 디스플레이 서체를 섞지 않는다. Shippori Mincho(일본 민쵸 붓글씨 계열 세리프)는 오직 "OMAMORI" 로고타이프 한 곳에만 쓰고 UI 라벨·헤딩에는 절대 확장하지 않는다.

### Hierarchy
- **Title** (700, `text-xl`~`text-2xl`, tracking-tight): 페이지 최상단 h1.
- **Section** (600, `text-base`): 카드/섹션 h2.
- **Body** (400~500, `text-sm`): 본문, 테이블 셀.
- **Muted** (400, `text-sm`, `ink-soft`): 보조 설명, 캡션.
- **Meta** (500, `text-xs`): 라벨, 타임스탬프.

숫자(금액·시간)는 `tabular-nums`로 고정해 표에서 자릿수가 흔들리지 않는다.

### Named Rules
**The Wordmark-Only Rule.** Shippori Mincho는 로고타이프 밖에서 등장하지 않는다. "로그인" 같은 페이지 제목조차 Pretendard bold로 남긴다 — 그 서체는 한글 글리프도 없다.

## Layout

Operate 밀도를 따른다: 사이드바(데스크톱 고정 264px) + 콘텐츠 `max-w-7xl`, 모바일은 상단 스티키 헤더 + 가로 스크롤 탭바로 접힌다. 캘린더처럼 좁은 화면에서 깨지기 쉬운 그리드는 `overflow-x-auto` 안에 `min-w` 래퍼를 둬 가로 스크롤로 안전하게 처리하고, 그리드 자체는 항상 정렬된 표 형태를 유지한다(스캔 가능성이 장식보다 우선). 카드 사이 간격은 4의 배수 스케일(gap-4, gap-5)로 통일.

## Elevation & Depth

이 시스템은 거의 평평하다. 카드는 `shadow-sm` 정도의 얕고 부드러운 그림자만 가지며, hover 시 `shadow-lg`로 살짝만 깊어진다. 컬러 글로우·블러 블롭 같은 장식적 깊이는 전혀 쓰지 않는다 — 유일한 예외는 대시보드 히어로 패널의 `paper-grain` 화지 질감(SVG 노이즈, opacity 0.5, multiply blend)으로, 이것은 그림자가 아니라 재질 표현이다.

### Named Rules
**The Flat Paper Rule.** 표면은 기본적으로 평평하다. 그림자는 카드가 배경 위에 "놓여 있다"는 최소한의 신호일 뿐, 강조 수단으로 쓰지 않는다.

## Shapes

카드·모달은 `rounded-2xl`(16px), 버튼·인풋·작은 배지는 `rounded-lg`(8px), 원형 요소(아바타, 요일 토글, 한코 스탬프)는 완전한 원. 보더는 항상 1px `hairline` 색.

## Components

### Buttons
- **Shape:** `rounded-lg` (8px), 최소 높이 44px(md)/36px(sm) — 터치 타겟 확보.
- **Primary:** `bg-brand-600` + 흰 텍스트, hover `bg-brand-700`.
- **Success:** `bg-brand-700` + 흰 텍스트 — Primary보다 한 톤 짙어, "확정/최종" 액션임을 같은 그린 계열 안에서 구분한다.
- **Danger / Danger Outline:** 솔리드는 `bg-rust`, 아웃라인은 `rust-tint` 배경 + `rust-text`.
- **Outline / Ghost:** `paper-light` 배경 또는 투명, `hairline` 보더.
- **Focus:** 모든 variant가 `focus-visible:ring-2 ring-brand-500`(또는 danger는 `ring-rust`)를 갖는다 — outline 제거 후 반드시 대체 링을 그린다.

### Badges (상태 뱃지)
- **Style:** 완전 원형 pill, tint 배경 + 짙은 text 색 조합(절대 solid 배경 + white 텍스트 아님, 대비 확보).
- **State→Tone 매핑:** neutral=shell/ink-soft, info=celadon, success=brand-50/brand-700, warning=ochre, danger=rust, dark=ink/paper(지급 완료 등 최종 상태).

### Cards / Containers
- **Corner Style:** `rounded-2xl`.
- **Background:** `paper`, 보더 `hairline`, 그림자 `shadow-sm`.
- **Internal Padding:** `p-5` 기본.

### Inputs / Fields
- **Style:** `paper-light` 배경, `hairline` 보더, `rounded-lg`.
- **Focus:** 보더가 `brand-500`로 바뀌며 동시에 `ring-2 ring-brand-500` — 색맹 사용자를 위해 보더+링 이중 신호.
- **Disabled:** `shell` 배경 + `ink-soft` 텍스트.

### Navigation
- 사이드바 항목: 비활성은 `ink-soft`, 활성은 `bg-brand-600` 필 배경 + 흰 텍스트. 모바일은 동일 스타일의 가로 스크롤 탭으로 접힌다.

### Hanko Stamp (signature component)
`components/ui/Hanko.tsx`. 근무기록 승인이라는 이 제품의 핵심 행위를 위한 유일한 브랜드 모티프 — SVG `feTurbulence`+`feDisplacementMap` 필터로 손도장처럼 살짝 삐뚤어진 원형 테두리를 그리고, 그 위에 `stamp` 색 텍스트(기본 "승인")를 얹는다. 필터 정의(`HankoFilterDefs`)는 앱 루트(`AppLayout`)에서 단 한 번만 마운트해 여러 스탬프 인스턴스가 같은 필터를 공유한다. 승인 대기 상세 카드, 대시보드 히어로 워터마크(대형, 저투명도)에 쓰이며 캘린더의 작은 상태 칩에는 쓰지 않는다 — 그 밀도에서는 단순 색 배지가 더 정직하다.

## Do's and Don'ts

### Do:
- **Do** 승인 관련 시각적 강조가 필요하면 `stamp`/한코 컴포넌트로 표현한다.
- **Do** 모든 아이콘을 `components/ui/Icon.tsx`의 선 굵기 1.8, `viewBox 24` SVG 세트에서 가져온다.
- **Do** 새 색이 필요하면 먼저 `index.css`의 `@theme` 토큰에 추가하고, 페이지에서 임의 hex를 직접 쓰지 않는다.
- **Do** 금액·시간처럼 자릿수가 바뀌는 숫자에는 `tabular-nums`를 적용한다.

### Don't:
- **Don't** `stamp`(주인 다홍)을 한코 스탬프 컴포넌트 밖에서 재사용하지 않는다.
- **Don't** 이모지나 유니코드 화살표/기호(→ ‹ › ▦ 등)를 아이콘 대신 쓰지 않는다.
- **Don't** Shippori Mincho를 로고타이프 밖(본문, 버튼, 페이지 제목)에 쓰지 않는다.
- **Don't** 헤딩 위에 eyebrow/kicker 라벨("Business overview" 같은 영문 소문자 태그)을 달지 않는다 — 헤딩이 스스로 말하게 한다.
- **Don't** 그라디언트 텍스트, 장식용 블러 블롭, 컬러 글로우를 쓰지 않는다 — 이 시스템은 평평하다.
