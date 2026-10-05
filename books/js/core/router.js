// 화면 전환: 주소의 # 뒤(예: #/book/abc/edit?from=list)를 보고 알맞은 화면을 그린다.
//
// 새 화면 추가 방법:
//   App.route('/경로/:id', {
//       title: '화면 제목' 또는 ctx => '제목',
//       back: '/돌아갈/경로' 또는 ctx => '경로',   (홈 화면은 생략)
//       render(el, ctx) { el.innerHTML = ...; 이벤트 연결 }
//   });
//   ctx.params.id, ctx.query.get('book') 처럼 주소 값을 읽는다.
App.routes = [];

App.route = (pattern, view) => {
    const names = [];
    const regex = new RegExp('^' + pattern.replace(/:[a-z]+/gi, m => {
        names.push(m.slice(1));
        return '([^/]+)';
    }) + '$');
    App.routes.push({ pattern, regex, names, view });
};

App.router = (() => {
    const SCROLL_KEY = 'readinglife.scroll';
    const RELOAD_KEY = 'readinglife.errorReload';
    let current = null;

    function parse() {
        const hash = location.hash.replace(/^#/, '') || '/';
        const [path, search = ''] = hash.split('?');
        return { path, query: new URLSearchParams(search), hash };
    }

    function match(path) {
        for (const route of App.routes) {
            const m = path.match(route.regex);
            if (m) {
                const params = {};
                route.names.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
                return { route, params };
            }
        }
        return null;
    }

    function rememberScroll() {
        if (!current) return;
        try {
            const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}');
            saved[current] = window.scrollY;
            sessionStorage.setItem(SCROLL_KEY, JSON.stringify(saved));
        } catch (err) { /* 저장 못 해도 괜찮다 */ }
    }

    function savedScroll(hash) {
        try {
            return JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}')[hash] || 0;
        } catch (err) {
            return 0;
        }
    }

    function render() {
        rememberScroll();
        App.store.sync();   // 다른 창에서 바뀐 기록이 있으면 먼저 읽어 온다
        const { path, query, hash } = parse();
        const found = match(path);
        if (!found) {
            location.replace('#/');
            return;
        }
        const ctx = { params: found.params, query, path, hash };
        const view = found.route.view;
        const pick = value => (typeof value === 'function' ? value(ctx) : value);

        // 화면마다 새 상자를 만들어 예전 화면의 이벤트가 남지 않게 한다
        const main = document.getElementById('view');
        const el = document.createElement('div');
        el.className = 'view';
        main.replaceChildren(el);

        App.ui.setTopBar(pick(view.title) || '', pick(view.back));
        document.title = (pick(view.title) ? pick(view.title) + ' - ' : '') + '책읽는 삶의 재미';
        current = hash;

        try {
            view.render(el, ctx);
        } catch (err) {
            console.error(err);
            // 새 버전으로 바뀌는 중에 파일 하나를 못 읽으면 생길 수 있다 → 한 번은 저절로 새로고침
            let reloaded = 0;
            try { reloaded = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch (e) { /* 무시 */ }
            if (Date.now() - reloaded > 60000) {
                try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch (e) { /* 무시 */ }
                location.reload();
                return;
            }
            el.innerHTML = App.ui.emptyState(`화면을 그리다 문제가 생겼어요. 기록은 지워지지 않았어요.
                인터넷에 연결된 상태에서 <b>새로고침</b>을 눌러 주세요.<br><small>오류 내용: ${App.util.escapeHtml(err && err.message)}</small>`,
                '<button class="btn" type="button" onclick="location.reload()">새로고침</button><a class="btn btn-outline" href="#/">홈으로</a>');
        }
        window.scrollTo(0, App.ui.consumeHighlight(el) ? window.scrollY : savedScroll(hash));
        App.ui.showPendingToast();
    }

    function go(path) {
        if (location.hash === '#' + path) render();
        else location.hash = path;
    }

    function start() {
        window.addEventListener('hashchange', render);
        render();
    }

    return { start, go, render };
})();
