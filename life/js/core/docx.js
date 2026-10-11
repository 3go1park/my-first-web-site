// 워드(.docx) 파일 만들기: 외부 프로그램 없이 탭 안에서 만든다 (인터넷이 없어도 된다).
// .docx 는 몇 개의 XML 파일을 zip 으로 묶은 것이라, 압축하지 않는(stored) zip 으로 직접 만든다.
// App.docx.build({ title, subtitle, sections: [{ heading, lines: ['문단', ...] }] }) → Uint8Array
App.docx = (() => {
    const FONT = '맑은 고딕';

    const esc = text => String(text)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 문단 하나. opts: { size(pt), bold, before/after(줄 간격, 1/20pt), color, center, border }
    function para(text, opts = {}) {
        // 순서는 워드 규칙(keepNext → pBdr → spacing → jc)을 지켜야 한다
        const pPr = [
            opts.keepNext ? '<w:keepNext/>' : '',
            opts.border ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="8A8FC4"/></w:pBdr>' : '',
            `<w:spacing w:before="${opts.before || 0}" w:after="${opts.after || 0}" w:line="${opts.line || 360}" w:lineRule="auto"/>`,
            opts.center ? '<w:jc w:val="center"/>' : ''
        ].join('');
        const rPr = [
            `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/>`,
            opts.bold ? '<w:b/>' : '',
            opts.color ? `<w:color w:val="${opts.color}"/>` : '',
            `<w:sz w:val="${(opts.size || 11) * 2}"/><w:szCs w:val="${(opts.size || 11) * 2}"/>`
        ].join('');
        const run = text ? `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>` : '';
        return `<w:p><w:pPr>${pPr}<w:rPr>${rPr}</w:rPr></w:pPr>${run}</w:p>`;
    }

    function documentXml({ title, subtitle, sections }) {
        const body = [];
        if (title) body.push(para(title, { size: 20, bold: true, center: true, after: 120 }));
        if (subtitle) body.push(para(subtitle, { size: 11, color: '666666', center: true, after: 480 }));
        sections.forEach((s, i) => {
            // 날짜 줄: 앞 일기와 넉넉히 띄우고, 아래에 가는 줄
            body.push(para(s.heading, { size: 13, bold: true, color: '2E3270', before: i ? 600 : 0, after: 160, border: true, keepNext: true }));
            const lines = s.lines.length ? s.lines : [''];
            lines.forEach(line => body.push(para(line, { size: 11, after: line ? 80 : 0 })));
        });
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
            + body.join('')
            + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1300" w:bottom="1440" w:left="1300" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>'
            + '</w:body></w:document>';
    }

    const FILES = {
        '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            + '<Default Extension="xml" ContentType="application/xml"/>'
            + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            + '</Types>',
        '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            + '</Relationships>'
    };

    // ---- 압축하지 않는 zip ------------------------------------------------
    const CRC_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c >>> 0;
        }
        return table;
    })();
    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    function zip(files) {
        const enc = new TextEncoder();
        const parts = [];
        const central = [];
        let offset = 0;
        Object.entries(files).forEach(([name, text]) => {
            const nameBytes = enc.encode(name);
            const data = enc.encode(text);
            const crc = crc32(data);
            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true);
            local.setUint16(4, 20, true);
            local.setUint16(6, 0x0800, true);          // 이름은 UTF-8
            local.setUint16(8, 0, true);               // 압축 안 함
            local.setUint16(12, 0x21, true);           // 날짜 1980-01-01
            local.setUint32(14, crc, true);
            local.setUint32(18, data.length, true);
            local.setUint32(22, data.length, true);
            local.setUint16(26, nameBytes.length, true);
            parts.push(new Uint8Array(local.buffer), nameBytes, data);

            const entry = new DataView(new ArrayBuffer(46));
            entry.setUint32(0, 0x02014b50, true);
            entry.setUint16(4, 20, true);
            entry.setUint16(6, 20, true);
            entry.setUint16(8, 0x0800, true);
            entry.setUint16(14, 0x21, true);
            entry.setUint32(16, crc, true);
            entry.setUint32(20, data.length, true);
            entry.setUint32(24, data.length, true);
            entry.setUint16(28, nameBytes.length, true);
            entry.setUint32(42, offset, true);
            central.push(new Uint8Array(entry.buffer), nameBytes);
            offset += 30 + nameBytes.length + data.length;
        });
        const centralSize = central.reduce((n, p) => n + p.length, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);
        end.setUint16(8, Object.keys(files).length, true);
        end.setUint16(10, Object.keys(files).length, true);
        end.setUint32(12, centralSize, true);
        end.setUint32(16, offset, true);
        const all = [...parts, ...central, new Uint8Array(end.buffer)];
        const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
        let at = 0;
        all.forEach(p => { out.set(p, at); at += p.length; });
        return out;
    }

    function build(doc) {
        return zip({ ...FILES, 'word/document.xml': documentXml(doc) });
    }

    return { build, MIME: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
})();
