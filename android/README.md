# 안드로이드 앱 (APK)

`life/`(하루 하루 삶의 기록)와 `books/`(책읽는 삶의 재미) 웹앱을 그대로 넣은 안드로이드 앱입니다.
화면과 기능은 웹앱과 같고, 앱이 주는 `window.AndroidBridge`로 갤탭 폴더에 백업 파일을 씁니다.

## 만들기
- `life/`, `books/`, `android/`가 바뀌어 올라오면 GitHub Actions(`.github/workflows/android.yml`)가 APK 두 개를 만듭니다.
- main 에서 만든 것은 릴리스 **apk** 에 올라갑니다.
  - https://github.com/3go1park/my-first-web-site/releases/latest/download/daily-life.apk
  - https://github.com/3go1park/my-first-web-site/releases/latest/download/reading-life.apk
- 직접 만들려면 안드로이드 SDK 가 있는 컴퓨터에서 `gradle -p android assembleRelease`.

## 구조
- `app/build.gradle`: 앱마다 flavor 하나 (`life`, `books`). 각 웹앱 폴더를 assets 로 넣는다.
- `MainActivity.java`: WebView 로 `https://appassets.androidplatform.net/assets/index.html`을 보여 준다.
  - `AndroidBridge.pickFolder()` → 폴더 고르기(ACTION_OPEN_DOCUMENT_TREE), **계속 허락**을 받아 둔다
  - `writeFile / readFile / hasFile / listFiles / deleteFile` → 고른 폴더의 파일
  - `saveDownload` → "내 파일 → 다운로드"에 저장
  - 파일 고르기(`<input type="file">`), 뒤로 가기, 바깥 주소는 브라우저로 열기
- 웹앱 쪽은 `js/core/folder-backup.js`가 `AndroidBridge`가 있으면 그것을 폴더처럼 씁니다.

## 서명
업데이트할 때 같은 서명이어야 기록을 지우지 않고 덮어 설치됩니다. 그래서 서명 열쇠 `app/release.keystore`를
저장소에 넣어 두었습니다 (개인용 앱이라 편의를 택함). 이 열쇠를 바꾸면 앱을 지우고 다시 설치해야 합니다.
