// 할일 일정 계산: 반복 회차 만들기, 상태(진행·완료·지연·진행전) 정하기.
// 상태는 저장하지 않고 날짜와 완료 표시로 그때그때 계산한다.
//
// 회차: 시작일~종료일이 한 회차. 반복하면 같은 길이로 다음 회차가 이어진다.
//   매일 → 하루씩, 매주 → 고른 요일마다, 매월 → 같은 날(음력이면 음력 같은 날),
//   매년 → 같은 달 같은 날(음력이면 음력 같은 달 같은 날). 없는 날(31일, 음력 30일)은 그달 마지막 날.
//   반복 횟수가 1이면 반복하지 않는다. 0(계속)이면 끝없이 이어진다.
App.schedule = (() => {
    const { addDays, addMonths, daysBetween, weekday, today, WEEKDAYS } = App.util;
    const lunar = App.lunar;

    const STATUS = {
        doing: '진행',
        late: '지연',
        before: '진행전',
        done: '완료'
    };
    const STATUS_ORDER = ['doing', 'late', 'before', 'done'];
    const REPEAT = { daily: '매일', weekly: '매주', monthly: '매월', yearly: '매년' };
    const LIMIT = 20000;   // 끝없는 반복에서도 멈추도록

    // 회차 시작일을 차례로 내놓는다
    function* starts(t) {
        const total = t.count || Infinity;
        let n = 0;
        const give = function* (date) { if (n < total) { n++; yield date; } };
        if (total === 1) { yield t.start; return; }

        if (t.repeat === 'daily') {
            for (let d = t.start; n < total && n < LIMIT; d = addDays(d, 1)) yield* give(d);
            return;
        }
        if (t.repeat === 'weekly') {
            const days = t.weekdays.length ? t.weekdays : [weekday(t.start)];
            for (let d = t.start, i = 0; n < total && i < LIMIT * 7; d = addDays(d, 1), i++) {
                if (days.includes(weekday(d))) yield* give(d);
            }
            return;
        }
        if (t.calendar === 'lunar' && lunar.supported()) {
            yield* lunarStarts(t, give, () => n < total);
            return;
        }
        const day = Number(t.start.slice(8));
        const step = t.repeat === 'monthly' ? 1 : 12;
        for (let k = 0; n < total && k < LIMIT; k++) yield* give(addMonths(t.start, k * step, day));
    }

    // 음력 반복: 다음 회차 근처로 건너뛴 뒤 하루씩 넘기며 음력 날짜가 맞는 날을 찾는다
    function* lunarStarts(t, give, more) {
        const base = lunar.fromSolar(t.start);
        const matches = d => {
            const l = lunar.fromSolar(d);
            if (t.repeat === 'yearly' && (l.month !== base.month || l.leap)) return false;
            return l.day === base.day || (l.day < base.day && lunar.isMonthEnd(d));
        };
        yield* give(t.start);
        let d = t.start;
        const jump = t.repeat === 'monthly' ? 27 : 350;
        for (let k = 0; more() && k < LIMIT; k++) {
            d = addDays(d, jump);
            let guard = 0;
            while (!matches(d) && guard++ < 60) d = addDays(d, 1);
            if (guard > 60) return;
            yield* give(d);
        }
    }

    // 회차 시작일 목록 (until 까지 + 그 뒤 extra 개). 같은 할일은 기억해 둔다.
    const cache = new Map();
    function startsUntil(t, until, extra = 0) {
        const key = [t.id, t.start, t.end, t.repeat, t.weekdays.join(''), t.count, t.calendar, until, extra].join('|');
        if (cache.has(key)) return cache.get(key);
        const list = [];
        let after = 0;
        for (const s of starts(t)) {
            if (s > until && ++after > extra) break;
            list.push(s);
        }
        if (cache.size > 2000) cache.clear();
        cache.set(key, list);
        return list;
    }

    const length = t => daysBetween(t.start, t.end);

    function occurrence(t, start, now = today()) {
        const end = addDays(start, length(t));
        const done = Boolean(t.done[start]);
        const status = done ? 'done' : now < start ? 'before' : now > end ? 'late' : 'doing';
        return { todo: t, start, end, done, status };
    }

    // until 까지 시작하는 회차들
    function occurrences(t, until, extra = 0, now = today()) {
        return startsUntil(t, until, extra).map(s => occurrence(t, s, now));
    }

    // 그 날에 걸쳐 있는 회차들
    function occurrencesOn(t, date) {
        return occurrences(t, date).filter(o => o.end >= date);
    }

    // 기간 [from, to] 와 겹치는 회차들
    function occurrencesIn(t, from, to) {
        return occurrences(t, to).filter(o => o.end >= from);
    }

    // 할일 하나의 지금 상태
    //   오늘이 걸친 회차가 있으면 → 그 회차가 완료면 완료, 아니면 진행
    //   없으면 → 지난 회차를 못 했으면 지연, 다음 회차가 있으면 진행전, 다 끝났으면 완료
    // focus: 목록에서 체크할 회차, missed: 못 한 지난 회차 수
    function stateOf(t, now = today()) {
        const list = occurrences(t, now, 1, now);
        const past = list.filter(o => o.end < now);
        const covering = list.filter(o => o.start <= now && o.end >= now);
        const next = list.find(o => o.start > now) || null;
        const missed = past.filter(o => !o.done).length;
        const doneCount = list.filter(o => o.done && o.start <= now).length;
        let focus;
        if (covering.length) focus = covering.find(o => !o.done) || covering[covering.length - 1];
        else if (past.length && !past[past.length - 1].done) focus = past[past.length - 1];
        else focus = next || past[past.length - 1] || list[0];
        const total = t.count || null;
        return { status: focus.status, focus, next, missed, doneCount, total };
    }

    // "매주 월·수·금 · 10회 · 음력"
    function repeatText(t) {
        if (t.count === 1) return '한 번';
        let text = REPEAT[t.repeat];
        if (t.repeat === 'weekly') {
            const days = t.weekdays.length ? t.weekdays : [weekday(t.start)];
            text += ' ' + days.map(d => WEEKDAYS[d]).join('·');
        }
        if (t.calendar === 'lunar' && ['monthly', 'yearly'].includes(t.repeat)) text += ' (음력)';
        return `${text} · ${t.count ? `${t.count}회` : '계속'}`;
    }

    return {
        STATUS, STATUS_ORDER, REPEAT, occurrence, occurrences, occurrencesOn, occurrencesIn,
        stateOf, repeatText, startsUntil
    };
})();
