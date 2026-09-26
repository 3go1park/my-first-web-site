// 통계 계산: 홈과 통계 화면이 함께 쓴다. 새 통계는 여기에 함수를 더한다.
App.insights = (() => {
    const { today, addDays, daysBetween, parseDate, toDateText } = App.util;
    const store = App.store;

    // 일지를 쓴 날짜 → 그날 쓴 일지 수
    function entriesByDay() {
        const map = new Map();
        store.journal().forEach(e => map.set(e.date, (map.get(e.date) || 0) + 1));
        return map;
    }

    // 오늘(또는 어제)까지 며칠 연속으로 일지를 썼는지
    function currentStreak() {
        const days = entriesByDay();
        let day = days.has(today()) ? today() : addDays(today(), -1);
        let count = 0;
        while (days.has(day)) {
            count++;
            day = addDays(day, -1);
        }
        return count;
    }

    function longestStreak() {
        const dates = [...entriesByDay().keys()].sort();
        let best = 0;
        let run = 0;
        dates.forEach((date, i) => {
            run = i > 0 && daysBetween(dates[i - 1], date) === 1 ? run + 1 : 1;
            best = Math.max(best, run);
        });
        return best;
    }

    function statusCounts() {
        const counts = { none: 0, reading: 0, late: 0, done: 0 };
        store.books().forEach(b => { counts[store.statusOf(b.id)]++; });
        return counts;
    }

    // 다 읽은 책: [{ book, record }]
    function finished() {
        return store.books()
            .filter(b => store.statusOf(b.id) === 'done')
            .map(b => ({ book: b, record: store.record(b.id) }));
    }

    function finishedInYear(year) {
        return finished().filter(f => f.record.done.startsWith(String(year))).length;
    }

    // 최근 n개월의 월별 완독 수 (오래된 달부터)
    function monthlyFinished(months = 12) {
        const now = new Date();
        const list = [];
        for (let i = months - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = toDateText(d).slice(0, 7);
            list.push({ key, label: `${d.getMonth() + 1}월`, year: d.getFullYear(), count: 0 });
        }
        finished().forEach(({ record }) => {
            const item = list.find(m => m.key === record.done.slice(0, 7));
            if (item) item.count++;
        });
        return list;
    }

    // 최근 weeks주의 날짜별 일지 수 (월요일 시작, 한 주 = 7칸)
    function dailyActivity(weeks = 18) {
        const counts = entriesByDay();
        const end = parseDate(today());
        const mondayOffset = (end.getDay() + 6) % 7;
        const start = addDays(today(), -mondayOffset - (weeks - 1) * 7);
        const columns = [];
        for (let w = 0; w < weeks; w++) {
            const days = [];
            for (let d = 0; d < 7; d++) {
                const date = addDays(start, w * 7 + d);
                days.push({ date, count: counts.get(date) || 0, future: date > today() });
            }
            columns.push(days);
        }
        return columns;
    }

    // 장르별 전체 권수와 완독 수 (권수가 많은 순, 8개 넘으면 나머지는 "기타")
    function genres(limit = 8) {
        const map = new Map();
        store.books().forEach(b => {
            const name = b.genre || '장르 없음';
            const g = map.get(name) || { name, total: 0, done: 0 };
            g.total++;
            if (store.statusOf(b.id) === 'done') g.done++;
            map.set(name, g);
        });
        const list = [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
        if (list.length <= limit) return list;
        const rest = list.slice(limit - 1).reduce((o, g) => ({ name: '기타', total: o.total + g.total, done: o.done + g.done }), { name: '기타', total: 0, done: 0 });
        return [...list.slice(0, limit - 1), rest];
    }

    // 시작부터 완료까지 평균 며칠 걸렸는지
    function averageDaysToFinish() {
        const spans = finished().map(({ record }) => daysBetween(record.start, record.done) + 1).filter(n => n > 0);
        if (!spans.length) return null;
        return Math.round(spans.reduce((a, b) => a + b, 0) / spans.length);
    }

    // 완료예정일을 정한 책 중 예정일 안에 다 읽은 비율
    function onTimeRate() {
        const withDue = finished().filter(({ record }) => record.due);
        if (!withDue.length) return null;
        const onTime = withDue.filter(({ record }) => record.done <= record.due).length;
        return { percent: Math.round(onTime / withDue.length * 100), onTime, total: withDue.length };
    }

    function averageRating() {
        const rated = finished().map(({ record }) => Number(record.rating) || 0).filter(Boolean);
        if (!rated.length) return null;
        return Math.round(rated.reduce((a, b) => a + b, 0) / rated.length * 10) / 10;
    }

    function journalDaysInLast(days) {
        const from = addDays(today(), -(days - 1));
        return [...entriesByDay().keys()].filter(d => d >= from && d <= today()).length;
    }

    return {
        entriesByDay, currentStreak, longestStreak, statusCounts, finished, finishedInYear,
        monthlyFinished, dailyActivity, genres, averageDaysToFinish, onTimeRate, averageRating,
        journalDaysInLast
    };
})();
