// 云端同步服务 (Rust 原生纯净版，零外部依赖，无需 Node.js)
// 彻底解决 Windows 用户无 Node.js 环境无法使用云端导入的痛点

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use aes::Aes128Enc;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use cbc::cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7};
use cbc::Encryptor;
use rand::Rng;
use regex::Regex;
use reqwest::blocking::Client;
use rsa::BigUint;
use serde_json::{json, Value};
use tiny_http::{Header, Method, Response, Server, StatusCode};

type Aes128CbcEnc = Encryptor<Aes128Enc>;

const RSA_MODULUS: [u8; 128] = [
    0xe0, 0xb5, 0x09, 0xf6, 0x25, 0x9d, 0xf8, 0x64, 0x2d, 0xbc, 0x35, 0x66, 0x29, 0x01, 0x47, 0x7d,
    0xf2, 0x26, 0x77, 0xec, 0x15, 0x2b, 0x5f, 0xf6, 0x8a, 0xce, 0x61, 0x5b, 0xb7, 0xb7, 0x25, 0x15,
    0x2b, 0x3a, 0xb1, 0x7a, 0x87, 0x6a, 0xea, 0x8a, 0x5a, 0xa7, 0x6d, 0x2e, 0x41, 0x76, 0x29, 0xec,
    0x4e, 0xe3, 0x41, 0xf5, 0x61, 0x35, 0xfc, 0xcf, 0x69, 0x52, 0x80, 0x10, 0x4e, 0x03, 0x12, 0xec,
    0xbd, 0xa9, 0x25, 0x57, 0xc9, 0x38, 0x70, 0x11, 0x4a, 0xf6, 0xc9, 0xd0, 0x5c, 0x4f, 0x7f, 0x0c,
    0x36, 0x85, 0xb7, 0xa4, 0x6b, 0xee, 0x25, 0x59, 0x32, 0x57, 0x5c, 0xce, 0x10, 0xb4, 0x24, 0xd8,
    0x13, 0xcf, 0xe4, 0x87, 0x5d, 0x3e, 0x82, 0x04, 0x7b, 0x97, 0xdd, 0xef, 0x52, 0x74, 0x1d, 0x54,
    0x6b, 0x8e, 0x28, 0x9d, 0xc6, 0x93, 0x5b, 0x3e, 0xce, 0x04, 0x62, 0xdb, 0x0a, 0x22, 0xb8, 0xe7,
];

// ===== 缓存系统 =====
static ALBUM_CACHE: OnceLock<Arc<Mutex<HashMap<String, String>>>> = OnceLock::new();
static CACHE_FILE_PATH: OnceLock<PathBuf> = OnceLock::new();
static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

// ===== 会话与状态存储 =====
struct NeteaseQrSession {
    initial_cookie: String,
    #[allow(dead_code)]
    create_time: u64,
}

struct QqQrSession {
    qrsig: String,
    ptqrtoken: u32,
    create_time: u64,
}

struct QqWxQrSession {
    uuid: String,
    create_time: u64,
}

static NETEASE_QR_SESSIONS: OnceLock<Arc<Mutex<HashMap<String, NeteaseQrSession>>>> = OnceLock::new();
static QQ_QR_SESSIONS: OnceLock<Arc<Mutex<HashMap<String, QqQrSession>>>> = OnceLock::new();
static QQ_WX_QR_SESSIONS: OnceLock<Arc<Mutex<HashMap<String, QqWxQrSession>>>> = OnceLock::new();
static LATEST_SYNC_PAYLOAD: OnceLock<Arc<Mutex<Option<Value>>>> = OnceLock::new();

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn get_client() -> &'static Client {
    HTTP_CLIENT.get_or_init(|| {
        Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .unwrap_or_else(|_| Client::new())
    })
}

fn get_cache() -> &'static Arc<Mutex<HashMap<String, String>>> {
    ALBUM_CACHE.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn get_netease_sessions() -> &'static Arc<Mutex<HashMap<String, NeteaseQrSession>>> {
    NETEASE_QR_SESSIONS.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn get_qq_sessions() -> &'static Arc<Mutex<HashMap<String, QqQrSession>>> {
    QQ_QR_SESSIONS.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn get_qq_wx_sessions() -> &'static Arc<Mutex<HashMap<String, QqWxQrSession>>> {
    QQ_WX_QR_SESSIONS.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn get_latest_payload() -> &'static Arc<Mutex<Option<Value>>> {
    LATEST_SYNC_PAYLOAD.get_or_init(|| Arc::new(Mutex::new(None)))
}

pub fn init_cache_from_app_data(app_data: PathBuf) {
    let cache_path = app_data.join("album-cache.json");
    let _ = CACHE_FILE_PATH.set(cache_path.clone());

    let cache = get_cache();
    let mut map = cache.lock().unwrap();

    let mut loaded = false;
    if cache_path.exists() {
        if let Ok(content) = fs::read_to_string(&cache_path) {
            if let Ok(json_map) = serde_json::from_str::<HashMap<String, Value>>(&content) {
                for (k, v) in json_map {
                    if let Some(s) = v.as_str() {
                        map.insert(k, s.to_string());
                    } else if let Some(n) = v.as_i64() {
                        map.insert(k, n.to_string());
                    }
                }
                println!("[CloudSync] 从磁盘载入 {} 条专辑发行日期缓存", map.len());
                loaded = true;
            }
        }
    }

    if !loaded {
        const EMBEDDED_CACHE: &str = include_str!("../../album-cache.json");
        if let Ok(json_map) = serde_json::from_str::<HashMap<String, Value>>(EMBEDDED_CACHE) {
            for (k, v) in json_map {
                if let Some(s) = v.as_str() {
                    map.insert(k, s.to_string());
                } else if let Some(n) = v.as_i64() {
                    map.insert(k, n.to_string());
                }
            }
            println!("[CloudSync] 从内置种子载入 {} 条专辑发行日期缓存", map.len());
            let _ = fs::write(&cache_path, EMBEDDED_CACHE);
        }
    }
}

fn persist_cache_disk() {
    if let Some(path) = CACHE_FILE_PATH.get() {
        let cache = get_cache();
        let map = cache.lock().unwrap().clone();
        let path_clone = path.clone();
        thread::spawn(move || {
            if let Ok(json_str) = serde_json::to_string_pretty(&map) {
                let _ = fs::write(path_clone, json_str);
            }
        });
    }
}

// ===== 加密辅助 =====
fn aes_128_cbc_encrypt(data: &[u8], key: &[u8], iv: &[u8]) -> Vec<u8> {
    let cipher = match Aes128CbcEnc::new_from_slices(key, iv) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let mut buf = vec![0u8; data.len() + 16];
    buf[..data.len()].copy_from_slice(data);
    match cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, data.len()) {
        Ok(ct) => ct.to_vec(),
        Err(_) => Vec::new(),
    }
}

pub fn weapi(json_val: &Value) -> (String, String) {
    const IV: &[u8] = b"0102030405060708";
    const PRESET_KEY: &[u8] = b"0CoJUm6Qyw8W8jud";
    const BASE62: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    let text = json_val.to_string();
    let mut rng = rand::thread_rng();
    let mut secret_key = [0u8; 16];
    for b in secret_key.iter_mut() {
        let idx = rng.gen_range(0..BASE62.len());
        *b = BASE62[idx];
    }

    let enc1 = aes_128_cbc_encrypt(text.as_bytes(), PRESET_KEY, IV);
    let enc1_b64 = BASE64_STANDARD.encode(&enc1);

    let enc2 = aes_128_cbc_encrypt(enc1_b64.as_bytes(), &secret_key, IV);
    let params = BASE64_STANDARD.encode(&enc2);

    let mut rev_key = secret_key;
    rev_key.reverse();
    let mut padded = vec![0u8; 128 - 16];
    padded.extend_from_slice(&rev_key);

    let n = BigUint::from_bytes_be(&RSA_MODULUS);
    let e = BigUint::from(65537u32);
    let m = BigUint::from_bytes_be(&padded);
    let c = m.modpow(&e, &n);
    let enc_sec_key = format!("{:0256x}", c);

    (params, enc_sec_key)
}

pub fn hash33(t: &str) -> u32 {
    let mut e: i32 = 0;
    for b in t.bytes() {
        e = e.wrapping_add((e << 5).wrapping_add(b as i32));
    }
    (2147483647 & e) as u32
}

pub fn get_gtk(s: &str) -> u32 {
    if s.is_empty() {
        return 5381;
    }
    let mut hash: i32 = 5381;
    for b in s.bytes() {
        hash = hash.wrapping_add((hash << 5).wrapping_add(b as i32));
    }
    (hash & 0x7fffffff) as u32
}

// ===== 日期与时间校验 =====
fn is_valid_netease_timestamp(ts: i64) -> bool {
    // 毫秒时间戳在 1900 年至 2035 年之间
    ts >= -2208988800000 && ts <= 2051222400000 && ts != 0
}

fn is_valid_date_str(s: &str) -> bool {
    let trimmed = s.trim();
    if trimmed.is_empty() || trimmed == "0" || trimmed == "0000-00-00" || trimmed == "1970-01-01" || trimmed.starts_with("0000") {
        return false;
    }
    let re_full = Regex::new(r"^(\d{4})[-./](\d{1,2})[-./](\d{1,2})").unwrap();
    if let Some(caps) = re_full.captures(trimmed) {
        if let Ok(y) = caps[1].parse::<i32>() {
            return y >= 1900 && y <= 2035;
        }
    }
    let re_year = Regex::new(r"^(\d{4})$").unwrap();
    if let Some(caps) = re_year.captures(trimmed) {
        if let Ok(y) = caps[1].parse::<i32>() {
            return y >= 1900 && y <= 2035;
        }
    }
    false
}

// ===== 权威发行日期补齐引擎 =====
fn fetch_netease_album_detail(id_str: &str, album_name: &str, artist_name: &str) -> Option<i64> {
    let cache = get_cache();
    if !id_str.is_empty() {
        let guard = cache.lock().unwrap();
        if let Some(val) = guard.get(id_str) {
            if let Ok(ts) = val.parse::<i64>() {
                if is_valid_netease_timestamp(ts) {
                    return Some(ts);
                }
            }
        }
    }

    let client = get_client();

    // Level 2: weapi 专辑详情
    if !id_str.is_empty() {
        let (params, enc_sec_key) = weapi(&json!({ "id": id_str }));
        let url = format!("https://music.163.com/weapi/v1/album/{}", id_str);
        if let Ok(res) = client.post(&url)
            .header("Referer", "https://music.163.com/")
            .form(&[("params", &params), ("encSecKey", &enc_sec_key)])
            .send()
        {
            if let Ok(j) = res.json::<Value>() {
                if let Some(pt) = j.pointer("/album/publishTime").and_then(|v| v.as_i64()) {
                    if is_valid_netease_timestamp(pt) {
                        cache.lock().unwrap().insert(id_str.to_string(), pt.to_string());
                        persist_cache_disk();
                        return Some(pt);
                    }
                }
            }
        }
    }

    // Level 3: 网易云原生搜索
    if !album_name.is_empty() {
        let kw = format!("{} {}", album_name, artist_name);
        let url = format!("https://music.163.com/api/search/get?s={}&type=10&offset=0&limit=5", urlencoding_encode(&kw));
        if let Ok(res) = client.get(&url).header("Referer", "https://music.163.com/").send() {
            if let Ok(j) = res.json::<Value>() {
                if let Some(albums) = j.pointer("/result/albums").and_then(|v| v.as_array()) {
                    for it in albums {
                        if let Some(pt) = it.get("publishTime").and_then(|v| v.as_i64()) {
                            if is_valid_netease_timestamp(pt) {
                                if !id_str.is_empty() {
                                    cache.lock().unwrap().insert(id_str.to_string(), pt.to_string());
                                    persist_cache_disk();
                                }
                                return Some(pt);
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

fn fetch_qq_album_detail(mid: &str, albumid: &str, album_name: &str, singer_name: &str) -> Option<String> {
    let cache_key = format!("qq_{}", if !mid.is_empty() { mid } else if !albumid.is_empty() { albumid } else { album_name });
    let cache = get_cache();
    {
        let guard = cache.lock().unwrap();
        if let Some(val) = guard.get(&cache_key) {
            if is_valid_date_str(val) {
                return Some(val.clone());
            }
        }
    }

    let client = get_client();

    // Level 1: musicu.fcg 原生接口 (GetAlbumDetail)
    if !mid.is_empty() {
        let body = json!({
            "comm": { "ct": 24, "cv": 0 },
            "album": {
                "module": "music.musichallAlbum.AlbumInfoServer",
                "method": "GetAlbumDetail",
                "param": {
                    "albumMid": mid,
                    "albumId": albumid.parse::<i64>().unwrap_or(0)
                }
            }
        });
        if let Ok(res) = client.post("https://u.y.qq.com/cgi-bin/musicu.fcg")
            .header("Referer", "https://y.qq.com/")
            .json(&body)
            .send()
        {
            if let Ok(j) = res.json::<Value>() {
                if let Some(pd) = j.pointer("/album/data/basicInfo/publishDate").and_then(|v| v.as_str()) {
                    if is_valid_date_str(pd) {
                        cache.lock().unwrap().insert(cache_key, pd.to_string());
                        persist_cache_disk();
                        return Some(pd.to_string());
                    }
                }
            }
        }
    }

    // Level 2: fcg_v8_album_info_cp.fcg
    if !mid.is_empty() {
        let url = format!("https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg?albummid={}&format=json", mid);
        if let Ok(res) = client.get(&url).header("Referer", "https://y.qq.com/").send() {
            if let Ok(j) = res.json::<Value>() {
                if let Some(ad) = j.pointer("/data/aDate").and_then(|v| v.as_str()) {
                    if is_valid_date_str(ad) {
                        cache.lock().unwrap().insert(cache_key, ad.to_string());
                        persist_cache_disk();
                        return Some(ad.to_string());
                    }
                }
            }
        }
    }

    // Level 3: QQ 音乐搜索 client_search_cp
    if !album_name.is_empty() || !mid.is_empty() {
        let kw = format!("{} {}", singer_name, if !album_name.is_empty() { album_name } else { mid });
        let url = format!("https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=5&t=8&w={}&format=json", urlencoding_encode(&kw));
        if let Ok(res) = client.get(&url).header("Referer", "https://y.qq.com/").send() {
            if let Ok(j) = res.json::<Value>() {
                if let Some(list) = j.pointer("/data/album/list").and_then(|v| v.as_array()) {
                    for it in list {
                        if let Some(pt) = it.get("publicTime").and_then(|v| v.as_str()) {
                            if is_valid_date_str(pt) {
                                cache.lock().unwrap().insert(cache_key, pt.to_string());
                                persist_cache_disk();
                                return Some(pt.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

fn urlencoding_encode(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

// ===== HTTP 响应封装 =====
fn send_cors_json(req: tiny_http::Request, status: u16, data: Value) {
    let json_bytes = serde_json::to_vec(&data).unwrap_or_else(|_| b"{}".to_vec());
    let response = Response::new(
        StatusCode(status),
        vec![
            Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, POST, OPTIONS"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type, Cookie, Authorization"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Allow-Credentials"[..], &b"true"[..]).unwrap(),
        ],
        &json_bytes[..],
        Some(json_bytes.len()),
        None,
    );
    let _ = req.respond(response);
}

fn send_cors_options(req: tiny_http::Request) {
    let response = Response::new(
        StatusCode(200),
        vec![
            Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, POST, OPTIONS"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type, Cookie, Authorization"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Allow-Credentials"[..], &b"true"[..]).unwrap(),
        ],
        &b""[..],
        Some(0),
        None,
    );
    let _ = req.respond(response);
}

// ===== 核心请求路由器 =====
fn handle_request(mut req: tiny_http::Request) {
    if req.method() == &Method::Options {
        send_cors_options(req);
        return;
    }

    let raw_url = req.url().to_string();
    let parsed_url = match url::Url::parse(&format!("http://127.0.0.1:3000{}", raw_url)) {
        Ok(u) => u,
        Err(_) => {
            send_cors_json(req, 400, json!({ "error": "Invalid URL" }));
            return;
        }
    };
    let pathname = parsed_url.path();
    let query: HashMap<String, String> = parsed_url.query_pairs().into_owned().collect();

    let client = get_client();

    match pathname {
        // 0. 健康检查
        "/api/health" => {
            send_cors_json(req, 200, json!({ "ok": true, "status": "ready", "engine": "rust-native" }));
        }

        // 0.1 跨端官方网站同步数据中转
        "/api/cloud/sync_payload" => {
            let mut body_str = String::new();
            let _ = req.as_reader().read_to_string(&mut body_str);
            if let Ok(mut payload) = serde_json::from_str::<Value>(&body_str) {
                let platform = payload.get("platform").and_then(|v| v.as_str()).unwrap_or("netease").to_string();
                let p_type = payload.get("type").and_then(|v| v.as_str()).unwrap_or("credentials").to_string();

                // 如果是 albums 列表，处理标准化
                if p_type == "albums" {
                    if let Some(albums) = payload.get_mut("albums").and_then(|v| v.as_array_mut()) {
                        for it in albums.iter_mut() {
                            let id_str = it.get("id").or_else(|| it.get("mid")).map(|v| v.to_string().trim_matches('"').to_string()).unwrap_or_default();
                            let name = it.get("name").or_else(|| it.get("albumname")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let artist = it.get("artist").or_else(|| it.get("singerName")).and_then(|v| v.as_str()).unwrap_or("").to_string();

                            if platform == "netease" {
                                let cur_pt = it.get("publishTime").and_then(|v| v.as_i64()).unwrap_or(0);
                                if !is_valid_netease_timestamp(cur_pt) {
                                    if let Some(pt) = fetch_netease_album_detail(&id_str, &name, &artist) {
                                        it["publishTime"] = json!(pt);
                                    }
                                }
                            } else if platform == "qq" {
                                let cur_pt = it.get("publishTime").and_then(|v| v.as_str()).unwrap_or("");
                                if !is_valid_date_str(cur_pt) {
                                    if let Some(pt) = fetch_qq_album_detail(&id_str, "", &name, &artist) {
                                        it["publishTime"] = json!(pt);
                                    }
                                }
                            }
                        }
                    }
                }

                let ts = now_millis();
                let mut guard = get_latest_payload().lock().unwrap();
                *guard = Some(json!({
                    "platform": platform,
                    "type": p_type,
                    "data": payload,
                    "timestamp": ts
                }));

                send_cors_json(req, 200, json!({ "success": true, "message": "数据已接收并就绪", "timestamp": ts }));
            } else {
                send_cors_json(req, 400, json!({ "success": false, "error": "Invalid JSON payload" }));
            }
        }

        "/api/cloud/sync_status" => {
            let guard = get_latest_payload().lock().unwrap();
            if let Some(ref payload) = *guard {
                send_cors_json(req, 200, json!({
                    "success": true,
                    "hasData": true,
                    "platform": payload["platform"],
                    "type": payload["type"],
                    "data": payload["data"],
                    "timestamp": payload["timestamp"]
                }));
            } else {
                send_cors_json(req, 200, json!({ "success": true, "hasData": false }));
            }
        }

        "/api/cloud/clear_sync_status" => {
            let mut guard = get_latest_payload().lock().unwrap();
            *guard = None;
            send_cors_json(req, 200, json!({ "success": true }));
        }

        // 1. 网易云扫码
        "/api/netease/qr/unikey" => {
            match client.get("https://music.163.com/api/login/qrcode/unikey?type=1")
                .header("Referer", "https://music.163.com/")
                .send()
            {
                Ok(res) => {
                    let mut session_cookies = vec!["os=pc".to_string()];
                    for c in res.cookies() {
                        session_cookies.push(format!("{}={}", c.name(), c.value()));
                    }
                    let session_cookie = session_cookies.join("; ");

                    if let Ok(mut j) = res.json::<Value>() {
                        if let Some(unikey) = j.get("unikey").and_then(|v| v.as_str()) {
                            get_netease_sessions().lock().unwrap().insert(
                                unikey.to_string(),
                                NeteaseQrSession {
                                    initial_cookie: session_cookie.clone(),
                                    create_time: now_millis(),
                                },
                            );
                            j["cookie"] = json!(session_cookie);
                        }
                        send_cors_json(req, 200, j);
                    } else {
                        send_cors_json(req, 500, json!({ "error": "Failed to parse unikey response" }));
                    }
                }
                Err(e) => {
                    send_cors_json(req, 500, json!({ "error": e.to_string() }));
                }
            }
        }

        "/api/netease/qr/check" => {
            let key = query.get("key").cloned().unwrap_or_default();
            if key.is_empty() {
                send_cors_json(req, 400, json!({ "error": "Missing key parameter" }));
                return;
            }

            let client_cookie = query.get("cookie").cloned().unwrap_or_default();
            let session_cookie = {
                let guard = get_netease_sessions().lock().unwrap();
                guard.get(&key).map(|s| s.initial_cookie.clone()).unwrap_or(client_cookie)
            };
            let effective_cookie = if session_cookie.is_empty() { "os=pc".to_string() } else { session_cookie };

            let (params, enc_sec_key) = weapi(&json!({ "key": key, "type": 1 }));
            let check_res = client.post("https://music.163.com/weapi/login/qrcode/client/login")
                .header("Referer", "https://music.163.com/")
                .header("Cookie", &effective_cookie)
                .form(&[("params", &params), ("encSecKey", &enc_sec_key)])
                .send();

            let mut music_u = String::new();
            let mut cookies_list = vec![effective_cookie.clone()];

            let mut final_json = json!({ "code": 801, "message": "等待扫码" });

            if let Ok(res) = check_res {
                for c in res.cookies() {
                    cookies_list.push(format!("{}={}", c.name(), c.value()));
                    if c.name() == "MUSIC_U" {
                        music_u = c.value().to_string();
                    }
                }
                if let Ok(j) = res.json::<Value>() {
                    final_json = j;
                    if let Some(raw_cookie) = final_json.get("cookie").and_then(|v| v.as_str()) {
                        let re_u = Regex::new(r"MUSIC_U=([^;]+)").unwrap();
                        if let Some(caps) = re_u.captures(raw_cookie) {
                            if music_u.is_empty() {
                                music_u = caps[1].to_string();
                            }
                        }
                        cookies_list.push(raw_cookie.to_string());
                    }
                }
            }

            // 若未提取到且不是终态，尝试 Plain API 兜底
            let cur_code = final_json.get("code").and_then(|v| v.as_i64()).unwrap_or(801);
            if music_u.is_empty() && cur_code != 803 && cur_code != 801 && cur_code != 802 && cur_code != 800 {
                if let Ok(p_res) = client.post("https://music.163.com/api/login/qrcode/client/login")
                    .header("Referer", "https://music.163.com/")
                    .header("Cookie", &effective_cookie)
                    .form(&[("key", &key), ("type", &"1".to_string())])
                    .send()
                {
                    for c in p_res.cookies() {
                        cookies_list.push(format!("{}={}", c.name(), c.value()));
                        if c.name() == "MUSIC_U" {
                            music_u = c.value().to_string();
                        }
                    }
                    if let Ok(pj) = p_res.json::<Value>() {
                        if let Some(code_val) = pj.get("code").and_then(|v| v.as_i64()) {
                            if code_val == 803 || !music_u.is_empty() {
                                final_json["code"] = json!(803);
                                final_json["success"] = json!(true);
                            } else if code_val == 802 {
                                final_json["code"] = json!(802);
                            }
                        }
                    }
                }
            }

            if !music_u.is_empty() || final_json.get("code").and_then(|v| v.as_i64()) == Some(803) {
                final_json["code"] = json!(803);
                final_json["success"] = json!(true);
                final_json["musicU"] = json!(music_u);
                get_netease_sessions().lock().unwrap().remove(&key);
            }

            let cookie_str = cookies_list.join("; ");
            final_json["cookie"] = json!(cookie_str);

            send_cors_json(req, 200, final_json);
        }

        // 1.1 网易云短信登录
        "/api/netease/sms/send" => {
            let mut body_str = String::new();
            let _ = req.as_reader().read_to_string(&mut body_str);
            let body_json: Value = serde_json::from_str(&body_str).unwrap_or_default();
            let phone = body_json.get("phone").and_then(|v| v.as_str()).unwrap_or("").trim();
            if phone.len() != 11 {
                send_cors_json(req, 400, json!({ "success": false, "message": "请输入正确的11位中国大陆手机号码" }));
                return;
            }

            let (params, enc_sec_key) = weapi(&json!({ "ctcode": "86", "cellphone": phone }));
            match client.post("https://music.163.com/weapi/sms/captcha/sent")
                .header("Referer", "https://music.163.com/")
                .form(&[("params", &params), ("encSecKey", &enc_sec_key)])
                .send()
            {
                Ok(res) => {
                    let j: Value = res.json().unwrap_or_default();
                    if j.get("code").and_then(|v| v.as_i64()) == Some(200) {
                        send_cors_json(req, 200, json!({ "success": true, "message": "验证码已发送至手机" }));
                    } else {
                        send_cors_json(req, 200, json!({ "success": false, "code": j["code"], "message": j["message"] }));
                    }
                }
                Err(e) => send_cors_json(req, 500, json!({ "success": false, "message": e.to_string() })),
            }
        }

        "/api/netease/sms/verify" => {
            let mut body_str = String::new();
            let _ = req.as_reader().read_to_string(&mut body_str);
            let body_json: Value = serde_json::from_str(&body_str).unwrap_or_default();
            let phone = body_json.get("phone").and_then(|v| v.as_str()).unwrap_or("").trim();
            let captcha = body_json.get("captcha").and_then(|v| v.as_str()).unwrap_or("").trim();

            let (params, enc_sec_key) = weapi(&json!({
                "countrycode": "86",
                "phone": phone,
                "cellphone": phone,
                "captcha": captcha,
                "rememberLogin": "true"
            }));

            match client.post("https://music.163.com/weapi/login/cellphone")
                .header("Referer", "https://music.163.com/")
                .form(&[("params", &params), ("encSecKey", &enc_sec_key)])
                .send()
            {
                Ok(res) => {
                    let mut music_u = String::new();
                    let mut cookie_list = Vec::new();
                    for c in res.cookies() {
                        cookie_list.push(format!("{}={}", c.name(), c.value()));
                        if c.name() == "MUSIC_U" {
                            music_u = c.value().to_string();
                        }
                    }
                    let j: Value = res.json().unwrap_or_default();
                    if j.get("code").and_then(|v| v.as_i64()) == Some(200) {
                        send_cors_json(req, 200, json!({
                            "success": true,
                            "code": 200,
                            "musicU": music_u,
                            "cookie": cookie_list.join("; "),
                            "user": {
                                "nickname": j.pointer("/profile/nickname").unwrap_or(&json!("")),
                                "avatarUrl": j.pointer("/profile/avatarUrl").unwrap_or(&json!(""))
                            }
                        }));
                    } else {
                        send_cors_json(req, 200, json!({
                            "success": false,
                            "code": j["code"],
                            "message": j.get("message").unwrap_or(&json!("验证码错误或已失效"))
                        }));
                    }
                }
                Err(e) => send_cors_json(req, 500, json!({ "success": false, "message": e.to_string() })),
            }
        }

        // 1.2 网易云收藏专辑列表
        "/api/netease/album/sublist" => {
            let mut body_str = String::new();
            let _ = req.as_reader().read_to_string(&mut body_str);
            let body_json: Value = serde_json::from_str(&body_str).unwrap_or_default();

            let cookie = body_json.get("cookie").and_then(|v| v.as_str())
                .or_else(|| query.get("cookie").map(|s| s.as_str()))
                .unwrap_or("").trim();
            let limit = body_json.get("limit").and_then(|v| v.as_i64())
                .or_else(|| query.get("limit").and_then(|s| s.parse().ok()))
                .unwrap_or(50);
            let offset = body_json.get("offset").and_then(|v| v.as_i64())
                .or_else(|| query.get("offset").and_then(|s| s.parse().ok()))
                .unwrap_or(0);

            let formatted_cookie = if cookie.contains("MUSIC_U=") {
                cookie.to_string()
            } else {
                format!("MUSIC_U={}", cookie)
            };

            let (params, enc_sec_key) = weapi(&json!({ "limit": limit, "offset": offset, "total": true }));
            match client.post("https://music.163.com/weapi/album/sublist")
                .header("Referer", "https://music.163.com/")
                .header("Cookie", &formatted_cookie)
                .form(&[("params", &params), ("encSecKey", &enc_sec_key)])
                .send()
            {
                Ok(res) => {
                    if let Ok(mut j) = res.json::<Value>() {
                        if j.get("code").and_then(|v| v.as_i64()) != Some(200) {
                            send_cors_json(req, 200, j);
                            return;
                        }

                        let total = j.get("count").or_else(|| j.get("total")).and_then(|v| v.as_i64()).unwrap_or(0);
                        let has_more = j.get("hasMore").and_then(|v| v.as_bool()).unwrap_or(false);

                        if let Some(data) = j.get_mut("data").and_then(|v| v.as_array_mut()) {
                            for it in data.iter_mut() {
                                let id_str = it.get("id").map(|v| v.to_string()).unwrap_or_default();
                                let mut pt = it.get("publishTime").and_then(|v| v.as_i64()).unwrap_or(0);
                                if !is_valid_netease_timestamp(pt) {
                                    if let Some(pub_time) = it.get("pubTime").and_then(|v| v.as_i64()) {
                                        if is_valid_netease_timestamp(pub_time) {
                                            pt = pub_time;
                                            it["publishTime"] = json!(pt);
                                        }
                                    }
                                }

                                if !is_valid_netease_timestamp(pt) {
                                    let name = it.get("name").and_then(|v| v.as_str()).unwrap_or("");
                                    let artist = it.pointer("/artist/name").and_then(|v| v.as_str()).unwrap_or("");
                                    if let Some(new_pt) = fetch_netease_album_detail(&id_str, name, artist) {
                                        it["publishTime"] = json!(new_pt);
                                    }
                                }
                            }
                        }

                        send_cors_json(req, 200, json!({
                            "code": 200,
                            "data": j["data"],
                            "count": total,
                            "hasMore": has_more
                        }));
                    } else {
                        send_cors_json(req, 500, json!({ "error": "Failed to parse netease sublist response" }));
                    }
                }
                Err(e) => send_cors_json(req, 500, json!({ "error": e.to_string() })),
            }
        }

        // 2. QQ 音乐微信扫码
        "/api/qq/wx/qr/create" => {
            let wx_connect_url = "https://open.weixin.qq.com/connect/qrconnect?appid=wx48db31d50e334801&redirect_uri=https%3A%2F%2Fy.qq.com%2Fportal%2Fwx_redirect.html&response_type=code&scope=snsapi_login&state=STATE#wechat_redirect";
            match client.get(wx_connect_url).send() {
                Ok(res) => {
                    let body = res.text().unwrap_or_default();
                    let re = Regex::new(r"qrcode/([a-zA-Z0-9_\-]+)").unwrap();
                    if let Some(caps) = re.captures(&body) {
                        let uuid = caps[1].to_string();
                        let qr_key = format!("wx_qr_{}_{}", now_millis(), rand::thread_rng().gen_range(1000..9999));
                        get_qq_wx_sessions().lock().unwrap().insert(qr_key.clone(), QqWxQrSession {
                            uuid: uuid.clone(),
                            create_time: now_millis(),
                        });

                        let img_url = format!("https://open.weixin.qq.com/connect/qrcode/{}", uuid);
                        if let Ok(img_res) = client.get(&img_url).send() {
                            let bytes = img_res.bytes().unwrap_or_default();
                            let b64 = format!("data:image/jpeg;base64,{}", BASE64_STANDARD.encode(&bytes));
                            send_cors_json(req, 200, json!({
                                "success": true,
                                "qrKey": qr_key,
                                "qrImgData": b64
                            }));
                        } else {
                            send_cors_json(req, 500, json!({ "success": false, "error": "下载微信二维码失败" }));
                        }
                    } else {
                        send_cors_json(req, 500, json!({ "success": false, "error": "未能提取微信二维码标识" }));
                    }
                }
                Err(e) => send_cors_json(req, 500, json!({ "success": false, "error": e.to_string() })),
            }
        }

        "/api/qq/wx/qr/check" => {
            let qr_key = query.get("qrKey").cloned().unwrap_or_default();
            let session_opt = get_qq_wx_sessions().lock().unwrap().get(&qr_key).map(|s| (s.uuid.clone(), s.create_time));
            let (uuid, create_time) = match session_opt {
                Some(s) => s,
                None => {
                    send_cors_json(req, 200, json!({ "success": false, "code": 65, "message": "二维码已失效，请刷新" }));
                    return;
                }
            };

            if now_millis().saturating_sub(create_time) > 180000 {
                get_qq_wx_sessions().lock().unwrap().remove(&qr_key);
                send_cors_json(req, 200, json!({ "success": false, "code": 65, "message": "二维码已失效，请刷新" }));
                return;
            }

            let poll_url = format!("https://long.open.weixin.qq.com/connect/l/qrconnect?uuid={}&_={}", uuid, now_millis());
            match client.get(&poll_url).send() {
                Ok(res) => {
                    let body = res.text().unwrap_or_default();
                    let re_code = Regex::new(r"wx_errcode=(\d+)").unwrap();
                    let errcode = re_code.captures(&body).and_then(|c| c[1].parse::<i32>().ok()).unwrap_or(408);

                    if errcode == 408 {
                        send_cors_json(req, 200, json!({ "success": true, "code": 66, "message": "请使用微信扫一扫授权登录" }));
                        return;
                    }
                    if errcode == 404 {
                        send_cors_json(req, 200, json!({ "success": true, "code": 67, "message": "📱 微信已扫描，请在手机上点击允许登录" }));
                        return;
                    }
                    if errcode == 403 || errcode == 402 {
                        get_qq_wx_sessions().lock().unwrap().remove(&qr_key);
                        send_cors_json(req, 200, json!({ "success": true, "code": 65, "message": "二维码已失效，请点击刷新" }));
                        return;
                    }

                    if errcode == 405 {
                        let re_wx = Regex::new(r"wx_code='([^']+)'").unwrap();
                        let wx_code = re_wx.captures(&body).map(|c| c[1].to_string()).unwrap_or_default();
                        get_qq_wx_sessions().lock().unwrap().remove(&qr_key);

                        if wx_code.is_empty() {
                            send_cors_json(req, 200, json!({ "success": false, "code": -1, "message": "未能提取微信授权码" }));
                            return;
                        }

                        // 换取凭据
                        let fcg_body = json!({
                            "comm": {
                                "g_tk": 5381,
                                "platform": "yqq",
                                "ct": 24,
                                "cv": 0,
                                "tmeAppID": "qqmusic",
                                "tmeLoginType": "1"
                            },
                            "req": {
                                "module": "music.login.LoginServer",
                                "method": "Login",
                                "param": {
                                    "strAppid": "wx48db31d50e334801",
                                    "code": wx_code,
                                    "onlyopenid": 0
                                }
                            }
                        });

                        if let Ok(fcg_res) = client.post("https://u.y.qq.com/cgi-bin/musicu.fcg")
                            .header("Referer", "https://y.qq.com/portal/wx_redirect.html")
                            .json(&fcg_body)
                            .send()
                        {
                            let mut cookie_map: HashMap<String, String> = HashMap::new();
                            for c in fcg_res.cookies() {
                                cookie_map.insert(c.name().to_string(), c.value().to_string());
                            }

                            let mut uin = String::new();
                            let mut musickey = String::new();
                            let mut openid = String::new();

                            if let Ok(j) = fcg_res.json::<Value>() {
                                if let Some(d) = j.pointer("/req/data") {
                                    uin = d.get("str_musicid").or_else(|| d.get("musicid")).or_else(|| d.get("encryptUin")).or_else(|| d.get("openid")).map(|v| v.to_string().trim_matches('"').to_string()).unwrap_or_default();
                                    musickey = d.get("musickey").or_else(|| d.get("refresh_token")).or_else(|| d.get("token")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    openid = d.get("openid").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                }
                            }

                            if uin.is_empty() {
                                uin = cookie_map.get("wxuin").or_else(|| cookie_map.get("uin")).cloned().unwrap_or_default();
                            }
                            if musickey.is_empty() {
                                musickey = cookie_map.get("qm_keyst").or_else(|| cookie_map.get("qqmusic_key")).or_else(|| cookie_map.get("music_key")).cloned().unwrap_or_default();
                            }

                            if !uin.is_empty() {
                                cookie_map.insert("uin".to_string(), uin.clone());
                                cookie_map.insert("wxuin".to_string(), uin.clone());
                            }
                            if !musickey.is_empty() {
                                cookie_map.insert("qm_keyst".to_string(), musickey.clone());
                                cookie_map.insert("qqmusic_key".to_string(), musickey.clone());
                                cookie_map.insert("music_key".to_string(), musickey.clone());
                            }
                            if !openid.is_empty() {
                                cookie_map.insert("wxopenid".to_string(), openid);
                            }
                            cookie_map.insert("login_type".to_string(), "2".to_string());

                            let cookie_str = cookie_map.iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join("; ");
                            send_cors_json(req, 200, json!({
                                "success": true,
                                "code": 0,
                                "accountType": "wechat",
                                "uin": uin.trim_start_matches(|c| c == 'o' || c == 'O'),
                                "cookie": cookie_str,
                                "message": "登录成功"
                            }));
                            return;
                        }
                    }

                    send_cors_json(req, 200, json!({ "success": true, "code": 66, "message": "请使用微信扫一扫授权登录" }));
                }
                Err(_) => send_cors_json(req, 200, json!({ "success": true, "code": 66, "message": "轮询中..." })),
            }
        }

        // 2.1 QQ 音乐 QQ 扫码
        "/api/qq/qr/create" => {
            let qr_url = format!("https://ssl.ptlogin2.qq.com/ptqrshow?appid=716027609&e=2&l=M&s=3&d=72&v=4&t={}&daid=383&pt_3rd_aid=101372833", rand::thread_rng().gen::<f64>());
            match client.get(&qr_url).send() {
                Ok(res) => {
                    let mut qrsig = String::new();
                    for c in res.cookies() {
                        if c.name() == "qrsig" {
                            qrsig = c.value().to_string();
                        }
                    }

                    if qrsig.is_empty() {
                        send_cors_json(req, 500, json!({ "success": false, "error": "未能获取 QQ 二维码凭据" }));
                        return;
                    }

                    let ptqrtoken = hash33(&qrsig);
                    let qr_key = format!("qq_qr_{}_{}", now_millis(), rand::thread_rng().gen_range(1000..9999));
                    get_qq_sessions().lock().unwrap().insert(qr_key.clone(), QqQrSession {
                        qrsig,
                        ptqrtoken,
                        create_time: now_millis(),
                    });

                    let bytes = res.bytes().unwrap_or_default();
                    let b64 = format!("data:image/png;base64,{}", BASE64_STANDARD.encode(&bytes));
                    send_cors_json(req, 200, json!({
                        "success": true,
                        "qrKey": qr_key,
                        "qrImgData": b64
                    }));
                }
                Err(e) => send_cors_json(req, 500, json!({ "success": false, "error": e.to_string() })),
            }
        }

        "/api/qq/qr/check" => {
            let qr_key = query.get("qrKey").cloned().unwrap_or_default();
            let session_opt = get_qq_sessions().lock().unwrap().get(&qr_key).map(|s| (s.qrsig.clone(), s.ptqrtoken, s.create_time));
            let (qrsig, ptqrtoken, create_time) = match session_opt {
                Some(s) => s,
                None => {
                    send_cors_json(req, 200, json!({ "success": false, "code": 65, "message": "二维码已失效，请刷新" }));
                    return;
                }
            };

            if now_millis().saturating_sub(create_time) > 180000 {
                get_qq_sessions().lock().unwrap().remove(&qr_key);
                send_cors_json(req, 200, json!({ "success": false, "code": 65, "message": "二维码已失效，请刷新" }));
                return;
            }

            let check_url = format!(
                "https://ssl.ptlogin2.qq.com/ptqrlogin?u1=https%3A%2F%2Fgraph.qq.com%2Foauth2.0%2Flogin_jump&ptqrtoken={}&ptredirect=0&h=1&t=1&g=1&from_ui=1&ptlang=2052&action=0-0-{}&js_ver=24032116&js_type=1&login_sig=&pt_uistyle=40&aid=716027609&daid=383&pt_3rd_aid=101372833",
                ptqrtoken, now_millis()
            );

            match client.get(&check_url)
                .header("Cookie", format!("qrsig={};", qrsig))
                .header("Referer", "https://xui.ptlogin2.qq.com/")
                .send()
            {
                Ok(res) => {
                    let mut all_cookies: HashMap<String, String> = HashMap::new();
                    all_cookies.insert("qrsig".to_string(), qrsig.clone());
                    for c in res.cookies() {
                        all_cookies.insert(c.name().to_string(), c.value().to_string());
                    }

                    let body = res.text().unwrap_or_default();
                    let re_cb = Regex::new(r"ptuiCB\((.*?)\)").unwrap();
                    if let Some(caps) = re_cb.captures(&body) {
                        let inner = &caps[1];
                        let re_args = Regex::new(r"'([^']*)'").unwrap();
                        let args: Vec<String> = re_args.captures_iter(inner).map(|c| c[1].to_string()).collect();

                        let status_code = args.get(0).and_then(|s| s.parse::<i32>().ok()).unwrap_or(-1);
                        let redirect_url = args.get(2).cloned().unwrap_or_default();
                        let status_msg = args.get(4).cloned().unwrap_or_default();
                        let nick = args.get(5).cloned().unwrap_or_default();

                        if status_code == 66 {
                            send_cors_json(req, 200, json!({ "success": true, "code": 66, "message": "二维码未失效，请使用手机QQ扫码" }));
                            return;
                        }
                        if status_code == 67 {
                            send_cors_json(req, 200, json!({ "success": true, "code": 67, "message": "二维码认证中，请在手机上点击确认登录" }));
                            return;
                        }
                        if status_code == 65 {
                            get_qq_sessions().lock().unwrap().remove(&qr_key);
                            send_cors_json(req, 200, json!({ "success": true, "code": 65, "message": "二维码已失效，请刷新" }));
                            return;
                        }

                        if status_code == 0 {
                            get_qq_sessions().lock().unwrap().remove(&qr_key);
                            let mut uin = String::new();
                            if !redirect_url.is_empty() {
                                let re_uin = Regex::new(r"uin=([0-9a-zA-Z_]+)").unwrap();
                                if let Some(uc) = re_uin.captures(&redirect_url) {
                                    uin = uc[1].trim_start_matches(|c| c == 'o' || c == 'O').to_string();
                                }
                            }
                            if uin.is_empty() {
                                if let Some(u) = all_cookies.get("uin") {
                                    uin = u.trim_start_matches(|c| c == 'o' || c == 'O').to_string();
                                }
                            }

                            // 跟进 redirect_url 获取核心业务 Cookies (p_skey 等)
                            if !redirect_url.is_empty() {
                                let cookie_header = all_cookies.iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join("; ");
                                if let Ok(sig_res) = client.get(&redirect_url)
                                    .header("Cookie", &cookie_header)
                                    .header("Referer", "https://xui.ptlogin2.qq.com/")
                                    .send()
                                {
                                    for c in sig_res.cookies() {
                                        all_cookies.insert(c.name().to_string(), c.value().to_string());
                                    }
                                }
                            }

                            let full_cookie = all_cookies.iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join("; ");
                            send_cors_json(req, 200, json!({
                                "success": true,
                                "code": 0,
                                "message": "登录成功",
                                "uin": uin,
                                "nick": nick,
                                "cookie": full_cookie
                            }));
                            return;
                        }

                        send_cors_json(req, 200, json!({ "success": false, "code": status_code, "message": status_msg }));
                    } else {
                        send_cors_json(req, 200, json!({ "success": false, "code": -1, "message": "解析腾讯响应异常" }));
                    }
                }
                Err(e) => send_cors_json(req, 500, json!({ "success": false, "error": e.to_string() })),
            }
        }

        // 3. QQ 音乐数据 API
        "/api/qq/verify" => {
            let mut body_str = String::new();
            let _ = req.as_reader().read_to_string(&mut body_str);
            let body_json: Value = serde_json::from_str(&body_str).unwrap_or_default();

            let mut uin = body_json.get("uin").and_then(|v| v.as_str())
                .or_else(|| query.get("uin").map(|s| s.as_str()))
                .unwrap_or("").trim().to_string();
            let cookie = body_json.get("cookie").and_then(|v| v.as_str())
                .or_else(|| query.get("cookie").map(|s| s.as_str()))
                .unwrap_or("").trim();

            if uin.is_empty() && !cookie.is_empty() {
                let re_uin = Regex::new(r"uin=([0-9a-zA-Z_]+)").unwrap();
                if let Some(c) = re_uin.captures(cookie) {
                    uin = c[1].trim_start_matches(|ch| ch == 'o' || ch == 'O').to_string();
                }
            }

            if uin.is_empty() {
                send_cors_json(req, 400, json!({ "success": false, "error": "缺少 QQ 账号 (uin)" }));
                return;
            }

            let mut gtk = 5381;
            let re_pskey = Regex::new(r"p_skey=([^;]+)").unwrap();
            let re_skey = Regex::new(r"(?:^|;\s*)skey=([^;]+)").unwrap();
            if let Some(c) = re_pskey.captures(cookie) {
                gtk = get_gtk(&c[1]);
            } else if let Some(c) = re_skey.captures(cookie) {
                gtk = get_gtk(&c[1]);
            }

            let cookie_header = if cookie.contains("uin=") { cookie.to_string() } else { format!("uin={}; {}", uin, cookie) };
            let target_url = format!(
                "https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg?g_tk={}&loginUin={}&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&ct=20&cid=205360956&userid={}&reqtype=2&sin=0&ein=1",
                gtk, urlencoding_encode(&uin), urlencoding_encode(&uin)
            );

            match client.get(&target_url)
                .header("Referer", "https://y.qq.com/")
                .header("Cookie", &cookie_header)
                .send()
            {
                Ok(res) => {
                    if let Ok(j) = res.json::<Value>() {
                        let code = j.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
                        if code == 0 {
                            let total = j.pointer("/data/totalalbum").and_then(|v| v.as_i64()).unwrap_or(0);
                            send_cors_json(req, 200, json!({ "success": true, "total": total, "uin": uin }));
                        } else if code == 4000 {
                            send_cors_json(req, 200, json!({
                                "success": false,
                                "code": 4000,
                                "error": "隐私权限限制：您的 QQ 音乐收藏专辑当前设置为「仅自己可见」。请在手机 QQ 音乐 APP 中进入【我的】➜ 右上角【设置】➜【隐私设置】➜【个人主页隐私设置】将【我喜欢的音乐/收藏】设为公开，即可一键同步！"
                            }));
                        } else {
                            send_cors_json(req, 200, json!({ "success": false, "code": code, "error": j.get("msg").unwrap_or(&json!("验证失败")) }));
                        }
                    } else {
                        send_cors_json(req, 500, json!({ "success": false, "error": "解析 QQ 音乐响应异常" }));
                    }
                }
                Err(e) => send_cors_json(req, 500, json!({ "success": false, "error": e.to_string() })),
            }
        }

        "/api/qq/album/detail" => {
            let mid = query.get("mid").cloned().unwrap_or_default();
            let albumid = query.get("albumid").cloned().unwrap_or_default();
            let name = query.get("name").cloned().unwrap_or_default();
            let artist = query.get("artist").cloned().unwrap_or_default();

            let pt = fetch_qq_album_detail(&mid, &albumid, &name, &artist).unwrap_or_default();
            send_cors_json(req, 200, json!({ "mid": mid, "publishTime": pt }));
        }

        "/api/qq/album/sublist" => {
            let mut body_str = String::new();
            let _ = req.as_reader().read_to_string(&mut body_str);
            let body_json: Value = serde_json::from_str(&body_str).unwrap_or_default();

            let mut uin = body_json.get("uin").and_then(|v| v.as_str())
                .or_else(|| query.get("uin").map(|s| s.as_str()))
                .unwrap_or("").trim().to_string();
            let cookie = body_json.get("cookie").and_then(|v| v.as_str())
                .or_else(|| query.get("cookie").map(|s| s.as_str()))
                .unwrap_or("").trim();
            let sin = body_json.get("sin").and_then(|v| v.as_i64())
                .or_else(|| query.get("sin").and_then(|s| s.parse().ok()))
                .unwrap_or(0);
            let limit = body_json.get("limit").and_then(|v| v.as_i64())
                .or_else(|| query.get("limit").and_then(|s| s.parse().ok()))
                .unwrap_or(30);
            let ein = sin + limit - 1;

            if uin.is_empty() && !cookie.is_empty() {
                let re_uin = Regex::new(r"(?:uin|wxuin)=([0-9a-zA-Z_]+)").unwrap();
                if let Some(c) = re_uin.captures(cookie) {
                    uin = c[1].trim_start_matches(|ch| ch == 'o' || ch == 'O').to_string();
                }
            }

            if uin.is_empty() {
                send_cors_json(req, 400, json!({ "error": "尚未连接 QQ 音乐账号，请先扫码授权" }));
                return;
            }

            let mut gtk = 5381;
            let re_pskey = Regex::new(r"p_skey=([^;]+)").unwrap();
            let re_skey = Regex::new(r"(?:^|;\s*)skey=([^;]+)").unwrap();
            if let Some(c) = re_pskey.captures(cookie) {
                gtk = get_gtk(&c[1]);
            } else if let Some(c) = re_skey.captures(cookie) {
                gtk = get_gtk(&c[1]);
            }

            let cookie_header = if cookie.contains("uin=") {
                cookie.to_string()
            } else {
                format!("uin={}; wxuin={}; {}", uin, uin, cookie)
            };

            let target_url = format!(
                "https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg?g_tk={}&loginUin={}&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&ct=20&cid=205360956&userid={}&reqtype=2&sin={}&ein={}",
                gtk, urlencoding_encode(&uin), urlencoding_encode(&uin), sin, ein
            );

            match client.get(&target_url)
                .header("Referer", "https://y.qq.com/")
                .header("Cookie", &cookie_header)
                .send()
            {
                Ok(res) => {
                    if let Ok(j) = res.json::<Value>() {
                        let code = j.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
                        if code != 0 {
                            let mut error_msg = j.get("msg").and_then(|v| v.as_str()).unwrap_or("获取收藏专辑失败").to_string();
                            if code == 4000 {
                                error_msg = "隐私权限限制：您的 QQ 音乐收藏专辑当前设置为「仅自己可见」。请在手机 QQ 音乐 APP 中进入【我的】➜ 右上角【设置】➜【隐私设置】➜【个人主页隐私设置】将【我喜欢的音乐/收藏】设为公开，即可一键同步！".to_string();
                            }
                            send_cors_json(req, 200, json!({
                                "code": code,
                                "data": [],
                                "count": 0,
                                "hasMore": false,
                                "msg": error_msg
                            }));
                            return;
                        }

                        let total = j.pointer("/data/totalalbum").and_then(|v| v.as_i64()).unwrap_or(0);
                        let raw_list = j.pointer("/data/albumlist").and_then(|v| v.as_array()).cloned().unwrap_or_default();

                        let mut formatted_list = Vec::new();
                        for item in raw_list {
                            let mid = item.get("albummid").or_else(|| item.get("albumMID")).or_else(|| item.get("mid")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let albumid = item.get("albumid").or_else(|| item.get("id")).map(|v| v.to_string()).unwrap_or_default();
                            let name = item.get("albumname").or_else(|| item.get("albumName")).or_else(|| item.get("name")).and_then(|v| v.as_str()).unwrap_or("").trim().to_string();

                            let mut artist = item.get("singername").or_else(|| item.get("singerName")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                            if let Some(singers) = item.get("singer_list").or_else(|| item.get("singer")).and_then(|v| v.as_array()) {
                                let names: Vec<String> = singers.iter().filter_map(|s| s.get("name").or_else(|| s.get("singer_name")).and_then(|v| v.as_str()).map(|v| v.to_string())).collect();
                                if !names.is_empty() {
                                    artist = names.join("/");
                                }
                            }

                            let mut pub_time = String::new();
                            if let Some(pt) = item.get("publicTime").and_then(|v| v.as_str()) {
                                if is_valid_date_str(pt) { pub_time = pt.to_string(); }
                            }
                            if pub_time.is_empty() {
                                if let Some(pt) = item.get("publishDate").and_then(|v| v.as_str()) {
                                    if is_valid_date_str(pt) { pub_time = pt.to_string(); }
                                }
                            }
                            if pub_time.is_empty() {
                                if let Some(pt) = item.get("pubtime").and_then(|v| v.as_str()) {
                                    if is_valid_date_str(pt) { pub_time = pt.to_string(); }
                                }
                            }

                            if !is_valid_date_str(&pub_time) {
                                if let Some(found_pt) = fetch_qq_album_detail(&mid, &albumid, &name, &artist) {
                                    pub_time = found_pt;
                                }
                            }

                            let pic_url = if !mid.is_empty() {
                                format!("https://y.gtimg.cn/music/photo_new/T002R800x800M000{}.jpg", mid)
                            } else {
                                item.get("pic").or_else(|| item.get("albumPic")).and_then(|v| v.as_str()).unwrap_or("").to_string()
                            };

                            formatted_list.push(json!({
                                "id": mid,
                                "mid": mid,
                                "albumid": albumid,
                                "name": name,
                                "artist": artist,
                                "publishTime": pub_time,
                                "picUrl": pic_url,
                                "songnum": item.get("songnum").or_else(|| item.get("song_cnt")).unwrap_or(&json!(0))
                            }));
                        }

                        let has_more = (sin + formatted_list.len() as i64) < total;
                        send_cors_json(req, 200, json!({
                            "code": 200,
                            "data": formatted_list,
                            "count": total,
                            "hasMore": has_more
                        }));
                    } else {
                        send_cors_json(req, 500, json!({ "error": "解析 QQ 音乐收藏专辑列表失败" }));
                    }
                }
                Err(e) => send_cors_json(req, 500, json!({ "error": e.to_string() })),
            }
        }

        _ => {
            send_cors_json(req, 404, json!({ "error": "Not Found" }));
        }
    }
}

// ===== 启动原生服务 =====
pub fn start_native_sync_server(app_data: PathBuf) {
    init_cache_from_app_data(app_data);

    // 检查端口 3000 是否已经在监听
    let addr = "127.0.0.1:3000";
    let server = match Server::http(addr) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[CloudSync] 127.0.0.1:3000 端口已在使用中或无需重复监听: {}", e);
            return;
        }
    };

    println!("[CloudSync] ✅ Rust 原生云端同步 HTTP 代理服务已就绪: http://{}", addr);

    let server_arc = Arc::new(server);
    thread::spawn(move || {
        for request in server_arc.incoming_requests() {
            thread::spawn(move || {
                handle_request(request);
            });
        }
    });
}

#[test]
fn test_live_server_health() {
    let temp_dir = std::env::temp_dir().join("music_ratings_test_cache");
    let _ = fs::create_dir_all(&temp_dir);
    start_native_sync_server(temp_dir);

    // 等待服务监听
    thread::sleep(Duration::from_millis(100));

    let client = get_client();
    let res = client.get("http://127.0.0.1:3000/api/health").send().expect("health request should succeed");
    assert_eq!(res.status(), 200);
    let j: Value = res.json().unwrap();
    assert_eq!(j["ok"], true);
    assert_eq!(j["status"], "ready");
    assert_eq!(j["engine"], "rust-native");
    println!("Server health verified: {:?}", j);
}
