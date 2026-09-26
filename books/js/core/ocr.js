// 글자 인식(OCR): 책 사진에서 글자를 읽는다. 무료 오픈소스 Tesseract.js(한국어+영어)를 쓴다.
// 사진은 탭 안에서만 처리하고 밖으로 보내지 않는다. 인식 프로그램과 언어 데이터(약 8MB)는
// 처음 쓸 때 한 번 jsdelivr에서 내려받는다. 버전을 올릴 때는 아래 VERSION만 바꾼다.
App.ocr = (() => {
    const VERSION = '7.0.0';
    const CDN = 'https://cdn.jsdelivr.net/npm';
    const SCRIPT = `${CDN}/tesseract.js@${VERSION}/dist/tesseract.min.js`;
    let workerPromise = null;
    let progressHandler = null;

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

    // canvas(또는 이미지)의 글자를 읽어 문장으로 돌려준다
    async function recognize(image, onProgress) {
        progressHandler = m => onProgress && onProgress(describe(m));
        try {
            const worker = await getWorker();
            const { data } = await worker.recognize(image);
            return cleanText(data.text || '');
        } finally {
            progressHandler = null;
        }
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

    return { recognize, cleanText };
})();
