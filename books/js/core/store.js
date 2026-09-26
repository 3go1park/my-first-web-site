// 데이터 저장소: 책 목록, 읽기 기록, 독서 일지를 한곳에서 읽고 쓴다.
// 화면 코드는 localStorage를 직접 만지지 않고 반드시 App.store를 거친다.
//
// 저장 모양 (schema 2)
// {
//   schema: 2,
//   books:   [{ id, no, title, originalTitle, author, publisher, year, genre, country, pages, summary }],
//   reading: { [bookId]: { start, due, done, rating, review } },
//   journal: [{ id, date, bookId, bookTitle, content, page, createdAt }],
//   settings:{ lastBackup }
// }
App.store = (() => {
    const { uid, today } = App.util;
    const KEY = 'readinglife.data';
    const SCHEMA = 2;
    const BOOK_FIELDS = ['no', 'title', 'originalTitle', 'author', 'publisher', 'year', 'genre', 'country', 'pages', 'summary'];

    const STATUS = {
        none: '읽기 전',
        reading: '읽는 중',
        late: '읽기 지연',
        done: '읽기 완료'
    };

    let data = null;

    function empty() {
        return { schema: SCHEMA, books: [], reading: {}, journal: [], settings: {} };
    }

    function readJson(key, fallback) {
        try {
            const text = localStorage.getItem(key);
            return text ? JSON.parse(text) : fallback;
        } catch (err) {
            return fallback;
        }
    }

    // 제목+저자로 같은 책인지 판단한다 (띄어쓰기·대소문자 무시)
    function matchKey(title, author) {
        const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
        return norm(title) + '|' + norm(author);
    }

    function cleanBook(raw, id) {
        const book = { id: id || raw.id || uid() };
        BOOK_FIELDS.forEach(field => {
            book[field] = raw[field] == null ? '' : String(raw[field]).trim();
        });
        // "320쪽"처럼 적어도 숫자만 남긴다
        book.pages = book.pages.replace(/[^\d]/g, '');
        return book;
    }

    // 예전 모양(책 번호 없이 "제목|저자"로 연결)의 데이터를 지금 모양으로 바꾼다.
    // 예전 백업 파일을 복원할 때도 같은 함수를 쓴다.
    function fromLegacy(books = [], reading = {}, journal = [], settings = {}) {
        const next = empty();
        const idByLegacyKey = new Map();
        books.forEach(raw => {
            const book = cleanBook(raw, uid());
            next.books.push(book);
            idByLegacyKey.set(`${raw.title}|${raw.author}`, book.id);
        });
        Object.entries(reading || {}).forEach(([legacyKey, record]) => {
            const id = idByLegacyKey.get(legacyKey);
            if (id && record && record.start) next.reading[id] = { ...record };
        });
        (journal || []).forEach(entry => {
            const id = idByLegacyKey.get(entry.bookKey) || '';
            next.journal.push({
                id: entry.id || uid(),
                date: entry.date,
                bookId: id,
                bookTitle: entry.bookKey ? entry.bookKey.split('|')[0] : '',
                content: entry.content || '',
                page: entry.page || '',
                createdAt: entry.createdAt || Date.now()
            });
        });
        next.settings = { ...settings };
        return next;
    }

    function load() {
        const saved = readJson(KEY, null);
        if (saved && saved.schema === SCHEMA) {
            data = { ...empty(), ...saved };
            return;
        }
        // 처음 한 번: 예전 저장 칸(books100.*)에서 옮겨 온다. 예전 칸은 지우지 않고 남겨 둔다.
        data = fromLegacy(
            readJson('books100.books', []),
            readJson('books100.reading', {}),
            readJson('books100.journal', []),
            { lastBackup: localStorage.getItem('books100.lastBackup') || '' }
        );
        save();
    }

    function save() {
        localStorage.setItem(KEY, JSON.stringify(data));
    }

    function numberOf(book) {
        const n = parseInt(book.no, 10);
        return isNaN(n) ? Infinity : n;
    }

    // ---- 읽기 ----------------------------------------------------------
    const books = () => data.books;
    const book = id => data.books.find(b => b.id === id) || null;
    const record = id => data.reading[id] || null;
    const journal = () => data.journal;
    const settings = () => data.settings;

    // 완료일이 있으면 읽기 완료, 완료예정일이 지났으면 읽기 지연, 시작일만 있으면 읽는 중
    function statusOf(id) {
        const r = record(id);
        if (!r || !r.start) return 'none';
        if (r.done) return 'done';
        if (r.due && r.due < today()) return 'late';
        return 'reading';
    }

    // 책에 남긴 가장 큰 쪽수 (일지의 "여기까지 읽음")
    function lastPage(id) {
        return data.journal
            .filter(e => e.bookId === id && e.page)
            .reduce((max, e) => Math.max(max, Number(e.page) || 0), 0);
    }

    // 진행률 0~100 (쪽수 정보가 없으면 null)
    function progressOf(id) {
        if (statusOf(id) === 'done') return 100;
        const total = Number((book(id) || {}).pages) || 0;
        const page = lastPage(id);
        if (!total || !page) return null;
        return Math.min(100, Math.round(page / total * 100));
    }

    function entriesOf(id) {
        return data.journal.filter(e => e.bookId === id);
    }

    function bookTitleOf(entry) {
        const b = entry.bookId && book(entry.bookId);
        return b ? b.title : (entry.bookTitle || '');
    }

    // ---- 책 --------------------------------------------------------------
    function nextNumber() {
        const numbers = data.books.map(numberOf).filter(isFinite);
        return String(numbers.length ? Math.max(...numbers) + 1 : data.books.length + 1);
    }

    function findSame(title, author, exceptId) {
        const key = matchKey(title, author);
        return data.books.find(b => b.id !== exceptId && matchKey(b.title, b.author) === key) || null;
    }

    function addBook(fields) {
        const b = cleanBook({ ...fields, no: fields.no || nextNumber() }, uid());
        data.books.push(b);
        save();
        return b;
    }

    function sortBooks() {
        data.books.sort((a, b) => numberOf(a) - numberOf(b));
    }

    function updateBook(id, fields) {
        const b = book(id);
        // 번호를 비우면 원래 번호를 그대로 둔다
        Object.assign(b, cleanBook({ ...b, ...fields, no: fields.no || b.no }, id));
        sortBooks();
        save();
        return b;
    }

    // 책을 지우면 읽기 기록도 지운다. 독서 일지는 글을 잃지 않도록 책 제목만 남기고 둔다.
    function deleteBook(id) {
        const b = book(id);
        data.books = data.books.filter(x => x.id !== id);
        delete data.reading[id];
        data.journal.forEach(e => {
            if (e.bookId === id) {
                e.bookId = '';
                e.bookTitle = b ? b.title : e.bookTitle;
            }
        });
        save();
    }

    // CSV로 읽은 책들을 목록과 비교한다: 새 책 / 정보가 갱신될 책 / 파일에 없는 기존 책
    function planImport(rows) {
        const existing = new Map(data.books.map(b => [matchKey(b.title, b.author), b]));
        const seen = new Set();
        const plan = { add: [], update: [], missing: [] };
        rows.forEach(row => {
            const key = matchKey(row.title, row.author);
            if (seen.has(key)) return;
            seen.add(key);
            const same = existing.get(key);
            if (same) plan.update.push({ id: same.id, fields: row });
            else plan.add.push(row);
        });
        plan.missing = data.books.filter(b => !seen.has(matchKey(b.title, b.author)));
        return plan;
    }

    // mode: 'merge' 기존 책은 두고 새 책 추가·정보 갱신 / 'replace' 파일에 없는 책은 지움
    function applyImport(plan, mode) {
        plan.update.forEach(({ id, fields }) => {
            const b = book(id);
            Object.assign(b, cleanBook({ ...b, ...fields }, id));
        });
        plan.add.forEach(fields => data.books.push(cleanBook({ ...fields, no: fields.no || nextNumber() }, uid())));
        save();
        if (mode === 'replace') plan.missing.forEach(b => deleteBook(b.id));
        sortBooks();
        save();
    }

    // ---- 읽기 기록 --------------------------------------------------------
    function setRecord(id, fields) {
        data.reading[id] = { ...(data.reading[id] || {}), ...fields };
        save();
        return data.reading[id];
    }

    function clearRecord(id) {
        delete data.reading[id];
        save();
    }

    // ---- 독서 일지 --------------------------------------------------------
    function addEntry(fields) {
        const entry = { id: uid(), createdAt: Date.now(), page: '', ...fields };
        entry.bookTitle = entry.bookId ? (book(entry.bookId) || {}).title || '' : '';
        data.journal.push(entry);
        save();
        return entry;
    }

    function updateEntry(id, fields) {
        const entry = data.journal.find(e => e.id === id);
        Object.assign(entry, fields);
        entry.bookTitle = entry.bookId ? (book(entry.bookId) || {}).title || '' : entry.bookTitle;
        save();
        return entry;
    }

    function deleteEntry(id) {
        data.journal = data.journal.filter(e => e.id !== id);
        save();
    }

    // ---- 백업 · 복원 ------------------------------------------------------
    const BACKUP_APP = 'books100';
    const BACKUP_VERSION = 3;

    function exportData() {
        return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
    }

    function markBackedUp() {
        data.settings.lastBackup = today();
        save();
    }

    // 백업 파일을 읽어 지금 모양의 데이터로 바꾼다. 이 앱의 백업이 아니면 null.
    // 버전 1 백업에는 독서 일지가 없으므로 hasJournal 로 알려 준다.
    function parseBackup(json) {
        if (!json || json.app !== BACKUP_APP) return null;
        if (json.version >= 3 && json.data && Array.isArray(json.data.books)) {
            return { next: { ...empty(), ...json.data, schema: SCHEMA }, hasJournal: true };
        }
        if (Array.isArray(json.books) && json.reading && typeof json.reading === 'object') {
            const hasJournal = Array.isArray(json.journal);
            return { next: fromLegacy(json.books, json.reading, json.journal || [], data.settings), hasJournal };
        }
        return null;
    }

    function restore({ next, hasJournal }) {
        if (!hasJournal) {
            // 일지가 없는 예전 백업: 지금 일지를 제목+저자로 새 책 번호에 다시 연결해 둔다
            const idByKey = new Map(next.books.map(b => [matchKey(b.title, b.author), b.id]));
            next.journal = data.journal.map(e => {
                const old = book(e.bookId);
                const id = old ? idByKey.get(matchKey(old.title, old.author)) || '' : '';
                return { ...e, bookId: id, bookTitle: old ? old.title : e.bookTitle };
            });
        }
        next.settings = { ...data.settings, ...next.settings };
        data = next;
        save();
    }

    load();

    return {
        STATUS, books, book, record, journal, settings, statusOf, lastPage, progressOf,
        entriesOf, bookTitleOf, nextNumber, findSame, addBook, updateBook, deleteBook,
        planImport, applyImport, setRecord, clearRecord, addEntry, updateEntry, deleteEntry,
        exportData, markBackedUp, parseBackup, restore, reload: load
    };
})();
