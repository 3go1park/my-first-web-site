// 백업 · 복원 화면: 책 목록과 읽기 기록을 파일 하나로 저장하고 다시 불러온다.
const BACKUP_APP = 'books100';
const BACKUP_VERSION = 1;

const summary = document.getElementById('backup-summary');
const lastBackup = document.getElementById('last-backup');
const downloadButton = document.getElementById('download-button');
const shareButton = document.getElementById('share-button');
const restoreInput = document.getElementById('restore-input');
const message = document.getElementById('message');

showFlash(document.getElementById('flash'));

function render() {
    const books = loadBooks();
    const records = Object.keys(loadReading()).length;
    summary.textContent = `지금 저장된 내용: 책 ${books.length}권, 읽기 기록 ${records}개`;

    const last = localStorage.getItem(LAST_BACKUP_KEY);
    lastBackup.textContent = last
        ? `마지막 백업: ${formatDate(last)} (${daysSince(last) === 0 ? '오늘' : daysSince(last) + '일 전'})`
        : '아직 백업한 적이 없어요.';
    downloadButton.disabled = books.length === 0;
}

function makeBackupFile() {
    const data = {
        app: BACKUP_APP,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        books: loadBooks(),
        reading: loadReading()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    return new File([blob], `reading-life-backup-${today()}.json`, { type: 'application/json' });
}

function markBackedUp() {
    localStorage.setItem(LAST_BACKUP_KEY, today());
    render();
}

downloadButton.addEventListener('click', () => {
    const file = makeBackupFile();
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    markBackedUp();
});

// 탭의 공유 기능(드라이브, 메일, 카카오톡 등)으로 바로 보내기
const canShareFiles = navigator.canShare && navigator.canShare({ files: [makeBackupFile()] });
shareButton.hidden = !canShareFiles;
shareButton.addEventListener('click', async () => {
    try {
        await navigator.share({ files: [makeBackupFile()], title: '책읽는 삶의 재미 백업' });
        markBackedUp();
    } catch (err) {
        // 공유 창을 닫은 경우는 그냥 넘어간다
    }
});

function showError(text) {
    message.textContent = text;
    message.hidden = false;
    restoreInput.value = '';
}

restoreInput.addEventListener('change', () => {
    const file = restoreInput.files[0];
    message.hidden = true;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        let data;
        try {
            data = JSON.parse(reader.result);
        } catch (err) {
            return showError('백업 파일을 읽지 못했어요. 이 앱에서 만든 백업 파일(.json)인지 확인해 주세요.');
        }
        if (!data || data.app !== BACKUP_APP || !Array.isArray(data.books)
            || typeof data.reading !== 'object' || data.reading === null) {
            return showError('이 앱의 백업 파일이 아니에요. "reading-life-backup-날짜.json" 파일을 골라 주세요.');
        }

        const records = Object.keys(data.reading).length;
        const when = data.exportedAt ? formatDate(data.exportedAt.slice(0, 10)) + ' 백업' : '백업 파일';
        if (!confirm(`${when}: 책 ${data.books.length}권, 읽기 기록 ${records}개\n지금 저장된 내용을 이 백업으로 바꿀까요?`)) {
            restoreInput.value = '';
            return;
        }

        saveBooks(data.books);
        saveReading(data.reading);
        setFlash(`복원했어요. 책 ${data.books.length}권, 읽기 기록 ${records}개`);
        location.href = 'index.html';
    };
    reader.onerror = () => showError('파일을 읽지 못했어요. 다시 선택해 주세요.');
    reader.readAsText(file, 'UTF-8');
});

render();
