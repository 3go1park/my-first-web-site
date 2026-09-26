// 여러 화면에서 쓰는 작은 도구 모음. 모든 코드는 App 이라는 이름 아래에 모은다.
window.App = window.App || {};

App.util = (() => {
    const pad = n => String(n).padStart(2, '0');

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    // 줄바꿈을 살려서 보여준다
    function escapeMultiline(value) {
        return escapeHtml(value).replace(/\n/g, '<br>');
    }

    // Date → "2026-09-26" (탭의 현지 시간 기준)
    function toDateText(date) {
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function today() {
        return toDateText(new Date());
    }

    // "2026-09-26" → Date (현지 자정)
    function parseDate(text) {
        const [y, m, d] = text.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    function addDays(text, days) {
        const date = parseDate(text);
        date.setDate(date.getDate() + days);
        return toDateText(date);
    }

    // 두 날짜 사이의 날 수 (to - from)
    function daysBetween(from, to) {
        return Math.round((parseDate(to) - parseDate(from)) / 86400000);
    }

    // "2026-09-26" → "2026.09.26"
    function formatDate(text) {
        return text ? text.replace(/-/g, '.') : '';
    }

    // "2026-09-26" → "2026.09.26 (토)"
    function formatDay(text) {
        const weekday = parseDate(text).toLocaleDateString('ko-KR', { weekday: 'short' });
        return `${formatDate(text)} (${weekday})`;
    }

    // "3일 전", "오늘"
    function relativeDay(text) {
        const days = daysBetween(text, today());
        if (days === 0) return '오늘';
        if (days === 1) return '어제';
        return days > 0 ? `${days}일 전` : `${-days}일 뒤`;
    }

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    // 따옴표("...") 안의 쉼표와 줄바꿈도 처리하는 CSV 파서
    function parseCsv(text) {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (inQuotes) {
                if (ch === '"' && text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else if (ch === '"') {
                    inQuotes = false;
                } else {
                    field += ch;
                }
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                row.push(field);
                field = '';
            } else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && text[i + 1] === '\n') i++;
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
            } else {
                field += ch;
            }
        }
        if (field !== '' || row.length > 0) {
            row.push(field);
            rows.push(row);
        }
        return rows.filter(r => r.some(cell => cell.trim() !== ''));
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
        escapeHtml, escapeMultiline, today, toDateText, parseDate, addDays, daysBetween,
        formatDate, formatDay, relativeDay, uid, parseCsv, readFileText
    };
})();
