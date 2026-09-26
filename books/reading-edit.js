// 읽기 기록 화면: 선택한 책의 시작일/완료예정일/완료일을 저장한다.
const key = new URLSearchParams(location.search).get('book') || '';
const book = loadBooks().find(b => bookKey(b) === key);
const reading = loadReading();
const record = reading[key];

const form = document.getElementById('reading-form');
const message = document.getElementById('message');
const clearButton = document.getElementById('clear-button');

function backToList(text) {
    setFlash(text);
    sessionStorage.setItem('books100.focus', key);
    sessionStorage.setItem('books100.readingFilter', 'all');
    location.href = 'reading.html';
}

function showError(text, field) {
    message.textContent = text;
    message.hidden = false;
    if (field) form.elements[field].focus();
}

if (!book) {
    document.getElementById('not-found').hidden = false;
} else {
    document.getElementById('book-title').textContent = book.title;
    document.getElementById('book-meta').textContent =
        [book.author, book.publisher, book.year, book.genre, book.country].filter(Boolean).join(' · ');
    document.getElementById('book-summary').textContent = book.summary || '';

    const status = readingStatus(record);
    const badge = document.getElementById('book-status');
    badge.textContent = STATUS_LABELS[status];
    badge.classList.add('status-' + status);

    // 처음 기록하는 책은 시작일을 오늘로 채워 둔다
    form.elements.start.value = (record && record.start) || today();
    form.elements.due.value = (record && record.due) || '';
    form.elements.done.value = (record && record.done) || '';
    clearButton.hidden = !record;
    document.getElementById('editor').hidden = false;
}

form.addEventListener('submit', event => {
    event.preventDefault();
    const start = form.elements.start.value;
    const due = form.elements.due.value;
    const done = form.elements.done.value;

    if (!start) return showError('시작일은 꼭 입력해 주세요.', 'start');
    if (due && due < start) return showError('완료예정일은 시작일보다 빠를 수 없어요.', 'due');
    if (done && done < start) return showError('완료일은 시작일보다 빠를 수 없어요.', 'done');
    if (done && done > today()) return showError('완료일은 오늘 이후로 정할 수 없어요.', 'done');

    const next = { start, due, done };
    reading[key] = next;
    saveReading(reading);
    backToList(`'${book.title}'을(를) 저장했어요. 상태: ${STATUS_LABELS[readingStatus(next)]}`);
});

clearButton.addEventListener('click', () => {
    if (!confirm('이 책의 읽기 기록을 지울까요? 상태가 "읽기 전"으로 돌아가요.')) return;
    delete reading[key];
    saveReading(reading);
    backToList(`'${book.title}'의 읽기 기록을 지웠어요.`);
});
