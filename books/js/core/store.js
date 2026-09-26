// 데이터 저장소: 책 목록, 읽기 기록, 독서 일지를 한곳에서 읽고 쓴다.
// 화면 코드는 localStorage를 직접 만지지 않고 반드시 App.store를 거친다.
//
// 저장 모양 (schema 2)
// {
//   schema: 2,
//   books:   [{ id, no, title, originalTitle, author, publisher, year, genre, country, pages, summary }],
//   reading: { [bookId]: { start, due, done, rating, review } },
//   journal: [{ id, date, bookId, bookTitle, content, page, createdAt, updatedAt }],
//   settings:{ lastBackup },
//   deleted: { books: {id: 지운 시각}, reading: {bookId: 시각}, journal: {id: 시각} }
// }
// 책·읽기 기록·일지에는 마지막으로 고친 시각(updatedAt)이 붙는다.
// updatedAt 과 deleted 는 두 기기의 백업을 "합쳐서 복원"할 때 어느 쪽이 최신인지 가리는 데 쓴다.
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
    // 마지막으로 읽거나 쓴 저장소 내용. 다른 창(크롬 탭과 홈 화면 앱 등)이 바꿨는지 비교하는 데 쓴다.
    let lastRaw = null;

    function empty() {
        return { schema: SCHEMA, books: [], reading: {}, journal: [], settings: {}, deleted: emptyDeleted() };
    }

    function emptyDeleted() {
        return { books: {}, reading: {}, journal: {} };
    }

    // 저장된 데이터에 빠진 칸이 있으면 채운다 (예전에 저장한 데이터·백업 파일용)
    function complete(raw) {
        const next = { ...empty(), ...raw, schema: SCHEMA };
        next.deleted = { ...emptyDeleted(), ...(raw.deleted || {}) };
        return next;
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
        const raw = localStorage.getItem(KEY);
        let saved = null;
        try { saved = raw ? JSON.parse(raw) : null; } catch (err) { saved = null; }
        if (saved && saved.schema === SCHEMA) {
            data = complete(saved);
            lastRaw = raw;
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
        const raw = JSON.stringify(data);
        localStorage.setItem(KEY, raw);
        lastRaw = raw;
    }

    // 다른 창이 저장소를 바꿨으면 다시 읽는다. 바뀌었으면 true.
    // 화면을 그리기 전과 무언가를 저장하기 전에 반드시 부른다 (예전 기록으로 덮어쓰지 않도록).
    function sync() {
        if (localStorage.getItem(KEY) === lastRaw) return false;
        load();
        return true;
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
        sync();
        const b = cleanBook({ ...fields, no: fields.no || nextNumber() }, uid());
        b.updatedAt = Date.now();
        data.books.push(b);
        save();
        return b;
    }

    function sortBooks() {
        data.books.sort((a, b) => numberOf(a) - numberOf(b));
    }

    function updateBook(id, fields) {
        sync();
        const b = book(id);
        // 번호를 비우면 원래 번호를 그대로 둔다
        Object.assign(b, cleanBook({ ...b, ...fields, no: fields.no || b.no }, id), { updatedAt: Date.now() });
        sortBooks();
        save();
        return b;
    }

    // 책을 지우면 읽기 기록도 지운다. 독서 일지는 글을 잃지 않도록 책 제목만 남기고 둔다.
    function deleteBook(id) {
        sync();
        const b = book(id);
        data.books = data.books.filter(x => x.id !== id);
        delete data.reading[id];
        data.deleted.books[id] = Date.now();
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
        sync();
        const now = Date.now();
        plan.update.forEach(({ id, fields }) => {
            const b = book(id);
            if (b) Object.assign(b, cleanBook({ ...b, ...fields }, id), { updatedAt: now });
        });
        plan.add.forEach(fields => data.books.push({ ...cleanBook({ ...fields, no: fields.no || nextNumber() }, uid()), updatedAt: now }));
        save();
        if (mode === 'replace') plan.missing.forEach(b => { if (book(b.id)) deleteBook(b.id); });
        sortBooks();
        save();
    }

    // ---- 읽기 기록 --------------------------------------------------------
    function setRecord(id, fields) {
        sync();
        data.reading[id] = { ...(data.reading[id] || {}), ...fields, updatedAt: Date.now() };
        save();
        return data.reading[id];
    }

    function clearRecord(id) {
        sync();
        delete data.reading[id];
        data.deleted.reading[id] = Date.now();
        save();
    }

    // 다른 책으로 잘못 기록했을 때: 읽기 기록과 독서 일지를 다른 책으로 옮긴다.
    // 옮긴 뒤 원래 책은 "읽기 전"이 된다. 다른 기기와 합칠 때도 옮긴 결과가 남도록 시각을 새로 찍는다.
    function moveRecords(fromId, toId, { record = true, journal = true } = {}) {
        sync();
        const now = Date.now();
        const target = book(toId);
        const moved = { record: false, entries: 0 };
        if (!target || fromId === toId) return moved;
        if (record && data.reading[fromId]) {
            data.reading[toId] = { ...data.reading[fromId], updatedAt: now };
            delete data.reading[fromId];
            data.deleted.reading[fromId] = now;
            moved.record = true;
        }
        if (journal) {
            data.journal.forEach(e => {
                if (e.bookId !== fromId) return;
                Object.assign(e, { bookId: toId, bookTitle: target.title, updatedAt: now });
                moved.entries++;
            });
        }
        save();
        return moved;
    }

    // ---- 독서 일지 --------------------------------------------------------
    function addEntry(fields) {
        sync();
        const entry = { id: uid(), createdAt: Date.now(), page: '', ...fields };
        entry.updatedAt = entry.createdAt;
        entry.bookTitle = entry.bookId ? (book(entry.bookId) || {}).title || '' : '';
        data.journal.push(entry);
        save();
        return entry;
    }

    function updateEntry(id, fields) {
        sync();
        const entry = data.journal.find(e => e.id === id);
        Object.assign(entry, fields, { updatedAt: Date.now() });
        entry.bookTitle = entry.bookId ? (book(entry.bookId) || {}).title || '' : entry.bookTitle;
        save();
        return entry;
    }

    function deleteEntry(id) {
        sync();
        data.journal = data.journal.filter(e => e.id !== id);
        data.deleted.journal[id] = Date.now();
        save();
    }

    // ---- 백업 · 복원 ------------------------------------------------------
    const BACKUP_APP = 'books100';
    const BACKUP_VERSION = 3;

    function exportData() {
        sync();
        return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
    }

    function markBackedUp() {
        sync();
        data.settings.lastBackup = today();
        save();
    }

    // 백업 파일을 읽어 지금 모양의 데이터로 바꾼다. 이 앱의 백업이 아니면 null.
    // 버전 1 백업에는 독서 일지가 없으므로 hasJournal 로 알려 준다.
    function parseBackup(json) {
        if (!json || json.app !== BACKUP_APP) return null;
        if (json.version >= 3 && json.data && Array.isArray(json.data.books)) {
            return { next: complete(json.data), hasJournal: true };
        }
        if (Array.isArray(json.books) && json.reading && typeof json.reading === 'object') {
            const hasJournal = Array.isArray(json.journal);
            return { next: fromLegacy(json.books, json.reading, json.journal || [], data.settings), hasJournal };
        }
        return null;
    }

    function restore({ next, hasJournal }) {
        sync();
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

    // ---- 합쳐서 복원 ------------------------------------------------------
    // 지금 데이터(local)에 백업(incoming)을 합친 결과를 만든다. 지금 데이터는 바꾸지 않는다.
    // 규칙: 한쪽에만 있으면 더하고, 둘 다 있으면 더 최근에 고친 쪽을 남기고,
    //       한쪽에서 지운 것(deleted)은 지운 뒤에 고친 적이 없으면 지운다.
    function mergeData(localData, incomingData) {
        const local = JSON.parse(JSON.stringify(localData));
        const incoming = complete(JSON.parse(JSON.stringify(incomingData)));
        const summary = { booksAdded: 0, booksUpdated: 0, recordsAdded: 0, recordsUpdated: 0, entriesAdded: 0, entriesUpdated: 0, removed: 0 };
        const stamp = item => (item && (item.updatedAt || item.createdAt)) || 0;

        // 지운 기록은 양쪽 것을 모두 모은다 (더 늦은 시각)
        const deleted = emptyDeleted();
        ['books', 'reading', 'journal'].forEach(kind => {
            [local.deleted[kind], incoming.deleted[kind]].forEach(list => {
                Object.entries(list || {}).forEach(([id, time]) => { deleted[kind][id] = Math.max(deleted[kind][id] || 0, time); });
            });
        });
        const isDeleted = (kind, id, item) => deleted[kind][id] !== undefined && deleted[kind][id] >= stamp(item);

        // 1) 책: id가 같거나, 제목+저자가 같으면 같은 책
        const idMap = new Map();
        const byId = new Map(local.books.map(b => [b.id, b]));
        const byKey = new Map(local.books.map(b => [matchKey(b.title, b.author), b]));
        const usedNumbers = new Set(local.books.map(b => b.no));
        let maxNumber = Math.max(0, ...local.books.map(numberOf).filter(isFinite));
        incoming.books.forEach(ib => {
            if (isDeleted('books', ib.id, ib)) return;
            const lb = byId.get(ib.id) || byKey.get(matchKey(ib.title, ib.author));
            if (lb) {
                idMap.set(ib.id, lb.id);
                if (stamp(ib) > stamp(lb)) {
                    Object.assign(lb, { ...ib, id: lb.id });
                    summary.booksUpdated++;
                } else {
                    // 지금 정보를 두고, 비어 있는 칸만 채운다
                    let filled = false;
                    BOOK_FIELDS.forEach(f => { if (!lb[f] && ib[f]) { lb[f] = ib[f]; filled = true; } });
                    if (filled) summary.booksUpdated++;
                }
                return;
            }
            const nb = { ...ib };
            if (!nb.no || usedNumbers.has(nb.no)) nb.no = String(++maxNumber);
            else maxNumber = Math.max(maxNumber, numberOf(nb) === Infinity ? 0 : numberOf(nb));
            usedNumbers.add(nb.no);
            local.books.push(nb);
            byId.set(nb.id, nb);
            byKey.set(matchKey(nb.title, nb.author), nb);
            idMap.set(ib.id, nb.id);
            summary.booksAdded++;
        });

        // 2) 읽기 기록: 더 최근에 저장한 쪽. 시각이 없으면 더 진행된 쪽(완독 > 읽는 중)
        const rank = r => (r.done ? 2 : r.start ? 1 : 0);
        const newer = (a, b) => (a.updatedAt && b.updatedAt ? a.updatedAt > b.updatedAt : rank(a) > rank(b));
        Object.entries(incoming.reading).forEach(([iid, ir]) => {
            const id = idMap.get(iid);
            if (!id || !ir || !ir.start || isDeleted('reading', id, ir)) return;
            const lr = local.reading[id];
            if (!lr) {
                local.reading[id] = ir;
                summary.recordsAdded++;
            } else if (newer(ir, lr)) {
                local.reading[id] = { ...ir, rating: ir.rating || lr.rating || 0, review: ir.review || lr.review || '' };
                summary.recordsUpdated++;
            } else if ((!lr.rating && ir.rating) || (!lr.review && ir.review)) {
                lr.rating = lr.rating || ir.rating;
                lr.review = lr.review || ir.review;
                summary.recordsUpdated++;
            }
        });

        // 3) 독서 일지: 모두 모으고, 같은 일지는 더 최근에 고친 쪽
        const entryById = new Map(local.journal.map(e => [e.id, e]));
        const sameText = new Set(local.journal.map(e => `${e.date}|${e.content}`));
        incoming.journal.forEach(ie => {
            if (isDeleted('journal', ie.id, ie)) return;
            const bookId = ie.bookId ? idMap.get(ie.bookId) || '' : '';
            const entry = { ...ie, bookId, bookTitle: ie.bookTitle || '' };
            const le = entryById.get(ie.id);
            if (le) {
                if (stamp(ie) > stamp(le)) {
                    Object.assign(le, entry);
                    summary.entriesUpdated++;
                }
                return;
            }
            if (sameText.has(`${ie.date}|${ie.content}`)) return;
            local.journal.push(entry);
            entryById.set(entry.id, entry);
            sameText.add(`${ie.date}|${ie.content}`);
            summary.entriesAdded++;
        });

        // 4) 다른 기기에서 지운 것을 지금 데이터에도 반영한다
        local.books = local.books.filter(b => {
            if (!isDeleted('books', b.id, b)) return true;
            delete local.reading[b.id];
            local.journal.forEach(e => { if (e.bookId === b.id) { e.bookId = ''; e.bookTitle = b.title; } });
            summary.removed++;
            return false;
        });
        Object.keys(local.reading).forEach(id => {
            if (isDeleted('reading', id, local.reading[id])) {
                delete local.reading[id];
                summary.removed++;
            }
        });
        const before = local.journal.length;
        local.journal = local.journal.filter(e => !isDeleted('journal', e.id, e));
        summary.removed += before - local.journal.length;

        local.deleted = deleted;
        local.books.sort((a, b) => numberOf(a) - numberOf(b));
        summary.changed = Object.values(summary).some(n => n > 0);
        return { next: local, summary };
    }

    function previewMerge(parsed) {
        sync();
        return { ...mergeData(data, parsed.next), incoming: parsed.next };
    }

    function applyMerge(merged) {
        if (sync()) merged = { ...mergeData(data, merged.incoming), incoming: merged.incoming };
        merged.next.settings = { ...data.settings };
        data = complete(merged.next);
        save();
    }

    load();

    return {
        STATUS, books, book, record, journal, settings, statusOf, lastPage, progressOf,
        entriesOf, bookTitleOf, nextNumber, findSame, addBook, updateBook, deleteBook,
        planImport, applyImport, setRecord, clearRecord, moveRecords, addEntry, updateEntry, deleteEntry,
        exportData, markBackedUp, parseBackup, restore, previewMerge, applyMerge, sync
    };
})();
