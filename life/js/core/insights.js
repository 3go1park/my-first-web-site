// 통계 계산 (통계 화면에서 씀). 할일 회차와 일기를 날짜로 모아 센다.
App.insights = (() => {
    const { today, addDays, addMonths, startOfMonth, daysBetween } = App.util;
    const store = App.store;
    const sch = App.schedule;

    // 할일 지금 상태별 개수
    function statusCounts() {
        const counts = { doing: 0, late: 0, before: 0, done: 0 };
        store.todos().forEach(t => { counts[sch.stateOf(t).status]++; });
        return counts;
    }

    // 기간 안에 마감(종료일)인 회차들
    function occurrencesEnding(from, to) {
        const list = [];
        store.todos().forEach(t => sch.occurrencesIn(t, from, to).forEach(o => {
            if (o.end >= from && o.end <= to) list.push(o);
        }));
        return list;
    }

    // 최근 days 일 동안 마감인 회차의 완료율
    function completionRate(days) {
        const now = today();
        const list = occurrencesEnding(addDays(now, -(days - 1)), now);
        const done = list.filter(o => o.done).length;
        return { done, total: list.length, percent: list.length ? Math.round(done / list.length * 100) : null };
    }

    // 날짜별 마감 회차 (완료 / 못 함) — 최근 days 일
    function dailyTodos(days) {
        const now = today();
        const from = addDays(now, -(days - 1));
        const map = new Map();
        for (let i = 0; i < days; i++) map.set(addDays(from, i), { done: 0, open: 0 });
        occurrencesEnding(from, now).forEach(o => { map.get(o.end)[o.done ? 'done' : 'open']++; });
        return [...map.entries()].map(([date, v]) => ({ date, ...v }));
    }

    // 할일별 최근 days 일 완료율 (마감이 지난 회차 기준, 많이 한 순)
    function perTodo(days) {
        const now = today();
        const from = addDays(now, -(days - 1));
        return store.todos().map(t => {
            const list = sch.occurrencesIn(t, from, now).filter(o => o.end >= from && o.end <= now);
            const done = list.filter(o => o.done).length;
            return { todo: t, done, total: list.length, percent: list.length ? Math.round(done / list.length * 100) : 0 };
        }).filter(x => x.total).sort((a, b) => b.percent - a.percent || b.total - a.total);
    }

    // 최근 months 달의 일기 수
    function monthlyDiary(months) {
        const first = addMonths(startOfMonth(today()), -(months - 1));
        const list = [];
        for (let i = 0; i < months; i++) {
            const key = addMonths(first, i).slice(0, 7);
            list.push({ key, label: `${Number(key.slice(5))}월`, year: key.slice(0, 4), count: 0 });
        }
        const byKey = new Map(list.map(m => [m.key, m]));
        store.diary().forEach(d => { const m = byKey.get(d.date.slice(0, 7)); if (m) m.count++; });
        return list;
    }

    // 오늘(또는 어제)까지 일기를 이어 쓴 날 수
    function currentStreak() {
        const dates = new Set(store.diary().map(d => d.date));
        let d = dates.has(today()) ? today() : addDays(today(), -1);
        let n = 0;
        while (dates.has(d)) { n++; d = addDays(d, -1); }
        return n;
    }

    function longestStreak() {
        const dates = [...new Set(store.diary().map(d => d.date))].sort();
        let best = 0;
        let run = 0;
        dates.forEach((d, i) => {
            run = i && daysBetween(dates[i - 1], d) === 1 ? run + 1 : 1;
            best = Math.max(best, run);
        });
        return best;
    }

    function moodCounts() {
        const counts = new Map(App.moods.LIST.map(m => [m.key, 0]));
        store.diary().forEach(d => { if (counts.has(d.mood)) counts.set(d.mood, counts.get(d.mood) + 1); });
        return App.moods.LIST.map(m => ({ ...m, count: counts.get(m.key) }));
    }

    return { statusCounts, completionRate, dailyTodos, perTodo, monthlyDiary, currentStreak, longestStreak, moodCounts };
})();
