#!/usr/bin/env python3
# 朝暮 V4 一次性迁移: data.json → config.json + days.json
# 用法: python scripts/migrate.py
# 前置: gh 已登录(Mchsd), 运行于 couple-tasks-web 仓库内
import base64, json, subprocess, sys, urllib.request, urllib.error, time

OWNER, REPO = 'Mchsd', 'couple-tasks'
MAX_TRIES = 3

def gh_token():
    # 优先环境变量, 否则 gh 缓存的 token
    import os
    t = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    if t: return t
    out = subprocess.run(['gh', 'auth', 'token'], capture_output=True, text=True)
    return out.stdout.strip()

TOKEN = gh_token()
if not TOKEN:
    print('FATAL: no token'); sys.exit(1)

def api(method, path, body=None, expect=(200, 201, 404)):
    url = f'https://api.github.com/repos/{OWNER}/{REPO}{path}'
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'dawn-dusk-migrate')
    if data: req.add_header('Content-Type', 'application/json')
    for attempt in range(MAX_TRIES):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            code = e.code
            if code in expect:
                return code, None
            if code == 403 and e.headers.get('X-RateLimit-Remaining') == '0':
                wait = int(e.headers.get('Retry-After', '60'))
                print(f'rate limited, sleep {wait}s'); time.sleep(wait); continue
            print(f'  {method} {path} -> HTTP {code}'); return code, None
        except Exception as e:
            print(f'  net err {e}, retry'); time.sleep(3)
    print(f'FATAL: {method} {path} failed after {MAX_TRIES}'); sys.exit(1)

def get_file(name):
    code, j = api('GET', f'/contents/{name}')
    if code == 404: return None
    return json.loads(base64.b64decode(j['content'].replace('\n', '')).decode('utf-8'))

def put_file(name, data, sha=None):
    body = {
        'message': f'V4 迁移: {name}',
        'content': base64.b64encode(json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')).decode(),
    }
    if sha: body['sha'] = sha
    code, j = api('PUT', f'/contents/{name}', body, expect=(200, 201))
    print(f'  PUT {name} -> {code} (sha {j.get("content",{}).get("sha","?")[:8]} if 200/201)')

def del_file(name, sha):
    body = {'message': f'V4 迁移: 删除 {name}（已拆分为 config+days）', 'sha': sha}
    code, _ = api('DELETE', f'/contents/{name}', body, expect=(200, 202, 404))
    print(f'  DELETE {name} -> {code}')

def main():
    # 0. 防半迁移: config.json 已存在则停止
    if get_file('config.json'):
        print('FATAL: config.json 已存在, 疑似已迁移过。人工检查后手动继续。'); sys.exit(1)
    if get_file('days.json'):
        print('FATAL: days.json 已存在, 疑似已迁移过。人工检查后手动继续。'); sys.exit(1)

    # 1. 读 data.json
    old = get_file('data.json')
    if old is None:
        print('FATAL: data.json 不存在'); sys.exit(1)
    days = old.pop('days', {})
    print(f'旧 data.json: 配置键={list(old.keys())} / days={len(days)} 天')

    # 2. 写 config.json (新增, 无 sha)
    config = dict(old)
    put_file('config.json', config)

    # 3. 写 days.json
    put_file('days.json', {'days': days})

    # 4. 核对: 读回两文件
    cfg = get_file('config.json'); djs = get_file('days.json')
    assert cfg and djs, 'readback failed'
    assert len(djs.get('days', {})) == len(days), 'days mismatch'
    assert cfg.get('names') == config.get('names'), 'names mismatch'
    assert cfg.get('zhengzi') == config.get('zhengzi'), 'zhengzi mismatch'
    assert cfg.get('pokes') == config.get('pokes'), 'pokes mismatch'
    print(f'核对通过: days={len(djs["days"])} names={cfg["names"]} zhengzi={cfg["zhengzi"]["count"]}')

    # 5. 删除 data.json
    code, j = api('GET', '/contents/data.json')
    if code == 200:
        del_file('data.json', j['sha'])
    print('迁移完成 ✅')

if __name__ == '__main__':
    main()
