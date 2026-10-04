// 통계: 할일(상태·완료율·날짜별 완료·할일별 완료율)과 일기(편수·연속 기록·월별·기분)
// 차트 색: 한 가지 값은 강조색 하나. "완료/못 함" 두 값은 강조색과 옅은 색 + 범례로 구분한다.
App.route('/stats', {
    title: '통계',
    back: '/',
    render(el) {
        const { escapeHtml, today, formatShort, startOfMonth } = App.util;
        const { emptyState, statusBadge } = App.ui;
        const store = App.store;
        const sch = App.schedule;
        const ins = App.insights;

        if (!store.todos().length && !store.diary().length) {
            el.innerHTML = emptyState('할일을 등록하거나 일기를 쓰면 통계를 보여 드려요.',
                '<a class="btn btn-outline" href="#/todos/new">할일 등록</a><a class="btn btn-outline" href="#/diary/new">일기 쓰기</a>');
            return;
        }

        const counts = ins.statusCounts();
        const todayList = store.todos().flatMap(t => sch.occurrencesOn(t, today()));
        const todayDone = todayList.filter(o => o.done).length;
        const totalTodos = store.todos().length;
        const rate7 = ins.completionRate(7);
        const rate30 = ins.completionRate(30);
        const daily = ins.dailyTodos(14);
        const perTodo = ins.perTodo(30);
        const monthly = ins.monthlyDiary(12);
        const moodList = ins.moodCounts();
        const moodTotal = moodList.reduce((n, m) => n + m.count, 0);
        const diaries = store.diary();
        const thisMonth = diaries.filter(d => d.date >= startOfMonth(today())).length;
        const avgLength = diaries.length ? Math.round(diaries.reduce((n, d) => n + d.content.length, 0) / diaries.length) : 0;

        const tile = (label, value, note = '') => `
            <div class="stat-card"><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong>${note ? `<span class="stat-note">${note}</span>` : ''}</div>`;
        const percentText = r => (r.percent === null ? '—' : `${r.percent}%`);
        const meter = (percent, label) => `<div class="meter meter-row" role="img" aria-label="${label}"><div class="meter-fill" style="width:${percent}%"></div></div>`;

        el.innerHTML = `
            <h2 class="group-title">할일</h2>
            <section class="stats-top">
                <div class="card hero-card">
                    <span class="stat-label">최근 30일 완료율</span>
                    <p class="hero-figure">${percentText(rate30)}</p>
                    ${meter(rate30.percent || 0, `최근 30일 ${rate30.total}회 중 ${rate30.done}회 완료`)}
                    <p class="hint">마감일이 지난 30일 안인 ${rate30.total}회 중 ${rate30.done}회 완료</p>
                    <div class="status-row">
                        ${sch.STATUS_ORDER.map(s => `<a href="#/todos?status=${s}">${statusBadge(s)} <b>${counts[s]}</b></a>`).join('')}
                    </div>
                </div>
                <div class="stat-grid">
                    ${tile('등록한 할일', `${totalTodos}개`, `반복 ${store.todos().filter(t => t.count !== 1).length}개`)}
                    ${tile('지금 지연', `${counts.late}개`, counts.late ? '할일 내역에서 확인하세요' : '밀린 일이 없어요')}
                    ${tile('최근 7일 완료율', percentText(rate7), `${rate7.total}회 중 ${rate7.done}회`)}
                    ${tile('오늘 할일', `${todayDone}/${todayList.length}`, todayList.length ? '오늘 걸친 회차 중 완료' : '오늘은 할일이 없어요')}
                </div>
            </section>

            <div class="chart-grid">
                <figure class="card chart-card">
                    <figcaption class="chart-head">
                        <div><h3>날짜별 할일</h3><p class="hint">최근 14일 · 그날이 마감인 회차</p></div>
                        <button type="button" class="btn-text" data-toggle="daily-table">표로 보기</button>
                    </figcaption>
                    <div class="legend"><span><i class="swatch swatch-done"></i>완료</span><span><i class="swatch swatch-open"></i>못 함</span></div>
                    <div id="daily-chart" class="chart-box"></div>
                    <table id="daily-table" class="data-table" hidden>
                        <thead><tr><th>날짜</th><th>완료</th><th>못 함</th></tr></thead>
                        <tbody>${daily.slice().reverse().map(d => `<tr><td>${formatShort(d.date)}</td><td>${d.done}</td><td>${d.open}</td></tr>`).join('')}</tbody>
                    </table>
                </figure>
                <figure class="card chart-card">
                    <figcaption class="chart-head">
                        <div><h3>할일별 완료율</h3><p class="hint">최근 30일 · 마감이 지난 회차 기준</p></div>
                    </figcaption>
                    ${perTodo.length ? `<div class="genre-meters">${perTodo.slice(0, 8).map(x => `
                        <a class="genre-row" href="#/todo/${x.todo.id}/edit">
                            <span class="genre-name">${escapeHtml(x.todo.title)}</span>
                            ${meter(x.percent, `${x.todo.title} ${x.percent}%`)}
                            <span class="genre-value">${x.done}/${x.total}회</span>
                        </a>`).join('')}</div>` : '<p class="hint">최근 30일 안에 마감인 할일이 없어요.</p>'}
                </figure>
            </div>

            <h2 class="group-title">일기</h2>
            <section class="stat-grid stat-grid-4">
                ${tile('쓴 일기', `${diaries.length}편`)}
                ${tile('이번 달', `${thisMonth}편`)}
                ${tile('연속 기록', `${ins.currentStreak()}일`, `가장 길게 ${ins.longestStreak()}일`)}
                ${tile('평균 길이', `${avgLength.toLocaleString()}자`)}
            </section>
            <div class="chart-grid">
                <figure class="card chart-card">
                    <figcaption class="chart-head">
                        <div><h3>월별 일기</h3><p class="hint">${monthly[0].year}.${monthly[0].key.slice(5)} ~ ${monthly[11].year}.${monthly[11].key.slice(5)}</p></div>
                        <button type="button" class="btn-text" data-toggle="monthly-table">표로 보기</button>
                    </figcaption>
                    <div id="monthly-chart" class="chart-box"></div>
                    <table id="monthly-table" class="data-table" hidden>
                        <thead><tr><th>달</th><th>일기</th></tr></thead>
                        <tbody>${monthly.map(m => `<tr><td>${m.year}년 ${m.label}</td><td>${m.count}편</td></tr>`).join('')}</tbody>
                    </table>
                </figure>
                <figure class="card chart-card">
                    <figcaption class="chart-head">
                        <div><h3>기분</h3><p class="hint">기분을 고른 일기 ${moodTotal}편</p></div>
                    </figcaption>
                    <div class="genre-meters">${moodList.map(m => {
                        const p = moodTotal ? Math.round(m.count / moodTotal * 100) : 0;
                        return `<div class="genre-row"><span class="genre-name">${m.icon} ${m.label}</span>${meter(p, `${m.label} ${p}%`)}<span class="genre-value">${m.count}편</span></div>`;
                    }).join('')}</div>
                </figure>
            </div>`;

        // 막대 차트 (SVG). items: [{ label, parts: [{ value, cls, tip }] }]
        function barChart(box, items, { unit, height = 220 }) {
            const width = 640;
            const top = 24;
            const bottom = 28;
            const left = 32;
            const plotH = height - top - bottom;
            const max = Math.max(1, ...items.map(i => i.parts.reduce((n, p) => n + p.value, 0)));
            const tick = max <= 4 ? 1 : Math.ceil(max / 4);
            const scaleMax = Math.ceil(max / tick) * tick;
            const slot = (width - left) / items.length;
            const barW = Math.min(36, slot * 0.6);
            const y = v => top + plotH - (v / scaleMax) * plotH;
            let svg = '';
            for (let v = 0; v <= scaleMax; v += tick) {
                svg += `<line class="grid" x1="${left}" x2="${width}" y1="${y(v)}" y2="${y(v)}"/>
                        <text class="axis-label" x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
            }
            items.forEach((item, i) => {
                const x = left + slot * i + (slot - barW) / 2;
                let base = 0;
                const total = item.parts.reduce((n, p) => n + p.value, 0);
                let marks = '';
                item.parts.forEach(p => {
                    if (!p.value) return;
                    const y1 = y(base + p.value);
                    const h = y(base) - y1 - (base ? 2 : 0);   // 겹친 칸 사이 2px 틈
                    marks += `<rect class="${p.cls}" x="${x}" y="${y1}" width="${barW}" height="${Math.max(1, h)}" rx="3"/>`;
                    base += p.value;
                });
                svg += `<g class="mark" tabindex="0" data-tip="${escapeHtml(item.tip)}">
                    <rect x="${left + slot * i}" y="${top}" width="${slot}" height="${plotH}" fill="transparent"/>
                    ${marks}
                    ${total && item.showValue ? `<text class="value-label" x="${x + barW / 2}" y="${y(total) - 6}" text-anchor="middle">${total}</text>` : ''}
                    <text class="axis-label" x="${x + barW / 2}" y="${height - 8}" text-anchor="middle">${item.label}</text>
                </g>`;
            });
            box.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${unit}">${svg}</svg>`;
        }

        barChart(el.querySelector('#daily-chart'), daily.map((d, i) => ({
            label: i % 2 === daily.length % 2 ? '' : `${Number(d.date.slice(8))}`,
            tip: `${formatShort(d.date)} · 완료 ${d.done} · 못 함 ${d.open}`,
            showValue: false,
            parts: [{ value: d.done, cls: 'bar' }, { value: d.open, cls: 'bar-open' }]
        })), { unit: '최근 14일 날짜별 완료한 할일과 못 한 할일' });

        const maxMonth = Math.max(...monthly.map(m => m.count));
        barChart(el.querySelector('#monthly-chart'), monthly.map(m => ({
            label: m.label,
            tip: `${m.year}년 ${m.label} · 일기 ${m.count}편`,
            showValue: m.count === maxMonth || m.key === today().slice(0, 7),
            parts: [{ value: m.count, cls: 'bar' }]
        })), { unit: '최근 12개월 월별 일기 수' });

        // 막대에 손가락을 대거나 마우스를 올리면 값을 보여 준다
        const tooltip = document.createElement('div');
        tooltip.className = 'chart-tooltip';
        tooltip.hidden = true;
        el.appendChild(tooltip);
        const showTip = mark => {
            el.querySelectorAll('.mark.is-hover').forEach(m => m.classList.remove('is-hover'));
            if (!mark) { tooltip.hidden = true; return; }
            mark.classList.add('is-hover');
            tooltip.textContent = mark.dataset.tip;
            tooltip.hidden = false;
            const r = mark.getBoundingClientRect();
            const box = el.getBoundingClientRect();
            tooltip.style.left = `${Math.min(r.left - box.left + r.width / 2, box.width - 120)}px`;
            tooltip.style.top = `${r.top - box.top - 8}px`;
        };
        el.addEventListener('pointerover', e => showTip(e.target.closest('.mark')));
        el.addEventListener('focusin', e => showTip(e.target.closest('.mark')));
        el.addEventListener('pointerleave', () => showTip(null));

        el.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => {
            const table = el.querySelector('#' + button.dataset.toggle);
            table.hidden = !table.hidden;
            button.textContent = table.hidden ? '표로 보기' : '표 닫기';
        }));
    }
});
