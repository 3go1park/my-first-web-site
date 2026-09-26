// 통계 화면: 핵심 숫자(스탯 타일), 월별 완독(막대), 독서 달력(히트맵), 장르별 완독(미터)
// 차트 색: 한 가지 값은 강조색 하나, 많고 적음은 같은 색의 밝기 단계로 (색약 검사 통과한 값)
App.route('/stats', {
    title: '통계',
    back: '/',
    render(el) {
        const { escapeHtml, formatDate, formatDay, today } = App.util;
        const { emptyState, statusBadge } = App.ui;
        const store = App.store;
        const ins = App.insights;

        if (!store.books().length) {
            el.innerHTML = emptyState('책을 등록하면 통계를 보여 드려요.', '<a class="btn btn-outline" href="#/books/upload">책 목록 업로드</a>');
            return;
        }

        const total = store.books().length;
        const counts = ins.statusCounts();
        const donePercent = Math.round(counts.done / total * 100);
        const year = new Date().getFullYear();
        const avgDays = ins.averageDaysToFinish();
        const onTime = ins.onTimeRate();
        const avgRating = ins.averageRating();
        const monthly = ins.monthlyFinished(12);
        const weeks = ins.dailyActivity(18);
        const genres = ins.genres(8);

        const tileHtml = (label, value, note = '') => `
            <div class="stat-card"><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong>${note ? `<span class="stat-note">${note}</span>` : ''}</div>`;

        el.innerHTML = `
            <section class="stats-top">
                <div class="card hero-card">
                    <span class="stat-label">완독한 책</span>
                    <p class="hero-figure">${counts.done}<span> / ${total}권</span></p>
                    <div class="meter" role="img" aria-label="전체 ${total}권 중 ${counts.done}권 완독, ${donePercent}%">
                        <div class="meter-fill" style="width:${donePercent}%"></div>
                    </div>
                    <p class="hint">전체의 ${donePercent}% · 남은 책 ${total - counts.done}권</p>
                    <div class="status-row">
                        ${['reading', 'late', 'none'].map(s => `<a href="#/reading?status=${s}">${statusBadge(s)} <b>${counts[s]}</b></a>`).join('')}
                    </div>
                </div>
                <div class="stat-grid">
                    ${tileHtml(`${year}년 완독`, `${ins.finishedInYear(year)}권`)}
                    ${tileHtml('연속 기록', `${ins.currentStreak()}일`, `가장 길게 ${ins.longestStreak()}일`)}
                    ${tileHtml('최근 30일 기록한 날', `${ins.journalDaysInLast(30)}일`)}
                    ${tileHtml('평균 완독 기간', avgDays === null ? '—' : `${avgDays}일`, avgDays === null ? '완독한 책이 생기면 보여요' : '시작일부터 완료일까지')}
                    ${tileHtml('예정일 지킨 비율', onTime === null ? '—' : `${onTime.percent}%`, onTime === null ? '완료예정일을 정해 보세요' : `${onTime.total}권 중 ${onTime.onTime}권`)}
                    ${tileHtml('평균 별점', avgRating === null ? '—' : `★ ${avgRating}`, avgRating === null ? '다 읽은 책에 별점을 남겨 보세요' : '')}
                </div>
            </section>

            <div class="chart-grid">
                <figure class="card chart-card">
                    <figcaption class="chart-head">
                        <div><h3>월별 완독</h3><p class="hint">${monthly[0].year}.${monthly[0].key.slice(5)} ~ ${monthly[11].year}.${monthly[11].key.slice(5)} · 완료일 기준</p></div>
                        <button type="button" class="btn-text" data-toggle="monthly-table">표로 보기</button>
                    </figcaption>
                    <div id="monthly-chart" class="chart-box"></div>
                    <table id="monthly-table" class="data-table" hidden>
                        <thead><tr><th>달</th><th>완독</th></tr></thead>
                        <tbody>${monthly.map(m => `<tr><td>${m.year}년 ${m.label}</td><td>${m.count}권</td></tr>`).join('')}</tbody>
                    </table>
                </figure>

                <figure class="card chart-card">
                    <figcaption class="chart-head">
                        <div><h3>독서 달력</h3><p class="hint">최근 18주 · 독서 일지를 쓴 날</p></div>
                        <button type="button" class="btn-text" data-toggle="activity-table">표로 보기</button>
                    </figcaption>
                    <div id="activity-chart" class="chart-box"></div>
                    <div class="scale-legend"><span>적게</span>${[0, 1, 2, 3, 4].map(n => `<i class="heat-${n}"></i>`).join('')}<span>많이</span></div>
                    <table id="activity-table" class="data-table" hidden>
                        <thead><tr><th>주 (월요일)</th><th>기록한 날</th><th>일지 수</th></tr></thead>
                        <tbody>${weeks.slice().reverse().map(w => `<tr><td>${formatDate(w[0].date)}</td><td>${w.filter(d => d.count).length}일</td><td>${w.reduce((a, d) => a + d.count, 0)}개</td></tr>`).join('')}</tbody>
                    </table>
                </figure>
            </div>

            <figure class="card chart-card">
                <figcaption class="chart-head">
                    <div><h3>장르별 완독</h3><p class="hint">막대 전체 = 장르의 책 수, 진한 부분 = 완독한 책</p></div>
                </figcaption>
                <div class="genre-meters">
                    ${genres.map(g => `
                        <div class="genre-row">
                            <span class="genre-name">${escapeHtml(g.name)}</span>
                            <div class="meter meter-row" role="img" aria-label="${escapeHtml(g.name)} ${g.total}권 중 ${g.done}권 완독">
                                <div class="meter-fill" style="width:${g.total ? g.done / g.total * 100 : 0}%"></div>
                            </div>
                            <span class="genre-value">${g.done} / ${g.total}권</span>
                        </div>`).join('')}
                </div>
            </figure>

            <div id="tooltip" class="chart-tooltip" role="status" hidden></div>`;

        // ---- 월별 완독: 세로 막대 (한 가지 값 → 강조색 하나) -----------------
        (() => {
            const W = 560, H = 230, left = 32, right = 8, top = 22, bottom = 30;
            const max = Math.max(1, ...monthly.map(m => m.count));
            const step = max <= 4 ? 1 : Math.ceil(max / 4);
            const yMax = Math.ceil(max / step) * step;
            const plotH = H - top - bottom;
            const slot = (W - left - right) / monthly.length;
            const barW = Math.min(24, slot * 0.6);
            const y = v => top + plotH - v / yMax * plotH;
            const ticks = [];
            for (let v = 0; v <= yMax; v += step) ticks.push(v);
            const peak = monthly.reduce((best, m) => (m.count > best.count ? m : best), monthly[0]);

            const bars = monthly.map((m, i) => {
                const x = left + slot * i + (slot - barW) / 2;
                const h = m.count / yMax * plotH;
                const r = Math.min(4, h);
                const base = top + plotH;
                // 윗부분만 4px 둥글게, 바닥은 반듯하게
                const path = h > 0
                    ? `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + barW - r} Q${x + barW},${base - h} ${x + barW},${base - h + r} V${base} Z`
                    : '';
                const tip = `${m.year}년 ${m.label} · 완독 ${m.count}권`;
                return `
                    <g class="mark" tabindex="0" data-tip="${tip}">
                        <rect class="hit" x="${left + slot * i}" y="${top}" width="${slot}" height="${plotH}" fill="transparent"/>
                        ${path ? `<path d="${path}" class="bar"/>` : ''}
                        ${m === peak && m.count > 0 ? `<text x="${x + barW / 2}" y="${base - h - 6}" class="value-label" text-anchor="middle">${m.count}</text>` : ''}
                        <text x="${left + slot * i + slot / 2}" y="${H - 10}" class="axis-label" text-anchor="middle">${m.label}</text>
                    </g>`;
            }).join('');

            el.querySelector('#monthly-chart').innerHTML = `
                <svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="최근 12개월 월별 완독 수">
                    ${ticks.map(v => `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" class="grid"/>
                        <text x="${left - 8}" y="${y(v) + 4}" class="axis-label" text-anchor="end">${v}</text>`).join('')}
                    ${bars}
                </svg>`;
        })();

        // ---- 독서 달력: 히트맵 (많고 적음 → 같은 색의 밝기 단계) -------------
        (() => {
            const cell = 20, gap = 2, left = 26, top = 20;
            const W = left + weeks.length * (cell + gap), H = top + 7 * (cell + gap);
            const level = n => Math.min(4, n);
            const dayNames = ['월', '', '수', '', '금', '', ''];
            let lastMonth = '';
            let lastLabelAt = -9;
            const columns = weeks.map((week, w) => {
                const x = left + w * (cell + gap);
                const month = week[0].date.slice(5, 7);
                // 달이 바뀌는 주에 달 이름을 적되, 앞 이름과 겹치면(3칸 안) 건너뛴다
                const showLabel = month !== lastMonth && w - lastLabelAt >= 3;
                const monthLabel = showLabel ? `<text x="${x}" y="${top - 7}" class="axis-label">${Number(month)}월</text>` : '';
                if (showLabel) lastLabelAt = w;
                lastMonth = month;
                return monthLabel + week.map((d, i) => d.future ? '' : `
                    <rect class="mark heat-${level(d.count)}${d.date === today() ? ' is-today' : ''}" tabindex="0"
                        x="${x}" y="${top + i * (cell + gap)}" width="${cell}" height="${cell}" rx="4"
                        data-tip="${formatDay(d.date)} · ${d.count ? `일지 ${d.count}개` : '기록 없음'}"/>`).join('');
            }).join('');
            el.querySelector('#activity-chart').innerHTML = `
                <svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="최근 18주 동안 독서 일지를 쓴 날">
                    ${dayNames.map((n, i) => n ? `<text x="0" y="${top + i * (cell + gap) + 15}" class="axis-label">${n}</text>` : '').join('')}
                    ${columns}
                </svg>`;
        })();

        // ---- 툴팁: 마우스·손가락·키보드 모두 ---------------------------------
        const tooltip = el.querySelector('#tooltip');
        function showTip(mark) {
            tooltip.textContent = mark.dataset.tip;
            tooltip.hidden = false;
            const box = mark.getBoundingClientRect();
            const tipBox = tooltip.getBoundingClientRect();
            const x = Math.min(window.innerWidth - tipBox.width - 8, Math.max(8, box.left + box.width / 2 - tipBox.width / 2));
            tooltip.style.left = `${x + window.scrollX}px`;
            tooltip.style.top = `${box.top + window.scrollY - tipBox.height - 8}px`;
            el.querySelectorAll('.mark.is-hover').forEach(m => m.classList.remove('is-hover'));
            mark.classList.add('is-hover');
        }
        function hideTip() {
            tooltip.hidden = true;
            el.querySelectorAll('.mark.is-hover').forEach(m => m.classList.remove('is-hover'));
        }
        el.addEventListener('pointerover', e => { const m = e.target.closest('.mark'); if (m) showTip(m); });
        el.addEventListener('pointerdown', e => { const m = e.target.closest('.mark'); if (m) showTip(m); else hideTip(); });
        el.addEventListener('pointerout', e => { if (e.pointerType === 'mouse' && e.target.closest('.mark')) hideTip(); });
        el.addEventListener('focusin', e => { const m = e.target.closest('.mark'); if (m) showTip(m); });
        el.addEventListener('focusout', hideTip);

        // ---- 표로 보기 -------------------------------------------------------
        el.querySelectorAll('[data-toggle]').forEach(button => {
            button.addEventListener('click', () => {
                const table = el.querySelector('#' + button.dataset.toggle);
                table.hidden = !table.hidden;
                button.textContent = table.hidden ? '표로 보기' : '표 닫기';
            });
        });
    }
});
