// 스캔 창: 사진 찍기/고르기 → (읽을 부분 고르기) → 글자 읽기 → 결과 고치기 → 넣기
// App.scan.open(options) 은 넣을 글을 돌려주고, 닫으면 null 을 돌려준다.
// options: { title, intro, tip, insertLabel } — 앱마다 다른 문구 (책 스캔 / 일기장 스캔).
// "책읽는 삶의 재미"(books)와 "하루 하루 삶의 기록"(life)이 같은 파일을 쓴다.
App.scan = (() => {
    const { icon } = App.ui;
    const MAX_SIDE = 2400;   // 너무 큰 사진은 줄여서 빠르게
    const MIN_WIDTH = 1200;  // 작은 글씨는 키워서 잘 읽히게

    function open(options = {}) {
        const text = {
            title: '책 스캔',
            intro: '읽은 책의 페이지를 찍으면 글자를 읽어 일지에 넣어 드려요.',
            tip: '잘 읽히게 하려면: 페이지를 평평하게, 밝은 곳에서, 글자가 화면을 가득 채우게 찍어 주세요.',
            insertLabel: '일지에 넣기',
            ...options
        };
        return new Promise(resolve => {
            const dialog = document.createElement('dialog');
            dialog.className = 'app-dialog scan-dialog';
            dialog.innerHTML = `
                <div class="scan-head">
                    <h3>${text.title}</h3>
                    <button type="button" class="btn-text" data-close>닫기</button>
                </div>

                <section class="scan-step" data-step="pick">
                    <p class="hint">${text.intro}</p>
                    <div class="scan-pick">
                        <label class="scan-pick-button">
                            <input type="file" accept="image/*" capture="environment" data-file>
                            ${icon('camera')}<span>사진 찍기</span>
                        </label>
                        <label class="scan-pick-button">
                            <input type="file" accept="image/*" data-file>
                            ${icon('image')}<span>사진 고르기</span>
                        </label>
                    </div>
                    <button type="button" class="btn btn-outline" data-use-photo hidden>방금 사진으로 다시 읽기</button>
                    <p class="hint small">${text.tip}</p>
                    <div class="scan-engine">
                        <p class="scan-engine-title">글자 인식 방법</p>
                        <label class="scan-engine-option">
                            <input type="radio" name="ocr-engine" value="google" data-engine>
                            <span><b>Google 손글씨 인식 (추천)</b><small>손글씨 한글도 잘 읽어요. 사진이 Google 로 보내지고, Google Cloud API 키가 필요해요 (매달 1,000장 무료).</small></span>
                        </label>
                        <label class="scan-engine-option">
                            <input type="radio" name="ocr-engine" value="basic" data-engine>
                            <span><b>기본 (탭 안에서)</b><small>사진을 밖으로 보내지 않지만, 인쇄된 글자만 읽어요. 손글씨는 거의 못 읽어요.</small></span>
                        </label>
                        <div class="scan-key" data-key-area hidden>
                            <p class="hint small" data-key-state></p>
                            <div class="scan-key-row">
                                <input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="API 키를 붙여 넣으세요 (AIza로 시작)" data-key>
                                <button type="button" class="btn btn-outline" data-save-key>키 저장</button>
                            </div>
                            <details class="scan-key-help">
                                <summary>API 키 만드는 법 (처음 한 번, 약 5분)</summary>
                                <ol>
                                    <li>console.cloud.google.com 에 구글 계정으로 들어가 새 프로젝트를 만들어요.</li>
                                    <li>위쪽 검색창에 "Cloud Vision API"를 검색해서 <b>사용</b>을 눌러요. (결제 계정 연결을 물으면 연결해요. 매달 1,000장까지는 무료예요)</li>
                                    <li>"API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키"를 눌러요.</li>
                                    <li>만든 키의 <b>API 제한사항</b>에서 "Cloud Vision API"만 고르고 저장해요. (다른 곳에 쓰이지 않게)</li>
                                    <li>키(AIza…)를 복사해서 위 칸에 붙여 넣고 <b>키 저장</b>을 눌러요. 키는 이 탭에만 저장돼요.</li>
                                </ol>
                            </details>
                        </div>
                    </div>
                </section>

                <section class="scan-step" data-step="crop" hidden>
                    <p class="hint">읽을 부분을 손가락으로 드래그해서 고르세요. 고르지 않으면 사진 전체를 읽어요.</p>
                    <div class="scan-stage"><img alt="찍은 사진" data-photo><div class="scan-box" hidden></div></div>
                    <div class="button-row">
                        <button type="button" class="btn btn-outline" data-again>다시 찍기</button>
                        <button type="button" class="btn btn-outline" data-clear-box hidden>선택 지우기</button>
                        <button type="button" class="btn btn-primary" data-read>글자 읽기</button>
                    </div>
                </section>

                <section class="scan-step" data-step="reading" hidden>
                    <p class="scan-progress-step" data-progress-step>준비 중</p>
                    <div class="progress-track"><div class="progress-fill" data-progress style="width:0%"></div></div>
                    <p class="hint small" data-reading-hint></p>
                </section>

                <section class="scan-step" data-step="result" hidden>
                    <p class="hint">읽은 글자예요. 틀린 부분을 고친 뒤 넣어 주세요.</p>
                    <textarea rows="9" data-result></textarea>
                    <p class="message error" data-error hidden></p>
                    <div class="button-row">
                        <button type="button" class="btn btn-outline" data-again>다른 사진</button>
                        <button type="button" class="btn btn-outline" data-retry hidden>다시 읽기</button>
                        <button type="button" class="btn btn-outline" data-settings hidden>인식 방법 바꾸기</button>
                        <button type="button" class="btn btn-primary" data-insert>${text.insertLabel}</button>
                    </div>
                </section>`;
            document.body.appendChild(dialog);

            const $ = sel => dialog.querySelector(sel);
            const photo = $('[data-photo]');
            const box = $('.scan-box');
            let image = null;       // 불러온 사진 (원래 크기)
            let selection = null;   // 원래 크기 기준 { x, y, w, h }

            function show(step) {
                $('[data-use-photo]').hidden = !(step === 'pick' && image);
                dialog.querySelectorAll('.scan-step').forEach(s => { s.hidden = s.dataset.step !== step; });
            }

            function finish(value) {
                dialog.close();
                dialog.remove();
                resolve(value);
            }

            // ---- 0) 인식 방법 / API 키 ----------------------------------------
            function renderEngine() {
                const { engine, key } = App.ocr.getSettings();
                dialog.querySelectorAll('[data-engine]').forEach(r => { r.checked = r.value === engine; });
                $('[data-key-area]').hidden = engine !== 'google';
                $('[data-key-state]').textContent = key
                    ? `저장된 키: ${key.slice(0, 6)}…${key.slice(-4)} (바꾸려면 새 키를 넣고 저장하세요)`
                    : 'API 키를 넣어야 Google 손글씨 인식을 쓸 수 있어요.';
                dialog.querySelector('.scan-key-help').open = !key;
            }
            dialog.querySelectorAll('[data-engine]').forEach(r => r.addEventListener('change', () => {
                App.ocr.saveSettings({ engine: r.value });
                renderEngine();
            }));
            $('[data-save-key]').addEventListener('click', () => {
                const key = $('[data-key]').value.trim();
                if (!key) return App.ui.toast('API 키를 붙여 넣어 주세요.');
                App.ocr.saveSettings({ key, engine: 'google' });
                $('[data-key]').value = '';
                renderEngine();
                App.ui.toast('API 키를 저장했어요.');
            });
            $('[data-use-photo]').addEventListener('click', () => show('crop'));
            renderEngine();

            // ---- 1) 사진 고르기 --------------------------------------------
            dialog.querySelectorAll('[data-file]').forEach(input => input.addEventListener('change', () => {
                const file = input.files[0];
                input.value = '';
                if (!file) return;
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => {
                    image = img;
                    photo.src = url;
                    selection = null;
                    box.hidden = true;
                    $('[data-clear-box]').hidden = true;
                    show('crop');
                };
                img.onerror = () => App.ui.toast('사진을 열지 못했어요. 다른 사진을 골라 주세요.');
                img.src = url;
            }));

            // ---- 2) 읽을 부분 고르기 (드래그) ------------------------------
            let start = null;
            const stage = $('.scan-stage');
            function point(event) {
                const r = photo.getBoundingClientRect();
                return {
                    x: Math.min(Math.max(event.clientX - r.left, 0), r.width),
                    y: Math.min(Math.max(event.clientY - r.top, 0), r.height),
                    r
                };
            }
            function drawBox(a, b) {
                const left = Math.min(a.x, b.x), top = Math.min(a.y, b.y);
                const width = Math.abs(a.x - b.x), height = Math.abs(a.y - b.y);
                Object.assign(box.style, { left: `${photo.offsetLeft + left}px`, top: `${photo.offsetTop + top}px`, width: `${width}px`, height: `${height}px` });
                box.hidden = false;
                const scale = image.naturalWidth / a.r.width;
                selection = { x: left * scale, y: top * scale, w: width * scale, h: height * scale };
            }
            stage.addEventListener('pointerdown', event => {
                if (!image) return;
                event.preventDefault();
                stage.setPointerCapture(event.pointerId);
                start = point(event);
            });
            stage.addEventListener('pointermove', event => {
                if (start) drawBox(start, point(event));
            });
            stage.addEventListener('pointerup', () => {
                start = null;
                // 너무 작게 고르면(실수로 톡 친 경우) 전체를 읽는다
                if (selection && (selection.w < 40 || selection.h < 20)) {
                    selection = null;
                    box.hidden = true;
                }
                $('[data-clear-box]').hidden = !selection;
            });
            $('[data-clear-box]').addEventListener('click', () => {
                selection = null;
                box.hidden = true;
                $('[data-clear-box]').hidden = true;
            });

            // 고른 부분을 잘라 크기를 맞춘다. 기본 인식은 흑백으로 바꿔야 잘 읽고,
            // Google 은 원래 색 그대로가 더 잘 읽는다.
            function prepare(engine) {
                const area = selection || { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
                let scale = Math.min(1, MAX_SIDE / Math.max(area.w, area.h));
                if (area.w * scale < MIN_WIDTH) scale = Math.min(3, MIN_WIDTH / area.w);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(area.w * scale);
                canvas.height = Math.round(area.h * scale);
                const g = canvas.getContext('2d', { willReadFrequently: true });
                if (engine !== 'google') g.filter = 'grayscale(1) contrast(1.4)';
                g.drawImage(image, area.x, area.y, area.w, area.h, 0, 0, canvas.width, canvas.height);
                return canvas;
            }

            // ---- 3) 글자 읽기 ------------------------------------------------
            $('[data-read]').addEventListener('click', async () => {
                const { engine, key } = App.ocr.getSettings();
                if (engine === 'google' && !key) {
                    show('pick');
                    App.ui.toast('Google 손글씨 인식을 쓰려면 API 키를 먼저 저장해 주세요.');
                    return;
                }
                $('[data-reading-hint]').textContent = engine === 'google'
                    ? '사진을 Google 로 보내 글자를 읽고 있어요.'
                    : '처음 한 번은 인식 프로그램을 내려받느라 시간이 걸려요.';
                $('[data-progress-step]').textContent = '준비 중';
                $('[data-progress]').style.width = '0%';
                show('reading');
                $('[data-error]').hidden = true;
                $('[data-retry]').hidden = true;
                $('[data-settings]').hidden = true;
                try {
                    const text = await App.ocr.recognize(prepare(engine), ({ step, percent }) => {
                        $('[data-progress-step]').textContent = `${step} ${percent}%`;
                        $('[data-progress]').style.width = `${percent}%`;
                    });
                    $('[data-result]').value = text;
                    if (!text) {
                        $('[data-error]').textContent = '글자를 찾지 못했어요. 더 밝게, 글자가 크게 나오게 다시 찍어 보세요.';
                        $('[data-error]').hidden = false;
                    }
                } catch (err) {
                    $('[data-result]').value = '';
                    $('[data-error]').textContent = err.message || '글자를 읽지 못했어요.';
                    $('[data-error]').hidden = false;
                    $('[data-retry]').hidden = false;   // 같은 사진으로 다시 시도
                    $('[data-settings]').hidden = false;
                }
                show('result');
            });

            // ---- 4) 넣기 / 다시 -------------------------------------------------
            $('[data-insert]').addEventListener('click', () => {
                const text = $('[data-result]').value.trim();
                if (!text) return;
                finish(text);
            });
            dialog.querySelectorAll('[data-again]').forEach(b => b.addEventListener('click', () => { renderEngine(); show('pick'); }));
            $('[data-retry]').addEventListener('click', () => show('crop'));
            // 키를 고치거나 방법을 바꾼 뒤 같은 사진으로 다시 읽을 수 있게: 고르기 화면에서 사진을 그대로 둔다
            $('[data-settings]').addEventListener('click', () => { renderEngine(); show('pick'); });
            $('[data-close]').addEventListener('click', () => finish(null));
            dialog.addEventListener('cancel', event => {
                event.preventDefault();
                finish(null);
            });

            show('pick');
            dialog.showModal();
        });
    }

    return { open };
})();
