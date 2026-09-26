# 책읽는 삶의 재미

갤럭시탭에 설치해 쓰는 독서 관리 웹앱(PWA)입니다. 빌드 도구 없이 HTML/CSS/JS만으로 만들고,
GitHub Pages(`https://3go1park.github.io/my-first-web-site/books/`)로 배포합니다.

## 폴더 구조

```
books/
├── index.html            앱의 유일한 화면 틀 (상단 막대 + 화면 자리 + 스크립트 목록)
├── css/app.css           모든 스타일 (색·크기 값 → 기본 → 공통 부품 → 화면별 → 좁은 화면)
├── js/
│   ├── core/             화면이 공통으로 쓰는 부분
│   │   ├── util.js       날짜, 글자 처리, CSV 읽기 같은 작은 도구
│   │   ├── store.js      데이터 저장소 (책·읽기 기록·일지·백업). localStorage는 여기서만 만진다
│   │   ├── insights.js   통계 계산 (홈과 통계 화면이 함께 씀)
│   │   ├── ui.js         토스트 알림, 상태 표시, 진행 막대, 아이콘
│   │   ├── ocr.js        책 사진 글자 인식 (Tesseract.js 한국어+영어, 처음 쓸 때 jsdelivr에서 약 8MB)
│   │   ├── scan.js       책 스캔 창 (사진 찍기/고르기 → 읽을 부분 고르기 → 글자 읽기 → 고쳐서 넣기)
│   │   └── router.js     주소(#/books 등)에 맞는 화면을 그림
│   ├── views/            화면 하나당 파일 하나
│   │   ├── home.js       #/                    홈 (지금 읽는 책, 메뉴)
│   │   ├── books.js      #/books, #/book/:id   책 목록(검색·필터), 책 상세
│   │   ├── book-form.js  #/books/new, #/book/:id/edit   책 등록·수정·삭제
│   │   ├── upload.js     #/books/upload        CSV 업로드 (합치기·바꾸기)
│   │   ├── reading.js    #/reading, #/book/:id/reading  읽기 현황, 읽기 기록(별점·감상)
│   │   ├── journal.js    #/journal             독서 일지 (쪽수, 자동 시작·완독 제안)
│   │   ├── stats.js      #/stats               통계
│   │   ├── backup.js     #/backup              백업·복원
│   │   ├── install.js    #/install             홈 화면 아이콘 설치·다시 등록
│   │   └── move.js       #/book/:id/move       잘못 적은 읽기 기록·일지를 다른 책으로 옮기기
│   └── app.js            앱 시작, 서비스 워커 등록
├── sw.js                 오프라인·업데이트 처리 (번호와 파일 목록은 자동 생성)
├── manifest.webmanifest  홈 화면 설치 정보
├── books-template.csv    업로드 양식
└── list.html 등          예전 주소 → 새 화면으로 옮겨 주는 페이지
```

## 데이터 모양 (`localStorage['readinglife.data']`, schema 2)

```js
{
  schema: 2,
  books:   [{ id, no, title, originalTitle, author, publisher, year, genre, country, pages, summary, updatedAt }],
  reading: { [bookId]: { start, due, done, rating, review, updatedAt } },
  journal: [{ id, date, bookId, bookTitle, content, page, createdAt, updatedAt }],
  settings:{ lastBackup },
  deleted: { books: { id: 지운 시각 }, reading: { bookId: 시각 }, journal: { id: 시각 } }
}
```

- 책은 바뀌지 않는 `id`로 연결합니다. 제목을 고쳐도 기록과 일지가 그대로 이어집니다.
- 읽기 상태는 저장하지 않고 날짜로 계산합니다 (`store.statusOf`): 완료일 → 읽기 완료
  (시작일을 모르는 예전에 읽은 책도), 완료예정일이 지남 → 읽기 지연, 시작일만 있음 → 읽는 중, 없음 → 읽기 전.
  시작일이 없는 완료 기록은 평균 완독 기간 계산에서 뺍니다.
- CSV 업로드는 책 항목과 함께 `시작일·완료예정일·완료일·별점` 칸을 읽습니다 (`store.recordFromRow`).
  값이 있는 칸만 반영하고, 잘못된 날짜·미래 완료일·1~5 밖 별점은 그 책의 기록만 건너뜁니다.
- 예전 모양(`books100.*`)의 데이터는 처음 열 때 자동으로 옮기고, 예전 칸은 지우지 않습니다.
- `updatedAt`(마지막으로 고친 시각)과 `deleted`(지운 기록)는 **합쳐서 복원**에 쓰입니다 (`store.mergeData`).
  한쪽에만 있으면 더하고, 둘 다 있으면 더 최근에 고친 쪽을 남기며, 한쪽에서 지운 것은 지운 뒤 고친 적이 없으면 지웁니다.
  책은 `id`가 같거나 제목+저자가 같으면 같은 책으로 봅니다.
- **여러 창 주의**: 같은 기기에서 앱이 두 곳(홈 화면 앱과 크롬 탭 등)에 열려 있을 수 있습니다.
  `store.sync()`가 저장소가 바뀌었는지 확인해 다시 읽습니다. 화면을 그리기 전(`router.render`)과
  저장하는 모든 함수의 맨 앞에서 부르므로, 새 저장 함수를 만들 때도 **맨 앞에 `sync()`를 넣어야**
  다른 창의 기록을 예전 내용으로 덮어쓰지 않습니다. 다른 창의 변경은 `storage` 이벤트로 바로 화면에 반영됩니다.
- 데이터 모양을 바꿀 때는 `store.js`의 `SCHEMA`를 올리고 `load()`에서 옮기는 코드를 더합니다.

## 새 화면 만들기

1. `js/views/새화면.js`를 만듭니다.
   ```js
   App.route('/새경로/:id', {
       title: '화면 제목',            // 또는 ctx => '제목'
       back: '/돌아갈/경로',          // 상단 ← 버튼. 또는 ctx => '경로'
       render(el, ctx) {
           // ctx.params.id, ctx.query.get('이름') 로 주소 값을 읽는다
           el.innerHTML = `...`;       // 사용자 글자는 App.util.escapeHtml 로 감싼다
           // 이벤트 연결, App.store 로 데이터 읽고 쓰기
           // 저장 후: App.ui.toast('저장했어요', { next: true }); App.router.go('/경로');
       }
   });
   ```
2. `index.html`의 스크립트 목록(views 부분)에 한 줄을 더합니다.
3. 필요하면 `home.js` 메뉴에 타일을 더합니다.
4. 새 통계는 `insights.js`에 계산 함수를 더하고 `stats.js`에서 그립니다.

## 배포 (새 버전 올리기)

```bash
python3 tools/release.py          # ?v= 번호와 캐시 번호를 올리고, 오프라인 파일 목록을 새로 만든다
python3 tools/release.py --check  # 확인만
```

파일을 더하거나 고친 뒤에는 **반드시** `release.py`를 실행하고 커밋합니다.
번호를 올리지 않으면 탭이 옛 파일과 새 파일을 섞어서 열 수 있습니다.
main에 합쳐지면 GitHub Pages가 1~2분 안에 배포합니다.

## 차트 색

통계 차트는 색약 검사를 통과한 값만 씁니다 (`css/app.css`의 `--chart-*`, `--heat-*`).
한 가지 값은 강조색(`--accent`) 하나로, 많고 적음은 같은 색의 밝기 단계로 나타냅니다.
