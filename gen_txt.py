import json

data = json.load(open(r'C:\Users\lilxanyy\Documents\music-ratings.json', 'r', encoding='utf-8'))


def write_entry(f, e, seq, _):
    score = e.get('score')
    score_note = e.get('scoreNote', '')
    if score is None and score_note == 'NR':
        score_str = 'NR'
    elif score is None:
        score_str = '未打分'
    else:
        score_str = f'{score}'

    title = e.get('title', '')
    artist = e.get('artist', '')
    date = e.get('date', '')
    review = e.get('review', '').strip()
    notes = e.get('notes', '').strip()
    tags = e.get('tags', [])
    cover = e.get('cover', '')
    tracks = e.get('tracks', [])

    f.write(f'  {seq}. [{score_str}] {title}\n')
    f.write(f'     {artist}\n')

    if tags:
        tag_str = '  '.join(tags)
        f.write(f'     [{tag_str}]\n')

    if date:
        f.write(f'     日期: {date}\n')

    if notes:
        f.write(f'     备注: {notes}\n')

    if cover:
        f.write(f'     封面: {cover}\n')

    if tracks:
        disc_groups = {}
        for t in tracks:
            d = t.get('disc', 1)
            disc_groups.setdefault(d, []).append(t.get('name', ''))

        if len(disc_groups) > 1:
            sep = ' · '
            for d_num in sorted(disc_groups.keys()):
                names = [n for n in disc_groups[d_num] if n]
                label = f'碟{d_num}:'
                if names:
                    f.write(f'     {label} {sep.join(names)}\n')
                else:
                    f.write(f'     {label} (曲目未命名)\n')
        else:
            names = [n for n in disc_groups.get(1, []) if n]
            if names:
                sep = ' · '
                f.write(f'     曲目: {sep.join(names)}\n')
            else:
                f.write(f'     曲目: (未命名)\n')

    if review:
        if len(review) > 250:
            truncated = review[:250]
            last_period = truncated.rfind('。')
            last_newline = truncated.rfind('\n')
            break_at = max(last_period, last_newline)
            if break_at > 100:
                truncated = review[:break_at + 1]
            else:
                truncated = review[:247] + '...'
            f.write(f'     乐评: {truncated}\n')
        else:
            for rl in review.split('\n'):
                if rl.strip():
                    f.write(f'     乐评: {rl.strip()}\n')

    f.write('\n')


# 统计
total_albums = 0
total_singles = 0
scored_albums = 0
scored_singles = 0
nr_albums = 0
nr_singles = 0

for section in data['sections']:
    for group in section['groups']:
        if group['name'] == 'Albums':
            total_albums += len(group['entries'])
            for e in group['entries']:
                if e.get('score') is not None:
                    scored_albums += 1
                elif e.get('scoreNote') == 'NR':
                    nr_albums += 1
        elif group['name'] == 'Singles':
            total_singles += len(group['entries'])
            for e in group['entries']:
                if e.get('score') is not None:
                    scored_singles += 1
                elif e.get('scoreNote') == 'NR':
                    nr_singles += 1

with open(r'C:\Users\lilxanyy\Desktop\xan的音乐清单07.18.txt', 'w', encoding='utf-8') as f:
    f.write('Xan\'s Music Ratings — 音乐清单\n')
    f.write('生成日期: 2026-07-18\n')
    f.write('=' * 80 + '\n\n')

    # 分数说明
    f.write('【分数说明】\n')
    f.write('\n')
    f.write('  NR  = 听过，但因某些原因无法给出具体分数\n')
    f.write('  未打分 = 还没来得及听的专辑\n')
    f.write('\n')
    f.write('  AOTY = 年度专辑 (Album Of The Year)\n')
    f.write('  SOTY = 年度单曲 (Song Of The Year)\n')
    f.write('\n')
    f.write('-' * 80 + '\n\n')

    for section in data['sections']:
        sec_title = section['title']

        has_content = any(len(g['entries']) > 0 for g in section['groups'])
        if not has_content:
            continue

        # Section header
        f.write(f'  {sec_title}\n')
        f.write('  ' + '=' * (len(sec_title) + 2) + '\n\n')

        for group in section['groups']:
            gname = group['name']
            entries = group['entries']
            if not entries:
                continue

            if gname == 'Albums':
                f.write('  --- ALBUMS ---\n\n')
            elif gname == 'Singles':
                f.write('  --- SINGLES ---\n\n')
            else:
                continue

            seq = 0

            aoty = [e for e in entries if e.get('isAoty')]
            normal = [e for e in entries if not e.get('isAoty')]

            if gname == 'Albums' and aoty:
                f.write('  ★ AOTY (年度专辑)\n\n')
                for e in aoty:
                    seq += 1
                    write_entry(f, e, seq, None)
                if normal:
                    f.write('  --- --- --- --- --- --- ---\n\n')

            if gname == 'Singles':
                soty = [e for e in entries if e.get('isSoty')]
                normal = [e for e in entries if not e.get('isSoty')]
                if soty:
                    f.write('  ★ SOTY (年度单曲)\n\n')
                    for e in soty:
                        seq += 1
                        write_entry(f, e, seq, None)
                    if normal:
                        f.write('  --- --- --- --- --- --- ---\n\n')

            for e in normal:
                seq += 1
                write_entry(f, e, seq, None)

        f.write('\n' + '-' * 80 + '\n\n')

    # 结尾统计
    f.write('【统计总结】\n\n')
    f.write(f'  专辑: 共 {total_albums} 张\n')
    f.write(f'    已打分: {scored_albums} 张\n')
    f.write(f'    NR: {nr_albums} 张\n')
    f.write(f'    未打分: {total_albums - scored_albums - nr_albums} 张\n')
    f.write('\n')
    f.write(f'  单曲: 共 {total_singles} 首\n')
    f.write(f'    已打分: {scored_singles} 首\n')
    f.write(f'    NR: {nr_singles} 首\n')
    f.write(f'    未打分: {total_singles - scored_singles - nr_singles} 首\n')
    f.write('\n')
    f.write(f'  合计: {total_albums + total_singles} 条目\n')
    f.write(f'  已打分: {scored_albums + scored_singles} 条目\n')
    f.write(f'  NR: {nr_albums + nr_singles} 条目\n')
    f.write(f'  未打分: {total_albums + total_singles - scored_albums - scored_singles - nr_albums - nr_singles} 条目\n')
    f.write('\n')
    f.write('=' * 80 + '\n')

print(f'Done!')
