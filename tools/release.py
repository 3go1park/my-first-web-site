#!/usr/bin/env python3
"""새 버전 준비: 파일 주소의 ?v= 번호와 서비스 워커 캐시 번호를 올리고,
오프라인용 파일 목록(sw.js의 FILES)을 앱 폴더의 실제 파일로 다시 만든다.

사용법 (저장소 맨 위 폴더에서). 앱 폴더를 적지 않으면 books:
    python3 tools/release.py               # books 번호를 1 올림
    python3 tools/release.py life          # life(하루 하루 삶의 기록) 번호를 1 올림
    python3 tools/release.py life --check  # 바꾸지 않고 확인만 (빠진 파일이 있으면 실패)
"""
import pathlib
import re
import sys

APPS = ('books', 'life')
ROOT = pathlib.Path(__file__).resolve().parent.parent / next((a for a in sys.argv[1:] if a in APPS), 'books')
INDEX = ROOT / 'index.html'
SW = ROOT / 'sw.js'
CACHE_NAME = r"(const CACHE = '[a-z0-9]+-v)(\d+)"
SKIP_DIRS = {'tools'}
SKIP_FILES = {'sw.js', 'README.md'}


def app_files():
    files = ['./']
    for path in sorted(ROOT.rglob('*')):
        rel = path.relative_to(ROOT)
        if path.is_dir() or rel.parts[0] in SKIP_DIRS or rel.name in SKIP_FILES or rel.name.startswith('.'):
            continue
        files.append(rel.as_posix())
    return files


def main():
    check = '--check' in sys.argv
    index = INDEX.read_text(encoding='utf-8')
    sw = SW.read_text(encoding='utf-8')

    versions = set(re.findall(r'\?v=(\d+)"', index))
    if len(versions) != 1:
        sys.exit(f'index.html의 ?v= 번호가 하나로 맞지 않아요: {sorted(versions)}')
    current = int(versions.pop())

    # index.html 이 불러오는 파일이 실제로 있는지 확인
    missing = [src for src in re.findall(r'(?:src|href)="([^"#:]+?)(?:\?v=\d+)?"', index)
               if not (ROOT / src).exists()]
    if missing:
        sys.exit(f'index.html이 불러오는데 없는 파일: {missing}')

    listed = re.search(r'// FILES:START\n(.*?)\s*// FILES:END', sw, re.S)
    expected = app_files()
    if check:
        current_list = re.findall(r"'([^']+)'", listed.group(1)) if listed else []
        sw_version = int(re.search(CACHE_NAME, sw).group(2))
        problems = []
        if current_list != expected:
            problems.append('sw.js의 FILES 목록이 실제 파일과 달라요')
        if sw_version != current:
            problems.append(f'sw.js 캐시 번호(v{sw_version})와 index.html(v{current})이 달라요')
        if problems:
            sys.exit('; '.join(problems) + ' → python3 tools/release.py 를 실행하세요')
        print(f'확인 완료: v{current}, 파일 {len(expected)}개')
        return

    nxt = current + 1
    index = re.sub(r'\?v=\d+"', f'?v={nxt}"', index)
    file_lines = ',\n'.join(f"    '{f}'" for f in expected)
    sw = re.sub(r'// FILES:START\n.*?// FILES:END',
                lambda m: f'// FILES:START\n{file_lines}\n    // FILES:END', sw, flags=re.S)
    sw = re.sub(CACHE_NAME, lambda m: f'{m.group(1)}{nxt}', sw)
    INDEX.write_text(index, encoding='utf-8')
    SW.write_text(sw, encoding='utf-8')
    print(f'v{current} → v{nxt}, 오프라인 파일 {len(expected)}개')


if __name__ == '__main__':
    main()
