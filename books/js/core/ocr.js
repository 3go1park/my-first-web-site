// 글자 인식(OCR): 사진(책 페이지, 종이 일기장 등)에서 글자를 읽는다. 두 가지 방법이 있다.
//  - 'google': Google Cloud Vision (손글씨 한글도 잘 읽는다). 사용자가 만든 API 키가 필요하고,
//    사진이 Google 로 보내진다. 키는 이 기기(localStorage)에만 저장한다.
//  - 'basic' : 무료 오픈소스 Tesseract.js(한국어+영어). 사진을 밖으로 보내지 않지만 인쇄된 글자만
//    쓸 만하고 손글씨는 거의 못 읽는다. 인식 프로그램과 언어 데이터(약 8MB)는 처음 쓸 때 한 번 내려받는다.
// (books 와 life 가 같은 파일을 쓴다) Tesseract 버전을 올릴 때는 아래 VERSION만 바꾼다.
App.ocr = (() => {
    const VERSION = '7.0.0';
    const CDN = 'https://cdn.jsdelivr.net/npm';
    const SCRIPT = `${CDN}/tesseract.js@${VERSION}/dist/tesseract.min.js`;
    const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
    const SETTINGS_KEY = 'ocr.settings';
    let workerPromise = null;
    let progressHandler = null;

    // ---- 설정 (인식 방법, API 키) ------------------------------------------
    function getSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            const key = typeof saved.key === 'string' ? saved.key.trim() : '';
            return { engine: saved.engine === 'google' ? 'google' : 'basic', key };
        } catch {
            return { engine: 'basic', key: '' };
        }
    }

    function saveSettings(next) {
        const merged = { ...getSettings(), ...next };
        merged.key = (merged.key || '').trim();
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged)); } catch { /* 저장 못 해도 이번에는 쓴다 */ }
        return merged;
    }

    // ---- Google Cloud Vision ------------------------------------------------
    async function recognizeGoogle(canvas, key, onProgress) {
        if (!key) throw new Error('Google Vision API 키를 먼저 넣어 주세요.');
        const report = (step, percent) => onProgress && onProgress({ step, percent });
        report('사진 보내는 중', 20);
        const content = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
        let response;
        try {
            response = await fetch(`${VISION_URL}?key=${encodeURIComponent(key)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requests: [{
                        image: { content },
                        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                        imageContext: { languageHints: ['ko', 'en'] }
                    }]
                })
            });
        } catch {
            throw new Error('Google 에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
        }
        report('글자 읽는 중', 70);
        const data = await response.json().catch(() => ({}));
        const error = (data && data.error) || (data.responses && data.responses[0] && data.responses[0].error);
        if (!response.ok || error) throw new Error(visionMessage(response.status, error));
        report('정리하는 중', 100);
        const result = (data.responses && data.responses[0]) || {};
        const text = (result.fullTextAnnotation && result.fullTextAnnotation.text)
            || (result.textAnnotations && result.textAnnotations[0] && result.textAnnotations[0].description)
            || '';
        return joinLines(text);
    }

    // Google 오류를 알아듣기 쉬운 말로
    function visionMessage(status, error) {
        const raw = `${(error && error.message) || ''} ${(error && error.status) || ''}`;
        if (/API key not valid|API_KEY_INVALID/i.test(raw)) return 'API 키가 맞지 않아요. 키를 다시 복사해서 넣어 주세요.';
        if (/billing/i.test(raw)) return 'Google Cloud 프로젝트에 결제 계정이 연결되어 있지 않아요. 결제 계정을 연결한 뒤 다시 해 주세요 (매달 1,000장까지 무료).';
        if (/has not been used|is disabled|SERVICE_DISABLED/i.test(raw)) return 'Cloud Vision API 가 켜져 있지 않아요. Google Cloud 콘솔에서 "Cloud Vision API"를 사용 설정해 주세요.';
        if (/referer|blocked|PERMISSION_DENIED/i.test(raw) || status === 403) return `이 키로는 Vision API 를 쓸 수 없어요. 키의 제한 설정을 확인해 주세요. (${(error && error.message) || status})`;
        if (status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(raw)) return '오늘 쓸 수 있는 양을 넘었어요. 잠시 뒤 다시 해 주세요.';
        return `글자를 읽지 못했어요. (${(error && error.message) || `오류 ${status}`})`;
    }

    // 손글씨는 한 줄이 문장 중간에서 끝나므로 줄을 이어 붙이고, 문장이 끝난 줄(. ! ?)에서만 줄을 바꾼다
    function joinLines(text) {
        const lines = text.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean);
        let out = '';
        lines.forEach(line => {
            if (!out) out = line;
            else out += /[.!?。]["'”’)]*$/.test(out) ? `\n${line}` : ` ${line}`;
        });
        return out.replace(/[ \t]{2,}/g, ' ').trim();
    }

    // ---- Tesseract (기본, 기기 안에서) --------------------------------------
    function loadScript() {
        if (window.Tesseract) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = SCRIPT;
            script.crossOrigin = 'anonymous';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('글자 인식 프로그램을 내려받지 못했어요. 인터넷 연결을 확인해 주세요.'));
            document.head.appendChild(script);
        });
    }

    // 인식기는 한 번 만들어 계속 쓴다 (두 번째부터는 빠르다)
    function getWorker() {
        if (!workerPromise) {
            workerPromise = loadScript()
                .then(() => window.Tesseract.createWorker(['kor', 'eng'], 1, {
                    workerPath: `${CDN}/tesseract.js@${VERSION}/dist/worker.min.js`,
                    corePath: `${CDN}/tesseract.js-core@${VERSION}`,
                    logger: m => progressHandler && progressHandler(m)
                }))
                .catch(err => {
                    workerPromise = null;
                    throw err instanceof Error ? err : new Error('글자 인식 준비에 실패했어요. 인터넷 연결을 확인해 주세요.');
                });
        }
        return workerPromise;
    }

    // Tesseract 진행 메시지를 한글 단계와 0~100 으로 바꾼다
    function describe(m) {
        const pct = Math.round((m.progress || 0) * 100);
        if (m.status === 'recognizing text') return { step: '글자 읽는 중', percent: pct };
        if (/load|download|initializ/i.test(m.status || '')) return { step: '인식 프로그램 준비 중 (처음 한 번은 약 8MB를 내려받아요)', percent: pct };
        return { step: '준비 중', percent: pct };
    }

    async function recognizeBasic(image, onProgress) {
        progressHandler = m => onProgress && onProgress(describe(m));
        try {
            const worker = await getWorker();
            const { data } = await worker.recognize(image);
            return cleanText(data.text || '');
        } finally {
            progressHandler = null;
        }
    }

    // canvas 의 글자를 읽어 문장으로 돌려준다 (설정한 방법으로)
    function recognize(canvas, onProgress) {
        const { engine, key } = getSettings();
        return engine === 'google' ? recognizeGoogle(canvas, key, onProgress) : recognizeBasic(canvas, onProgress);
    }

    // 줄 끝에서 끊긴 문장을 이어 붙이고, 빈 줄(문단)은 남긴다
    function cleanText(text) {
        return text
            .replace(/\r/g, '')
            .split(/\n\s*\n/)
            .map(paragraph => paragraph.split('\n').map(line => line.trim()).filter(Boolean).join(' '))
            .filter(Boolean)
            .join('\n\n')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
    }

    return { recognize, cleanText, joinLines, getSettings, saveSettings };
})();
