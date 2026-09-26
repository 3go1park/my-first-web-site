// 책 목록 화면: 저장된 책을 한 줄에 한 권씩 보여준다.
const books = loadBooks();
const empty = document.getElementById('empty');
const list = document.getElementById('book-list');
const rows = document.getElementById('book-rows');
const count = document.getElementById('book-count');

showFlash(document.getElementById('flash'));

if (books.length === 0) {
    empty.hidden = false;
} else {
    count.textContent = `${books.length}권`;
    rows.innerHTML = books.map(b => `
        <li class="book-row">
            <span class="col-no">${escapeHtml(b.no)}</span>
            <span class="col-title">
                <strong>${escapeHtml(b.title)}</strong>
                <small class="col-author-inline">${escapeHtml(b.author)}</small>
                <small class="col-summary">${escapeHtml(b.summary)}</small>
            </span>
            <span class="col-author">${escapeHtml(b.author)}</span>
            <span class="col-genre">${escapeHtml(b.genre)}</span>
            <span class="col-country">${escapeHtml(b.country)}</span>
            <span class="col-year">${escapeHtml(b.year)}</span>
        </li>`).join('');
    list.hidden = false;

    // 방금 등록한 책이 있으면 맨 아래 줄로 이동해 강조한다
    if (location.hash === '#new') {
        const last = rows.lastElementChild;
        last.classList.add('is-new');
        last.scrollIntoView({ block: 'center' });
        history.replaceState(null, '', 'list.html');
    }
}
