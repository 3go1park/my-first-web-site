// 홈 화면: 등록된 책 수와 읽기 상태별 권수를 보여준다.
const books = loadBooks();
const reading = loadReading();
const summary = document.getElementById('book-summary');
const stats = document.getElementById('reading-stats');

const counts = { reading: 0, late: 0, done: 0 };
books.forEach(book => {
    const status = readingStatus(reading[bookKey(book)]);
    if (status in counts) counts[status]++;
});

summary.textContent = books.length > 0
    ? `등록된 책 ${books.length}권 · 읽기 완료 ${counts.done}권`
    : '아직 등록된 책이 없어요. 책 목록을 업로드하거나 직접 등록해 보세요.';

// 누르면 책 읽기 목록에서 그 상태의 책만 보여준다
stats.innerHTML = ['reading', 'late', 'done'].map(status => `
    <a class="stat-tile status-${status}" href="reading.html?status=${status}">
        <b>${counts[status]}</b>
        <span>${STATUS_LABELS[status]}</span>
    </a>`).join('');
