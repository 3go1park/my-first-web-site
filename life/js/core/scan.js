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
            intro: '읽은 책의 페이지를 찍으면 글자를 읽어 일지에 넣어 드려요. 사진은 이 탭 안에서만 처리해요.',
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
                    <p class="hint small">${text.tip}</p>
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
                    <p class="hint small">처음 한 번은 인식 프로그램을 내려받느라 시간이 걸려요.</p>
                </section>

                <section class="scan-step" data-step="result" hidden>
                    <p class="hint">읽은 글자예요. 틀린 부분을 고친 뒤 넣어 주세요.</p>
                    <textarea rows="9" data-result></textarea>
                    <p class="message error" data-error hidden></p>
                    <div class="button-row">
                        <button type="button" class="btn btn-outline" data-again>다른 사진</button>
                        <button type="button" class="btn btn-outline" data-retry hidden>다시 읽기</button>
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
                dialog.querySelectorAll('.scan-step').forEach(s => { s.hidden = s.dataset.step !== step; });
            }

            function finish(value) {
                dialog.close();
                dialog.remove();
                resolve(value);
            }

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

            // 고른 부분을 잘라 흑백으로 바꾸고 크기를 맞춘다 (인식률을 높이려고)
            function prepare() {
                const area = selection || { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
                let scale = Math.min(1, MAX_SIDE / Math.max(area.w, area.h));
                if (area.w * scale < MIN_WIDTH) scale = Math.min(3, MIN_WIDTH / area.w);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(area.w * scale);
                canvas.height = Math.round(area.h * scale);
                const g = canvas.getContext('2d', { willReadFrequently: true });
                g.filter = 'grayscale(1) contrast(1.4)';
                g.drawImage(image, area.x, area.y, area.w, area.h, 0, 0, canvas.width, canvas.height);
                return canvas;
            }

            // ---- 3) 글자 읽기 ------------------------------------------------
            $('[data-read]').addEventListener('click', async () => {
                show('reading');
                $('[data-error]').hidden = true;
                $('[data-retry]').hidden = true;
                try {
                    const text = await App.ocr.recognize(prepare(), ({ step, percent }) => {
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
                }
                show('result');
            });

            // ---- 4) 넣기 / 다시 -------------------------------------------------
            $('[data-insert]').addEventListener('click', () => {
                const text = $('[data-result]').value.trim();
                if (!text) return;
                finish(text);
            });
            dialog.querySelectorAll('[data-again]').forEach(b => b.addEventListener('click', () => show('pick')));
            $('[data-retry]').addEventListener('click', () => show('crop'));
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
