// 할일 일정 계산: 반복 회차 만들기, 상태(진행·지연·진행전·완료·미완료) 정하기.
// 상태는 저장하지 않고 날짜와 결과 표시(완료/미완료)로 그때그때 계산한다.
//
// 반복 없음 → 시작일~종료일이 한 번의 할일 (종료일이 마감).
// 반복 있음 → 시작일부터 종료일까지(계속이면 끝없이) 하루짜리 회차가 이어진다.
//   매일 → 하루씩, 매주 → 고른 요일마다, 매월 → 같은 날(음력이면 음력 같은 날),
//   매년 → 같은 달 같은 날(음력이면 음력 같은 달 같은 날). 없는 날(31일, 음력 30일)은 그달 마지막 날.
// 회차 결과: 완료(done) 또는 미완료(missed, 하지 못하고 끝냄). 결과가 없는데 날짜가 지나면 지연.
App.schedule = (() => {
    const { addDays, addMonths, weekday, today, formatDate, WEEKDAYS } = App.util;
    const lunar = App.lunar;

    const STATUS = {
        doing: '진행',
        late: '지연',
        before: '진행전',
        done: '완료',
        missed: '미완료'
    };
    const STATUS_ORDER = ['doing', 'late', 'before', 'done', 'missed'];
    const REPEAT = { none: '없음', daily: '매일', weekly: '매주', monthly: '매월', yearly: '매년' };
    const LIMIT = 20000;   // 끝없는 반복에서도 멈추도록

    const lastDay = t => (t.repeat === 'none' || t.endless ? '9999-12-31' : t.end);

    // 회차 시작일을 차례로 내놓는다 (종료일까지)
    function* starts(t) {
        if (t.repeat === 'none') { yield t.start; return; }
        const end = lastDay(t);
        if (t.repeat === 'daily') {
            for (let d = t.start, i = 0; d <= end && i < LIMIT; d = addDays(d, 1), i++) yield d;
            return;
        }
        if (t.repeat === 'weekly') {
            const days = t.weekdays.length ? t.weekdays : [weekday(t.start)];
            for (let d = t.start, i = 0; d <= end && i < LIMIT * 7; d = addDays(d, 1), i++) {
                if (days.includes(weekday(d))) yield d;
            }
            return;
        }
        if (t.calendar === 'lunar' && lunar.supported()) {
            for (const d of lunarStarts(t)) {
                if (d > end) return;
                yield d;
            }
            return;
        }
        const day = Number(t.start.slice(8));
        const step = t.repeat === 'monthly' ? 1 : 12;
        for (let k = 0; k < LIMIT; k++) {
            const d = addMonths(t.start, k * step, day);
            if (d > end) return;
            yield d;
        }
    }

    // 음력 반복: 다음 회차 근처로 건너뛴 뒤 하루씩 넘기며 음력 날짜가 맞는 날을 찾는다
    function* lunarStarts(t) {
        const base = lunar.fromSolar(t.start);
        const matches = d => {
            const l = lunar.fromSolar(d);
            if (t.repeat === 'yearly' && (l.month !== base.month || l.leap)) return false;
            return l.day === base.day || (l.day < base.day && lunar.isMonthEnd(d));
        };
        yield t.start;
        let d = t.start;
        const jump = t.repeat === 'monthly' ? 27 : 350;
        for (let k = 0; k < LIMIT; k++) {
            d = addDays(d, jump);
            let guard = 0;
            while (!matches(d) && guard++ < 60) d = addDays(d, 1);
            if (guard > 60) return;
            yield d;
        }
    }

    // 회차 시작일 목록 (until 까지 + 그 뒤 extra 개). 같은 할일은 기억해 둔다.
    const cache = new Map();
    function startsUntil(t, until, extra = 0) {
        const key = [t.id, t.start, t.end, t.repeat, t.weekdays.join(''), t.endless, t.calendar, until, extra].join('|');
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

    // 회차의 결과: 'done' | 'missed' | ''
    function resultOf(t, start) {
        if (t.missed && t.missed[start]) return 'missed';
        if (t.done && t.done[start]) return 'done';
        return '';
    }

    function occurrence(t, start, now = today()) {
        const end = t.repeat === 'none' ? t.end : start;
        const result = resultOf(t, start);
        const status = result || (now < start ? 'before' : now > end ? 'late' : 'doing');
        return { todo: t, start, end, result, done: result === 'done', missed: result === 'missed', status };
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
    //   오늘이 걸친 회차가 있으면 → 그 회차의 결과(완료/미완료), 없으면 진행
    //   없으면 → 결과 없이 지난 회차가 있으면 지연, 다음 회차가 있으면 진행전, 다 끝났으면 마지막 결과
    // focus: 목록에서 결과를 표시할 회차, overdue: 결과 없이 지난 회차 수
    function stateOf(t, now = today()) {
        const list = occurrences(t, now, 1, now);
        const past = list.filter(o => o.end < now);
        const covering = list.filter(o => o.start <= now && o.end >= now);
        const next = list.find(o => o.start > now) || null;
        const open = past.filter(o => !o.result);
        let focus;
        if (covering.length) focus = covering.find(o => !o.result) || covering[covering.length - 1];
        else if (open.length) focus = open[open.length - 1];
        else focus = next || past[past.length - 1] || list[0];
        const started = list.filter(o => o.start <= now);
        return {
            status: focus.status,
            focus,
            next,
            overdue: open.length,
            doneCount: started.filter(o => o.done).length,
            missedCount: started.filter(o => o.missed).length
        };
    }

    // "매주 월·수·금 · ~2026.12.31", "반복 없음"
    function repeatText(t) {
        if (t.repeat === 'none') return '반복 없음';
        let text = REPEAT[t.repeat];
        if (t.repeat === 'weekly') {
            const days = t.weekdays.length ? t.weekdays : [weekday(t.start)];
            text += ' ' + days.map(d => WEEKDAYS[d]).join('·');
        }
        if (t.calendar === 'lunar' && ['monthly', 'yearly'].includes(t.repeat)) text += ' (음력)';
        return `${text} · ${t.endless ? '계속' : `~${formatDate(t.end)}`}`;
    }

    return {
        STATUS, STATUS_ORDER, REPEAT, occurrence, occurrences, occurrencesOn, occurrencesIn,
        stateOf, repeatText, startsUntil, resultOf
    };
})();
