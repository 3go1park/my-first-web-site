// 책 읽기 등록 화면: 책마다 읽기 상태를 보여주고, 누르면 기록 화면으로 이동한다.
const FILTER_KEY = 'books100.readingFilter';
const FOCUS_KEY = 'books100.focus';
const FILTERS = ['all', 'reading', 'late', 'done', 'none'];

const books = loadBooks();
const reading = loadReading();
const filters = document.getElementById('filters');
const list = document.getElementById('reading-list');
const rows = document.getElementById('reading-rows');
const noMatch = document.getElementById('no-match');

showFlash(document.getElementById('flash'));

// 홈 화면의 상태 버튼(?status=reading)으로 들어오면 그 상태부터 보여준다
let current = new URLSearchParams(location.search).get('status')
    || sessionStorage.getItem(FILTER_KEY) || 'all';
if (!FILTERS.includes(current)) current = 'all';

const items = books.map(book => {
    const record = reading[bookKey(book)] || {};
    return { book, record, status: readingStatus(record) };
});

function renderFilters() {
    const counts = { all: items.length };
    items.forEach(item => { counts[item.status] = (counts[item.status] || 0) + 1; });
    filters.innerHTML = FILTERS.map(key => `
        <button type="button" role="tab" data-filter="${key}"
            class="filter-tab status-${key}${key === current ? ' is-active' : ''}"
            aria-selected="${key === current}">
            ${key === 'all' ? '전체' : STATUS_LABELS[key]} <b>${counts[key] || 0}</b>
        </button>`).join('');
}

function renderRows() {
    const shown = items.filter(item => current === 'all' || item.status === current);
    rows.innerHTML = shown.map(({ book, record, status }) => `
        <li>
            <a class="reading-row" href="reading-edit.html?book=${encodeURIComponent(bookKey(book))}"
                data-key="${escapeHtml(bookKey(book))}">
                <span class="col-no">${escapeHtml(book.no)}</span>
                <span class="col-title">
                    <strong>${escapeHtml(book.title)}</strong>
                    <small>${escapeHtml(book.author)}</small>
                </span>
                <span><em class="status-badge status-${status}">${STATUS_LABELS[status]}</em></span>
                <span class="col-date">${formatDate(record.start)}</span>
                <span class="col-date${status === 'late' ? ' is-late' : ''}">${formatDate(record.due)}</span>
                <span class="col-date">${formatDate(record.done)}</span>
            </a>
        </li>`).join('');
    noMatch.hidden = shown.length > 0;
}

filters.addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    current = button.dataset.filter;
    sessionStorage.setItem(FILTER_KEY, current);
    history.replaceState(null, '', 'reading.html');
    renderFilters();
    renderRows();
});

if (books.length === 0) {
    document.getElementById('empty').hidden = false;
} else {
    renderFilters();
    renderRows();
    filters.hidden = false;
    list.hidden = false;

    // 방금 저장한 책으로 이동해 강조한다
    const focus = sessionStorage.getItem(FOCUS_KEY);
    sessionStorage.removeItem(FOCUS_KEY);
    const row = focus && [...rows.querySelectorAll('.reading-row')].find(a => a.dataset.key === focus);
    if (row) {
        row.classList.add('is-new');
        row.scrollIntoView({ block: 'center' });
    }
}
