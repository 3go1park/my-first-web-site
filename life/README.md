# 하루 하루 삶의 기록

갤럭시탭(가로 화면 기준)에 설치해 쓰는 할일·일기 웹앱(PWA)입니다. "책읽는 삶의 재미"(`../books`)와 같은 방식으로
빌드 도구 없이 HTML/CSS/JS만으로 만들고, GitHub Pages(`https://3go1park.github.io/my-first-web-site/life/`)로 배포합니다.

## 메뉴

| 메뉴 | 화면 | 주소 |
|---|---|---|
| 할일 | 할일 등록 · 수정 (시작일·종료일, 반복 주기·횟수·양력/음력, 회차별 완료) | `#/todos/new`, `#/todo/:id/edit` |
|      | 할일 내역 (내용·메모 검색, 상태, 기간, 반복 여부, 정렬) | `#/todos` |
| 일기 | 일기 쓰기 (일자 선택, 그날 할일 요약을 위에 표시, 기분, 내용) | `#/diary/new`, `#/diary/:id/edit` |
|      | 일기 내역 (내용 검색, 기간, 기분, 요일, 정렬, 달별 묶음) | `#/diary` |
| 통계 | 할일 완료율·상태·날짜별/할일별 완료, 일기 편수·연속 기록·월별·기분 | `#/stats` |
| 관리 | 백업 · 복원 (파일 저장·공유, 합쳐서 복원, 백업으로 바꾸기) | `#/backup` |
|      | 홈 화면 아이콘 (설치, 다시 등록 방법) | `#/install` |

## 폴더 구조

```
life/
├── index.html            앱의 유일한 화면 틀 (상단 막대 + 화면 자리 + 스크립트 목록)
├── css/app.css           모든 스타일 (색·크기 값 → 기본 → 공통 부품 → 화면별 → 좁은 화면)
├── js/
│   ├── core/
│   │   ├── util.js       날짜, 글자 처리 같은 작은 도구
│   │   ├── lunar.js      양력 → 음력 (브라우저의 한국 음력 달력 Intl 'dangi' 사용)
│   │   ├── store.js      데이터 저장소 (할일·일기·백업). localStorage는 여기서만 만진다
│   │   ├── schedule.js   반복 회차 계산, 상태(진행·지연·진행전·완료) 계산
│   │   ├── moods.js      일기 기분 목록
│   │   ├── insights.js   통계 계산
│   │   ├── ui.js         토스트, 상태 표시, 완료 체크 버튼, 확인 창, 아이콘
│   │   ├── router.js     주소(#/todos 등)에 맞는 화면을 그림
│   │   └── install.js    홈 화면 설치 신호 받기
│   ├── views/            화면 하나당 파일 하나 (home, todo-form, todos, diary-form, diary, stats, backup, install)
│   └── app.js            앱 시작, 서비스 워커 등록
├── sw.js                 오프라인·업데이트 처리 (번호와 파일 목록은 자동 생성)
├── manifest.webmanifest  홈 화면 설치 정보 (가로 화면으로 시작)
└── icons/                앱 아이콘
```

## 데이터 모양 (`localStorage['dailylife.data']`, schema 1)

```js
{
  schema: 1,
  todos: [{ id, title, memo, start, end, repeat, weekdays, count, calendar, done, createdAt, updatedAt }],
  diary: [{ id, date, mood, content, createdAt, updatedAt }],
  settings: { lastBackup },
  deleted: { todos: { id: 지운 시각 }, diary: { id: 시각 } }
}
```

- **할일 반복**: `repeat` = `daily`(매일) · `weekly`(매주, `weekdays` 0=일~6=토) · `monthly`(매월) · `yearly`(매년).
  `count`는 전체 횟수(처음 포함, 기본 1 = 반복 안 함), `0`은 계속. `calendar`가 `lunar`면 매월·매년을 음력 날짜로 반복합니다
  (예: 음력 생일, 제사). 그달에 그 날이 없으면(31일, 음력 30일) 그달 마지막 날로 합니다.
- **회차**: 시작일~종료일이 한 회차이고, 반복하면 같은 길이로 다음 회차가 이어집니다.
  완료는 회차의 시작일을 열쇠로 `done`에 저장합니다.
- **상태는 저장하지 않고 계산합니다** (`schedule.stateOf`):
  오늘이 걸친 회차가 있으면 그 회차를 완료했는지에 따라 **완료/진행**, 없으면 지난 회차를 못 했으면 **지연**,
  다음 회차가 있으면 **진행전**, 모두 끝났으면 **완료**. 못 한 지난 회차 수는 "놓친 N회"로 보여 줍니다.
- **일기는 하루에 하나**입니다. 이미 쓴 날을 고르면 그 일기를 엽니다.
- **합쳐서 복원** (`store.mergeData`): 한쪽에만 있으면 더하고, 둘 다 있으면 더 최근에 고친 쪽을 남기며,
  한쪽에서 지운 것은 지운 뒤 고친 적이 없으면 지웁니다. 같은 날 일기를 양쪽에서 따로 썼으면 두 글을 이어 붙입니다.
- 저장하는 모든 함수의 맨 앞에서 `sync()`를 불러, 다른 창(홈 화면 앱과 크롬 탭)의 기록을 덮어쓰지 않습니다.

## 배포 (새 버전 올리기)

```bash
python3 tools/release.py life          # ?v= 번호와 캐시 번호를 올리고, 오프라인 파일 목록을 새로 만든다
python3 tools/release.py life --check  # 확인만
```

파일을 더하거나 고친 뒤에는 **반드시** `release.py life`를 실행하고 커밋합니다.
main에 합쳐지면 GitHub Pages가 1~2분 안에 배포합니다.
