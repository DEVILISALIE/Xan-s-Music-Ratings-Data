// ===== 云端流媒体专辑导入模块 (冈易音乐 & 企鹅音乐 双平台版) =====

const CloudImport = (() => {
  const STORAGE = {
    NETEASE_COOKIE: 'netease_cookie',
    NETEASE_USER: 'netease_user_name',
    QQ_COOKIE: 'qq_music_cookie',
    QQ_UIN: 'qq_music_uin',
  };

  // 只要不是直接访问 http://127.0.0.1:3000 或 localhost:3000，一律直连本地同步服务 http://127.0.0.1:3000
  const isDirect3000 = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && String(window.location.port) === '3000';
  const API_BASE = isDirect3000 ? '' : 'http://127.0.0.1:3000';

  let _qrPollTimer = null;

  // 检查并等待本地同步服务就绪
  async function ensureServerOnline() {
    // 桌面版环境：优先尝试调用 Tauri 后端确保本地静默代理服务处于就绪状态
    if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
      try {
        await window.__TAURI__.core.invoke('ensure_sync_server_running');
      } catch (_) {}
    }

    // 探针检测端口 3000 是否已就绪（最多重试 4 次，每次间隔 400ms，以防刚启动中）
    for (let i = 0; i < 4; i++) {
      try {
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 1200);
        const res = await fetch(`${API_BASE}/api/health`, { signal: ctrl.signal });
        clearTimeout(timeoutId);
        if (res.ok) return true;
      } catch (_) {
        if (i < 3) {
          await new Promise(r => setTimeout(r, 400));
        }
      }
    }
    return false;
  }

  // 辅助函数：统一设置扫码提示文案与状态徽章
  function setQrTipStatus(el, text, status = 'normal') {
    if (!el) return;
    el.textContent = text;
    el.className = `qr-status-badge ${status}`;
  }

  // 辅助函数：标准化全角半角及各类括号
  function stripBrackets(str) {
    return (str || '').replace(/[（(\[【「『].*?[)）\]】」』]/g, '').trim();
  }

  function norm(str) {
    return stripBrackets(str)
      .toLowerCase()
      .replace(/[\s\-_—·.,:：/'"“”‘’!！?？~～]/g, '')
      .trim();
  }

  function getArtistTokens(str) {
    if (!str) return [];
    const clean = stripBrackets(str);
    return clean
      .toLowerCase()
      .split(/[\/,&+、和与]|(\s+feat\.?\s+)|\s+with\s+/i)
      .filter(Boolean)
      .map(s => s.replace(/[\s\-_—·.,:：/'"“”‘’!！?？~～]/g, '').trim())
      .filter(Boolean);
  }

  function normArtist(str) {
    return getArtistTokens(str).sort().join('|');
  }

  function makeKey(title, artist) {
    return norm(title) + '|||' + normArtist(artist);
  }

  function isArtistMatch(tokens1, tokens2, raw1, raw2) {
    if (!tokens1 || !tokens2 || tokens1.length === 0 || tokens2.length === 0) return true;
    for (const t1 of tokens1) {
      if (tokens2.includes(t1)) return true;
    }
    const n1 = normArtist(raw1);
    const n2 = normArtist(raw2);
    if (n1 && n2 && (n1.includes(n2) || n2.includes(n1))) return true;
    return false;
  }

  function normalizeCookie(input) {
    if (!input) return '';
    let str = input.trim().replace(/^['"]|['"]$/g, '');
    if (!str.includes('=')) {
      return `MUSIC_U=${str}`;
    }
    return str;
  }

  // 辅助函数：确保云端导入下拉菜单展开，方便用户自主点击同步按钮
  function ensureCloudPopoverOpen() {
    const trigger = document.getElementById('cloudImportTrigger');
    const popover = document.getElementById('cloudImportPopover');
    if (!trigger || !popover) return;
    updateUiStatus();
    const wasOpen = popover.classList.contains('open') || popover.classList.contains('portal-open');
    if (!wasOpen) {
      if (typeof portalOpen === 'function') {
        portalOpen(popover, trigger, { openClass: 'open', align: 'right', prefer: 'below' });
      } else {
        trigger.click();
      }
    }
  }

  // ===== 全局中转监听与脚本生成 =====
  let _cloudSyncPollTimer = null;
  let _smsCountDownTimer = null;

  // 生成网易云官方网页直接扒取脚本 (纯剪贴板写入 + 静默回传双保险)
  function getNeteaseScrapeCode() {
    return `(async function(){
      function cp(t){
        if(navigator.clipboard&&navigator.clipboard.writeText){
          return navigator.clipboard.writeText(t).catch(function(){return fb(t);});
        }
        return fb(t);
      }
      function fb(t){
        var a=document.createElement('textarea');a.value=t;a.style.cssText='position:fixed;left:-9999px;top:0;';
        document.body.appendChild(a);a.focus();a.select();
        try{document.execCommand('copy');}catch(e){}
        document.body.removeChild(a);return Promise.resolve();
      }
      var b=document.createElement('div');
      b.style.cssText='position:fixed;top:28px;right:28px;z-index:2147483647;background:linear-gradient(135deg,#18181b,#09090b);color:#fff;padding:16px 20px;border-radius:14px;box-shadow:0 12px 38px rgba(0,0,0,0.5);font-family:system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.5;max-width:380px;border:1px solid rgba(230,0,38,0.5);backdrop-filter:blur(16px);transition:all .3s ease;';
      b.innerHTML='<div style="display:flex;align-items:center;gap:8px;font-weight:600;color:#f87171;"><span>⚡ 正在抓取冈易已收藏专辑...</span></div>';
      document.body.appendChild(b);

      try {
        var offset=0,limit=100,all=[];
        while(true){
          b.innerHTML='<div style="font-weight:600;color:#f87171;margin-bottom:4px;">⚡ 正在抓取收藏专辑 ('+all.length+'张)...</div>';
          var r=await fetch('/api/album/sublist?limit='+limit+'&offset='+offset,{credentials:'include'});
          var j=await r.json();
          if(j.code!==200)throw new Error(j.message||j.msg||'请先在当前冈易页面完成登录');
          var list=j.data||[];
          all=all.concat(list);
          if(!j.hasMore||list.length<limit)break;
          offset+=limit;
        }

        var payload={platform:'netease',type:'albums',albums:all,cookie:document.cookie,timestamp:Date.now()};
        var pStr=JSON.stringify(payload);
        await cp(pStr);

        var directOk=false;
        try {
          var ctrl=new AbortController();
          var tid=setTimeout(function(){ctrl.abort();},1200);
          var res=await fetch('http://127.0.0.1:3000/api/cloud/sync_payload',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:pStr,
            signal:ctrl.signal
          });
          clearTimeout(tid);
          var ret=await res.json();
          if(ret&&ret.success)directOk=true;
        } catch(_) {}

        b.style.borderColor='rgba(16,185,129,0.9)';
        b.style.background='linear-gradient(135deg,#064e3b,#022c22)';
        if(directOk){
          b.innerHTML='<div style="display:flex;align-items:center;gap:8px;font-weight:600;color:#34d399;font-size:14px;margin-bottom:4px;"><span>✅ 冈易数据已直传软件！</span></div><div style="color:#a7f3d0;font-size:12px;">成功获取 '+all.length+' 张收藏专辑，软件正开始导入，请切回查看。</div>';
        } else {
          b.innerHTML='<div style="display:flex;align-items:center;gap:8px;font-weight:600;color:#34d399;font-size:14px;margin-bottom:4px;"><span>🎉 '+all.length+' 张专辑已复制到剪贴板！</span></div><div style="color:#e5e7eb;font-size:12px;margin-top:2px;">抓取完成。<br><strong style="color:#6ee7b7;">请切回【音乐评级】软件</strong>，点击【📋 粘贴官方数据】即可秒级导入！</div>';
        }
        setTimeout(function(){b.style.opacity='0';setTimeout(function(){b.remove();},400);},7000);
      } catch(e) {
        b.style.borderColor='rgba(239,68,68,0.5)';
        b.innerHTML='<div style="font-weight:600;color:#ef4444;margin-bottom:4px;">⚠️ 抓取提示: '+e.message+'</div><div style="color:#d1d5db;font-size:12px;">请确认已在网页版登录你的冈易账号后重试。</div>';
        setTimeout(function(){b.remove();},6000);
      }
    })();`.replace(/\n\s*/g, ' ');
  }

  // 生成企鹅音乐官方网页直接扒取脚本 (纯剪贴板写入 + 静默回传双保险)
  function getQQScrapeCode() {
    return `(async function(){
      function cp(t){
        if(navigator.clipboard&&navigator.clipboard.writeText){
          return navigator.clipboard.writeText(t).catch(function(){return fb(t);});
        }
        return fb(t);
      }
      function fb(t){
        var a=document.createElement('textarea');a.value=t;a.style.cssText='position:fixed;left:-9999px;top:0;';
        document.body.appendChild(a);a.focus();a.select();
        try{document.execCommand('copy');}catch(e){}
        document.body.removeChild(a);return Promise.resolve();
      }
      var b=document.createElement('div');
      b.style.cssText='position:fixed;top:28px;right:28px;z-index:2147483647;background:linear-gradient(135deg,#18181b,#09090b);color:#fff;padding:16px 20px;border-radius:14px;box-shadow:0 12px 38px rgba(0,0,0,0.5);font-family:system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.5;max-width:380px;border:1px solid rgba(49,194,124,0.5);backdrop-filter:blur(16px);transition:all .3s ease;';
      b.innerHTML='<div style="display:flex;align-items:center;gap:8px;font-weight:600;color:#31c27c;"><span>⚡ 正在提取企鹅音乐登录凭据...</span></div>';
      document.body.appendChild(b);

      try {
        var cookies=document.cookie||'';
        var m=cookies.match(/(?:uin|p_uin)=o?([0-9a-zA-Z_]+)/);
        var uin=m?m[1].replace(/^[oO]/,''):'';
        if(!uin){
          b.style.borderColor='rgba(239,68,68,0.5)';
          b.innerHTML='<div style="font-weight:600;color:#ef4444;margin-bottom:4px;">⚠️ 未检测到登录状态</div><div style="color:#d1d5db;font-size:12px;">请先在企鹅音乐网页右上角点击头像完成登录，登录后再点击此书签！</div>';
          setTimeout(function(){b.remove();},6000);
          return;
        }

        var payload={platform:'qq',type:'credentials',uin:uin,cookie:cookies,timestamp:Date.now()};
        var pStr=JSON.stringify(payload);
        await cp(pStr);

        var directOk=false;
        try {
          var ctrl=new AbortController();
          var tid=setTimeout(function(){ctrl.abort();},1200);
          var res=await fetch('http://127.0.0.1:3000/api/cloud/sync_payload',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:pStr,
            signal:ctrl.signal
          });
          clearTimeout(tid);
          var j=await res.json();
          if(j&&j.success)directOk=true;
        } catch(_) {}

        b.style.borderColor='rgba(49,194,124,0.9)';
        b.style.background='linear-gradient(135deg,#064e3b,#022c22)';
        if(directOk){
          b.innerHTML='<div style="display:flex;align-items:center;gap:8px;font-weight:600;color:#34d399;font-size:14px;margin-bottom:4px;"><span>✅ 企鹅音乐已直传软件！</span></div><div style="color:#a7f3d0;font-size:12px;">已成功提取账号 ('+uin+')，软件正开始同步唱片，请切回查看。</div>';
        } else {
          b.innerHTML='<div style="display:flex;align-items:center;gap:8px;font-weight:600;color:#34d399;font-size:14px;margin-bottom:4px;"><span>🎉 授权凭据已复制到剪贴板！</span></div><div style="color:#e5e7eb;font-size:12px;margin-top:2px;">已成功提取账号 ('+uin+')。<br><strong style="color:#6ee7b7;">请切回【音乐评级】软件</strong>，点击【📋 粘贴官方数据】即可秒级同步！</div>';
        }
        setTimeout(function(){b.style.opacity='0';setTimeout(function(){b.remove();},400);},7000);
      } catch(e) {
        b.style.borderColor='rgba(239,68,68,0.5)';
        b.innerHTML='<div style="font-weight:600;color:#ef4444;margin-bottom:4px;">❌ 提取异常: '+e.message+'</div>';
        setTimeout(function(){b.remove();},5000);
      }
    })();`.replace(/\n\s*/g, ' ');
  }

  // 处理粘贴或捕获到的官方数据文本 (支持 JSON 载荷与原生 Cookie 文本)
  async function applyCloudPayloadText(platform, rawText) {
    if (!rawText || !rawText.trim()) {
      showNotification('⚠️ 剪贴板为空，请先在官方网页执行书签提取后再点击粘贴');
      return false;
    }
    const text = rawText.trim();

    // 1. 优先尝试作为 JSON 载荷解析
    try {
      if (text.startsWith('{') || text.startsWith('[')) {
        const parsed = JSON.parse(text);

        // A. 标准全量载荷：包含 albums 列表
        if (parsed.type === 'albums' && Array.isArray(parsed.albums)) {
          const list = parsed.albums;
          const targetPlatform = parsed.platform === 'qq' ? '企鹅音乐' : '冈易音乐';
          if (parsed.platform === 'netease' || platform === 'netease') {
            closeNeteaseQrLogin();
          } else {
            closeQQAuthModal();
          }
          showNotification(`🎉 成功识别官方剪贴板数据！共 ${list.length} 张专辑，正在导入...`);
          await importAlbumsPipeline(list, targetPlatform, { addOnly: false });
          return true;
        }

        // B. 直接是专辑对象数组
        if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0].name || parsed[0].albumname)) {
          const targetPlatform = platform === 'qq' ? '企鹅音乐' : '冈易音乐';
          if (platform === 'netease') closeNeteaseQrLogin();
          else closeQQAuthModal();
          showNotification(`🎉 成功识别 ${parsed.length} 张专辑数据，正在导入...`);
          await importAlbumsPipeline(parsed, targetPlatform, { addOnly: false });
          return true;
        }

        // C. 企鹅音乐授权凭据载荷
        if (parsed.platform === 'qq' || parsed.uin || (parsed.cookie && parsed.cookie.includes('qm_keyst'))) {
          const uin = parsed.uin || (parsed.cookie?.match(/(?:uin|p_uin)=o?([0-9a-zA-Z_]+)/)?.[1]?.replace(/^[oO]/, ''));
          const cookie = parsed.cookie || '';
          if (uin) localStorage.setItem(STORAGE.QQ_UIN, uin);
          if (cookie) localStorage.setItem(STORAGE.QQ_COOKIE, cookie);
          closeQQAuthModal();
          updateUiStatus();
          ensureCloudPopoverOpen();
          showNotification(`✅ 成功录入企鹅音乐授权 (账号: ${uin || '已授权'})！请点击【一键同步】或【仅新增导入】`);
          return true;
        }

        // D. 冈易登录凭据载荷
        if (parsed.platform === 'netease' || parsed.musicU || (parsed.cookie && parsed.cookie.includes('MUSIC_U'))) {
          const cookie = parsed.cookie || (parsed.musicU ? `MUSIC_U=${parsed.musicU}` : '');
          if (cookie) {
            await connectWithCookie(cookie);
            return true;
          }
        }
      }
    } catch (_) {}

    // 2. 非 JSON 载荷，尝试作为纯 Cookie 凭据解析
    if (platform === 'netease' || text.includes('MUSIC_U=')) {
      const cookie = normalizeCookie(text);
      if (cookie && (cookie.includes('MUSIC_U=') || cookie.length > 30)) {
        await connectWithCookie(cookie);
        return true;
      }
    }

    if (platform === 'qq' || text.includes('qm_keyst') || text.includes('uin=')) {
      const uinMatch = text.match(/(?:uin|p_uin)=o?([0-9a-zA-Z_]+)/);
      const uin = uinMatch ? uinMatch[1].replace(/^[oO]/, '') : (localStorage.getItem(STORAGE.QQ_UIN) || '');
      if (uin && (text.includes(';') || text.includes('qm_keyst') || text.includes('='))) {
        await connectQQCredentials(uin, text);
        return true;
      }
    }

    showNotification('⚠️ 剪贴板内容无法识别为官方数据，请确认是否在官网成功执行了书签脚本');
    return false;
  }

  function stopCloudSyncPoll() {
    if (_cloudSyncPollTimer) {
      clearInterval(_cloudSyncPollTimer);
      _cloudSyncPollTimer = null;
    }
  }

  // 开启轮询本地中转服务，监听官方网站数据回传
  function startCloudSyncPoll(platform) {
    stopCloudSyncPoll();
    _cloudSyncPollTimer = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/cloud/sync_status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.hasPayload && data.payload && data.payload.platform === platform) {
          const payload = data.payload;
          stopCloudSyncPoll();

          // 确认收到，清理服务端暂存
          fetch(`${API_BASE}/api/cloud/clear_sync_status`, { method: 'POST' }).catch(() => {});

          // 关闭桌面端独立登录小窗口（如果存在）
          if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
            try {
              window.__TAURI__.core.invoke('close_official_login_window');
            } catch (_) {}
          }

          if (platform === 'netease') {
            closeNeteaseQrLogin();
            if (payload.type === 'albums' && Array.isArray(payload.data?.albums)) {
              showNotification(`🎉 成功从官方网站捕获到 ${payload.data.albums.length} 张冈易专辑！正在导入...`);
              await importAlbumsPipeline(payload.data.albums, '冈易音乐', { addOnly: false });
            } else if (payload.data?.cookie || payload.data?.musicU) {
              const cookie = payload.data.cookie || `MUSIC_U=${payload.data.musicU}`;
              localStorage.setItem(STORAGE.NETEASE_COOKIE, cookie);
              updateUiStatus();
              ensureCloudPopoverOpen();
              showNotification('✅ 冈易官方登录成功！请点击【一键同步】或【仅新增导入】开始更新专辑');
            }
          } else if (platform === 'qq') {
            closeQQAuthModal();
            if (payload.data?.uin) localStorage.setItem(STORAGE.QQ_UIN, payload.data.uin);
            if (payload.data?.cookie) localStorage.setItem(STORAGE.QQ_COOKIE, payload.data.cookie);
            updateUiStatus();
            ensureCloudPopoverOpen();
            showNotification(`✅ 企鹅音乐官方登录成功！(账号: ${payload.data?.uin || '已授权'})，请点击【一键同步】或【仅新增导入】开始更新专辑`);
          }
        }
      } catch (_) {}
    }, 1200);
  }

  // 打开官方网站登录窗口并启动监听
  function openOfficialWebLogin(platform, event) {
    // 展现监听中呼吸指示器
    if (platform === 'netease') {
      const wrap = document.getElementById('neteaseWebListenWrap');
      if (wrap) wrap.style.display = 'flex';
    } else if (platform === 'qq') {
      const wrap = document.getElementById('qqWebListenWrap');
      if (wrap) wrap.style.display = 'flex';
    }

    startCloudSyncPoll(platform);
    ensureServerOnline().catch(() => {});

    // 如果处于桌面端环境，拦截原生外链并优先拉起 Tauri 官方登录小窗口
    if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
      if (event) event.preventDefault();
      window.__TAURI__.core.invoke('open_official_login_window', { platform }).catch((err) => {
        console.warn('[OfficialLogin] 弹出 Tauri 官方登录窗口失败，尝试直接打开:', err);
        const targetUrl = platform === 'netease' ? 'https://music.163.com' : 'https://y.qq.com';
        window.open(targetUrl, '_blank');
      });
      return;
    }

    // 普通浏览器环境：不阻断 a 标签默认的 target="_blank" 原生跳转！
    // 如果是通过无参数调用，则兜底执行 window.open
    if (!event) {
      const targetUrl = platform === 'netease' ? 'https://music.163.com' : 'https://y.qq.com';
      window.open(targetUrl, '_blank');
    }
  }

  // 初始化书签链接与复制代码交互
  function initBookmarklets() {
    const neteaseLink = document.getElementById('neteaseBookmarkletLink');
    if (neteaseLink) {
      neteaseLink.href = 'javascript:' + encodeURIComponent(getNeteaseScrapeCode());
    }
    const qqLink = document.getElementById('qqBookmarkletLink');
    if (qqLink) {
      qqLink.href = 'javascript:' + encodeURIComponent(getQQScrapeCode());
    }
  }

  // ===== 1. 冈易音乐 授权登录 =====

  function switchNeteaseTab(tab) {
    const smsBtn = document.getElementById('neteaseTabSmsBtn');
    const qrBtn = document.getElementById('neteaseTabQrBtn');
    const smsView = document.getElementById('neteaseSmsView');
    const qrView = document.getElementById('neteaseQrView');

    [smsBtn, qrBtn].forEach(b => b?.classList.remove('active'));
    [smsView, qrView].forEach(v => { if (v) v.style.display = 'none'; });

    // 切换非扫码模式时停止二维码轮询
    if (tab !== 'qr' && _qrPollTimer) {
      clearInterval(_qrPollTimer);
      _qrPollTimer = null;
    }

    if (tab === 'sms') {
      smsBtn?.classList.add('active');
      if (smsView) smsView.style.display = 'block';
      const phoneInput = document.getElementById('neteaseSmsPhone');
      if (phoneInput) setTimeout(() => phoneInput.focus(), 80);
    } else if (tab === 'qr') {
      qrBtn?.classList.add('active');
      if (qrView) qrView.style.display = 'block';
      startNeteaseQrLogin();
    }
  }

  let _neteaseQrCodeInstance = null;

  async function openNeteaseQrLogin(startTab = 'qr') {
    closeAllDropdowns();
    const modal = document.getElementById('neteaseQrModal');
    if (!modal) return;

    modal.classList.add('active');
    switchNeteaseTab(startTab);
  }

  async function startNeteaseQrLogin() {
    const qrBox = document.getElementById('neteaseQrCodeBox');
    const qrMask = document.getElementById('neteaseQrMask');
    const qrTip = document.getElementById('neteaseQrTip');

    if (!qrBox) return;
    if (_qrPollTimer) {
      clearInterval(_qrPollTimer);
      _qrPollTimer = null;
    }
    if (qrMask) qrMask.style.display = 'none';
    setQrTipStatus(qrTip, '正在连接本地同步服务...', 'normal');
    qrBox.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;height:100%;">正在连接本地同步服务...</div>';

    const serverOk = await ensureServerOnline();
    if (!serverOk) {
      if (qrMask) qrMask.style.display = 'flex';
      setQrTipStatus(qrTip, '本地同步服务未就绪，请确保已安装 Node.js 后重试', 'error');
      qrBox.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;height:100%;">本地服务连接失败</div>';
      showNotification('获取二维码失败: 本地同步服务未启动');
      return;
    }

    setQrTipStatus(qrTip, '请使用 冈易音乐 APP 扫一扫授权登录', 'normal');
    qrBox.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;height:100%;">正在生成安全二维码...</div>';

    try {
      const res = await fetch(`${API_BASE}/api/netease/qr/unikey`);
      const data = await res.json();
      if (!data || !data.unikey) {
        throw new Error('获取扫码 key 失败');
      }

      const unikey = data.unikey;
      const sessionCookie = data.cookie || '';
      // 官方标准登录协议链接
      const qrTargetUrl = `https://music.163.com/login?codekey=${unikey}`;

      // 毫秒级本地纯 JS 渲染 QRCode，100% 离线可用，零国外 CDN 依赖
      qrBox.innerHTML = '';
      if (window.QRCode) {
        _neteaseQrCodeInstance = new window.QRCode(qrBox, {
          text: qrTargetUrl,
          width: 150,
          height: 150,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M
        });
      } else {
        const img = document.createElement('img');
        img.style.width = '170px';
        img.style.height = '170px';
        img.style.display = 'block';
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrTargetUrl)}`;
        qrBox.appendChild(img);
      }

      if (_qrPollTimer) clearInterval(_qrPollTimer);
      _qrPollTimer = setInterval(async () => {
        try {
          const checkRes = await fetch(`${API_BASE}/api/netease/qr/check?key=${encodeURIComponent(unikey)}&cookie=${encodeURIComponent(sessionCookie)}`);
          const checkData = await checkRes.json();

          const codeNum = Number(checkData.code);
          const hasMusicU = Boolean(checkData.musicU || (checkData.cookie && checkData.cookie.includes('MUSIC_U=')));

          if (codeNum === 802) {
            setQrTipStatus(qrTip, '📱 手机已扫码，请在手机端点击【确认登录】', 'scanned');
          } else if (codeNum === 803 || checkData.success || hasMusicU) {
            clearInterval(_qrPollTimer);
            _qrPollTimer = null;
            const cookie = checkData.cookie || (checkData.musicU ? `MUSIC_U=${checkData.musicU}` : '');
            localStorage.setItem(STORAGE.NETEASE_COOKIE, cookie);
            setQrTipStatus(qrTip, '✅ 授权登录成功！', 'success');
            setTimeout(() => {
              closeNeteaseQrLogin();
              updateUiStatus();
              ensureCloudPopoverOpen();
              showNotification('✅ 冈易音乐登录成功！请点击【一键同步】或【仅新增导入】开始更新专辑');
            }, 300);
          } else if (codeNum === 800) {
            clearInterval(_qrPollTimer);
            _qrPollTimer = null;
            if (qrMask) qrMask.style.display = 'flex';
            setQrTipStatus(qrTip, '二维码已失效，请点击刷新', 'error');
          } else if (codeNum === 8821) {
            clearInterval(_qrPollTimer);
            _qrPollTimer = null;
            setQrTipStatus(qrTip, '⚠️ 移动端授权触发官方安全风控，正在为您无缝切换手机号登录...', 'error');
            showNotification('官方对本次扫码触发了安全风控，已为您切换至手机验证码登录');
            setTimeout(() => {
              switchNeteaseTab('sms');
            }, 1200);
          }
          // 对齐官方：801 等待扫码或过渡状态持续轮询，绝对不自爆中止
        } catch (_) {}
      }, 1500);
    } catch (e) {
      console.error('NetEase QR init failed:', e);
      if (qrMask) qrMask.style.display = 'flex';
      setQrTipStatus(qrTip, '获取登录二维码失败，请点击刷新重试', 'error');
      qrBox.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;height:100%;">二维码生成失败</div>';
      showNotification('获取冈易登录二维码失败，请确保本地后台服务处于运行状态');
    }
  }

  // 网易云官方手机短信验证码发送
  async function sendNeteaseSmsCaptcha() {
    const phoneInput = document.getElementById('neteaseSmsPhone');
    const sendBtn = document.getElementById('neteaseSmsSendBtn');
    const errAlert = document.getElementById('neteaseSmsErrorAlert');
    const errDesc = document.getElementById('neteaseSmsErrorDesc');
    const phone = (phoneInput?.value || '').trim();

    if (errAlert) errAlert.style.display = 'none';

    if (!phone || !/^1\d{10}$/.test(phone)) {
      if (errAlert && errDesc) {
        errDesc.textContent = '请输入正确的11位中国大陆手机号码';
        errAlert.style.display = 'block';
      }
      return;
    }

    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = '发送中...';
    }

    try {
      const res = await fetch(`${API_BASE}/api/netease/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || '发送验证码失败');
      }

      showNotification('✅ 验证码已发送，请查看手机官方短信');
      const codeInput = document.getElementById('neteaseSmsCode');
      if (codeInput) codeInput.focus();

      // 60秒倒计时
      let countdown = 60;
      if (_smsCountDownTimer) clearInterval(_smsCountDownTimer);
      _smsCountDownTimer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
          if (sendBtn) sendBtn.textContent = `${countdown}s 后重新获取`;
        } else {
          clearInterval(_smsCountDownTimer);
          _smsCountDownTimer = null;
          if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = '获取验证码';
          }
        }
      }, 1000);
    } catch (err) {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = '获取验证码';
      }
      if (errAlert && errDesc) {
        errDesc.textContent = err.message;
        errAlert.style.display = 'block';
      }
    }
  }

  // 网易云官方手机短信验证码提交登录
  async function submitNeteaseSmsLogin() {
    const phone = (document.getElementById('neteaseSmsPhone')?.value || '').trim();
    const captcha = (document.getElementById('neteaseSmsCode')?.value || '').trim();
    const submitBtn = document.getElementById('neteaseSmsSubmitBtn');
    const errAlert = document.getElementById('neteaseSmsErrorAlert');
    const errDesc = document.getElementById('neteaseSmsErrorDesc');

    if (errAlert) errAlert.style.display = 'none';

    if (!phone || !captcha) {
      if (errAlert && errDesc) {
        errDesc.textContent = '手机号与短信验证码均不能为空';
        errAlert.style.display = 'block';
      }
      return;
    }

    const origText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '正在登录验证...';
    }

    try {
      const res = await fetch(`${API_BASE}/api/netease/sms/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, captcha })
      });
      const data = await res.json();
      if (!data.success || !data.musicU) {
        throw new Error(data.message || '短信验证码错误或已失效');
      }

      const cookie = data.cookie || `MUSIC_U=${data.musicU}`;
      localStorage.setItem(STORAGE.NETEASE_COOKIE, cookie);
      closeNeteaseQrLogin();
      updateUiStatus();
      ensureCloudPopoverOpen();
      showNotification(`✅ 短信验证通过，登录成功！(${data.user?.nickname || '冈易用户'})，请点击【一键同步】或【仅新增导入】开始更新专辑`);
    } catch (err) {
      if (errAlert && errDesc) {
        errDesc.textContent = err.message;
        errAlert.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
      }
    }
  }

  async function connectWithCookie(rawCookie) {
    const errAlert = document.getElementById('neteaseCookieErrorAlert');
    const errDesc = document.getElementById('neteaseCookieErrorDesc');
    const showModalError = (msg) => {
      if (errAlert && errDesc) {
        errDesc.textContent = msg;
        errAlert.style.display = 'block';
      }
      showNotification('连接失败: ' + msg);
    };

    if (errAlert) errAlert.style.display = 'none';

    const cookie = normalizeCookie(rawCookie);
    if (!cookie) {
      showModalError('请输入 MUSIC_U 或冈易 Cookie 凭据');
      return;
    }

    const submitBtn = document.getElementById('neteaseCookieSubmit');
    const originalText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '正在验证凭证...';
    }

    try {
      const res = await fetch(`${API_BASE}/api/netease/album/sublist?cookie=${encodeURIComponent(cookie)}&limit=1&offset=0`);
      if (!res.ok) {
        throw new Error(`连接后台服务异常 (${res.status})`);
      }
      const data = await res.json();
      if (data.code !== 200) {
        if (data.code === 301) {
          throw new Error('凭据已失效或未登录，请重新复制最新的 MUSIC_U');
        }
        throw new Error(data.message || data.msg || 'Cookie 验证未通过，请确认是否完整复制');
      }

      localStorage.setItem(STORAGE.NETEASE_COOKIE, cookie);
      closeNeteaseQrLogin();
      updateUiStatus();
      ensureCloudPopoverOpen();
      showNotification('✅ 冈易音乐凭据连接成功！请点击【一键同步】或【仅新增导入】开始更新专辑');
    } catch (err) {
      console.error('Cookie connect failed:', err);
      showModalError(err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  }

  function closeNeteaseQrLogin() {
    stopCloudSyncPoll();
    if (_qrPollTimer) {
      clearInterval(_qrPollTimer);
      _qrPollTimer = null;
    }
    if (_smsCountDownTimer) {
      clearInterval(_smsCountDownTimer);
      _smsCountDownTimer = null;
    }
    const modal = document.getElementById('neteaseQrModal');
    if (modal) modal.classList.remove('active');
  }

  // ===== 2. 企鹅音乐 账号连接与授权 =====

  let _qqQrPollTimer = null;
  let _currentQQQrKey = null;
  let _currentQQAuthChannel = 'wechat'; // 'wechat' (首选) | 'qq'

  function switchQQChannel(channel) {
    _currentQQAuthChannel = channel;
    const tabWx = document.getElementById('qqTabWxBtn');
    const tabQq = document.getElementById('qqTabQqBtn');
    const qrTip = document.getElementById('qqQrTip');
    const stepGuide = document.getElementById('qqStepGuide');

    if (channel === 'wechat') {
      tabWx?.classList.add('active');
      tabQq?.classList.remove('active');
      setQrTipStatus(qrTip, '请使用 微信「扫一扫」授权登录', 'normal');
      if (stepGuide) {
        stepGuide.style.background = 'rgba(7, 193, 96, 0.08)';
        stepGuide.style.border = '1px solid rgba(7, 193, 96, 0.25)';
        stepGuide.innerHTML = `
          <div style="font-weight: 600; color: #07c160; margin-bottom: 2px;">🟢 扫码指引（微信）：</div>
          <div>1. 打开手机 <strong>微信 APP</strong> ➜ 点击右上角 <strong>【+】</strong> 号</div>
          <div>2. 选择 <strong>【扫一扫】</strong> 对准屏幕二维码</div>
          <div>3. 手机端点击【允许】授权登录，即可秒级自动同步</div>
        `;
      }
    } else {
      tabQq?.classList.add('active');
      tabWx?.classList.remove('active');
      setQrTipStatus(qrTip, '请使用 手机QQ「扫一扫」授权登录', 'normal');
      if (stepGuide) {
        stepGuide.style.background = 'rgba(18, 183, 245, 0.08)';
        stepGuide.style.border = '1px solid rgba(18, 183, 245, 0.25)';
        stepGuide.innerHTML = `
          <div style="font-weight: 600; color: #12b7f5; margin-bottom: 2px;">🔵 扫码指引（手机 QQ）：</div>
          <div>1. 打开 <strong>手机 QQ</strong> ➜ 点击右上角 <strong>【+】</strong> 号</div>
          <div>2. 选择 <strong>【扫一扫】</strong> 对准屏幕二维码</div>
          <div>3. 手机端点击【确认登录】，即可秒级自动同步</div>
        `;
      }
    }
    startQQChannelQrLogin();
  }

  async function startQQChannelQrLogin() {
    if (_qqQrPollTimer) {
      clearInterval(_qqQrPollTimer);
      _qqQrPollTimer = null;
    }
    const qrImg = document.getElementById('qqQrImg');
    const qrMask = document.getElementById('qqQrMask');
    const qrTip = document.getElementById('qqQrTip');
    const qrLoading = document.getElementById('qqQrLoading');

    if (qrMask) qrMask.style.display = 'none';
    if (qrLoading) qrLoading.style.display = 'flex';
    if (qrImg) qrImg.style.display = 'none';
    setQrTipStatus(qrTip, '正在连接本地同步服务...', 'normal');

    const serverOk = await ensureServerOnline();
    if (!serverOk) {
      if (qrLoading) qrLoading.style.display = 'none';
      if (qrMask) qrMask.style.display = 'flex';
      setQrTipStatus(qrTip, '本地同步服务未就绪，请确认已安装 Node.js 后重试', 'error');
      showNotification('获取二维码失败: 本地同步服务未启动');
      return;
    }

    const isWx = _currentQQAuthChannel === 'wechat';
    setQrTipStatus(qrTip, isWx ? '正在获取微信安全授权二维码...' : '正在获取 QQ 安全授权二维码...', 'normal');

    const apiCreate = isWx ? `${API_BASE}/api/qq/wx/qr/create` : `${API_BASE}/api/qq/qr/create`;
    const apiCheck = isWx ? `${API_BASE}/api/qq/wx/qr/check` : `${API_BASE}/api/qq/qr/check`;

    try {
      const res = await fetch(apiCreate);
      if (!res.ok) throw new Error(`网络请求失败 (${res.status})`);
      const data = await res.json();
      if (!data.success || !data.qrKey || !data.qrImgData) {
        throw new Error(data.error || '获取二维码数据失败');
      }

      _currentQQQrKey = data.qrKey;
      if (qrLoading) qrLoading.style.display = 'none';
      if (qrImg) {
        qrImg.src = data.qrImgData;
        qrImg.style.display = 'block';
        qrImg.style.opacity = '1';
      }

      setQrTipStatus(qrTip, isWx ? '请使用 微信「扫一扫」授权登录' : '请使用 手机QQ「扫一扫」授权登录', 'normal');

      _qqQrPollTimer = setInterval(async () => {
        if (!_currentQQQrKey) return;
        try {
          const checkRes = await fetch(`${apiCheck}?qrKey=${encodeURIComponent(_currentQQQrKey)}`);
          if (!checkRes.ok) return;
          const checkData = await checkRes.json();

          if (checkData.code === 66) {
            setQrTipStatus(qrTip, isWx ? '请使用 微信「扫一扫」授权登录' : '请使用 手机QQ「扫一扫」授权登录', 'normal');
          } else if (checkData.code === 67) {
            setQrTipStatus(qrTip, isWx ? '📱 微信已扫描，请在手机上点击允许登录' : '📱 手机已扫描，请在手机 QQ 上点击确认登录', 'scanned');
          } else if (checkData.code === 65) {
            clearInterval(_qqQrPollTimer);
            _qqQrPollTimer = null;
            if (qrLoading) qrLoading.style.display = 'none';
            if (qrMask) qrMask.style.display = 'flex';
            setQrTipStatus(qrTip, '二维码已失效，请点击刷新', 'error');
          } else if (Number(checkData.code) === 0) {
            clearInterval(_qqQrPollTimer);
            _qqQrPollTimer = null;
            setQrTipStatus(qrTip, '✅ 授权成功！正在同步收藏唱片...', 'success');

            const uin = checkData.uin || '';
            const cookie = checkData.cookie || '';
            const isWechat = checkData.accountType === 'wechat' || _currentQQAuthChannel === 'wechat';
            if (isWechat) {
              localStorage.setItem('qq_music_account_type', 'wechat');
            } else {
              localStorage.setItem('qq_music_account_type', 'qq');
            }

            if (uin) localStorage.setItem(STORAGE.QQ_UIN, uin);
            if (cookie) localStorage.setItem(STORAGE.QQ_COOKIE, cookie);

            closeQQAuthModal();
            updateUiStatus();
            ensureCloudPopoverOpen();
            const tipAccount = isWechat ? '微信授权' : (uin ? `账号: ${uin}` : '已授权');
            showNotification(`✅ 企鹅音乐登录成功！(${tipAccount})，请点击【一键同步】或【仅新增导入】开始更新专辑`);
          }
        } catch (_) {}
      }, 1500);

    } catch (e) {
      console.error('QQ QR init failed:', e);
      if (qrLoading) qrLoading.style.display = 'none';
      if (qrMask) qrMask.style.display = 'flex';
      setQrTipStatus(qrTip, '获取登录二维码失败，请确保本地后台服务正在运行', 'error');
    }
  }

  function openQQAuthModal() {
    closeAllDropdowns();
    const modal = document.getElementById('qqAuthModal');
    if (!modal) return;
    modal.classList.add('active');
    switchQQChannel('wechat'); // 默认微信扫码排第一作为首选项
  }

  function closeQQAuthModal() {
    stopCloudSyncPoll();
    if (_qqQrPollTimer) {
      clearInterval(_qqQrPollTimer);
      _qqQrPollTimer = null;
    }
    const modal = document.getElementById('qqAuthModal');
    if (modal) modal.classList.remove('active');
  }

    async function connectQQCredentials(rawUin, rawCookie) {
    const errAlert = document.getElementById('qqAuthErrorAlert');
    const errDesc = document.getElementById('qqAuthErrorDesc');
    const showModalError = (msg) => {
      if (errAlert && errDesc) {
        errDesc.textContent = msg;
        errAlert.style.display = 'block';
      }
      showNotification('连接企鹅音乐失败: ' + msg);
    };

    if (errAlert) errAlert.style.display = 'none';

    let uin = (rawUin || '').trim();
    let cookie = (rawCookie || '').trim();

    // 智能提取：如果用户在 Cookie 栏输入了包含 uin 的整串 Cookie
    if (cookie) {
      const uinMatch = cookie.match(/uin=([0-9a-zA-Z_]+)/);
      if (uinMatch && !uin) {
        uin = uinMatch[1].replace(/^[oO]/, '');
        const uinInput = document.getElementById('qqUinInput');
        if (uinInput) uinInput.value = uin;
      }
    }
    if (!uin && rawUin) {
      const uinMatch = rawUin.match(/uin=([0-9a-zA-Z_]+)/);
      if (uinMatch) {
        uin = uinMatch[1].replace(/^[oO]/, '');
      }
    }

    if (!uin) {
      showModalError('请输入账号 (QQ 号或 uin)');
      return;
    }

    // 校验 Cookie 是否提供
    if (!cookie) {
      showModalError('未能检测到 Cookie 凭据。由于企鹅音乐隐私权限保护，若未公开主页收藏，需在下方填入从 y.qq.com 获取的完整 Cookie（包含 qm_keyst）才能读取。');
      return;
    }

    const submitBtn = document.getElementById('qqAuthSubmit');
    const originalText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '正在连接本地服务...';
    }

    const serverOk = await ensureServerOnline();
    if (!serverOk) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
      showModalError('本地同步服务未就绪，请确认已安装 Node.js 运行环境后重试');
      return;
    }

    if (submitBtn) {
      submitBtn.textContent = '正在验证连接...';
    }

    try {
      let res;
      try {
        res = await fetch(`${API_BASE}/api/qq/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uin, cookie })
        });
      } catch (_) {
        const verifyUrl = `${API_BASE}/api/qq/verify?uin=${encodeURIComponent(uin)}&cookie=${encodeURIComponent(cookie)}`;
        res = await fetch(verifyUrl);
      }

      if (!res.ok) throw new Error(`连接后台服务异常 (${res.status})`);
      const data = await res.json();
      if (!data.success) {
        let errStr = data.error || '验证失败';
        if (errStr === 'privacy' || data.code === 4000) {
          errStr = '隐私权限限制：您的企鹅音乐收藏专辑当前设置为「仅自己可见」。请在手机 企鹅音乐 APP 中进入【我的】➜ 右上角【设置】➜【隐私设置】➜【个人主页隐私设置】将【我喜欢的音乐/收藏】设为公开，即可一键同步！';
        }
        throw new Error(errStr);
      }

      localStorage.setItem(STORAGE.QQ_UIN, uin);
      localStorage.setItem(STORAGE.QQ_COOKIE, cookie);
      closeQQAuthModal();
      updateUiStatus();
      showNotification(`✅ 企鹅音乐账号连接成功！(已检测到 ${data.total || 0} 张收藏专辑)`);
    } catch (err) {
      console.error('QQ connect failed:', err);
      showModalError(err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  }

  function disconnectQQ() {
    localStorage.removeItem(STORAGE.QQ_COOKIE);
    localStorage.removeItem(STORAGE.QQ_UIN);
    updateUiStatus();
    showNotification('已断开企鹅音乐账号连接');
  }

  // ===== 3. 拉取企鹅音乐收藏专辑 =====

  async function fetchAllQQSavedAlbums(progressCb) {
    let uin = localStorage.getItem(STORAGE.QQ_UIN);
    const cookie = localStorage.getItem(STORAGE.QQ_COOKIE) || '';
    if (!uin && cookie) {
      const match = cookie.match(/(?:uin|wxuin)=([0-9a-zA-Z_]+)/);
      if (match) {
        uin = match[1].replace(/^[oO]/, '');
        localStorage.setItem(STORAGE.QQ_UIN, uin);
      }
    }
    if (!uin && !cookie) {
      throw new Error('企鹅音乐尚未连接，请先点击【连接账号】使用微信或手机扫码授权');
    }

    const albums = [];
    let sin = 0;
    const limit = 30;
    let hasMore = true;
    let total = 0;

    while (hasMore) {
      if (_syncCancelled) throw new Error('USER_CANCELLED');
      if (progressCb) progressCb(sin, Math.max(total, sin + 1));
      let res;
      try {
        res = await fetch(`${API_BASE}/api/qq/album/sublist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uin, cookie, sin, limit })
        });
      } catch (_) {
        const url = `${API_BASE}/api/qq/album/sublist?uin=${encodeURIComponent(uin)}&cookie=${encodeURIComponent(cookie)}&sin=${sin}&limit=${limit}`;
        res = await fetch(url);
      }

      if (!res.ok) throw new Error(`企鹅音乐接口请求异常 (${res.status})`);
      const data = await res.json();

      if (data.code !== 200) {
        let msg = data.msg || data.error || '获取企鹅音乐收藏专辑列表失败';
        if (msg === 'privacy' || data.code === 4000) {
          msg = '隐私权限限制：您的企鹅音乐收藏专辑当前设置为「仅自己可见」。请在手机 企鹅音乐 APP 中进入【我的】➜ 右上角【设置】➜【隐私设置】➜【个人主页隐私设置】将【我喜欢的音乐/收藏】设为公开，即可一键同步！';
        }
        throw new Error(msg);
      }

      total = data.count || 0;
      const list = data.data || [];
      if (list.length === 0) break;

      for (const item of list) {
        albums.push(item);
      }

      hasMore = data.hasMore !== false && albums.length < total;
      sin += list.length;
    }

    if (progressCb) progressCb(albums.length, albums.length);
    return albums;
  }

  // ===== 2. 拉取冈易音乐收藏专辑 =====

  async function fetchAllNeteaseSavedAlbums(progressCb) {
    const cookie = localStorage.getItem(STORAGE.NETEASE_COOKIE);
    if (!cookie) throw new Error('冈易音乐未登录或凭据已失效，请重新扫码');

    const albums = [];
    let offset = 0;
    const limit = 50;
    let hasMore = true;
    let total = 0;

    while (hasMore) {
      if (_syncCancelled) throw new Error('USER_CANCELLED');
      if (progressCb) progressCb(offset, Math.max(total, offset + 1));
      let res;
      try {
        res = await fetch(`${API_BASE}/api/netease/album/sublist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cookie, limit, offset })
        });
      } catch (_) {
        res = await fetch(`${API_BASE}/api/netease/album/sublist?cookie=${encodeURIComponent(cookie)}&limit=${limit}&offset=${offset}`);
      }
      if (!res.ok) throw new Error(`冈易接口请求异常 (${res.status})`);
      const data = await res.json();
      if (data.code !== 200) {
        if (data.code === 301) {
          localStorage.removeItem(STORAGE.NETEASE_COOKIE);
          updateUiStatus();
          throw new Error('冈易登录已过期，请重新扫码登录');
        }
        throw new Error(data.msg || '冈易接口返回异常');
      }

      total = data.count || data.total || 0;
      const list = data.data || [];
      if (list.length === 0) break;

      for (const item of list) {
        albums.push(item);
      }

      hasMore = data.hasMore !== false && albums.length < total;
      offset += list.length;
    }
    if (progressCb) progressCb(albums.length, albums.length);
    return albums;
  }

  // ===== 3. 年代规则与数据映射引擎 =====

  // 核心用户数据保护判定：全面检测卡片内是否包含用户写入的数据
  // 包括：总评分、曲目评分/曲目列表(track评分)、标签(tags)、文字乐评(review)、
  // 评分小注(scoreNote)、备忘笔记(notes)、年度专辑/单曲(isAoty/isSoty)、自定义封面等
  function hasUserCustomData(entry) {
    if (!entry) return false;

    // 1. 总评分：用户给出过具体分数（0 - 100），而非默认待打分 null
    if (entry.score !== null && entry.score !== undefined && entry.score !== '') {
      return true;
    }

    // 2. 曲目列表与曲目评分（tracks）：只要存在有效曲目数据、填写了歌名或打过单曲分
    if (Array.isArray(entry.tracks) && entry.tracks.length > 0) {
      const hasRealTrack = entry.tracks.some(t => {
        if (!t) return false;
        if (t.score !== null && t.score !== undefined && t.score !== '') return true;
        if (typeof t.title === 'string' && t.title.trim() !== '') return true;
        return false;
      });
      if (hasRealTrack) return true;
    }

    // 3. 标签（tags）：用户打过标签
    if (Array.isArray(entry.tags) && entry.tags.some(tg => typeof tg === 'string' && tg.trim() !== '')) {
      return true;
    }

    // 4. 文字乐评（review）：写过详细评论或分析
    if (typeof entry.review === 'string' && entry.review.trim() !== '') {
      return true;
    }

    // 5. 评分小注 / 附言（scoreNote）
    if (typeof entry.scoreNote === 'string' && entry.scoreNote.trim() !== '') {
      return true;
    }

    // 6. 备忘录 / 副标题 / 笔记（notes）
    if (typeof entry.notes === 'string' && entry.notes.trim() !== '') {
      return true;
    }

    // 7. 年度专辑 / 年度单曲（isAoty / isSoty）
    if (entry.isAoty === true || entry.isSoty === true) {
      return true;
    }

    // 8. 自定义上传封面（本地存储的封面，非以 http/https 开头的云端流媒体外链）
    if (typeof entry.cover === 'string' && entry.cover.trim() !== '' && !entry.cover.startsWith('http')) {
      return true;
    }

    return false;
  }

  // 权威日期解析引擎：支持 YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD / YYYY / 10位或13位时间戳 / ISO 标准串
  function parseReleaseDate(input) {
    if (input === undefined || input === null || input === '') return null;
    const str = String(input).trim();
    if (!str || str === '0' || str === '0000-00-00' || str === '1970-01-01' || str.startsWith('0000')) return null;

    const curYear = new Date().getFullYear();

    // 1. 标准 YYYY-MM-DD 或 YYYY/MM/DD 或 YYYY.MM.DD (如 "2001-09-14")
    const matchFull = str.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (matchFull) {
      const y = parseInt(matchFull[1], 10);
      if (y >= 1900 && y <= curYear + 2) {
        return {
          year: y,
          month: matchFull[2].padStart(2, '0'),
          day: matchFull[3].padStart(2, '0')
        };
      }
    }

    // 2. 纯四位数字年份 (如 "2001")
    const matchYearOnly = str.match(/^(\d{4})$/);
    if (matchYearOnly) {
      const y = parseInt(matchYearOnly[1], 10);
      if (y >= 1900 && y <= curYear + 2) {
        return { year: y, month: '', day: '' };
      }
    }

    // 3. 数字时间戳（纯数字：支持毫秒级13位、历史负数时间戳、10位秒级时间戳）
    const numTs = Number(str);
    if (!isNaN(numTs) && numTs !== 0) {
      // 只有 10 位正数秒级时间戳（100000000 ~ 3000000000）才需要乘 1000 转毫秒；网易云的所有时间戳（含历史负数）均为毫秒时间戳，绝不可乘 1000！
      let tsMs = numTs;
      if (numTs > 1e8 && numTs < 3e9) {
        tsMs = numTs * 1000;
      }
      const d = new Date(tsMs);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        if (y >= 1900 && y <= curYear + 2) {
          return {
            year: y,
            month: String(d.getMonth() + 1).padStart(2, '0'),
            day: String(d.getDate()).padStart(2, '0')
          };
        }
      }
    }

    // 4. ISO 格式或 Date 可解析字符串
    const dIso = new Date(str);
    if (!isNaN(dIso.getTime())) {
      const y = dIso.getFullYear();
      if (y >= 1900 && y <= curYear + 2) {
        return {
          year: y,
          month: String(dIso.getMonth() + 1).padStart(2, '0'),
          day: String(dIso.getDate()).padStart(2, '0')
        };
      }
    }

    return null;
  }

  function formatAlbumForImport(rawAlbum) {
    const title = (rawAlbum.name || '').trim();
    let artist = '';
    if (Array.isArray(rawAlbum.artists) && rawAlbum.artists.length > 0) {
      artist = rawAlbum.artists.map(a => a.name).filter(Boolean).join('/').trim();
    } else if (rawAlbum.artist && rawAlbum.artist.name) {
      artist = String(rawAlbum.artist.name).trim();
    }
    const cover = rawAlbum.picUrl ? rawAlbum.picUrl.replace(/^http:/, 'https:') : null;

    if (!title) return null;

    // 网易云专属时间戳提取：支持 publishTime / pubTime / publish_time
    const rawTs = rawAlbum.publishTime ?? rawAlbum.pubTime ?? rawAlbum.publish_time;
    const parsedDate = parseReleaseDate(rawTs);
    let year = parsedDate ? parsedDate.year : null;
    let month = parsedDate ? parsedDate.month : '';
    let day = parsedDate ? parsedDate.day : '';

    // 严禁从标题正则提取年份！若仍未获取到则兜底使用系统当前年份
    if (!year) {
      console.warn('[Netease Import] 未能获取到真实发行年份: ' + title);
      year = new Date().getFullYear();
    }

    // 严格遵循本音乐库标准年代划分体系：
    // 1. 1990 年及以后：单年独立（如 2024、2012、1994），date 显示 MM.DD（若无月日或01.01默认占位则显示具体年份）
    // 2. 1990 年以前：年代分组（1980s、1979-1975、1974-1970、1960s、1950s），date 显示具体发行年份 YYYY
    const targetSectionId = getTargetSectionForYear(year);
    let formattedDate = '';

    if (year >= 1990) {
      formattedDate = (month && day && !(month === '01' && day === '01')) ? `${month}.${day}` : String(year);
    } else {
      formattedDate = String(year);
    }

    return {
      targetSectionId,
      year,
      entry: {
        id: generateId(),
        title,
        artist,
        score: null,         // 外部新导入的专辑初始分数为 null（展示为 NR，待打分）
        scoreNote: '',
        date: formattedDate, // 自动按年代规则计算出来的日期
        tags: [],
        review: '',
        isAoty: false,
        isSoty: false,
        notes: '',
        cover,
        cloudSource: 'netease',
        tracks: []
      }
    };
  }

  function formatQQAlbumForImport(rawAlbum) {
    const title = (rawAlbum.name || '').trim();
    let artist = (rawAlbum.artist || '').trim();
    if (!artist && Array.isArray(rawAlbum.artists)) {
      artist = rawAlbum.artists.map(a => a.name).join('/');
    }
    const cover = rawAlbum.picUrl ? rawAlbum.picUrl.replace(/^http:/, 'https:') : null;

    if (!title) return null;

    const parsedDate = parseReleaseDate(rawAlbum.publishTime || rawAlbum.publicTime || rawAlbum.publishDate);
    let year = parsedDate ? parsedDate.year : null;
    let month = parsedDate ? parsedDate.month : '';
    let day = parsedDate ? parsedDate.day : '';

    if (!year) {
      year = new Date().getFullYear();
    }

    const targetSectionId = getTargetSectionForYear(year);
    let formattedDate = '';

    if (year >= 1990) {
      formattedDate = (month && day && !(month === '01' && day === '01')) ? `${month}.${day}` : String(year);
    } else {
      formattedDate = String(year);
    }

    return {
      targetSectionId,
      year,
      entry: {
        id: generateId(),
        title,
        artist,
        score: null,
        scoreNote: '',
        date: formattedDate,
        tags: [],
        review: '',
        isAoty: false,
        isSoty: false,
        notes: '',
        cover,
        cloudSource: 'qq',
        tracks: []
      }
    };
  }

  // ===== 4. 查重、归档入库与自动校准年代管道 =====

  async function importAlbumsPipeline(rawAlbums, opts = {}) {
    const isAddOnly = opts.addOnly === true;
    const source = opts.source || 'netease';
    const platformName = source === 'qq' ? '企鹅音乐' : '冈易音乐';

    if (!rawAlbums || rawAlbums.length === 0) {
      showNotification(`未在${platformName}找到已收藏的专辑`);
      return;
    }

    // 建立现有条目的多维比对索引（组合键 + 标题多值倒排索引）
    const entryLocationMap = new Map();
    const titleToEntriesMap = new Map();

    for (const section of appData.sections) {
      for (const group of section.groups) {
        for (let i = 0; i < group.entries.length; i++) {
          const entry = group.entries[i];
          const fullKey = makeKey(entry.title, entry.artist);
          const tKey = norm(entry.title);
          const loc = { section, group, entry, tokens: getArtistTokens(entry.artist) };
          entryLocationMap.set(fullKey, loc);
          if (!titleToEntriesMap.has(tKey)) {
            titleToEntriesMap.set(tKey, []);
          }
          titleToEntriesMap.get(tKey).push(loc);
        }
      }
    }

    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const newlyAddedTitles = [];

    for (let i = 0; i < rawAlbums.length; i++) {
      if (_syncCancelled) throw new Error('USER_CANCELLED');
      const raw = rawAlbums[i];
      const parsed = source === 'qq' ? formatQQAlbumForImport(raw) : formatAlbumForImport(raw);
      if (!parsed) continue;

      // 实时计算归档进度 (50% -> 98%)，并在二级菜单中动态展示当前处理专辑与目标年代
      const currentPct = 50 + Math.floor(((i + 1) / rawAlbums.length) * 48);
      const albumDesc = `${parsed.entry.title} (${parsed.year || '未知'}) → ${parsed.targetSectionId}`;
      setSyncProgress(
        currentPct,
        isAddOnly ? `正在比对新增: ${albumDesc}` : `正在精准归档: ${albumDesc}`,
        `${i + 1} / ${rawAlbums.length}`,
        false,
        `正在同步${platformName}...`
      );

      // 短暂让出微任务时间，保证浏览器 60fps 实时重绘进度条与文字
      if (i % 2 === 0 || rawAlbums.length < 50) {
        await new Promise(r => setTimeout(r, 12));
      }

      const fullKey = makeKey(parsed.entry.title, parsed.entry.artist);
      const tKey = norm(parsed.entry.title);
      let existingLoc = entryLocationMap.get(fullKey);

      // 如果精确组合键未命中，但在同名列表中找到了艺术家相符的条目（协作歌手、别名或括号差异）
      if (!existingLoc && titleToEntriesMap.has(tKey)) {
        const candidates = titleToEntriesMap.get(tKey);
        const parsedTokens = getArtistTokens(parsed.entry.artist);
        for (const cand of candidates) {
          if (isArtistMatch(cand.tokens, parsedTokens, cand.entry.artist, parsed.entry.artist)) {
            existingLoc = cand;
            break;
          }
        }
      }

      if (existingLoc) {
        const existingEntry = existingLoc.entry;
        const currentSection = existingLoc.section;
        const currentGroup = existingLoc.group;

        // 核心资产保护：凡是包含任何用户写入数据（track评分、标签、文字乐评、总分、小注、备忘等）的专辑卡片，绝对保留，绝不被更新同步刷掉
        if (hasUserCustomData(existingEntry)) {
          let mod = false;
          // 仅在原卡片完全无封面时，非破坏性安全补齐云端高清封面
          if (!existingEntry.cover && parsed.entry.cover) {
            existingEntry.cover = parsed.entry.cover;
            mod = true;
          }
          // 仅在原卡片完全无发行日期时，非破坏性安全补齐发行日期
          if (!existingEntry.date && parsed.entry.date) {
            existingEntry.date = parsed.entry.date;
            mod = true;
          }
          if (mod) updatedCount++;
          skippedCount++;
          continue;
        }

        // 如果是尚未打分的导入条目（score === null），自动校准其年份、日期与年代归档
        let modified = false;

        // 补全封面
        if (parsed.entry.cover && !existingEntry.cover) {
          existingEntry.cover = parsed.entry.cover;
          modified = true;
        }

        // 特殊保护：《The Legend of 1900》在 1999 年分区中不得被覆盖篡改
        const isLegend1999 = /1900/i.test(existingEntry.title || '') && currentSection.id === '1999';

        if (!isLegend1999) {
          // 补齐或校准日期
          if (parsed.entry.date && existingEntry.date !== parsed.entry.date) {
            existingEntry.date = parsed.entry.date;
            modified = true;
          }

          // 核心校准：如果当前所在分区是非法分区（如 3973、3439）或被误归入 2024，自动迁移至正确年代
          const isCurrentBogus = !isValidSectionId(currentSection.id);
          const isMisplaced2024 = currentSection.id === '2024' && parsed.targetSectionId !== '2024';
          const shouldRelocate = isCurrentBogus || isMisplaced2024 || (!isAddOnly && currentSection.id !== parsed.targetSectionId);

          if (shouldRelocate) {
            const idx = currentGroup.entries.indexOf(existingEntry);
            if (idx !== -1) {
              currentGroup.entries.splice(idx, 1);
            }

            const targetSection = findOrCreateSection(parsed.targetSectionId);
            let targetGroup = targetSection.groups.find(g => g.name === 'Albums');
            if (!targetGroup) {
              targetGroup = { name: 'Albums', entries: [] };
              targetSection.groups.unshift(targetGroup);
            }
            targetGroup.entries.push(existingEntry);

            existingLoc.section = targetSection;
            existingLoc.group = targetGroup;
            modified = true;
          }
        }

        if (modified) {
          updatedCount++;
          continue;
        }

        skippedCount++;
        continue;
      }

      // 全新条目：新增入库
      parsed.entry.cloudSource = source;
      const section = findOrCreateSection(parsed.targetSectionId);
      let albumsGroup = section.groups.find(g => g.name === 'Albums');
      if (!albumsGroup) {
        albumsGroup = { name: 'Albums', entries: [] };
        section.groups.unshift(albumsGroup);
      }

      albumsGroup.entries.push(parsed.entry);
      const newLoc = { section, group: albumsGroup, entry: parsed.entry, tokens: getArtistTokens(parsed.entry.artist) };
      entryLocationMap.set(fullKey, newLoc);
      if (!titleToEntriesMap.has(tKey)) {
        titleToEntriesMap.set(tKey, []);
      }
      titleToEntriesMap.get(tKey).push(newLoc);
      addedCount++;
      newlyAddedTitles.push(`${parsed.entry.title} (${parsed.entry.artist})`);
    }

    // ===== 普通一键同步专属：加减都算进去 =====
    // 如果是普通一键同步（isAddOnly === false），对齐当前平台：云端已取消收藏/删除的未打分唱片，从本地同步减去
    let deletedCount = 0;
    const deletedTitles = [];

    if (!isAddOnly) {
      const cloudKeySet = new Set();
      const cloudTitleCandMap = new Map();

      for (let i = 0; i < rawAlbums.length; i++) {
        const raw = rawAlbums[i];
        const title = (raw.name || '').trim();
        let artist = (raw.artist || (Array.isArray(raw.artists) ? raw.artists.map(a => a.name).join('/') : '')).trim();
        if (!title) continue;
        const fk = makeKey(title, artist);
        const tk = norm(title);
        cloudKeySet.add(fk);
        if (!cloudTitleCandMap.has(tk)) {
          cloudTitleCandMap.set(tk, []);
        }
        cloudTitleCandMap.get(tk).push({
          title,
          artist,
          tokens: getArtistTokens(artist)
        });
      }

      function isInCloud(entry) {
        const fk = makeKey(entry.title, entry.artist);
        if (cloudKeySet.has(fk)) return true;
        const tk = norm(entry.title);
        if (cloudTitleCandMap.has(tk)) {
          const candidates = cloudTitleCandMap.get(tk);
          const entryTokens = getArtistTokens(entry.artist);
          for (const cand of candidates) {
            if (isArtistMatch(cand.tokens, entryTokens, cand.artist, entry.artist)) {
              return true;
            }
          }
        }
        return false;
      }

      for (const section of appData.sections) {
        for (const group of (section.groups || [])) {
          // 严禁清理 Singles (单曲) 分组！云端专辑同步仅针对 Albums (专辑) 分组
          if (group.name === 'Singles' || group.name === '单曲') continue;
          if (!Array.isArray(group.entries)) continue;
          for (let i = group.entries.length - 1; i >= 0; i--) {
            const entry = group.entries[i];
            // 1. 核心绝对豁免：只要卡片内写入了任何用户数据（track评分、打标签、写文字乐评、总分、小注、备忘等），拥有免删金牌，绝对保留，永不删除！
            if (hasUserCustomData(entry)) {
              continue;
            }

            // 2. 凡是没有写入任何自定义数据且不在当前云端收藏列表里的专辑卡片，在「一键同步」模式下全部彻底清理对齐
            if (!isInCloud(entry)) {
              group.entries.splice(i, 1);
              deletedCount++;
              deletedTitles.push(`${entry.title} (${entry.artist})`);
            }
          }
        }
      }
    }

    // 运行全局自愈与数据清洗，杜绝任何历史遗留错位
    if (typeof sanitizeAndAlignSections === 'function') {
      sanitizeAndAlignSections(appData);
    }
    ensureDefaultGroups();

    if (isAddOnly) {
      if (addedCount > 0 || updatedCount > 0) {
        await saveData();
        await refreshAll();
        if (typeof updateToolbarStats === 'function') updateToolbarStats();

        let detailMsg = `完成！成功新增 ${addedCount} 张`;
        if (updatedCount > 0) detailMsg += `，校准 ${updatedCount} 张`;
        setSyncProgress(100, detailMsg, `${rawAlbums.length} / ${rawAlbums.length}`, true, `同步${platformName}完成`);

        let notifyMsg = `✅ 仅新增导入完成！成功入库 ${addedCount} 张新专辑`;
        if (updatedCount > 0) notifyMsg += `，已自动校准 ${updatedCount} 张错位唱片至正确年代`;
        notifyMsg += `，跳过 ${skippedCount} 张已有唱片（卡片内写入数据 100% 绝对保留，零覆盖）`;
        if (newlyAddedTitles.length > 0) {
          const sample = newlyAddedTitles.slice(0, 3).join('、');
          notifyMsg += `\n新增唱片：${sample}${newlyAddedTitles.length > 3 ? ' 等' : ''}`;
        }
        showNotification(notifyMsg);
      } else {
        setSyncProgress(100, `已是最新！无新专辑需要入库`, `${rawAlbums.length} / ${rawAlbums.length}`, true, `同步${platformName}完成`);
        showNotification(`✅ 本地库已包含全部 ${rawAlbums.length} 张专辑，无新增唱片（本地现有数据零修改，${platformName}删除不删本地）`);
      }
      return;
    }

    // 普通一键同步：有多少算多少，加减都算进去
    if (addedCount > 0 || updatedCount > 0 || deletedCount > 0) {
      await saveData();
      await refreshAll();
      if (typeof updateToolbarStats === 'function') updateToolbarStats();

      let detailMsg = `完成！新增 ${addedCount} 张`;
      if (deletedCount > 0) detailMsg += `，移除 ${deletedCount} 张`;
      if (updatedCount > 0) detailMsg += `，校准 ${updatedCount} 张`;
      setSyncProgress(100, detailMsg, `${rawAlbums.length} / ${rawAlbums.length}`, true, `同步${platformName}完成`);

      let notifyMsg = `✅ 一键同步完成！`;
      const parts = [];
      if (addedCount > 0) parts.push(`新增 ${addedCount} 张新专辑`);
      if (deletedCount > 0) parts.push(`同步移除 ${deletedCount} 张云端已删唱片`);
      if (updatedCount > 0) parts.push(`校准 ${updatedCount} 张至正确年代`);
      notifyMsg += parts.join('，') + `（已严格保留所有包含曲目评分、标签、乐评等用户写入数据的卡片）`;

      showNotification(notifyMsg);
    } else {
      setSyncProgress(100, `已是最新！${rawAlbums.length} 张专辑无需更新`, `${rawAlbums.length} / ${rawAlbums.length}`, true, `同步${platformName}完成`);
      showNotification(`✅ 本地数据已与 ${platformName} 完全对齐（共 ${rawAlbums.length} 张）`);
    }
  }

  // 冈易音乐 同步主函数（支持 mode: 'addOnly' 或 'full'）
  async function syncNeteaseAlbums(opts = {}) {
    _syncCancelled = false;
    const isAddOnly = opts.addOnly === true;

    // 确保二级菜单打开，让用户能直观实时观看进度条
    const trigger = document.getElementById('cloudImportTrigger');
    const popover = document.getElementById('cloudImportPopover');
    if (trigger && popover) {
      const wasOpen = popover.classList.contains('open') || popover.classList.contains('portal-open');
      if (!wasOpen) {
        updateUiStatus();
        portalOpen(popover, trigger, { openClass: 'open', align: 'right', prefer: 'below' });
      }
    }

    const syncBtn = document.getElementById('neteaseSyncBtn');
    const addOnlyBtn = document.getElementById('neteaseAddOnlyBtn');

    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.style.opacity = '0.6';
      syncBtn.style.pointerEvents = 'none';
      if (!isAddOnly) syncBtn.textContent = '同步中...';
    }
    if (addOnlyBtn) {
      addOnlyBtn.disabled = true;
      addOnlyBtn.style.opacity = '0.6';
      addOnlyBtn.style.pointerEvents = 'none';
      if (isAddOnly) addOnlyBtn.textContent = '导入中...';
    }

    setSyncProgress(5, '正在连接本地同步服务...', '准备中', false, '正在同步冈易音乐...');
    try {
      const serverOk = await ensureServerOnline();
      if (!serverOk) {
        throw new Error('本地云端同步服务未启动。若未安装 Node.js，请先安装 Node.js 运行环境后重试');
      }

      setSyncProgress(10, '正在连接冈易音乐 API...', '准备中', false, '正在同步冈易音乐...');
      const albums = await fetchAllNeteaseSavedAlbums((curr, total) => {
        const pct = Math.floor((curr / Math.max(1, total)) * 40) + 10;
        setSyncProgress(pct, `正在拉取云端收藏专辑 (${curr}/${total})...`, `${curr} / ${total}`, false, '正在同步冈易音乐...');
      });

      const modeDesc = isAddOnly ? '正在比对并提取新收藏专辑...' : '正在逐张比对与智能年代归档...';
      setSyncProgress(50, modeDesc, `${albums.length} 张`, false, '正在同步冈易音乐...');
      await importAlbumsPipeline(albums, { addOnly: isAddOnly, source: 'netease' });
    } catch (err) {
      if (err.message === 'USER_CANCELLED') {
        setSyncProgress(0, '已取消本次同步操作', '已终止', true, '同步已手动取消');
        showNotification('⚠️ 已及时取消同步，本地数据保持不变');
        return;
      }
      console.error(err);
      showNotification('冈易同步失败: ' + err.message);
      setSyncProgress(null);
    } finally {
      setTimeout(() => {
        resetSyncButtons();
      }, 1200);
    }
  }

  // 企鹅音乐 同步主函数（支持 mode: 'addOnly' 或 'full'）
  async function syncQQAlbums(opts = {}) {
    _syncCancelled = false;
    const isAddOnly = opts.addOnly === true;

    // 确保二级菜单打开，让用户能直观实时观看进度条
    const trigger = document.getElementById('cloudImportTrigger');
    const popover = document.getElementById('cloudImportPopover');
    if (trigger && popover) {
      const wasOpen = popover.classList.contains('open') || popover.classList.contains('portal-open');
      if (!wasOpen) {
        updateUiStatus();
        portalOpen(popover, trigger, { openClass: 'open', align: 'right', prefer: 'below' });
      }
    }

    const syncBtn = document.getElementById('qqSyncBtn');
    const addOnlyBtn = document.getElementById('qqAddOnlyBtn');

    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.style.opacity = '0.6';
      syncBtn.style.pointerEvents = 'none';
      if (!isAddOnly) syncBtn.textContent = '同步中...';
    }
    if (addOnlyBtn) {
      addOnlyBtn.disabled = true;
      addOnlyBtn.style.opacity = '0.6';
      addOnlyBtn.style.pointerEvents = 'none';
      if (isAddOnly) addOnlyBtn.textContent = '导入中...';
    }

    setSyncProgress(5, '正在连接本地同步服务...', '准备中', false, '正在同步企鹅音乐...');
    try {
      const serverOk = await ensureServerOnline();
      if (!serverOk) {
        throw new Error('本地云端同步服务未启动。若未安装 Node.js，请先安装 Node.js 运行环境后重试');
      }

      setSyncProgress(10, '正在连接企鹅音乐 API...', '准备中', false, '正在同步企鹅音乐...');
      const albums = await fetchAllQQSavedAlbums((curr, total) => {
        const pct = Math.floor((curr / Math.max(1, total)) * 40) + 10;
        setSyncProgress(pct, `正在拉取云端收藏专辑 (${curr}/${total})...`, `${curr} / ${total}`, false, '正在同步企鹅音乐...');
      });

      const modeDesc = isAddOnly ? '正在比对并提取新收藏专辑...' : '正在逐张比对与智能年代归档...';
      setSyncProgress(50, modeDesc, `${albums.length} 张`, false, '正在同步企鹅音乐...');
      await importAlbumsPipeline(albums, { addOnly: isAddOnly, source: 'qq' });
    } catch (err) {
      if (err.message === 'USER_CANCELLED') {
        setSyncProgress(0, '已取消本次同步操作', '已终止', true, '同步已手动取消');
        showNotification('⚠️ 已及时取消同步，本地数据保持不变');
        return;
      }
      console.error(err);
      showNotification('企鹅音乐同步失败: ' + err.message);
      setSyncProgress(null);
    } finally {
      setTimeout(() => {
        resetSyncButtons();
      }, 1200);
    }
  }

  // ===== 5. UI 状态刷新与交互绑定 =====

  function updateUiStatus() {
    const neteaseCookie = localStorage.getItem(STORAGE.NETEASE_COOKIE);

    const neteaseStatus = document.getElementById('neteaseStatus');
    const neteaseLoginBtn = document.getElementById('neteaseLoginBtn');
    const neteaseAddOnlyBtn = document.getElementById('neteaseAddOnlyBtn');
    const neteaseSyncBtn = document.getElementById('neteaseSyncBtn');
    const neteaseDisconnectBtn = document.getElementById('neteaseDisconnectBtn');

    if (neteaseCookie) {
      if (neteaseStatus) {
        neteaseStatus.textContent = t('cloudImport.connected');
        neteaseStatus.className = 'cloud-platform-badge connected';
      }
      if (neteaseLoginBtn) neteaseLoginBtn.style.display = 'none';
      if (neteaseAddOnlyBtn) neteaseAddOnlyBtn.style.display = 'inline-flex';
      if (neteaseSyncBtn) neteaseSyncBtn.style.display = 'inline-flex';
      if (neteaseDisconnectBtn) neteaseDisconnectBtn.style.display = 'inline-flex';
    } else {
      if (neteaseStatus) {
        neteaseStatus.textContent = t('cloudImport.disconnected');
        neteaseStatus.className = 'cloud-platform-badge disconnected';
      }
      if (neteaseLoginBtn) neteaseLoginBtn.style.display = 'inline-flex';
      if (neteaseAddOnlyBtn) neteaseAddOnlyBtn.style.display = 'none';
      if (neteaseSyncBtn) neteaseSyncBtn.style.display = 'none';
      if (neteaseDisconnectBtn) neteaseDisconnectBtn.style.display = 'none';
    }

    const qqUin = localStorage.getItem(STORAGE.QQ_UIN);
    const qqCookie = localStorage.getItem(STORAGE.QQ_COOKIE);
    const qqAccountType = localStorage.getItem('qq_music_account_type');
    const qqStatus = document.getElementById('qqStatus');
    const qqLoginBtn = document.getElementById('qqLoginBtn');
    const qqAddOnlyBtn = document.getElementById('qqAddOnlyBtn');
    const qqSyncBtn = document.getElementById('qqSyncBtn');
    const qqDisconnectBtn = document.getElementById('qqDisconnectBtn');

    const isQQConnected = !!(qqUin || qqCookie);

    if (isQQConnected) {
      if (qqStatus) {
        let label = '已连接';
        if (qqAccountType === 'wechat' || (qqCookie && qqCookie.includes('wxuin='))) {
          label = '微信已连接';
        } else if (qqUin && /^\d+$/.test(qqUin) && qqUin.length <= 11) {
          label = `已连接 (QQ: ${qqUin})`;
        }
        qqStatus.textContent = label;
        qqStatus.className = 'cloud-platform-badge connected';
      }
      if (qqLoginBtn) qqLoginBtn.style.display = 'none';
      if (qqAddOnlyBtn) qqAddOnlyBtn.style.display = 'inline-flex';
      if (qqSyncBtn) qqSyncBtn.style.display = 'inline-flex';
      if (qqDisconnectBtn) qqDisconnectBtn.style.display = 'inline-flex';
    } else {
      if (qqStatus) {
        qqStatus.textContent = '未连接';
        qqStatus.className = 'cloud-platform-badge disconnected';
      }
      if (qqLoginBtn) qqLoginBtn.style.display = 'inline-flex';
      if (qqAddOnlyBtn) qqAddOnlyBtn.style.display = 'none';
      if (qqSyncBtn) qqSyncBtn.style.display = 'none';
      if (qqDisconnectBtn) qqDisconnectBtn.style.display = 'none';
    }
  }

  let _syncCancelled = false;
  let _syncFadeTimer = null;

  function cancelSync() {
    _syncCancelled = true;
    setSyncProgress(0, '已取消本次同步操作', '已终止', true, '同步已手动取消');
    showNotification('⚠️ 已及时取消同步，本地数据保持不变');
    resetSyncButtons();
  }

  function resetSyncButtons() {
    const neteaseSyncBtn = document.getElementById('neteaseSyncBtn');
    const neteaseAddBtn = document.getElementById('neteaseAddOnlyBtn');
    const qqSyncBtn = document.getElementById('qqSyncBtn');
    const qqAddBtn = document.getElementById('qqAddOnlyBtn');

    [neteaseSyncBtn, neteaseAddBtn, qqSyncBtn, qqAddBtn].forEach(b => {
      if (!b) return;
      b.disabled = false;
      b.style.pointerEvents = 'auto';
      b.style.opacity = '1';
    });

    if (neteaseSyncBtn) neteaseSyncBtn.textContent = '一键同步';
    if (neteaseAddBtn) neteaseAddBtn.textContent = '仅新增模式';
    if (qqSyncBtn) qqSyncBtn.textContent = '一键同步';
    if (qqAddBtn) qqAddBtn.textContent = '仅新增模式';
  }

  function setSyncProgress(percent, text, countInfo, isDone = false, customTitle = null) {
    const wrap = document.getElementById('cloudSyncProgress');
    const bar = document.getElementById('cloudSyncBarInner');
    const txt = document.getElementById('cloudSyncStatusText');
    const pctTxt = document.getElementById('cloudSyncPctText');
    const countTxt = document.getElementById('cloudSyncCountText');
    const title = document.getElementById('cloudSyncTitle');
    const spinner = document.getElementById('cloudSyncSpinner');
    if (!wrap) return;

    if (_syncFadeTimer) {
      clearTimeout(_syncFadeTimer);
      _syncFadeTimer = null;
    }

    if (percent === null) {
      wrap.style.display = 'none';
      if (bar) bar.style.width = '0%';
      return;
    }

    wrap.style.display = 'flex';
    const cleanPct = Math.min(100, Math.max(0, Math.round(percent)));
    if (bar) bar.style.width = `${cleanPct}%`;
    if (pctTxt) pctTxt.textContent = `${cleanPct}%`;
    if (txt && text) txt.textContent = text;
    if (countTxt && countInfo) countTxt.textContent = countInfo;

    if (isDone || cleanPct === 100) {
      if (title) title.textContent = customTitle || '同步与归档完成';
      if (spinner) {
        spinner.innerHTML = '✓';
        spinner.className = 'cloud-sync-spinner done';
      }
      if (bar) bar.classList.add('done');

      // 完成后保持展示 5 秒，再平滑收起
      _syncFadeTimer = setTimeout(() => {
        wrap.style.display = 'none';
        if (bar) {
          bar.style.width = '0%';
          bar.classList.remove('done');
        }
      }, 5000);
    } else {
      if (title) title.textContent = customTitle || '正在同步云端流媒体...';
      if (spinner) {
        spinner.innerHTML = '';
        spinner.className = 'cloud-sync-spinner';
      }
      if (bar) bar.classList.remove('done');
    }
  }

  function bindCloudImport() {
    const trigger = document.getElementById('cloudImportTrigger');
    const popover = document.getElementById('cloudImportPopover');

    if (trigger) trigger.textContent = t('toolbar.cloudImport');

    // 弹层展开/收起
    if (trigger && popover) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = popover.classList.contains('open') || popover.classList.contains('portal-open');
        closeAllDropdowns();
        if (!wasOpen) {
          updateUiStatus();
          portalOpen(popover, trigger, { openClass: 'open', align: 'right', prefer: 'below' });
        }
      });
    }

    // 网易云按钮交互
    document.getElementById('neteaseLoginBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openNeteaseQrLogin();
    });

    document.getElementById('neteaseDisconnectBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      localStorage.removeItem(STORAGE.NETEASE_COOKIE);
      localStorage.removeItem(STORAGE.NETEASE_USER);
      updateUiStatus();
      showNotification('已断开冈易音乐连接');
    });

    document.getElementById('neteaseAddOnlyBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      syncNeteaseAlbums({ addOnly: true });
    });

    document.getElementById('neteaseSyncBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      syncNeteaseAlbums({ addOnly: false });
    });

    // 网易云二维码弹窗关闭/刷新
    document.getElementById('neteaseQrClose')?.addEventListener('click', closeNeteaseQrLogin);
    document.getElementById('neteaseWebClose')?.addEventListener('click', closeNeteaseQrLogin);
    document.getElementById('neteaseSmsCancel')?.addEventListener('click', closeNeteaseQrLogin);
    document.getElementById('neteaseQrRefresh')?.addEventListener('click', () => startNeteaseQrLogin());

    // 标签页切换交互
    document.getElementById('neteaseTabWebBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      switchNeteaseTab('web');
    });

    document.getElementById('neteaseTabSmsBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      switchNeteaseTab('sms');
    });

    document.getElementById('neteaseTabQrBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      switchNeteaseTab('qr');
    });

    // 取消同步按钮
    document.getElementById('cloudSyncCancelBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelSync();
    });

    // 短信验证码发送与登录提交
    document.getElementById('neteaseSmsSendBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      sendNeteaseSmsCaptcha();
    });

    document.getElementById('neteaseSmsSubmitBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      submitNeteaseSmsLogin();
    });

    // 风控警告内的一键切换手机号登录
    document.getElementById('neteaseSwitchToWebBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      switchNeteaseTab('sms');
    });

    // 点击弹层遮罩关闭
    document.getElementById('neteaseQrModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'neteaseQrModal') closeNeteaseQrLogin();
    });

    // 企鹅音乐 按钮交互
    document.getElementById('qqLoginBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openQQAuthModal();
    });

    // 企鹅音乐 渠道切换 (微信扫码首选 & QQ扫码并列)
    document.getElementById('qqTabWxBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      switchQQChannel('wechat');
    });

    document.getElementById('qqTabQqBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      switchQQChannel('qq');
    });

    document.getElementById('qqDisconnectBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      disconnectQQ();
    });

    document.getElementById('qqAddOnlyBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      syncQQAlbums({ addOnly: true });
    });

    document.getElementById('qqSyncBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      syncQQAlbums({ addOnly: false });
    });

    // 企鹅音乐 扫码刷新与取消
    document.getElementById('qqQrRefresh')?.addEventListener('click', (e) => {
      e.stopPropagation();
      startQQChannelQrLogin();
    });

    document.getElementById('qqQrMask')?.addEventListener('click', (e) => {
      e.stopPropagation();
      startQQChannelQrLogin();
    });

    document.getElementById('qqQrClose')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeQQAuthModal();
    });

    document.getElementById('qqAuthModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'qqAuthModal') closeQQAuthModal();
    });

    // 初始化状态刷新
    updateUiStatus();

  }

    // 简易顶部通知轻提示 (最高图层 z-index: 100000)
  function showNotification(msg, duration) {
    if (typeof showToast === 'function') {
      showToast(msg, duration);
      return;
    }
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed;
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: rgba(30, 30, 36, 0.95);
      color: #fff;
      padding: 10px 22px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      z-index: 100000;
      box-shadow: 0 10px 32px rgba(0,0,0,0.45);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 0.5px solid rgba(255,255,255,0.25);
      opacity: 0;
      transition: all 0.25s ease;
      pointer-events: none;
      max-width: min(90vw, 680px);
      line-height: 1.45;
      white-space: normal;
      text-align: center;
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    const dTime = duration || Math.max(2500, Math.min(6500, (msg || '').length * 80));
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-8px)';
      setTimeout(() => toast.remove(), 300);
    }, dTime);
  }

  return {
    init: bindCloudImport,
    openNeteaseLogin: openNeteaseQrLogin,
    openQQLogin: openQQAuthModal,
    updateUiStatus,
    syncNeteaseAlbums,
    syncQQAlbums,
    formatAlbumForImport,
    formatQQAlbumForImport,
    importAlbumsPipeline,
  };
})();

// 在 window 上暴露供调用
window.CloudImport = CloudImport;
