// 홈 화면: 저장된 책 목록 수를 보여준다.
const STORAGE_KEY = 'books100.books';

const books = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
const total = document.getElementById('total');
const label = document.getElementById('progress-label');

if (books.length > 0) {
    total.textContent = `/ ${books.length}권`;
    label.textContent = `${books.length}권의 책 목록이 저장되어 있어요.`;
} else {
    label.textContent = '아직 책 목록이 없어요. 먼저 책 목록을 업로드해 주세요.';
}
