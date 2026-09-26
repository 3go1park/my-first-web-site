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
