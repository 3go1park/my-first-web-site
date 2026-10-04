// 데이터 저장소: 할일과 일기를 한곳에서 읽고 쓴다.
// 화면 코드는 localStorage를 직접 만지지 않고 반드시 App.store를 거친다.
//
// 저장 모양 (schema 1)
// {
//   schema: 1,
//   todos:   [{ id, title, memo, start, end, repeat, weekdays, count, calendar, done, createdAt, updatedAt }],
//   diary:   [{ id, date, mood, content, createdAt, updatedAt }],
//   settings:{ lastBackup },
//   deleted: { todos: {id: 지운 시각}, diary: {id: 시각} }
// }
// 할일: repeat = 'daily' | 'weekly' | 'monthly' | 'yearly', weekdays = [0(일)~6(토)],
//       count = 반복 횟수 (0 = 계속), calendar = 'solar'(양력) | 'lunar'(음력),
//       done = { [그 회차의 시작일]: 완료한 시각 }
// 일기는 하루에 하나. updatedAt 과 deleted 는 "합쳐서 복원"할 때 어느 쪽이 최신인지 가리는 데 쓴다.
App.store = (() => {
    const { uid, today, isDate } = App.util;
    const KEY = 'dailylife.data';
    const SCHEMA = 1;
    const BACKUP_APP = 'daily-life';
    const BACKUP_VERSION = 1;
    const REPEATS = ['daily', 'weekly', 'monthly', 'yearly'];

    let data = null;
    // 마지막으로 읽거나 쓴 저장소 내용. 다른 창(크롬 탭과 홈 화면 앱 등)이 바꿨는지 비교하는 데 쓴다.
    let lastRaw = null;

    function empty() {
        return { schema: SCHEMA, todos: [], diary: [], settings: {}, deleted: { todos: {}, diary: {} } };
    }

    // 빠진 칸을 채우고 이상한 값은 고친다 (예전 데이터·백업 파일용)
    function complete(raw) {
        const next = { ...empty(), ...raw, schema: SCHEMA };
        next.deleted = { todos: {}, diary: {}, ...(raw.deleted || {}) };
        next.todos = (Array.isArray(next.todos) ? next.todos : []).filter(t => t && t.id).map(t => cleanTodo(t, t));
        next.diary = (Array.isArray(next.diary) ? next.diary : []).filter(d => d && d.id && isDate(d.date));
        next.settings = { ...(raw.settings || {}) };
        return next;
    }

    function cleanTodo(raw, base = {}) {
        const start = isDate(raw.start) ? raw.start : today();
        const end = isDate(raw.end) && raw.end >= start ? raw.end : start;
        const count = Math.max(0, Math.min(9999, parseInt(raw.count, 10) || 0));
        return {
            id: base.id || uid(),
            title: String(raw.title || '').trim(),
            memo: String(raw.memo || '').trim(),
            start,
            end,
            repeat: REPEATS.includes(raw.repeat) ? raw.repeat : 'daily',
            weekdays: [...new Set((raw.weekdays || []).map(Number).filter(n => n >= 0 && n <= 6))].sort(),
            count: raw.count === 0 || raw.count === '0' ? 0 : count || 1,
            calendar: raw.calendar === 'lunar' ? 'lunar' : 'solar',
            done: { ...(base.done || {}) },
            createdAt: base.createdAt || Date.now(),
            updatedAt: base.updatedAt || Date.now()
        };
    }

    function load() {
        const raw = localStorage.getItem(KEY);
        let saved = null;
        try { saved = raw ? JSON.parse(raw) : null; } catch (err) { saved = null; }
        data = saved && saved.schema === SCHEMA ? complete(saved) : empty();
        lastRaw = raw;
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

    // ---- 할일 ------------------------------------------------------------
    const todos = () => data.todos;
    const todo = id => data.todos.find(t => t.id === id) || null;

    // fields: { title, memo, start, end, repeat, weekdays, count, calendar }
    function saveTodo(fields, id) {
        sync();
        const old = id ? todo(id) : null;
        const next = cleanTodo(fields, old ? { ...old, updatedAt: Date.now() } : {});
        if (old) Object.assign(old, next);
        else data.todos.push(next);
        save();
        return old || next;
    }

    function deleteTodo(id) {
        sync();
        data.todos = data.todos.filter(t => t.id !== id);
        data.deleted.todos[id] = Date.now();
        save();
    }

    // 한 회차(시작일 occStart)를 완료/완료 취소
    function setDone(id, occStart, done) {
        sync();
        const t = todo(id);
        if (!t) return;
        if (done) t.done[occStart] = Date.now();
        else delete t.done[occStart];
        t.updatedAt = Date.now();
        save();
    }

    // ---- 일기 ------------------------------------------------------------
    // 최신 날짜가 먼저
    const diary = () => data.diary.slice().sort((a, b) => b.date.localeCompare(a.date));
    const diaryEntry = id => data.diary.find(d => d.id === id) || null;
    const diaryOn = date => data.diary.find(d => d.date === date) || null;

    // fields: { date, mood, content }. 같은 날 일기가 이미 있으면 그 일기를 고친다.
    function saveDiary(fields, id) {
        sync();
        const entry = (id && diaryEntry(id)) || diaryOn(fields.date);
        const clean = { date: fields.date, mood: fields.mood || '', content: String(fields.content || '').trim() };
        if (entry) {
            // 날짜를 다른 날로 옮겼는데 그날 일기가 있으면 그 일기는 지운다 (화면에서 먼저 물어봄)
            const other = diaryOn(clean.date);
            if (other && other !== entry) deleteDiaryNow(other.id);
            Object.assign(entry, clean, { updatedAt: Date.now() });
            save();
            return entry;
        }
        const created = { id: uid(), ...clean, createdAt: Date.now(), updatedAt: Date.now() };
        data.diary.push(created);
        save();
        return created;
    }

    function deleteDiaryNow(id) {
        data.diary = data.diary.filter(d => d.id !== id);
        data.deleted.diary[id] = Date.now();
    }

    function deleteDiary(id) {
        sync();
        deleteDiaryNow(id);
        save();
    }

    // ---- 설정 · 백업 ------------------------------------------------------
    const settings = () => data.settings;

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
    function parseBackup(json) {
        if (!json || json.app !== BACKUP_APP || !json.data || !Array.isArray(json.data.todos)) return null;
        return { next: complete(json.data) };
    }

    function restore({ next }) {
        sync();
        next.settings = { ...data.settings, ...next.settings };
        data = next;
        save();
    }

    // ---- 합쳐서 복원 ------------------------------------------------------
    // 지금 데이터(local)에 백업(incoming)을 합친 결과를 만든다. 지금 데이터는 바꾸지 않는다.
    // 규칙: 한쪽에만 있으면 더하고, 둘 다 있으면 더 최근에 고친 쪽을 남기고,
    //       한쪽에서 지운 것(deleted)은 지운 뒤에 고친 적이 없으면 지운다.
    //       같은 날 일기가 양쪽에 따로 있으면 두 글을 이어 붙인다.
    function mergeData(localData, incomingData) {
        const local = JSON.parse(JSON.stringify(localData));
        const incoming = complete(JSON.parse(JSON.stringify(incomingData)));
        const summary = { todosAdded: 0, todosUpdated: 0, diaryAdded: 0, diaryUpdated: 0, removed: 0 };
        const stamp = item => (item && (item.updatedAt || item.createdAt)) || 0;

        const deleted = { todos: {}, diary: {} };
        ['todos', 'diary'].forEach(kind => {
            [local.deleted[kind], incoming.deleted[kind]].forEach(list => {
                Object.entries(list || {}).forEach(([id, time]) => { deleted[kind][id] = Math.max(deleted[kind][id] || 0, time); });
            });
        });
        const isDeleted = (kind, item) => deleted[kind][item.id] !== undefined && deleted[kind][item.id] >= stamp(item);

        const todoById = new Map(local.todos.map(t => [t.id, t]));
        incoming.todos.forEach(it => {
            if (isDeleted('todos', it)) return;
            const lt = todoById.get(it.id);
            if (!lt) {
                local.todos.push(it);
                summary.todosAdded++;
            } else if (stamp(it) > stamp(lt)) {
                Object.assign(lt, it);
                summary.todosUpdated++;
            }
        });

        const diaryById = new Map(local.diary.map(d => [d.id, d]));
        const diaryByDate = new Map(local.diary.map(d => [d.date, d]));
        incoming.diary.forEach(idr => {
            if (isDeleted('diary', idr)) return;
            const same = diaryById.get(idr.id);
            if (same) {
                if (stamp(idr) > stamp(same)) {
                    diaryByDate.delete(same.date);
                    Object.assign(same, idr);
                    diaryByDate.set(same.date, same);
                    summary.diaryUpdated++;
                }
                return;
            }
            const sameDay = diaryByDate.get(idr.date);
            if (sameDay) {
                if (sameDay.content !== idr.content && !sameDay.content.includes(idr.content)) {
                    sameDay.content = [sameDay.content, idr.content].filter(Boolean).join('\n\n');
                    sameDay.mood = sameDay.mood || idr.mood;
                    sameDay.updatedAt = Math.max(stamp(sameDay), stamp(idr)) + 1;
                    summary.diaryUpdated++;
                }
                return;
            }
            local.diary.push(idr);
            diaryById.set(idr.id, idr);
            diaryByDate.set(idr.date, idr);
            summary.diaryAdded++;
        });

        // 지운 기록 반영
        const beforeCount = local.todos.length + local.diary.length;
        local.todos = local.todos.filter(t => !isDeleted('todos', t));
        local.diary = local.diary.filter(d => !isDeleted('diary', d));
        summary.removed = beforeCount - local.todos.length - local.diary.length;
        local.deleted = deleted;
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
        todos, todo, saveTodo, deleteTodo, setDone,
        diary, diaryEntry, diaryOn, saveDiary, deleteDiary,
        settings, exportData, markBackedUp, parseBackup, restore, previewMerge, applyMerge, sync
    };
})();
