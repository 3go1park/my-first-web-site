// 앱 설치: 홈 화면 아이콘 설치, 이름이 바뀌지 않을 때 다시 등록하는 방법
App.route('/install', {
    title: '홈 화면 아이콘',
    back: '/',
    render(el) {
        const { escapeHtml } = App.util;
        const install = App.install;
        const url = install.appUrl();

        el.innerHTML = `
            <div class="two-columns">
                <section class="card">
                    <div class="app-badge">
                        <img src="icons/icon-192.png" alt="" width="72" height="72">
                        <div><strong>하루 하루 삶의 기록</strong><span class="hint">홈 화면 아이콘 이름</span></div>
                    </div>
                    <div id="install-state"></div>
                </section>

                <section class="card">
                    <h3>아이콘을 다시 등록하는 방법</h3>
                    <p class="hint">홈 화면 아이콘은 처음 설치할 때의 이름을 계속 써요. 예전 이름이 보이면 아래 순서로 다시 등록하세요.</p>
                    <ol class="step-list">
                        <li><b>먼저 백업하기</b> — 만일을 위해 백업 파일을 저장해 두세요.
                            <a class="btn btn-small btn-outline" href="#/backup">백업 · 복원으로</a></li>
                        <li><b>예전 아이콘 지우기</b> — 홈 화면의 아이콘을 길게 눌러 <b>삭제</b>(또는 제거).
                            <span class="warn">앱 정보의 "저장공간 → 데이터 삭제"는 누르지 마세요.</span></li>
                        <li><b>크롬에서 앱 주소 열기</b>
                            <span class="url-row"><code id="app-url">${escapeHtml(url)}</code>
                            <button id="copy-url" class="btn btn-small btn-outline" type="button">주소 복사</button></span></li>
                        <li><b>설치하기</b> — 앱 화면이 열리면 홈 → <b>관리 → 홈 화면 아이콘</b>에서 <b>홈 화면에 설치</b>를 누르거나,
                            크롬 메뉴(⋮) → <b>앱 설치</b>(또는 <b>홈 화면에 추가</b>)를 누르세요.</li>
                        <li><b>확인하기</b> — 새 아이콘 <b>하루 하루 삶의 기록</b>로 열어 기록이 그대로인지 확인하세요.
                            기록이 보이지 않으면 백업 파일로 <b>합쳐서 복원</b>하면 돼요.</li>
                    </ol>
                </section>
            </div>`;

        const state = el.querySelector('#install-state');

        function renderState() {
            if (install.isStandalone()) {
                state.innerHTML = `
                    <p class="state-line ok">지금 홈 화면 아이콘으로 실행 중이에요.</p>
                    <p class="hint">아이콘 이름이 "하루 하루 삶의 기록"가 아니라면 오른쪽 순서대로 다시 등록해 주세요.</p>`;
            } else if (install.justInstalled()) {
                state.innerHTML = `
                    <p class="state-line ok">설치했어요!</p>
                    <p class="hint">홈 화면의 새 아이콘 <b>하루 하루 삶의 기록</b>로 열어 주세요. 이 브라우저 창은 닫아도 돼요.</p>`;
            } else if (install.canPrompt()) {
                state.innerHTML = `
                    <p class="state-line">이 기기에 설치할 수 있어요.</p>
                    <button id="install-button" class="btn btn-primary" type="button">홈 화면에 설치</button>`;
                state.querySelector('#install-button').addEventListener('click', async () => {
                    const outcome = await install.prompt();
                    if (outcome === 'dismissed') App.ui.toast('설치를 취소했어요. 언제든 다시 설치할 수 있어요.');
                });
            } else {
                state.innerHTML = `
                    <p class="state-line">브라우저 메뉴에서 설치해 주세요.</p>
                    <p class="hint">크롬: 메뉴(⋮) → <b>앱 설치</b> 또는 <b>홈 화면에 추가</b><br>
                        삼성 인터넷: 메뉴(≡) → <b>현재 페이지 추가</b> → <b>홈 화면</b></p>
                    <p class="hint">이미 설치되어 있으면 설치 메뉴가 보이지 않아요. 예전 아이콘을 먼저 지워 주세요.</p>`;
            }
        }

        const stop = install.onChange(() => {
            if (document.body.contains(state)) renderState();
            else stop();
        });
        renderState();

        el.querySelector('#copy-url').addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(url);
                App.ui.toast('앱 주소를 복사했어요. 크롬 주소창에 붙여 넣으세요.');
            } catch (err) {
                // 복사가 막힌 경우: 주소를 선택해 두어 길게 눌러 복사할 수 있게
                const range = document.createRange();
                range.selectNodeContents(el.querySelector('#app-url'));
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
                App.ui.toast('주소를 길게 눌러 복사해 주세요.');
            }
        });
    }
});
