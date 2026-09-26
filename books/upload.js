// CSV 파일을 읽어 책 목록으로 바꾸고, 이 기기(localStorage)에 저장한다.
const STORAGE_KEY = 'books100.books';

// 한글 항목 이름 → 저장할 때 쓰는 이름
const COLUMNS = {
    '번호': 'no',
    '제목': 'title',
    '원제': 'originalTitle',
    '저자': 'author',
    '출판사': 'publisher',
    '출간연도': 'year',
    '장르': 'genre',
    '국가': 'country',
    '한줄소개': 'summary'
};

const fileInput = document.getElementById('file-input');
const fileName = document.getElementById('file-name');
const message = document.getElementById('message');
const preview = document.getElementById('preview');
const previewSummary = document.getElementById('preview-summary');
const previewBody = document.getElementById('preview-body');
const saveButton = document.getElementById('save-button');

let parsedBooks = [];

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
    // 완전히 빈 줄은 버린다
    return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function toBooks(rows) {
    const header = rows[0].map(h => h.trim().replace(/^﻿/, ''));
    const keys = header.map(h => COLUMNS[h]);

    if (!keys.includes('title') || !keys.includes('author')) {
        throw new Error('첫 줄에 "제목"과 "저자" 항목이 있어야 해요. 양식 파일의 첫 줄을 그대로 써 주세요.');
    }

    const books = [];
    const errors = [];
    rows.slice(1).forEach((cells, index) => {
        const book = {};
        keys.forEach((key, col) => {
            if (key) book[key] = (cells[col] || '').trim();
        });
        const line = index + 2;
        if (!book.title || !book.author) {
            errors.push(line + '번째 줄: 제목 또는 저자가 비어 있어요.');
            return;
        }
        if (!book.no) book.no = String(books.length + 1);
        books.push(book);
    });
    return { books, errors };
}

function showMessage(text, type) {
    message.textContent = text;
    message.className = 'message ' + type;
    message.hidden = false;
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function showPreview(books, errors) {
    previewBody.innerHTML = books.map(b => `
        <tr>
            <td>${escapeHtml(b.no)}</td>
            <td>${escapeHtml(b.title)}</td>
            <td>${escapeHtml(b.author)}</td>
            <td>${escapeHtml(b.publisher)}</td>
            <td>${escapeHtml(b.year)}</td>
            <td>${escapeHtml(b.genre)}</td>
            <td>${escapeHtml(b.country)}</td>
        </tr>`).join('');

    let summary = `파일에서 책 ${books.length}권을 찾았어요.`;
    if (errors.length > 0) {
        summary += ` 건너뛴 줄 ${errors.length}개: ${errors.join(' / ')}`;
    }
    previewSummary.textContent = summary;
    preview.hidden = false;
}

fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    preview.hidden = true;
    message.hidden = true;
    parsedBooks = [];
    if (!file) return;

    fileName.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const rows = parseCsv(reader.result);
            if (rows.length < 2) {
                throw new Error('책 정보가 없어요. 둘째 줄부터 책을 채워 주세요.');
            }
            const { books, errors } = toBooks(rows);
            if (books.length === 0) {
                throw new Error('올바른 책 정보가 한 권도 없어요. ' + errors.join(' / '));
            }
            parsedBooks = books;
            showPreview(books, errors);
        } catch (err) {
            showMessage(err.message, 'error');
        }
    };
    reader.onerror = () => showMessage('파일을 읽지 못했어요. 다시 선택해 주세요.', 'error');
    reader.readAsText(file, 'UTF-8');
});

saveButton.addEventListener('click', () => {
    if (parsedBooks.length === 0) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && !confirm('이미 저장된 책 목록이 있어요. 새 목록으로 바꿀까요?')) return;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedBooks));
    preview.hidden = true;
    showMessage(`${parsedBooks.length}권을 저장했어요. 홈으로 돌아가 확인해 보세요.`, 'success');
});
