# PRD: IGMS Awarded Projects 검색 대시보드

## 1. 개요

### 1.1 목적
Singapore Research Grant (IGMS) Awarded Projects 데이터를 검색하고 탐색할 수 있는 대시보드 웹 애플리케이션 개발

### 1.2 데이터 소스
- `awarded_projects_FINAL.xlsx` (5,772개 프로젝트)
- 컬럼: Project ID, Project Title, Status, PI Name, Host Institution, Start Date, Duration, Abstract, Keywords, Detail URL

### 1.3 기술 스택
- **정적 웹앱** (HTML/CSS/JavaScript)
- 데이터: JSON 파일로 변환하여 로드
- 검색: 클라이언트 사이드 필터링
- 호스팅: GitHub Pages

---

## 2. 핵심 기능

### 2.1 검색 기능

#### 2.1.1 기관별 검색 (Host Institution)
- Choices.js 라이브러리로 복수 선택 드롭다운 구현
- 검색 가능한 드롭다운
- **복수 기관 동시 선택 가능**

#### 2.1.2 PI별 검색 (PI Name)
- Choices.js 라이브러리로 복수 선택 드롭다운 구현
- **기관 선택 시 해당 기관의 PI만 필터링되어 표시**
- **복수 PI 동시 선택 가능**

#### 2.1.3 키워드 검색
- 사용자 입력 키워드로 검색
- 검색 대상: Title, Abstract, Keywords 컬럼
- **검색 방식: AND (여러 키워드 입력 시 모두 포함된 결과만 표시)**
- **키워드 구분: 공백 또는 콤마**
- 대소문자 구분 없음
- 디바운싱 적용 (300ms)

### 2.2 필터 기능

#### 2.2.1 상태 필터 (Status)
- 체크박스로 상태 선택
- In progress, Completed 등
- **체크박스 동적 생성 (데이터 기반)**

#### 2.2.2 날짜 필터 (Start Date)
- Flatpickr 라이브러리로 날짜 선택
- 시작일 ~ 종료일 범위 선택

#### 2.2.3 기간 필터 (Duration)
- 숫자 입력으로 최소/최대 개월 수 지정

### 2.3 결과 표시

#### 2.3.1 목록 뷰
- 검색 결과 테이블 형태로 표시
- **페이지당 20개 항목**
- **컬럼별 정렬 기능 (오름차순/내림차순 토글)**
- 검색 결과 수 표시
- **기본 정렬: Start Date 최신순**

#### 2.3.2 상세 뷰
- 프로젝트 클릭 시 모달로 상세 정보 표시
- 표시 정보: 전체 컬럼
- 원본 사이트 링크 (Detail URL) 제공
- **ESC 키 또는 모달 외부 클릭으로 닫기**

#### 2.3.3 결과 내보내기
- **CSV 다운로드 기능**
- **Excel 다운로드 기능 (SheetJS/xlsx 라이브러리)**
- 현재 필터링된 결과만 내보내기
- **파일명: igms_projects_YYYYMMDD_HHMMSS.csv/xlsx**

### 2.4 시각화

#### 2.4.1 차트 공통 기능
- **Chart.js 라이브러리 사용**
- **차트 클릭 시 필터 적용 (AND 조건)**
  - 데이터 영역(막대/점/파이 조각) 클릭 → 해당 값으로 필터 적용
  - 빈 공간/제목 클릭 → 확대 모달 표시
- **필터 적용 시 상단 필터 입력창에도 반영**
- **Y축 정수만 표시**

#### 2.4.2 기관/PI별 막대 차트
- **기관 선택 없음: 상위 10개 기관별 과제 수**
- **기관 선택됨: 해당 기관의 상위 10명 PI별 과제 수**
- **긴 이름은 약어로 표시 (예: National University of Singapore → NUS)**
- 차트 제목 동적 변경 ("기관별 과제 수" ↔ "PI별 과제 수")

#### 2.4.3 연도별 추이 라인 차트
- 연도별 프로젝트 수 추이
- **클릭 시 해당 연도로 날짜 필터 적용 (1월 1일 ~ 12월 31일)**

#### 2.4.4 상태 분포 파이 차트 (도넛형)
- 상태별 프로젝트 분포
- **클릭 시 해당 상태만 체크박스 선택**

#### 2.4.5 키워드 워드클라우드
- **D3.js + d3-cloud 라이브러리 사용**
- 필터링된 결과의 상위 50개 키워드 표시
- **키워드 클릭 시 검색창에 해당 키워드 입력 후 검색**
- **빈 공간/제목 클릭 시 확대 모달 표시 (80개 키워드)**
- **제외 단어: 'data access contact:', 'not applicable', 'na', 'n/a', 'nil', 'none'**

#### 2.4.6 차트 모달
- 확대된 차트 표시
- **모달 내에서도 클릭 필터 기능 동작**
- ESC 키 또는 모달 외부 클릭으로 닫기

### 2.5 비밀번호 보호

#### 2.5.1 로그인 화면
- **간단한 비밀번호 인증 (클라이언트 사이드)**
- sessionStorage 사용하여 세션 유지
- 비밀번호 틀릴 시 에러 메시지 표시

#### 2.5.2 구현 방식
```javascript
// auth.js - 별도 파일로 분리
const CORRECT_PASSWORD = 'your_password';
const SESSION_KEY = 'igms_authenticated';

// sessionStorage로 인증 상태 확인
if (sessionStorage.getItem(SESSION_KEY) === 'true') {
    showDashboard();
}
```

---

## 3. UI/UX 설계

### 3.1 레이아웃

```
+----------------------------------------------------------+
|  [로그인 화면] - 비밀번호 입력                              |
+----------------------------------------------------------+
                          ↓ 인증 성공
+----------------------------------------------------------+
|  싱가포르 정부과제 검색 대시보드(2006-2025)                  |
|  Singapore Research Grant - 5,772개 과제                  |
|  과제출처: NRF, MOH, MOE, A*STAR                          |
+----------------------------------------------------------+
|  [검색 영역]                                                |
|  +------------------+  +------------------+                |
|  | 수행기관 (복수)   |  | 과제책임자 (복수) |                |
|  +------------------+  +------------------+                |
|  +--------------------------------------------------+     |
|  | 키워드 검색 (복수 키워드는 AND 조건)               |     |
|  +--------------------------------------------------+     |
|  [상태 필터] ☑ In progress ☑ Completed                    |
|  [시작일 범위] 시작 ~ 종료                                 |
|  [수행기간] 최소 ~ 최대 개월                               |
|  [필터 초기화] [CSV 다운로드] [Excel 다운로드]              |
+----------------------------------------------------------+
|  검색 결과: 1,234개 과제                                   |
+----------------------------------------------------------+
|  [시각화 영역 - 4개 차트 그리드]                            |
|  +----------------+  +----------------+                    |
|  | Top 연구 키워드 |  | 기관별 과제 수  |                    |
|  | (워드클라우드)  |  | (막대 차트)    |                    |
|  +----------------+  +----------------+                    |
|  +----------------+  +----------------+                    |
|  | 연도별 과제 추이 |  | 상태별 분포    |                    |
|  | (라인 차트)     |  | (파이 차트)    |                    |
|  +----------------+  +----------------+                    |
+----------------------------------------------------------+
|  [결과 테이블] - 정렬 가능                                  |
|  +------+----------+--------+------+------+------+        |
|  | 과제번호 | 과제명 | 상태 | 과제책임자 | 수행기관 | 시작일 |
|  +------+----------+--------+------+------+------+        |
|  | ...  | ...      | ...    | ...  | ...  | ...  |        |
|  +------+----------+--------+------+------+------+        |
|  [페이지네이션: < 1 2 3 4 5 ... >]                         |
+----------------------------------------------------------+
```

### 3.2 사용 라이브러리

| 기능 | 라이브러리 | CDN |
|-----|-----------|-----|
| 복수 선택 드롭다운 | Choices.js 10.2.0 | jsdelivr |
| 날짜 선택 | Flatpickr | jsdelivr |
| 차트 | Chart.js | jsdelivr |
| 워드클라우드 | D3.js 7 + d3-cloud 1.2.5 | jsdelivr |
| Excel 내보내기 | SheetJS (xlsx) 0.18.5 | jsdelivr |
| 모달 | 순수 CSS/JS | - |

### 3.3 CSS 스타일 가이드

#### 3.3.1 색상
```css
:root {
    --primary-color: #2563eb;      /* 파란색 - 주 색상 */
    --primary-hover: #1d4ed8;
    --secondary-color: #64748b;    /* 회색 - 보조 색상 */
    --success-color: #22c55e;      /* 녹색 */
    --warning-color: #f59e0b;      /* 주황색 */
    --danger-color: #ef4444;       /* 빨간색 */
    --text-primary: #1e293b;
    --text-secondary: #64748b;
    --bg-primary: #ffffff;
    --bg-secondary: #f8fafc;
    --border-color: #e2e8f0;
}
```

#### 3.3.2 반응형 브레이크포인트
```css
@media (max-width: 768px) { /* 태블릿/모바일 */ }
@media (max-width: 480px) { /* 작은 모바일 */ }
```

---

## 4. 기술 구현

### 4.1 최종 파일 구조

```
/IGMS/
├── index.html              # 루트 리다이렉트 (GitHub Pages용)
├── PRD_search_dashboard.md # 이 문서
├── awarded_projects_FINAL.xlsx
└── dashboard/
    ├── index.html          # 메인 HTML
    ├── css/
    │   └── style.css       # 전체 스타일
    ├── js/
    │   ├── auth.js         # 비밀번호 인증 로직
    │   └── app.js          # 메인 앱 로직 (검색, 필터, 차트, 내보내기 통합)
    └── data/
        └── projects.json   # 변환된 JSON 데이터
```

### 4.2 데이터 변환 (Excel → JSON)

#### 4.2.1 JSON 구조
```json
[
  {
    "id": "프로젝트 ID",
    "title": "과제명",
    "status": "상태",
    "pi": "책임자명",
    "inst": "수행기관",
    "date": "시작일 (YYYY-MM-DD)",
    "dur": 수행기간(개월),
    "abs": "초록",
    "kw": "키워드",
    "url": "상세 URL"
  }
]
```

#### 4.2.2 변환 스크립트 (Python)
```python
import pandas as pd
import json

df = pd.read_excel('awarded_projects_FINAL.xlsx')
df.columns = ['id', 'title', 'status', 'pi', 'inst', 'date', 'dur', 'abs', 'kw', 'url']
df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d')
df.to_json('projects.json', orient='records', force_ascii=False, indent=2)
```

### 4.3 핵심 JavaScript 함수

#### 4.3.1 데이터 로드
```javascript
async function loadData() {
    const response = await fetch('data/projects.json');
    allProjects = await response.json();
    filteredProjects = [...allProjects];
    initializeUI();
    applyFilters();
}
```

#### 4.3.2 필터 적용 (AND 조건)
```javascript
function applyFilters() {
    filteredProjects = allProjects.filter(project => {
        // 기관 필터
        if (selectedInstitutions.length > 0 &&
            !selectedInstitutions.includes(project.inst)) return false;

        // PI 필터
        if (selectedPIs.length > 0 &&
            !selectedPIs.includes(project.pi)) return false;

        // 키워드 필터 (AND 조건)
        if (keywords.length > 0) {
            const searchText = `${project.title} ${project.abs} ${project.kw}`.toLowerCase();
            if (!keywords.every(kw => searchText.includes(kw.toLowerCase()))) {
                return false;
            }
        }

        // 상태 필터
        // 날짜 필터
        // 기간 필터
        return true;
    });

    updateResults();
    updateCharts();
}
```

#### 4.3.3 차트 클릭 필터 함수
```javascript
// 막대 차트 클릭 (기관 또는 PI)
function filterByBarChart(labelData) {
    if (labelData.type === 'inst') {
        institutionSelect.setChoiceByValue(labelData.value);
        updatePIOptions();
    } else if (labelData.type === 'pi') {
        piSelect.setChoiceByValue(labelData.value);
    }
    applyFilters();
}

// 연도 클릭 (라인 차트)
function filterByYear(year) {
    dateFromFp.setDate(`${year}-01-01`);
    dateToFp.setDate(`${year}-12-31`);
    applyFilters();
}

// 상태 클릭 (파이 차트)
function filterByStatus(status) {
    document.querySelectorAll('#statusFilters input').forEach(cb => {
        cb.checked = (cb.value === status);
    });
    applyFilters();
}
```

#### 4.3.4 워드클라우드 생성
```javascript
function updateWordCloud() {
    const kwCount = {};
    filteredProjects.forEach(p => {
        const keywords = p.kw.replace(/;/g, ',').split(',').map(k => k.trim().toLowerCase());
        keywords.forEach(k => {
            if (k && k.length > 2 && !excludeWords.includes(k)) {
                kwCount[k] = (kwCount[k] || 0) + 1;
            }
        });
    });

    const words = Object.entries(kwCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([text, count]) => ({
            text, count,
            size: 10 + (normalizedCount * 25)
        }));

    d3.layout.cloud()
        .words(words)
        .on('end', draw)
        .start();
}
```

### 4.4 성능 최적화

- **디바운싱**: 입력 이벤트에 300ms 디바운싱 적용
- **페이지네이션**: 한 번에 20개만 DOM에 렌더링
- **차트 업데이트**: 기존 차트 인스턴스 재사용 (.update())

---

## 5. GitHub Pages 배포

### 5.1 배포 순서

1. GitHub 저장소 생성
2. 코드 푸시
3. Settings → Pages → Source: main branch
4. 배포 완료 (2-3분 소요)

### 5.2 폴더 구조와 URL

- **루트에 리다이렉트 index.html 필요** (dashboard 폴더가 하위에 있는 경우)
```html
<!-- /index.html -->
<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="refresh" content="0; url=dashboard/">
</head>
<body>
    <p>Redirecting to <a href="dashboard/">dashboard</a>...</p>
</body>
</html>
```

- 접속 URL: `https://[사용자명].github.io/[저장소명]/`
- 자동으로 `/dashboard/`로 리다이렉트

### 5.3 404 에러 해결

| 문제 | 해결 |
|-----|-----|
| 루트에 index.html 없음 | 리다이렉트 index.html 생성 |
| 파일 경로 오류 | 상대 경로 확인 (css/, js/, data/) |
| 캐시 문제 | 강력 새로고침 (Ctrl+Shift+R) |

---

## 6. 개발 완료 체크리스트

### Phase 1: MVP ✅
- [x] 데이터 JSON 변환
- [x] 기본 UI 레이아웃
- [x] 기관 복수 선택 검색
- [x] PI 복수 선택 검색 (기관 연동)
- [x] 키워드 AND 검색
- [x] 결과 테이블 표시
- [x] 페이지네이션
- [x] 상세 모달

### Phase 2: 필터 & 내보내기 ✅
- [x] 상태 필터 (체크박스)
- [x] 날짜 필터 (Flatpickr)
- [x] 기간 필터 (숫자 입력)
- [x] CSV 내보내기
- [x] Excel 내보내기

### Phase 3: 시각화 ✅
- [x] 기관/PI별 막대 차트
- [x] 연도별 추이 라인 차트
- [x] 상태 분포 파이 차트
- [x] 키워드 워드클라우드
- [x] 차트 클릭 → 필터 기능
- [x] 차트 확대 모달

### Phase 4: 보안 & 배포 ✅
- [x] 비밀번호 보호 (sessionStorage)
- [x] GitHub Pages 배포
- [x] 루트 리다이렉트 설정

---

## 7. 확정 사항

| 항목 | 결정 |
|-----|-----|
| 시각화 위치 | 검색 결과 상단에 표시 |
| 기본 표시 | 페이지 첫 로드 시 전체 데이터 표시 |
| 정렬 기본값 | Start Date 최신순 |
| 페이지당 항목 수 | 20개 |
| 차트 클릭 동작 | 데이터 클릭=필터, 빈공간/제목 클릭=모달 |
| 필터 조건 | AND (차트 클릭 시 기존 필터에 추가) |
| 인증 방식 | 클라이언트 사이드 비밀번호 (sessionStorage) |
| 호스팅 | GitHub Pages |
| 추가 기능 | 불필요 (즐겨찾기, 검색 기록 등 제외) |

---

## 8. 재사용 가이드

### 8.1 새 프로젝트에 적용하기

1. **데이터 준비**
   - Excel 파일을 JSON으로 변환
   - 컬럼명을 짧게 변경 (id, title, status 등)

2. **코드 수정**
   - `data/projects.json` 교체
   - `index.html` 제목/설명 수정
   - `auth.js` 비밀번호 변경
   - `app.js` 컬럼 매핑 수정 (columnNames 객체)

3. **배포**
   - GitHub 저장소 생성 및 푸시
   - Settings → Pages 활성화

### 8.2 주의사항

- **JSON 파일 크기**: 5MB 이하 권장
- **비밀번호 보안**: 클라이언트 사이드이므로 민감한 데이터에는 부적합
- **브라우저 지원**: 최신 브라우저 (ES6+ 필요)
