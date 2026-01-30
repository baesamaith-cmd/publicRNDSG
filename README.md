# IGMS Search Dashboard 사용 매뉴얼

이 대시보드는 싱가포르 정부 과제(IGMS) 데이터를 검색하고 분석하는 도구입니다. **AI 의미 검색(Semantic Search)** 기능이 포함되어 있어, 단순히 키워드가 일치하지 않아도 문맥상 관련된 과제를 찾을 수 있습니다.

## 1. 실행 방법 (로컬)

보안 정책상 브라우저에서 `index.html` 파일을 직접 열면 AI 기능이 작동하지 않습니다. 아래 명령어로 로컬 서버를 실행해주세요.

1. **터미널 열기**
   프로젝트 폴더(`/Users/wonbaeson/Documents/IGMS`)에서 터미널을 엽니다.

2. **서버 실행 명령어 입력**
   ```bash
   python3 -m http.server 8080
   ```
   *(만약 `Address already in use` 에러가 나면 8080 대신 8081, 8082 등 다른 숫자로 변경하세요)*

3. **브라우저 접속**
   크롬, 엣지 등 최신 브라우저 주소창에 아래 주소를 입력합니다.
   *   [http://localhost:8080](http://localhost:8080)

4. **로그인**
   *   비밀번호: **`202601`**

---

## 2. AI 의미 검색 사용법

기본 키워드 검색은 단어가 정확히 일치해야 찾을 수 있지만(예: "Robot" 검색 시 "Robotics"만 검색됨), AI 검색은 의미를 이해합니다.

1. **AI 모드 켜기**
   검색창 우측의 **[AI 의미 검색]** 스위치를 켭니다.
   *   *최초 실행 시 약 23MB 크기의 AI 모델을 다운로드하느라 5~10초 정도 걸릴 수 있습니다.*

2. **검색어 입력 (영어 추천)**
   현재 적용된 모델은 영어에 최적화되어 있습니다. 개념이나 문장 형태로 검색해보세요.

   *   **"Heart disease"** 검색 
       *   → 결과: "Cardiovascular", "Myocardial infarction" 등이 포함된 과제 검색됨
   *   **"Elderly people"** 검색
       *   → 결과: "Geriatric", "Aging population" 등이 포함된 과제 검색됨

3. **필터 조합**
   AI 검색 결과에 **수행기관(Institution)**이나 **연도(Year)** 필터를 추가로 적용하여 범위를 좁힐 수 있습니다.

---

## 3. 데이터 업데이트

새로운 엑셀 데이터가 생기면 다음 과정을 통해 AI "두뇌"를 업데이트해야 합니다.

1. `dashboard/data/projects.json` 파일을 최신 데이터로 업데이트합니다.
2. 터미널에서 임베딩 생성 스크립트를 실행합니다.
   ```bash
   # 가상환경 활성화 (필요시)
   source venv/bin/activate
   
   # 생성 스크립트 실행
   python generate_embeddings.py
   ```
3. 생성 완료 후 웹페이지를 새로고침하면 반영됩니다.
