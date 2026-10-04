// 일기의 기분 (고르지 않아도 된다)
App.moods = (() => {
    const LIST = [
        { key: 'great', icon: '😄', label: '아주 좋음' },
        { key: 'good', icon: '🙂', label: '좋음' },
        { key: 'soso', icon: '😐', label: '보통' },
        { key: 'bad', icon: '😟', label: '나쁨' },
        { key: 'awful', icon: '😢', label: '아주 나쁨' }
    ];
    const find = key => LIST.find(m => m.key === key) || null;
    const icon = key => (find(key) ? find(key).icon : '');
    const label = key => (find(key) ? find(key).label : '');
    return { LIST, find, icon, label };
})();
