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
            el.innerHTML = App.ui.emptyState('화면을 그리다 문제가 생겼어요. 홈으로 돌아가 다시 시도해 주세요.',
                '<a class="btn btn-outline" href="#/">홈으로</a>');
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
