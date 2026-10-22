const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const sourceRoot = path.join(root, 'desktop-ui');
const cacheFilePath = path.join(root, 'album-cache.json');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

// ===== 缓存系统 =====
const albumPublishTimeCache = new Map();
try {
  if (fs.existsSync(cacheFilePath)) {
    const raw = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
    for (const [k, v] of Object.entries(raw)) {
      albumPublishTimeCache.set(k, v);
    }
    console.log(`[Cache] 已载入 ${albumPublishTimeCache.size} 条专辑发行日期缓存`);
  }
} catch (e) {
  console.warn('[Cache] 读取缓存失败:', e.message);
}

let persistTimer = null;
function persistCache() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const obj = Object.fromEntries(albumPublishTimeCache.entries());
      fs.writeFileSync(cacheFilePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (_) {}
  }, 1000);
}

// ===== 网易云 weapi 加密辅助 =====
const iv = Buffer.from('0102030405060708');
const presetKey = Buffer.from('0CoJUm6Qyw8W8jud');
const base62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const publicKey = '-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB\n-----END PUBLIC KEY-----';

const aesEncrypt = (buffer, mode, key, ivBuf) => {
  const cipher = crypto.createCipheriv(mode, key, ivBuf);
  return Buffer.concat([cipher.update(buffer), cipher.final()]);
};

const rsaEncrypt = (buffer, key) => {
  buffer = Buffer.concat([Buffer.alloc(128 - buffer.length), buffer]);
  return crypto.publicEncrypt({ key, padding: crypto.constants.RSA_NO_PADDING }, buffer);
};

const weapi = (object) => {
  const text = JSON.stringify(object);
  const secretKey = crypto.randomBytes(16).map(n => (base62.charAt(n % 62).charCodeAt()));
  return {
    params: aesEncrypt(Buffer.from(aesEncrypt(Buffer.from(text), 'aes-128-cbc', presetKey, iv).toString('base64')), 'aes-128-cbc', secretKey, iv).toString('base64'),
    encSecKey: rsaEncrypt(secretKey.reverse(), publicKey).toString('hex'),
  };
};

function checkPlainNeteaseQr(key, cookie) {
  return new Promise((resolve) => {
    const postData = new URLSearchParams({ key, type: 1 }).toString();
    const req = https.request('https://music.163.com/api/login/qrcode/client/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://music.163.com/',
        'Cookie': cookie || 'os=pc',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 6000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ json, setCookie: res.headers['set-cookie'] || [] });
        } catch (_) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(postData);
    req.end();
  });
}

// ===== 网易云 扫码会话映射 =====
const neteaseQrSessionMap = new Map();

// ===== QQ 音乐 会话与 Hash 算法 =====
const qqQrSessionMap = new Map();
const qqWxQrSessionMap = new Map();

function hash33(t) {
  let e = 0;
  for (let i = 0, n = t.length; i < n; ++i) {
    e += (e << 5) + t.charCodeAt(i);
  }
  return 2147483647 & e;
}

function getGtk(str) {
  if (!str) return 5381;
  let hash = 5381;
  for (let i = 0, len = str.length; i < len; ++i) {
    hash += (hash << 5) + str.charCodeAt(i);
  }
  return hash & 0x7fffffff;
}

// ===== 网易云时间戳校验与独立发行时间补齐引擎 =====
function isValidNeteaseTimestamp(ts) {
  if (ts === undefined || ts === null || ts === '') return false;
  const num = Number(ts);
  if (isNaN(num) || num === 0) return false;
  const d = new Date(num);
  if (isNaN(d.getTime())) return false;
  const y = d.getFullYear();
  return y >= 1900 && y <= (new Date().getFullYear() + 2);
}

// 网易云音乐 发行时间获取 (四级权威获取与回退体系)
// Level 1: 内存/磁盘高速缓存 albumPublishTimeCache (命中率 > 95%)
// Level 2: 网易云原生 weapi 专辑详情接口 (/weapi/v1/album/{id})
// Level 3: 网易云原生公开搜索接口 (/api/search/get?type=10)
// Level 4: QQ 音乐跨库搜索兜底 (/client_search_cp)
async function fetchNeteaseAlbumDetail(albumId, albumName, artistName) {
  const idStr = String(albumId || '').trim();

  // Level 1: 本地高速缓存
  if (idStr && albumPublishTimeCache.has(idStr)) {
    const cached = albumPublishTimeCache.get(idStr);
    if (isValidNeteaseTimestamp(cached)) {
      return Number(cached);
    }
  }

  let resultTs = null;

  // Level 2: 网易云原生 weapi 专辑详情
  if (idStr) {
    try {
      resultTs = await new Promise((resolve) => {
        const weapiData = weapi({ id: idStr });
        const postBody = new URLSearchParams(weapiData).toString();

        const req = https.request('https://music.163.com/weapi/v1/album/' + idStr, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://music.163.com/',
            'Content-Length': Buffer.byteLength(postBody)
          },
          timeout: 4500
        }, (res) => {
          let b = '';
          res.on('data', c => b += c);
          res.on('end', () => {
            try {
              const j = JSON.parse(b);
              const pt = j.album && j.album.publishTime;
              if (isValidNeteaseTimestamp(pt)) {
                return resolve(Number(pt));
              }
            } catch (_) {}
            resolve(null);
          });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(postBody);
        req.end();
      });
    } catch (_) {}
  }

  // Level 3: 网易云原生搜索
  if (!resultTs && albumName) {
    try {
      resultTs = await new Promise((resolve) => {
        const kw = albumName + ' ' + (artistName || '');
        const url = 'https://music.163.com/api/search/get?s=' + encodeURIComponent(kw) + '&type=10&offset=0&limit=5';
        https.get(url, {
          headers: {
            'Referer': 'https://music.163.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 4000
        }, (res) => {
          let b = '';
          res.on('data', c => b += c);
          res.on('end', () => {
            try {
              const j = JSON.parse(b);
              const list = j.result && j.result.albums;
              if (Array.isArray(list) && list.length > 0) {
                if (idStr) {
                  const matchId = list.find(a => String(a.id) === idStr);
                  if (matchId && isValidNeteaseTimestamp(matchId.publishTime)) {
                    return resolve(Number(matchId.publishTime));
                  }
                }
                for (const it of list) {
                  if (isValidNeteaseTimestamp(it.publishTime)) {
                    return resolve(Number(it.publishTime));
                  }
                }
              }
            } catch (_) {}
            resolve(null);
          });
        }).on('error', () => resolve(null));
      });
    } catch (_) {}
  }

  // Level 4: QQ 音乐跨库搜索兜底
  if (!resultTs && albumName) {
    try {
      resultTs = await new Promise((resolve) => {
        const kw = (artistName ? artistName + ' ' : '') + albumName;
        const url = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=5&t=8&w=' + encodeURIComponent(kw) + '&format=json';
        https.get(url, {
          headers: {
            'Referer': 'https://y.qq.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          },
          timeout: 4000
        }, (res) => {
          let b = '';
          res.on('data', c => b += c);
          res.on('end', () => {
            try {
              const j = JSON.parse(b);
              const list = j.data && j.data.album && j.data.album.list;
              if (Array.isArray(list) && list.length > 0) {
                for (const it of list) {
                  if (it.publicTime && isValidDateStr(it.publicTime)) {
                    const ts = new Date(it.publicTime).getTime();
                    if (isValidNeteaseTimestamp(ts)) {
                      return resolve(ts);
                    }
                  }
                }
              }
            } catch (_) {}
            resolve(null);
          });
        }).on('error', () => resolve(null));
      });
    } catch (_) {}
  }

  if (resultTs && isValidNeteaseTimestamp(resultTs)) {
    if (idStr) albumPublishTimeCache.set(idStr, resultTs);
    persistCache();
    return resultTs;
  }

  return null;
}

// ===== 日期校验辅助函数 =====
function isValidDateStr(str) {
  if (str === undefined || str === null || str === '') return false;
  const s = String(str).trim();
  if (!s || s === '0' || s === '0000-00-00' || s === '1970-01-01' || s.startsWith('0000')) return false;

  const curYear = new Date().getFullYear();

  // 1. 标准 YYYY-MM-DD 或 YYYY/MM/DD 或 YYYY.MM.DD
  const mFull = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (mFull) {
    const y = parseInt(mFull[1], 10);
    return y >= 1900 && y <= curYear + 2;
  }

  // 2. 纯四位数字年份 YYYY
  const mYear = s.match(/^(\d{4})$/);
  if (mYear) {
    const y = parseInt(mYear[1], 10);
    return y >= 1900 && y <= curYear + 2;
  }

  return false;
}

// ===== QQ 音乐 发行日期获取 (四级权威获取与回退体系) =====
// Level 1: musicu.fcg (GetAlbumDetail - basicInfo.publishDate)
// Level 2: fcg_v8_album_info_cp.fcg (aDate)
// Level 3: QQ 音乐原生搜索 client_search_cp (publicTime)
// Level 4: 网易云原生搜索 search/get (publishTime)
async function fetchQQAlbumDetail(mid, albumid, albumName, singerName) {
  const cacheKey = 'qq_' + (mid || albumid || (albumName + '_' + (singerName || '')));
  if (albumPublishTimeCache.has(cacheKey)) {
    const cached = albumPublishTimeCache.get(cacheKey);
    if (isValidDateStr(cached)) {
      return cached;
    }
  }

  let resultDate = null;

  // Level 1: musicu.fcg 原生接口 (GetAlbumDetail)
  if (mid) {
    try {
      resultDate = await new Promise((resolve) => {
        const postBody = JSON.stringify({
          comm: { ct: 24, cv: 0 },
          album: {
            module: 'music.musichallAlbum.AlbumInfoServer',
            method: 'GetAlbumDetail',
            param: {
              albumMid: mid,
              albumId: albumid ? Number(albumid) : 0
            }
          }
        });

        const req = https.request('https://u.y.qq.com/cgi-bin/musicu.fcg', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Referer': 'https://y.qq.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Content-Length': Buffer.byteLength(postBody)
          },
          timeout: 4500
        }, (res) => {
          let b = '';
          res.on('data', c => b += c);
          res.on('end', () => {
            try {
              const j = JSON.parse(b);
              const basic = j.album && j.album.data && j.album.data.basicInfo;
              if (basic && basic.publishDate && isValidDateStr(basic.publishDate)) {
                return resolve(basic.publishDate);
              }
            } catch (_) {}
            resolve(null);
          });
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(postBody);
        req.end();
      });
    } catch (_) {}
  }

  // Level 2: fcg_v8_album_info_cp.fcg 备用通道
  if (!resultDate && mid) {
    try {
      resultDate = await new Promise((resolve) => {
        https.get('https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg?albummid=' + encodeURIComponent(mid) + '&format=json', {
          headers: {
            'Referer': 'https://y.qq.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          },
          timeout: 3500
        }, (res2) => {
          let b2 = '';
          res2.on('data', c => b2 += c);
          res2.on('end', () => {
            try {
              const j2 = JSON.parse(b2);
              if (j2.data && j2.data.aDate && isValidDateStr(j2.data.aDate)) {
                return resolve(j2.data.aDate);
              }
            } catch (_) {}
            resolve(null);
          });
        }).on('error', () => resolve(null));
      });
    } catch (_) {}
  }

  // Level 3: QQ 音乐原生搜索精准匹配兜底 (client_search_cp)
  if (!resultDate && (albumName || mid)) {
    try {
      resultDate = await new Promise((resolve) => {
        const kw = (singerName ? singerName + ' ' : '') + (albumName || mid);
        const url = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=5&t=8&w=' + encodeURIComponent(kw) + '&format=json';
        https.get(url, {
          headers: {
            'Referer': 'https://y.qq.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          },
          timeout: 4000
        }, (res3) => {
          let b3 = '';
          res3.on('data', c => b3 += c);
          res3.on('end', () => {
            try {
              const j3 = JSON.parse(b3);
              const list = j3.data && j3.data.album && j3.data.album.list;
              if (Array.isArray(list) && list.length > 0) {
                // 优先精准匹配 mid 或 albumID
                const matched = list.find(a => (mid && a.albumMID === mid) || (albumid && a.albumID == albumid));
                if (matched && matched.publicTime && isValidDateStr(matched.publicTime)) {
                  return resolve(matched.publicTime);
                }
                // 其次匹配首个有合法日期的条目
                for (const it of list) {
                  if (it.publicTime && isValidDateStr(it.publicTime)) {
                    return resolve(it.publicTime);
                  }
                }
              }
            } catch (_) {}
            resolve(null);
          });
        }).on('error', () => resolve(null));
      });
    } catch (_) {}
  }

  // Level 4: 网易云搜索权威跨库兜底
  if (!resultDate && albumName) {
    try {
      resultDate = await new Promise((resolve) => {
        const kw = albumName + ' ' + (singerName || '');
        const url = 'https://music.163.com/api/search/get?s=' + encodeURIComponent(kw) + '&type=10&offset=0&limit=5';
        https.get(url, {
          headers: {
            'Referer': 'https://music.163.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          },
          timeout: 4000
        }, (res4) => {
          let b4 = '';
          res4.on('data', c => b4 += c);
          res4.on('end', () => {
            try {
              const j4 = JSON.parse(b4);
              const list = j4.result && j4.result.albums;
              if (Array.isArray(list) && list.length > 0) {
                for (const a of list) {
                  if (a.publishTime) {
                    const d = new Date(a.publishTime);
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const ds = y + '-' + m + '-' + day;
                    if (isValidDateStr(ds)) {
                      return resolve(ds);
                    }
                  }
                }
              }
            } catch (_) {}
            resolve(null);
          });
        }).on('error', () => resolve(null));
      });
    } catch (_) {}
  }

  if (resultDate && isValidDateStr(resultDate)) {
    albumPublishTimeCache.set(cacheKey, resultDate);
    if (mid) albumPublishTimeCache.set('qq_' + mid, resultDate);
    persistCache();
    return resultDate;
  }

  return null;
}

// ===== 0. 全局云端同步中转状态与短信登录 =====
let latestSyncPayload = null;

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
    'Access-Control-Allow-Private-Network': 'true',
  });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch (_) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
      'Access-Control-Allow-Private-Network': 'true',
    });
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, 'http://127.0.0.1:3000');
  const pathname = reqUrl.pathname;

  // ===== 0. 健康检查探针 =====
  if (pathname === '/api/health') {
    sendJson(res, 200, { ok: true, status: 'ready', pid: process.pid, time: Date.now() });
    return;
  }

  // ===== 0.1 跨端官方网站同步数据中转 (Payload Bridge) =====
  if (pathname === '/api/cloud/sync_payload') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
      return;
    }
    try {
      const payload = await parseBody(req);
      const platform = payload.platform || 'netease';
      const type = payload.type || 'credentials';

      console.log(`[SyncPayload] 收到官方网页回传数据: 平台=${platform}, 类型=${type}`);

      // 如果回传的是抓取到的全量专辑列表，立即启动后台并发补齐发行时间
      if (type === 'albums' && Array.isArray(payload.albums)) {
        const rawAlbums = payload.albums;
        console.log(`[SyncPayload] 收到 ${rawAlbums.length} 张官方收藏专辑，正在校验与标准化...`);

        // 标准化
        const formattedList = rawAlbums.map(it => {
          let artist = '';
          if (it.artist && it.artist.name) artist = it.artist.name;
          else if (Array.isArray(it.artists) && it.artists.length > 0) artist = it.artists.map(a => a.name).join('/');
          else if (it.singerName || it.singername) artist = it.singerName || it.singername;

          let pub = '';
          if (isValidNeteaseTimestamp(it.publishTime)) pub = Number(it.publishTime);
          else if (isValidDateStr(it.publicTime)) pub = it.publicTime;
          else if (isValidDateStr(it.publishDate)) pub = it.publishDate;

          return {
            id: it.id || it.mid || it.albummid || it.albumid,
            mid: it.mid || it.albummid || '',
            name: (it.name || it.albumname || it.albumName || '').trim(),
            artist: artist,
            publishTime: pub,
            picUrl: it.picUrl || (it.mid ? `https://y.gtimg.cn/music/photo_new/T002R800x800M000${it.mid}.jpg` : '') || '',
            size: it.size || it.songnum || 0
          };
        });

        // 异步补齐缺失时间
        const concurrency = 4;
        let cursor = 0;
        async function worker() {
          while (cursor < formattedList.length) {
            const item = formattedList[cursor++];
            if (platform === 'netease') {
              if (!isValidNeteaseTimestamp(item.publishTime)) {
                const pt = await fetchNeteaseAlbumDetail(item.id, item.name, item.artist);
                if (pt && isValidNeteaseTimestamp(pt)) item.publishTime = pt;
              }
            } else if (platform === 'qq') {
              if (!isValidDateStr(item.publishTime)) {
                const pt = await fetchQQAlbumDetail(item.mid, item.id, item.name, item.artist);
                if (pt && isValidDateStr(pt)) item.publishTime = pt;
              }
            }
            await new Promise(r => setTimeout(r, 15));
          }
        }
        await Promise.all(Array.from({ length: Math.min(concurrency, formattedList.length) }, worker));

        payload.albums = formattedList;
      }

      latestSyncPayload = {
        platform,
        type,
        data: payload,
        timestamp: Date.now()
      };

      sendJson(res, 200, { success: true, message: '数据已接收并就绪', timestamp: latestSyncPayload.timestamp });
    } catch (e) {
      console.error('[SyncPayload Error]', e);
      sendJson(res, 500, { success: false, error: e.message });
    }
    return;
  }

  if (pathname === '/api/cloud/sync_status') {
    if (latestSyncPayload) {
      const pl = latestSyncPayload;
      sendJson(res, 200, { hasPayload: true, payload: pl });
    } else {
      sendJson(res, 200, { hasPayload: false });
    }
    return;
  }

  if (pathname === '/api/cloud/clear_sync_status') {
    latestSyncPayload = null;
    sendJson(res, 200, { success: true });
    return;
  }

  // ===== 0.2 网易云官方手机短信验证码直登 (免 8821 风控) =====
  if (pathname === '/api/netease/sms/send') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
      return;
    }
    try {
      const bodyData = await parseBody(req);
      const phone = String(bodyData.phone || '').trim();
      if (!phone || !/^1\d{10}$/.test(phone)) {
        sendJson(res, 400, { success: false, message: '请输入正确的11位中国大陆手机号码' });
        return;
      }

      const weapiData = weapi({ ctcode: '86', cellphone: phone });
      const postBody = new URLSearchParams(weapiData).toString();

      const proxyReq = https.request('https://music.163.com/weapi/sms/captcha/sent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://music.163.com/',
          'Content-Length': Buffer.byteLength(postBody),
        },
        timeout: 8000
      }, (proxyRes) => {
        let body = '';
        proxyRes.on('data', c => body += c);
        proxyRes.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.code === 200) {
              sendJson(res, 200, { success: true, message: '验证码已通过网易官方短信发送至您的手机，请查收' });
            } else {
              sendJson(res, 200, { success: false, code: json.code, message: json.message || json.msg || '发送验证码失败' });
            }
          } catch (e) {
            sendJson(res, 500, { success: false, message: '解析网易短信响应失败: ' + e.message });
          }
        });
      });
      proxyReq.on('timeout', () => proxyReq.destroy(new Error('请求超时')));
      proxyReq.on('error', err => sendJson(res, 500, { success: false, message: err.message }));
      proxyReq.write(postBody);
      proxyReq.end();
    } catch (e) {
      sendJson(res, 500, { success: false, message: e.message });
    }
    return;
  }

  if (pathname === '/api/netease/sms/verify') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
      return;
    }
    try {
      const bodyData = await parseBody(req);
      const phone = String(bodyData.phone || '').trim();
      const captcha = String(bodyData.captcha || '').trim();
      if (!phone || !captcha) {
        sendJson(res, 400, { success: false, message: '手机号和验证码不能为空' });
        return;
      }

      const weapiData = weapi({
        countrycode: '86',
        phone: phone,
        cellphone: phone,
        captcha: captcha,
        rememberLogin: 'true'
      });
      const postBody = new URLSearchParams(weapiData).toString();

      const proxyReq = https.request('https://music.163.com/weapi/login/cellphone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://music.163.com/',
          'Content-Length': Buffer.byteLength(postBody),
        },
        timeout: 10000
      }, (proxyRes) => {
        let body = '';
        proxyRes.on('data', c => body += c);
        proxyRes.on('end', () => {
          try {
            const json = JSON.parse(body);
            const setCookies = proxyRes.headers['set-cookie'] || [];
            let musicU = '';
            const cookiesList = [];
            for (const c of setCookies) {
              cookiesList.push(c.split(';')[0]);
              const match = c.match(/MUSIC_U=([^;]+)/);
              if (match) musicU = match[1];
            }
            if (musicU) json.musicU = musicU;
            if (cookiesList.length > 0) json.cookie = cookiesList.join('; ');

            if (json.code === 200) {
              sendJson(res, 200, {
                success: true,
                code: 200,
                musicU: musicU,
                cookie: json.cookie || (musicU ? `MUSIC_U=${musicU}` : ''),
                user: {
                  nickname: json.profile ? json.profile.nickname : '',
                  avatarUrl: json.profile ? json.profile.avatarUrl : ''
                }
              });
            } else {
              sendJson(res, 200, {
                success: false,
                code: json.code,
                message: json.message || json.msg || '验证码错误或已失效'
              });
            }
          } catch (e) {
            sendJson(res, 500, { success: false, message: '解析登录结果失败: ' + e.message });
          }
        });
      });
      proxyReq.on('timeout', () => proxyReq.destroy(new Error('请求超时')));
      proxyReq.on('error', err => sendJson(res, 500, { success: false, message: err.message }));
      proxyReq.write(postBody);
      proxyReq.end();
    } catch (e) {
      sendJson(res, 500, { success: false, message: e.message });
    }
    return;
  }

  // ===== 1. 网易云音乐 扫码登录 API 代理 =====
  if (pathname === '/api/netease/qr/unikey') {
    const proxyReq = https.get('https://music.163.com/api/login/qrcode/unikey?type=1', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://music.163.com/',
      }
    }, (proxyRes) => {
      let body = '';
      proxyRes.on('data', chunk => body += chunk);
      proxyRes.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json && json.unikey) {
            const setCookies = proxyRes.headers['set-cookie'] || [];
            const cookiesList = ['os=pc'];
            for (const c of setCookies) {
              cookiesList.push(c.split(';')[0]);
            }
            const sessionCookie = cookiesList.join('; ');
            neteaseQrSessionMap.set(json.unikey, {
              initialCookie: sessionCookie,
              createTime: Date.now()
            });
            json.cookie = sessionCookie;
          }
          sendJson(res, 200, json);
        } catch (e) {
          sendJson(res, 500, { error: 'Failed to parse unikey response' });
        }
      });
    });
    proxyReq.on('error', (err) => sendJson(res, 500, { error: err.message }));
    return;
  }

  if (pathname === '/api/netease/qr/check') {
    const key = reqUrl.searchParams.get('key');
    if (!key) {
      sendJson(res, 400, { error: 'Missing key parameter' });
      return;
    }

    const clientCookie = reqUrl.searchParams.get('cookie') || '';
    const session = neteaseQrSessionMap.get(key);
    const sessionCookie = (session && session.initialCookie) || clientCookie || 'os=pc';

    const weapiData = weapi({ key, type: 1 });
    const postBody = new URLSearchParams(weapiData).toString();

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://music.163.com/',
      'Content-Length': Buffer.byteLength(postBody),
    };
    if (sessionCookie) {
      headers['Cookie'] = sessionCookie;
    }

    const proxyReq = https.request('https://music.163.com/weapi/login/qrcode/client/login', {
      method: 'POST',
      headers: headers,
      timeout: 8000
    }, (proxyRes) => {
      let body = '';
      proxyRes.on('data', chunk => body += chunk);
      proxyRes.on('end', async () => {
        try {
          const json = JSON.parse(body);
          const setCookies = proxyRes.headers['set-cookie'] || [];
          let musicU = '';
          const cookiesList = [];
          if (sessionCookie) {
            cookiesList.push(sessionCookie);
          }
          for (const c of setCookies) {
            cookiesList.push(c.split(';')[0]);
            const match = c.match(/MUSIC_U=([^;]+)/);
            if (match) musicU = match[1];
          }

          // 核心兼容：如果网易云在 json.cookie 中直接返回了凭据
          const rawBodyCookie = json.cookie || '';
          if (rawBodyCookie) {
            const m = rawBodyCookie.match(/MUSIC_U=([^;]+)/);
            if (m && !musicU) musicU = m[1];
            cookiesList.push(rawBodyCookie);
          }

          // 如果 weapi 返回了 8821 或其他非正常状态，但未能直接提取到 MUSIC_U，立即启动 Plain REST API 双重验证通道
          if (!musicU && Number(json.code) !== 803 && Number(json.code) !== 801 && Number(json.code) !== 802 && Number(json.code) !== 800) {
            try {
              const plainResult = await checkPlainNeteaseQr(key, sessionCookie);
              if (plainResult && plainResult.json) {
                const plainJson = plainResult.json;
                for (const c of plainResult.setCookie) {
                  cookiesList.push(c.split(';')[0]);
                  const m = c.match(/MUSIC_U=([^;]+)/);
                  if (m) musicU = m[1];
                }
                if (plainJson.cookie) {
                  const m = plainJson.cookie.match(/MUSIC_U=([^;]+)/);
                  if (m && !musicU) musicU = m[1];
                  cookiesList.push(plainJson.cookie);
                }
                if (musicU || Number(plainJson.code) === 803) {
                  json.code = 803;
                  json.success = true;
                } else if (Number(plainJson.code) === 802) {
                  json.code = 802;
                }
              }
            } catch (_) {}
          }

          if (musicU) json.musicU = musicU;

          // 只要提取到了 MUSIC_U 或网易云返回了 803，立刻判定为授权成功！
          if (musicU || Number(json.code) === 803) {
            json.code = 803;
            json.success = true;
          }

          if (cookiesList.length > 0) {
            json.cookie = cookiesList.join('; ');
          }
          if (musicU && json.cookie && !json.cookie.includes('MUSIC_U=')) {
            json.cookie += `; MUSIC_U=${musicU}`;
          }

          console.log(`[NetEase QR Check] key=${key.slice(0, 8)}... code=${json.code} msg=${json.message || ''} musicU=${musicU ? 'YES' : 'NO'}`);

          if (Number(json.code) === 803 || Number(json.code) === 800) {
            neteaseQrSessionMap.delete(key);
          }
          sendJson(res, 200, json);
        } catch (e) {
          console.error('[NetEase QR Check Parse Error]', e.message, 'body:', body);
          sendJson(res, 500, { error: 'Failed to parse qr check response' });
        }
      });
    });
    proxyReq.on('timeout', () => proxyReq.destroy(new Error('请求超时')));
    proxyReq.on('error', (err) => sendJson(res, 500, { error: err.message }));
    proxyReq.write(postBody);
    proxyReq.end();
    return;
  }

  if (pathname === '/api/netease/album/sublist') {
    let bodyData = {};
    if (req.method === 'POST') {
      bodyData = await parseBody(req);
    }
    const cookie = (bodyData.cookie || reqUrl.searchParams.get('cookie') || req.headers['cookie'] || '').trim();
    const limit = parseInt(bodyData.limit !== undefined ? bodyData.limit : (reqUrl.searchParams.get('limit') || '50'), 10);
    const offset = parseInt(bodyData.offset !== undefined ? bodyData.offset : (reqUrl.searchParams.get('offset') || '0'), 10);

    const weapiData = weapi({ limit, offset, total: true });
    const postBody = new URLSearchParams(weapiData).toString();
    const formattedCookie = cookie.includes('MUSIC_U=') ? cookie : `MUSIC_U=${cookie}`;

    const proxyReq = https.request('https://music.163.com/weapi/album/sublist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://music.163.com/',
        'Cookie': formattedCookie,
        'Content-Length': Buffer.byteLength(postBody),
      },
      timeout: 12000
    }, (proxyRes) => {
      let body = '';
      proxyRes.on('data', chunk => body += chunk);
      proxyRes.on('end', async () => {
        try {
          const json = JSON.parse(body);
          if (json.code !== 200) {
            sendJson(res, 200, json);
            return;
          }

          const rawList = (json && Array.isArray(json.data)) ? json.data : [];
          const total = json ? (json.count || json.total || 0) : 0;

          // 自动为每张网易云专辑补齐权威发行时间戳 publishTime
          const concurrency = 4;
          let cursor = 0;
          async function worker() {
            while (cursor < rawList.length) {
              const it = rawList[cursor++];
              if (isValidNeteaseTimestamp(it.publishTime)) continue;
              if (isValidNeteaseTimestamp(it.pubTime)) {
                it.publishTime = Number(it.pubTime);
                continue;
              }

              let artistName = '';
              if (it.artist && it.artist.name) artistName = it.artist.name;
              else if (Array.isArray(it.artists) && it.artists.length > 0) artistName = it.artists.map(a => a.name).join('/');

              const pt = await fetchNeteaseAlbumDetail(it.id, it.name, artistName);
              if (pt && isValidNeteaseTimestamp(pt)) {
                it.publishTime = pt;
                console.log('[Netease Sublist] ✅ 成功补齐发行时间: 《' + it.name + '》 -> ' + new Date(pt).toISOString().slice(0, 10));
              } else {
                console.warn('[Netease Sublist] ⚠️ 未能获取到《' + it.name + '》的发行时间');
              }
              await new Promise(r => setTimeout(r, 15));
            }
          }
          await Promise.all(Array.from({ length: Math.min(concurrency, rawList.length) }, worker));

          console.log('[Netease Sublist] 处理完成 ' + rawList.length + ' 张 (总数: ' + total + ', hasMore: ' + json.hasMore + ')');
          sendJson(res, 200, {
            code: 200,
            data: rawList,
            count: total,
            hasMore: json.hasMore !== false
          });
        } catch (e) {
          sendJson(res, 500, { error: 'Failed to parse album sublist response: ' + e.message });
        }
      });
    });
    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('请求网易云接口超时 (ETIMEDOUT)'));
    });
    proxyReq.on('error', (err) => sendJson(res, 500, { error: err.message }));
    proxyReq.write(postBody);
    proxyReq.end();
    return;
  }

  // ===== 2.0 QQ 音乐 微信扫码登录 API =====
  if (pathname === '/api/qq/wx/qr/create') {
    const wxConnectUrl = 'https://open.weixin.qq.com/connect/qrconnect?appid=wx48db31d50e334801&redirect_uri=https%3A%2F%2Fy.qq.com%2Fportal%2Fwx_redirect.html&response_type=code&scope=snsapi_login&state=STATE#wechat_redirect';

    https.get(wxConnectUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    }, (proxyRes) => {
      let body = '';
      proxyRes.on('data', chunk => body += chunk);
      proxyRes.on('end', () => {
        const m = body.match(/qrcode\/([a-zA-Z0-9_\-]+)/);
        if (!m) {
          sendJson(res, 500, { success: false, error: '未能从微信开放平台获取二维码标识' });
          return;
        }

        const uuid = m[1];
        const qrKey = 'wx_qr_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
        qqWxQrSessionMap.set(qrKey, {
          uuid,
          createTime: Date.now()
        });

        const imgUrl = `https://open.weixin.qq.com/connect/qrcode/${uuid}`;
        https.get(imgUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 8000
        }, (imgRes) => {
          const chunks = [];
          imgRes.on('data', c => chunks.push(c));
          imgRes.on('end', () => {
            const buf = Buffer.concat(chunks);
            const base64Img = 'data:image/jpeg;base64,' + buf.toString('base64');
            sendJson(res, 200, {
              success: true,
              qrKey,
              qrImgData: base64Img
            });
          });
        }).on('error', (err) => {
          sendJson(res, 500, { success: false, error: '下载微信二维码图片失败: ' + err.message });
        });
      });
    }).on('error', (err) => {
      sendJson(res, 500, { success: false, error: '请求微信授权接口失败: ' + err.message });
    });
    return;
  }

  if (pathname === '/api/qq/wx/qr/check') {
    const qrKey = reqUrl.searchParams.get('qrKey');
    if (!qrKey || !qqWxQrSessionMap.has(qrKey)) {
      sendJson(res, 200, { success: false, code: 65, message: '二维码已失效，请刷新' });
      return;
    }

    const session = qqWxQrSessionMap.get(qrKey);
    const { uuid, createTime } = session;

    if (Date.now() - createTime > 180000) {
      qqWxQrSessionMap.delete(qrKey);
      sendJson(res, 200, { success: false, code: 65, message: '二维码已失效，请刷新' });
      return;
    }

    const pollUrl = `https://long.open.weixin.qq.com/connect/l/qrconnect?uuid=${uuid}&_=${Date.now()}`;
    https.get(pollUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 28000
    }, (pollRes) => {
      let body = '';
      pollRes.on('data', c => body += c);
      pollRes.on('end', async () => {
        const codeMatch = body.match(/wx_errcode=(\d+)/);
        const errcode = codeMatch ? parseInt(codeMatch[1], 10) : 408;

        if (errcode === 408) {
          sendJson(res, 200, { success: true, code: 66, message: '请使用微信扫一扫授权登录' });
          return;
        }
        if (errcode === 404) {
          sendJson(res, 200, { success: true, code: 67, message: '📱 微信已扫描，请在手机上点击允许登录' });
          return;
        }
        if (errcode === 403 || errcode === 402) {
          qqWxQrSessionMap.delete(qrKey);
          sendJson(res, 200, { success: true, code: 65, message: '二维码已失效，请点击刷新' });
          return;
        }

        if (errcode === 405) {
          const wxCodeMatch = body.match(/wx_code='([^']+)'/);
          const wxCode = wxCodeMatch ? wxCodeMatch[1] : '';
          if (!wxCode) {
            sendJson(res, 200, { success: false, code: -1, message: '未能提取微信授权码' });
            return;
          }

          qqWxQrSessionMap.delete(qrKey);
          console.log(`[QQ Wechat Login] 微信授权成功，获得 wx_code: ${wxCode}，正在换取 QQ 音乐凭据...`);

          try {
            const postData = JSON.stringify({
              comm: {
                g_tk: 5381,
                platform: 'yqq',
                ct: 24,
                cv: 0,
                tmeAppID: 'qqmusic',
                tmeLoginType: '1'
              },
              req: {
                module: 'music.login.LoginServer',
                method: 'Login',
                param: {
                  strAppid: 'wx48db31d50e334801',
                  code: wxCode,
                  onlyopenid: 0
                }
              }
            });

            const reqOptions = {
              hostname: 'u.y.qq.com',
              path: '/cgi-bin/musicu.fcg',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Referer': 'https://y.qq.com/portal/wx_redirect.html',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              },
              timeout: 8000
            };

            const fcgReq = https.request(reqOptions, (fcgRes) => {
              let fcgBody = '';
              fcgRes.on('data', c => fcgBody += c);
              fcgRes.on('end', () => {
                console.log('[QQ Wechat Login] FCG Body:', fcgBody);
                let uin = '';
                let musickey = '';
                let openid = '';
                try {
                  const j = JSON.parse(fcgBody);
                  const d = (j.req && j.req.data) ? j.req.data : {};
                  uin = d.str_musicid || (d.musicid ? String(d.musicid) : '') || d.encryptUin || d.openid || '';
                  musickey = d.musickey || d.refresh_token || d.token || '';
                  openid = d.openid || '';
                } catch (_) {}

                const setCookies = fcgRes.headers['set-cookie'] || [];
                const cookiesMap = new Map();
                for (const c of setCookies) {
                  const pair = c.split(';')[0];
                  const idx = pair.indexOf('=');
                  if (idx > 0) {
                    cookiesMap.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
                  }
                }

                if (!uin) {
                  uin = cookiesMap.get('wxuin') || cookiesMap.get('uin') || '';
                }
                if (!musickey) {
                  musickey = cookiesMap.get('qm_keyst') || cookiesMap.get('qqmusic_key') || cookiesMap.get('music_key') || '';
                }

                if (uin) {
                  cookiesMap.set('uin', uin);
                  cookiesMap.set('wxuin', uin);
                }
                if (musickey) {
                  cookiesMap.set('qm_keyst', musickey);
                  cookiesMap.set('qqmusic_key', musickey);
                  cookiesMap.set('music_key', musickey);
                }
                if (openid) {
                  cookiesMap.set('wxopenid', openid);
                }
                cookiesMap.set('login_type', '2');

                const cookieStr = Array.from(cookiesMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

                console.log(`[QQ Wechat Login] 解析完成: uin=${uin}, cookie长度=${cookieStr.length}`);

                sendJson(res, 200, {
                  success: true,
                  code: 0,
                  accountType: 'wechat',
                  uin: uin.replace(/^[oO]/, ''),
                  cookie: cookieStr,
                  message: '登录成功'
                });
              });
            });

            fcgReq.on('error', (err) => {
              sendJson(res, 500, { success: false, error: '换取 QQ 音乐凭据失败: ' + err.message });
            });
            fcgReq.write(postData);
            fcgReq.end();

          } catch (err) {
            sendJson(res, 500, { success: false, error: '处理微信登录异常: ' + err.message });
          }
          return;
        }

        sendJson(res, 200, { success: true, code: 66, message: '请使用微信扫一扫授权登录' });
      });
    }).on('error', (err) => {
      sendJson(res, 200, { success: true, code: 66, message: '轮询中...' });
    });
    return;
  }

  // ===== 2. QQ 音乐 扫码登录 API =====
  if (pathname === '/api/qq/qr/create') {
    const t = Math.random();
    // 关键参数：daid=383 & pt_3rd_aid=101372833，确保与 ptqrlogin 授权链路完美闭环匹配
    const qrUrl = `https://ssl.ptlogin2.qq.com/ptqrshow?appid=716027609&e=2&l=M&s=3&d=72&v=4&t=${t}&daid=383&pt_3rd_aid=101372833`;

    https.get(qrUrl, (proxyRes) => {
      const setCookies = proxyRes.headers['set-cookie'] || [];
      let qrsig = '';
      for (const c of setCookies) {
        const m = c.match(/qrsig=([^;]+)/);
        if (m) qrsig = m[1];
      }

      if (!qrsig) {
        sendJson(res, 500, { success: false, error: '未能获取 QQ 登录二维码凭据' });
        return;
      }

      const ptqrtoken = hash33(qrsig);
      const qrKey = 'qq_qr_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
      qqQrSessionMap.set(qrKey, {
        qrsig,
        ptqrtoken,
        createTime: Date.now()
      });

      const chunks = [];
      proxyRes.on('data', chunk => chunks.push(chunk));
      proxyRes.on('end', () => {
        const buf = Buffer.concat(chunks);
        const base64Img = 'data:image/png;base64,' + buf.toString('base64');
        sendJson(res, 200, {
          success: true,
          qrKey,
          qrImgData: base64Img
        });
      });
    }).on('error', (err) => {
      sendJson(res, 500, { success: false, error: '请求腾讯二维码接口失败: ' + err.message });
    });
    return;
  }

  if (pathname === '/api/qq/qr/check') {
    const qrKey = reqUrl.searchParams.get('qrKey');
    if (!qrKey || !qqQrSessionMap.has(qrKey)) {
      sendJson(res, 200, { success: false, code: 65, message: '二维码已失效，请刷新' });
      return;
    }

    const session = qqQrSessionMap.get(qrKey);
    const { qrsig, ptqrtoken, createTime } = session;

    // 二维码有效时间最多 3 分钟
    if (Date.now() - createTime > 180000) {
      qqQrSessionMap.delete(qrKey);
      sendJson(res, 200, { success: false, code: 65, message: '二维码已失效，请刷新' });
      return;
    }

    const checkUrl = `https://ssl.ptlogin2.qq.com/ptqrlogin?u1=https%3A%2F%2Fgraph.qq.com%2Foauth2.0%2Flogin_jump&ptqrtoken=${ptqrtoken}&ptredirect=0&h=1&t=1&g=1&from_ui=1&ptlang=2052&action=0-0-${Date.now()}&js_ver=24032116&js_type=1&login_sig=&pt_uistyle=40&aid=716027609&daid=383&pt_3rd_aid=101372833`;

    https.get(checkUrl, {
      headers: {
        'Cookie': `qrsig=${qrsig};`,
        'Referer': 'https://xui.ptlogin2.qq.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5000
    }, (proxyRes) => {
      let body = '';
      proxyRes.on('data', chunk => body += chunk);
      proxyRes.on('end', async () => {
        try {
          const cbMatch = body.match(/ptuiCB\((.*?)\)/s);
          if (!cbMatch) {
            console.warn('[QQ QR Check] Unrecognized body:', body);
            sendJson(res, 200, { success: false, code: -1, message: '解析腾讯响应异常' });
            return;
          }

          const args = [];
          const argRegex = /'(.*?)'/g;
          let m;
          while ((m = argRegex.exec(cbMatch[1])) !== null) {
            args.push(m[1]);
          }

          const statusCode = parseInt(args[0], 10);
          const redirectUrl = args[2] || '';
          const statusMsg = args[4] || '';
          const nick = args[5] || '';

          if (statusCode === 66) {
            sendJson(res, 200, { success: true, code: 66, message: '二维码未失效，请使用手机QQ扫码' });
            return;
          }

          if (statusCode === 67) {
            sendJson(res, 200, { success: true, code: 67, message: '二维码认证中，请在手机上点击确认登录' });
            return;
          }

          if (statusCode === 65) {
            qqQrSessionMap.delete(qrKey);
            sendJson(res, 200, { success: true, code: 65, message: '二维码已失效，请刷新' });
            return;
          }

          if (statusCode === 0) {
            console.log(`[QQ QR Login] 登录成功! 用户昵称: ${nick}`);
            const allCookies = new Map();
            allCookies.set('qrsig', qrsig);

            const ptCookies = proxyRes.headers['set-cookie'] || [];
            for (const c of ptCookies) {
              const pair = c.split(';')[0];
              const idx = pair.indexOf('=');
              if (idx > 0) {
                allCookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
              }
            }

            let uin = '';
            if (redirectUrl) {
              const uMatch = redirectUrl.match(/uin=([0-9a-zA-Z_]+)/);
              if (uMatch) uin = uMatch[1].replace(/^[oO]/, '');
            }
            if (!uin && allCookies.has('uin')) {
              uin = allCookies.get('uin').replace(/^[oO]/, '');
            }
            if (!uin && allCookies.has('p_uin')) {
              uin = allCookies.get('p_uin').replace(/^[oO]/, '');
            }

            // 跟进 redirectUrl (check_sig) 并捕获核心业务 Cookies (包含 p_skey, skey 等)
            if (redirectUrl && (redirectUrl.startsWith('http:') || redirectUrl.startsWith('https:'))) {
              try {
                const httpMod = redirectUrl.startsWith('http:') ? http : https;
                const cookieHeader = Array.from(allCookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
                await new Promise((resolve) => {
                  const reqFollow = httpMod.get(redirectUrl, {
                    headers: {
                      'Cookie': cookieHeader,
                      'Referer': 'https://xui.ptlogin2.qq.com/',
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    timeout: 3000
                  }, (sigRes) => {
                    sigRes.resume();
                    const sigCookies = sigRes.headers['set-cookie'] || [];
                    for (const sc of sigCookies) {
                      const pair = sc.split(';')[0];
                      const idx = pair.indexOf('=');
                      if (idx > 0) {
                        allCookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
                      }
                    }
                    resolve();
                  });
                  reqFollow.on('error', () => resolve());
                  reqFollow.on('timeout', () => { reqFollow.destroy(); resolve(); });
                });
              } catch (_) {}
            }

            const cookiePairs = [];
            for (const [k, v] of allCookies.entries()) {
              cookiePairs.push(`${k}=${v}`);
            }
            const fullCookie = cookiePairs.join('; ');

            qqQrSessionMap.delete(qrKey);

            sendJson(res, 200, {
              success: true,
              code: 0,
              message: '登录成功',
              uin: uin || (allCookies.get('uin') ? allCookies.get('uin').replace(/^[oO]/, '') : ''),
              nick: nick,
              cookie: fullCookie
            });
            return;
          }

          sendJson(res, 200, { success: false, code: statusCode, message: statusMsg || '登录未完成' });
        } catch (e) {
          sendJson(res, 500, { success: false, error: '处理扫码登录响应异常: ' + e.message });
        }
      });
    }).on('error', (err) => {
      sendJson(res, 500, { success: false, error: '检查扫码状态失败: ' + err.message });
    });
    return;
  }

  // ===== 3. QQ 音乐 数据 API =====
  if (pathname === '/api/qq/verify') {
    let bodyData = {};
    if (req.method === 'POST') {
      bodyData = await parseBody(req);
    }
    let uin = (bodyData.uin || reqUrl.searchParams.get('uin') || '').trim();
    let cookie = (bodyData.cookie || reqUrl.searchParams.get('cookie') || req.headers['cookie'] || '').trim();

    if (!uin && cookie) {
      const match = cookie.match(/uin=([0-9a-zA-Z_]+)/);
      if (match) uin = match[1].replace(/^[oO]/, '');
    }

    if (!uin) {
      sendJson(res, 400, { success: false, error: '缺少 QQ 账号 (uin)' });
      return;
    }

    const cookieHeader = cookie ? (cookie.includes('uin=') ? cookie : `uin=${uin}; ${cookie}`) : `uin=${uin};`;
    let gtk = 5381;
    const pSkeyMatch = cookie.match(/p_skey=([^;]+)/);
    const skeyMatch = cookie.match(/(?:^|;\s*)skey=([^;]+)/);
    if (pSkeyMatch) {
      gtk = getGtk(pSkeyMatch[1]);
    } else if (skeyMatch) {
      gtk = getGtk(skeyMatch[1]);
    }

    const targetUrl = `https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg?g_tk=${gtk}&loginUin=${encodeURIComponent(uin)}&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&ct=20&cid=205360956&userid=${encodeURIComponent(uin)}&reqtype=2&sin=0&ein=1`;

    const proxyReq = https.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://y.qq.com/',
        'Cookie': cookieHeader
      },
      timeout: 10000
    }, (proxyRes) => {
      let body = '';
      proxyRes.on('data', c => body += c);
      proxyRes.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.code === 0) {
            sendJson(res, 200, {
              success: true,
              total: json.data ? (json.data.totalalbum || 0) : 0,
              uin
            });
          } else if (json.code === 4000 || json.subcode === 4000 || json.msg === 'privacy') {
            sendJson(res, 200, {
              success: false,
              code: 4000,
              error: '隐私权限限制：您的 QQ 音乐收藏专辑当前设置为「仅自己可见」。请在手机 QQ 音乐 APP 中进入【我的】➜ 右上角【设置】➜【隐私设置】➜【个人主页隐私设置】将【我喜欢的音乐/收藏】设为公开，即可一键同步！'
            });
          } else {
            sendJson(res, 200, {
              success: false,
              code: json.code,
              error: json.msg || '验证失败'
            });
          }
        } catch (e) {
          sendJson(res, 500, { success: false, error: '解析 QQ 音乐响应异常: ' + e.message });
        }
      });
    });
    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('连接腾讯验证接口超时 (ETIMEDOUT)'));
    });
    proxyReq.on('error', err => sendJson(res, 500, { success: false, error: err.message }));
    return;
  }

  if (pathname === '/api/qq/album/detail') {
    const mid = reqUrl.searchParams.get('mid') || '';
    const albumid = reqUrl.searchParams.get('albumid') || '';
    const name = reqUrl.searchParams.get('name') || '';
    const artist = reqUrl.searchParams.get('artist') || '';
    if (!mid && !albumid && !name) {
      sendJson(res, 400, { error: 'Missing album parameters' });
      return;
    }
    fetchQQAlbumDetail(mid, albumid, name, artist).then(pt => {
      sendJson(res, 200, { mid, publishTime: pt || '' });
    });
    return;
  }


  if (pathname === '/api/qq/album/sublist') {
    let bodyData = {};
    if (req.method === 'POST') {
      bodyData = await parseBody(req);
    }
    let uin = (bodyData.uin || reqUrl.searchParams.get('uin') || '').trim();
    let cookie = (bodyData.cookie || reqUrl.searchParams.get('cookie') || req.headers['cookie'] || '').trim();
    const sin = parseInt(bodyData.sin !== undefined ? bodyData.sin : (reqUrl.searchParams.get('sin') || reqUrl.searchParams.get('offset') || '0'), 10);
    const limit = parseInt(bodyData.limit !== undefined ? bodyData.limit : (reqUrl.searchParams.get('limit') || reqUrl.searchParams.get('num') || '30'), 10);
    const ein = sin + limit - 1;

    if (!uin && cookie) {
      const match = cookie.match(/(?:uin|wxuin)=([0-9a-zA-Z_]+)/);
      if (match) uin = match[1].replace(/^[oO]/, '');
    }

    if (!uin) {
      sendJson(res, 400, { error: '尚未连接 QQ 音乐账号，请先扫码授权' });
      return;
    }

    const cookieHeader = cookie ? (cookie.includes('uin=') ? cookie : `uin=${uin}; wxuin=${uin}; ${cookie}`) : `uin=${uin}; wxuin=${uin};`;
    let gtk = 5381;
    const pSkeyMatch = cookie.match(/p_skey=([^;]+)/);
    const skeyMatch = cookie.match(/(?:^|;\s*)skey=([^;]+)/);
    if (pSkeyMatch) {
      gtk = getGtk(pSkeyMatch[1]);
    } else if (skeyMatch) {
      gtk = getGtk(skeyMatch[1]);
    }

    const targetUrl = `https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg?g_tk=${gtk}&loginUin=${encodeURIComponent(uin)}&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&ct=20&cid=205360956&userid=${encodeURIComponent(uin)}&reqtype=2&sin=${sin}&ein=${ein}`;

    const proxyReq = https.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://y.qq.com/',
        'Cookie': cookieHeader
      },
      timeout: 12000
    }, (proxyRes) => {
      let body = '';
      proxyRes.on('data', c => body += c);
      proxyRes.on('end', async () => {
        try {
          const json = JSON.parse(body);
          if (json.code !== 0) {
            let errorMsg = json.msg || '获取收藏专辑失败';
            if (json.code === 4000 || json.subcode === 4000 || json.msg === 'privacy') {
              errorMsg = '隐私权限限制：您的 QQ 音乐收藏专辑当前设置为「仅自己可见」。请在手机 QQ 音乐 APP 中进入【我的】➜ 右上角【设置】➜【隐私设置】➜【个人主页隐私设置】将【我喜欢的音乐/收藏】设为公开，即可一键同步！';
            }
            sendJson(res, 200, {
              code: json.code,
              data: [],
              count: 0,
              hasMore: false,
              msg: errorMsg
            });
            return;
          }

          const rawList = (json.data && Array.isArray(json.data.albumlist)) ? json.data.albumlist : [];
          const total = json.data ? (json.data.totalalbum || 0) : 0;

          const formattedList = rawList.map(item => {
            const mid = item.albummid || item.albumMID || item.mid || '';
            let artist = item.singername || item.singerName || '';
            const rawSingers = item.singer_list || item.singer || item.singers || item.vec_singer;
            if (Array.isArray(rawSingers) && rawSingers.length > 0) {
              artist = rawSingers.map(s => s.name || s.singer_name).filter(Boolean).join('/');
            }

            // 严禁使用 item.createtime！createtime 是用户在 QQ 音乐点击收藏专辑的操作时间戳！
            let pubTime = '';
            if (isValidDateStr(item.publicTime)) pubTime = item.publicTime;
            else if (isValidDateStr(item.publishDate)) pubTime = item.publishDate;
            else if (isValidDateStr(item.pubtime)) pubTime = item.pubtime;

            return {
              id: mid,
              mid: mid,
              albumid: item.albumid || item.id,
              name: (item.albumname || item.albumName || item.name || '').trim(),
              artist: artist,
              artists: Array.isArray(rawSingers) ? rawSingers.map(s => ({ name: s.name || s.singer_name })) : [{ name: artist }],
              publishTime: pubTime,
              picUrl: mid ? 'https://y.gtimg.cn/music/photo_new/T002R800x800M000' + mid + '.jpg' : (item.pic || item.albumPic || ''),
              songnum: item.songnum || item.song_cnt || 0
            };
          });

          // 自动补齐缺失有效发行日期的专辑 (只要不是有效合法发行日期，立即异步并发权威补齐)
          const pending = formattedList.filter(it => !isValidDateStr(it.publishTime));
          if (pending.length > 0) {
            console.log('[QQ Music Sublist] 检测到 ' + pending.length + ' 张专辑缺失权威发行日期，启动并发获取...');
            const concurrency = 4;
            let cursor = 0;
            async function worker() {
              while (cursor < pending.length) {
                const it = pending[cursor++];
                const pt = await fetchQQAlbumDetail(it.mid, it.albumid, it.name, it.artist);
                if (pt && isValidDateStr(pt)) {
                  it.publishTime = pt;
                  console.log('[QQ Music Sublist] ✅ 成功补齐发行日期: 《' + it.name + '》 -> ' + pt);
                } else {
                  console.warn('[QQ Music Sublist] ⚠️ 未能获取到《' + it.name + '》的发行日期');
                }
                await new Promise(r => setTimeout(r, 20));
              }
            }
            await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
          }

          const hasMore = (sin + formattedList.length) < total;
          console.log(`[QQ Music Sublist] 分页 ${formattedList.length} 张 (总数: ${total}, hasMore: ${hasMore})`);

          sendJson(res, 200, {
            code: 200,
            data: formattedList,
            count: total,
            hasMore: hasMore
          });
        } catch (e) {
          sendJson(res, 500, { error: '解析 QQ 音乐收藏专辑列表失败: ' + e.message });
        }
      });
    });
    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('请求 QQ 音乐收藏列表超时 (ETIMEDOUT)'));
    });
    proxyReq.on('error', err => sendJson(res, 500, { error: err.message }));
    return;
  }

  // ===== 4. 静态文件服务 =====
  const urlPath = reqUrl.pathname;
  let relativePath = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  // 支持直接访问 preview.html
  let filePath;
  if (relativePath === 'preview.html') {
    filePath = path.join(root, 'preview.html');
  } else {
    filePath = path.resolve(sourceRoot, relativePath);
  }

  if (!filePath.startsWith(sourceRoot + path.sep) && filePath !== path.join(root, 'preview.html')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
    res.end(data);
  });
});

const PORT = 3000;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Dev server running at http://127.0.0.1:${PORT}`);
});
