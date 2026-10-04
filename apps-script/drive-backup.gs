/**
 * 구글 드라이브 자동 백업 — "하루 하루 삶의 기록", "책읽는 삶의 재미" 공용
 *
 * 두 앱이 자료를 저장할 때마다 이 웹 앱으로 보내고, 이 웹 앱이 내 구글 드라이브의
 * "삶의 기록 앱 백업" 폴더에 저장한다. (설정 방법은 apps-script/README.md)
 *
 *  - 앱이름-latest.json      : 가장 최근 백업 (앱에서 "드라이브에서 불러오기"로 읽음)
 *  - 앱이름-YYYY-MM-DD.json  : 날짜별 백업 (그날의 마지막 상태). 오래된 것은 휴지통으로
 *  - 앱이름-줄어들기전-시각.json : 기록 수가 줄어드는 백업이 오면, 덮어쓰기 전의 내용을 따로 남김
 *
 * ★ 아래 SECRET 을 나만 아는 긴 글자로 바꾼 뒤 배포한다. 앱에도 같은 글자를 넣는다.
 */
const SECRET = '여기에-나만-아는-긴-비밀-키를-넣으세요';
const FOLDER_NAME = '삶의 기록 앱 백업';
const KEEP_DAYS = 90;   // 날짜별 백업을 며칠 동안 남길지
const APPS = {
  'daily-life': '하루하루삶의기록',
  'books100': '책읽는삶의재미'
};

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (SECRET.indexOf('여기에') === 0) return reply({ ok: false, error: 'Apps Script 코드의 SECRET 을 바꾼 뒤 다시 배포해 주세요' });
    if (body.key !== SECRET) return reply({ ok: false, error: 'key' });
    const prefix = APPS[body.app];
    if (!prefix) return reply({ ok: false, error: '모르는 앱: ' + body.app });

    if (body.action === 'ping') return reply({ ok: true });
    if (body.action === 'load') return reply(load(prefix));
    if (body.action === 'save') return reply(save(prefix, body.data));
    return reply({ ok: false, error: '모르는 요청: ' + body.action });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

// 브라우저 주소창으로 열면 동작 중인지만 알려 준다 (자료는 보여 주지 않음)
function doGet() {
  return reply({ ok: true, message: '삶의 기록 백업 웹 앱이 동작 중이에요.' });
}

function load(prefix) {
  const file = findFile(folder(), prefix + '-latest.json');
  if (!file) return { ok: true, data: null };
  return {
    ok: true,
    data: JSON.parse(file.getBlob().getDataAsString('UTF-8')),
    savedAt: file.getLastUpdated().toISOString()
  };
}

function save(prefix, data) {
  if (!data || typeof data !== 'object') return { ok: false, error: '보낸 자료가 비어 있어요' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const dir = folder();
    const text = JSON.stringify(data);
    const now = new Date();
    const latest = findFile(dir, prefix + '-latest.json');

    // 기록 수가 줄어들면 (지웠거나, 빈 상태에서 저장했거나) 덮어쓰기 전 내용을 남겨 둔다
    if (latest) {
      const oldText = latest.getBlob().getDataAsString('UTF-8');
      if (countRecords(JSON.parse(oldText)) > countRecords(data)) {
        dir.createFile(prefix + '-줄어들기전-' + stamp(now, 'yyyy-MM-dd-HHmmss') + '.json', oldText, 'application/json');
      }
    }

    write(dir, prefix + '-latest.json', text);
    write(dir, prefix + '-' + stamp(now, 'yyyy-MM-dd') + '.json', text);
    prune(dir, prefix, now);
    return { ok: true, savedAt: now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

// 백업 안의 목록(할일, 일기, 책, 일지 …) 개수를 모두 더한다
function countRecords(backup) {
  const data = (backup && backup.data) || {};
  let n = 0;
  Object.keys(data).forEach(function (k) {
    if (Array.isArray(data[k])) n += data[k].length;
    else if (k === 'reading' && data[k] && typeof data[k] === 'object') n += Object.keys(data[k]).length;
  });
  return n;
}

function prune(dir, prefix, now) {
  const limit = now.getTime() - KEEP_DAYS * 86400000;
  const files = dir.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getName().indexOf(prefix + '-') === 0 && f.getName().indexOf('-latest.json') < 0
        && f.getLastUpdated().getTime() < limit) {
      f.setTrashed(true);   // 바로 지우지 않고 휴지통으로 (30일 동안 되살릴 수 있음)
    }
  }
}

function folder() {
  const found = DriveApp.getFoldersByName(FOLDER_NAME);
  return found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME);
}

function findFile(dir, name) {
  const found = dir.getFilesByName(name);
  return found.hasNext() ? found.next() : null;
}

function write(dir, name, text) {
  const file = findFile(dir, name);
  if (file) file.setContent(text);
  else dir.createFile(name, text, 'application/json');
}

function stamp(date, pattern) {
  return Utilities.formatDate(date, 'Asia/Seoul', pattern);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
