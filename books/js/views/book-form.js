// 책 등록 / 책 정보 수정 화면 (같은 입력 양식을 함께 쓴다)
(() => {
    const FIELDS = [
        { name: 'title', label: '제목', required: true },
        { name: 'author', label: '저자', required: true },
        { name: 'originalTitle', label: '원제' },
        { name: 'publisher', label: '출판사' },
        { name: 'year', label: '출간연도', numeric: true, placeholder: '예: 1919' },
        { name: 'pages', label: '쪽수', numeric: true, placeholder: '예: 240' },
        { name: 'genre', label: '장르', list: 'genre-options', placeholder: '예: 소설' },
        { name: 'country', label: '국가', list: 'country-options', placeholder: '예: 한국' },
        { name: 'no', label: '번호', numeric: true },
        { name: 'summary', label: '한줄소개', wide: true }
    ];

    function render(el, book) {
        const { escapeHtml } = App.util;
        const store = App.store;
        const options = (key, defaults) => [...new Set([...defaults, ...store.books().map(b => b[key]).filter(Boolean)])]
            .map(v => `<option value="${escapeHtml(v)}">`).join('');

        el.innerHTML = `
            <form id="book-form" class="card" novalidate>
                <div class="form-grid">
                    ${FIELDS.map(f => `
                        <label class="field${f.wide ? ' field-wide' : ''}">
                            <span>${f.label}${f.required ? ' *' : ''}</span>
                            <input name="${f.name}" type="text" autocomplete="off"
                                ${f.numeric ? 'inputmode="numeric"' : ''} ${f.list ? `list="${f.list}"` : ''}
                                placeholder="${f.placeholder || (f.name === 'no' ? '비우면 자동으로 붙어요' : '')}"
                                value="${escapeHtml(book ? book[f.name] : '')}">
                        </label>`).join('')}
                </div>
                <datalist id="genre-options">${options('genre', ['소설', '시', '철학', '역사', '과학', '에세이'])}</datalist>
                <datalist id="country-options">${options('country', ['한국', '중국', '일본', '미국', '영국', '프랑스', '독일', '러시아'])}</datalist>
                <p id="message" class="message error" hidden></p>
                <div class="form-actions">
                    <button class="btn btn-primary" type="submit">${book ? '수정 저장' : '등록하기'}</button>
                    ${book ? '<button id="delete-book" class="btn btn-danger-text" type="button">이 책 지우기</button>' : ''}
                </div>
            </form>`;

        const form = el.querySelector('#book-form');
        const message = el.querySelector('#message');

        form.addEventListener('submit', event => {
            event.preventDefault();
            const fields = {};
            FIELDS.forEach(f => { fields[f.name] = form.elements[f.name].value.trim(); });

            const fail = (text, name) => {
                message.textContent = text;
                message.hidden = false;
                form.elements[name].focus();
            };
            if (!fields.title) return fail('제목을 입력해 주세요.', 'title');
            if (!fields.author) return fail('저자를 입력해 주세요.', 'author');
            if (fields.pages && !/^\d+$/.test(fields.pages)) return fail('쪽수는 숫자로만 적어 주세요.', 'pages');

            const same = store.findSame(fields.title, fields.author, book && book.id);
            if (same && !confirm(`같은 제목과 저자의 책(${same.no}번)이 이미 있어요. 그래도 저장할까요?`)) return;

            if (book) {
                store.updateBook(book.id, fields);
                App.ui.toast(`'${fields.title}' 정보를 고쳤어요.`, { next: true });
                App.router.go(`/book/${book.id}`);
            } else {
                const added = store.addBook(fields);
                App.ui.toast(`'${added.title}'을(를) ${added.no}번으로 등록했어요.`, { next: true });
                App.ui.highlight(added.id);
                App.router.go('/books');
            }
        });

        const del = el.querySelector('#delete-book');
        if (del) {
            del.addEventListener('click', async () => {
                if (!(await App.ui.confirmBookDelete([book.id]))) return;
                store.deleteBook(book.id);
                App.ui.toast(`'${book.title}'을(를) 지웠어요.`, { next: true });
                App.router.go('/books');
            });
        }
    }

    App.route('/books/new', {
        title: '책 등록',
        back: '/books',
        render: el => render(el, null)
    });

    App.route('/book/:id/edit', {
        title: '책 정보 수정',
        back: ctx => `/book/${ctx.params.id}`,
        render(el, ctx) {
            const book = App.store.book(ctx.params.id);
            if (!book) {
                el.innerHTML = App.ui.emptyState('책을 찾지 못했어요.', '<a class="btn btn-outline" href="#/books">책 목록</a>');
                return;
            }
            render(el, book);
        }
    });
})();
