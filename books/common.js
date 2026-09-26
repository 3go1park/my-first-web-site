// 여러 화면에서 함께 쓰는 기능
const STORAGE_KEY = 'books100.books';
const FLASH_KEY = 'books100.flash';

function loadBooks() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (err) {
        return [];
    }
}

function saveBooks(books) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

// 다음 화면에서 한 번만 보여줄 안내 문구
function setFlash(text) {
    sessionStorage.setItem(FLASH_KEY, text);
}

function showFlash(element) {
    const text = sessionStorage.getItem(FLASH_KEY);
    if (!text) return;
    element.textContent = text;
    element.hidden = false;
    sessionStorage.removeItem(FLASH_KEY);
}

// 책 읽기 기록: 책 목록과 따로 저장한다. 책 목록을 다시 올려도 기록이 남도록
// 번호 대신 "제목|저자"를 열쇠로 쓴다.
const READING_KEY = 'books100.reading';

const STATUS_LABELS = {
    none: '읽기 전',
    reading: '읽는 중',
    late: '읽기 지연',
    done: '읽기 완료'
};

function bookKey(book) {
    return `${book.title}|${book.author}`;
}

function loadReading() {
    try {
        return JSON.parse(localStorage.getItem(READING_KEY) || '{}');
    } catch (err) {
        return {};
    }
}

function saveReading(reading) {
    localStorage.setItem(READING_KEY, JSON.stringify(reading));
}

// 오늘 날짜를 "2026-09-26" 형식으로 (탭의 현지 시간 기준)
function today() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 완료일이 있으면 읽기 완료, 완료예정일이 지났으면 읽기 지연, 시작일만 있으면 읽는 중
function readingStatus(record) {
    if (!record || !record.start) return 'none';
    if (record.done) return 'done';
    if (record.due && record.due < today()) return 'late';
    return 'reading';
}

// "2026-09-26" → "2026.09.26"
function formatDate(value) {
    return value ? value.replace(/-/g, '.') : '';
}

// 마지막으로 백업한 날짜
const LAST_BACKUP_KEY = 'books100.lastBackup';

function daysSince(dateText) {
    const [y, m, d] = dateText.split('-').map(Number);
    const then = new Date(y, m - 1, d);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((start - then) / 86400000);
}
