// 여러 화면에서 쓰는 작은 도구 모음. 모든 코드는 App 이라는 이름 아래에 모은다.
window.App = window.App || {};

App.util = (() => {
    const pad = n => String(n).padStart(2, '0');
    const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    // 줄바꿈을 살려서 보여준다
    function escapeMultiline(value) {
        return escapeHtml(value).replace(/\n/g, '<br>');
    }

    // 찾는 글자를 <mark>로 칠해서 보여준다 (줄바꿈도 살림)
    function highlightText(value, word) {
        const html = escapeMultiline(value);
        if (!word) return html;
        const safe = escapeHtml(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return html.replace(new RegExp(safe, 'gi'), m => `<mark>${m}</mark>`);
    }

    // Date → "2026-10-04" (탭의 현지 시간 기준)
    function toDateText(date) {
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function today() {
        return toDateText(new Date());
    }

    // "2026-10-04" → Date (현지 자정)
    function parseDate(text) {
        const [y, m, d] = text.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    function isDate(text) {
        return /^\d{4}-\d{2}-\d{2}$/.test(String(text || '')) && toDateText(parseDate(text)) === text;
    }

    function addDays(text, days) {
        const date = parseDate(text);
        date.setDate(date.getDate() + days);
        return toDateText(date);
    }

    // 달을 더한다. 31일 → 다음 달에 31일이 없으면 그 달 마지막 날
    function addMonths(text, months, day) {
        const [y, m, d] = text.split('-').map(Number);
        const want = day || d;
        const first = new Date(y, m - 1 + months, 1);
        const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
        first.setDate(Math.min(want, last));
        return toDateText(first);
    }

    // 두 날짜 사이의 날 수 (to - from)
    function daysBetween(from, to) {
        return Math.round((parseDate(to) - parseDate(from)) / 86400000);
    }

    function weekday(text) {
        return parseDate(text).getDay();
    }

    // 그 주의 월요일
    function startOfWeek(text) {
        return addDays(text, -((weekday(text) + 6) % 7));
    }

    function startOfMonth(text) {
        return text.slice(0, 8) + '01';
    }

    function endOfMonth(text) {
        return addDays(addMonths(startOfMonth(text), 1), -1);
    }

    // "2026-10-04" → "2026.10.04"
    function formatDate(text) {
        return text ? text.replace(/-/g, '.') : '';
    }

    // "2026-10-04" → "2026.10.04 (일)"
    function formatDay(text) {
        return `${formatDate(text)} (${WEEKDAYS[weekday(text)]})`;
    }

    // "2026-10-04" → "10월 4일 (일)"
    function formatShort(text) {
        const [, m, d] = text.split('-').map(Number);
        return `${m}월 ${d}일 (${WEEKDAYS[weekday(text)]})`;
    }

    // "3일 전", "오늘", "2일 뒤"
    function relativeDay(text) {
        const days = daysBetween(text, today());
        if (days === 0) return '오늘';
        if (days === 1) return '어제';
        if (days === -1) return '내일';
        return days > 0 ? `${days}일 전` : `${-days}일 뒤`;
    }

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    // 파일을 글자로 읽는다
    function readFileText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('파일을 읽지 못했어요. 다시 선택해 주세요.'));
            reader.readAsText(file, 'UTF-8');
        });
    }

    return {
        WEEKDAYS, escapeHtml, escapeMultiline, highlightText, today, toDateText, parseDate, isDate,
        addDays, addMonths, daysBetween, weekday, startOfWeek, startOfMonth, endOfMonth,
        formatDate, formatDay, formatShort, relativeDay, uid, readFileText
    };
})();
