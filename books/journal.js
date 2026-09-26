// 독서 일지 화면: 날짜별로 읽은 내용을 등록하고, 아래에 목록으로 보여준다.
const books = loadBooks();
const reading = loadReading();
let entries = loadJournal();
let editingId = null;

const form = document.getElementById('journal-form');
const formTitle = document.getElementById('form-title');
const submitButton = document.getElementById('submit-button');
const cancelEdit = document.getElementById('cancel-edit');
const message = document.getElementById('message');
const flash = document.getElementById('flash');
const bookSelect = document.getElementById('book-select');
const filterSelect = document.getElementById('journal-filter');
const list = document.getElementById('journal-list');
const empty = document.getElementById('journal-empty');
const count = document.getElementById('journal-count');

const bookByKey = new Map(books.map(book => [bookKey(book), book]));
const params = new URLSearchParams(location.search);

function bookTitle(key) {
    if (!key) return '';
    const book = bookByKey.get(key);
    return book ? book.title : key.split('|')[0];
}

// "2026-09-26" → "2026.09.26 (토)"
function formatDay(value) {
    const [y, m, d] = value.split('-').map(Number);
    const weekday = new Date(y, m - 1, d).toLocaleDateString('ko-KR', { weekday: 'short' });
    return `${formatDate(value)} (${weekday})`;
}

// 책 선택: 읽는 중인 책을 맨 위에 모아 보여준다
function fillBookSelect() {
    const option = book => `<option value="${escapeHtml(bookKey(book))}">${escapeHtml(book.no)}. ${escapeHtml(book.title)}</option>`;
    const isReading = book => ['reading', 'late'].includes(readingStatus(reading[bookKey(book)]));
    const now = books.filter(isReading);
    const others = books.filter(book => !isReading(book));
    bookSelect.innerHTML = '<option value="">선택 안 함</option>'
        + (now.length ? `<optgroup label="읽는 중">${now.map(option).join('')}</optgroup>` : '')
        + (others.length ? `<optgroup label="다른 책">${others.map(option).join('')}</optgroup>` : '');

    // 주소로 받은 책 → 마지막으로 쓴 책 → 읽는 중인 첫 책 순서로 미리 골라 둔다
    const last = entries.length ? [...entries].sort((a, b) => b.createdAt - a.createdAt)[0].bookKey : '';
    const preferred = [params.get('book'), last, now[0] && bookKey(now[0])]
        .find(key => key && bookByKey.has(key));
    bookSelect.value = preferred || '';
}

function fillFilter() {
    const keys = [...new Set(entries.map(e => e.bookKey).filter(Boolean))];
    const current = filterSelect.value || params.get('book') || 'all';
    filterSelect.innerHTML = '<option value="all">전체</option>'
        + keys.map(key => `<option value="${escapeHtml(key)}">${escapeHtml(bookTitle(key))}</option>`).join('')
        + (entries.some(e => !e.bookKey) ? '<option value="">책 없이 쓴 일지</option>' : '');
    filterSelect.value = [...filterSelect.options].some(o => o.value === current) ? current : 'all';
}

function renderList() {
    const filter = filterSelect.value;
    const shown = entries
        .filter(e => filter === 'all' || e.bookKey === filter)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

    count.textContent = `${shown.length}개`;
    empty.hidden = shown.length > 0;

    // 같은 날짜끼리 묶어서 보여준다
    let lastDate = '';
    list.innerHTML = shown.map(e => {
        const heading = e.date !== lastDate ? `<li class="journal-date">${formatDay(e.date)}</li>` : '';
        lastDate = e.date;
        return `${heading}
            <li class="journal-entry card${e.id === editingId ? ' is-editing' : ''}">
                ${e.bookKey ? `<p class="journal-book">${escapeHtml(bookTitle(e.bookKey))}</p>` : ''}
                <p class="journal-content">${escapeMultiline(e.content)}</p>
                <div class="journal-actions">
                    <button type="button" class="text-button plain" data-edit="${e.id}">수정</button>
                    <button type="button" class="text-button" data-delete="${e.id}">삭제</button>
                </div>
            </li>`;
    }).join('');
}

function resetForm() {
    editingId = null;
    formTitle.textContent = '오늘 읽은 내용';
    submitButton.textContent = '등록하기';
    cancelEdit.hidden = true;
    form.elements.content.value = '';
    message.hidden = true;
}

function showNotice(text) {
    flash.textContent = text;
    flash.hidden = false;
}

function showError(text, field) {
    message.textContent = text;
    message.hidden = false;
    form.elements[field].focus();
}

form.addEventListener('submit', event => {
    event.preventDefault();
    const date = form.elements.date.value;
    const content = form.elements.content.value.trim();
    const key = bookSelect.value;

    if (!date) return showError('일자를 골라 주세요.', 'date');
    if (date > today()) return showError('앞으로의 날짜에는 일지를 쓸 수 없어요.', 'date');
    if (!content) return showError('읽은 내용을 적어 주세요.', 'content');

    if (editingId) {
        const entry = entries.find(e => e.id === editingId);
        Object.assign(entry, { date, bookKey: key, content });
        showNotice(`${formatDay(date)} 일지를 고쳤어요.`);
    } else {
        entries.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            date,
            bookKey: key,
            content,
            createdAt: Date.now()
        });
        showNotice(`${formatDay(date)} 일지를 등록했어요.`);
    }
    saveJournal(entries);
    resetForm();
    fillFilter();
    renderList();
});

cancelEdit.addEventListener('click', () => {
    resetForm();
    form.elements.date.value = today();
    renderList();
});

list.addEventListener('click', event => {
    const editId = event.target.dataset.edit;
    const deleteId = event.target.dataset.delete;

    if (editId) {
        const entry = entries.find(e => e.id === editId);
        editingId = editId;
        form.elements.date.value = entry.date;
        bookSelect.value = bookByKey.has(entry.bookKey) ? entry.bookKey : '';
        form.elements.content.value = entry.content;
        formTitle.textContent = '일지 수정';
        submitButton.textContent = '수정 저장';
        cancelEdit.hidden = false;
        flash.hidden = true;
        renderList();
        form.scrollIntoView({ block: 'start', behavior: 'smooth' });
        form.elements.content.focus();
    }

    if (deleteId && confirm('이 일지를 지울까요?')) {
        entries = entries.filter(e => e.id !== deleteId);
        if (editingId === deleteId) resetForm();
        saveJournal(entries);
        showNotice('일지를 지웠어요.');
        fillFilter();
        renderList();
    }
});

filterSelect.addEventListener('change', renderList);

form.elements.date.value = today();
form.elements.date.max = today();
fillBookSelect();
fillFilter();
renderList();
