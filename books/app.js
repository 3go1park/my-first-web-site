// 홈 화면: 등록된 책 수를 보여준다.
const books = loadBooks();
const summary = document.getElementById('book-summary');

summary.textContent = books.length > 0
    ? `등록된 책 ${books.length}권`
    : '아직 등록된 책이 없어요. 책 목록을 업로드하거나 직접 등록해 보세요.';
