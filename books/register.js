// 책 등록 화면: 입력한 책을 목록 맨 아래에 추가하고 목록 화면으로 이동한다.
const form = document.getElementById('register-form');
const message = document.getElementById('message');

// 이미 등록된 장르와 국가를 입력 추천 목록으로 보여준다
function fillOptions(id, key, defaults) {
    const values = new Set(defaults);
    loadBooks().forEach(book => {
        if (book[key]) values.add(book[key]);
    });
    document.getElementById(id).innerHTML =
        [...values].map(v => `<option value="${escapeHtml(v)}">`).join('');
}

fillOptions('genre-options', 'genre', ['소설', '시', '철학', '역사', '과학', '에세이']);
fillOptions('country-options', 'country', ['한국', '중국', '일본', '미국', '영국', '프랑스', '독일', '러시아']);

function nextNumber(books) {
    const numbers = books.map(b => parseInt(b.no, 10)).filter(n => !isNaN(n));
    return String(numbers.length > 0 ? Math.max(...numbers) + 1 : books.length + 1);
}

form.addEventListener('submit', event => {
    event.preventDefault();

    const book = {};
    new FormData(form).forEach((value, key) => {
        book[key] = String(value).trim();
    });

    if (!book.title || !book.author) {
        message.textContent = '제목과 저자는 꼭 입력해 주세요.';
        message.hidden = false;
        form.elements[book.title ? 'author' : 'title'].focus();
        return;
    }

    const books = loadBooks();
    const same = books.some(b => b.title === book.title && b.author === book.author);
    if (same && !confirm('같은 제목과 저자의 책이 이미 있어요. 그래도 등록할까요?')) return;

    book.no = nextNumber(books);
    books.push(book);
    saveBooks(books);

    setFlash(`'${book.title}'을(를) ${book.no}번으로 등록했어요.`);
    location.href = 'list.html#new';
});
