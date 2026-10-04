// 음력 날짜: 브라우저에 들어 있는 한국 음력 달력(Intl 'dangi')으로 양력 → 음력을 바꾼다.
// 음력 → 양력은 하루씩 넘기며 찾는다 (schedule.js 에서 사용). 한 번 바꾼 날짜는 기억해 둔다.
App.lunar = (() => {
    const cache = new Map();
    let format = null;

    function formatter() {
        if (format === null) {
            try {
                format = new Intl.DateTimeFormat('en-u-ca-dangi', {
                    year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC'
                });
                if (format.resolvedOptions().calendar !== 'dangi') format = false;
            } catch (err) {
                format = false;
            }
        }
        return format;
    }

    // 이 브라우저가 음력을 계산할 수 있는지
    function supported() {
        return Boolean(formatter());
    }

    // "2026-10-04" → { year: 2026, month: 8, day: 24, leap: false }  (못 바꾸면 null)
    function fromSolar(text) {
        if (cache.has(text)) return cache.get(text);
        const f = formatter();
        if (!f) return null;
        const [y, m, d] = text.split('-').map(Number);
        const parts = {};
        f.formatToParts(new Date(Date.UTC(y, m - 1, d))).forEach(p => { parts[p.type] = p.value; });
        const result = {
            year: Number(parts.relatedYear || parts.year),
            month: parseInt(parts.month, 10),
            day: parseInt(parts.day, 10),
            leap: /\D/.test(parts.month)   // "6bis" = 윤6월
        };
        cache.set(text, result);
        return result;
    }

    // 그 날이 음력 달의 마지막 날인지 (다음 날이 음력 1일)
    function isMonthEnd(text) {
        const next = fromSolar(App.util.addDays(text, 1));
        return Boolean(next && next.day === 1);
    }

    // "음력 8월 24일", 윤달은 "음력 윤6월 1일"
    function label(text) {
        const l = fromSolar(text);
        return l ? `음력 ${l.leap ? '윤' : ''}${l.month}월 ${l.day}일` : '';
    }

    return { supported, fromSolar, isMonthEnd, label };
})();
