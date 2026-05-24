const fs = require("fs");
const path = require("path");
const dir = __dirname;

// 支持命令行参数指定输入文件，或自动查找项目根目录下的 .txt 文件
let inputPath = process.argv[2];
if (!inputPath) {
  const txtFiles = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
  if (txtFiles.length === 0) {
    console.error("未找到 .txt 源文件，请将 txt 文件放在项目根目录或通过参数指定路径");
    console.error("用法: node gen.js <输入文件路径>");
    process.exit(1);
  }
  inputPath = path.join(dir, txtFiles[0]);
  if (txtFiles.length > 1) {
    console.log("找到多个 .txt 文件，使用第一个:", txtFiles[0]);
    console.log("如需指定其他文件，请使用: node gen.js <文件路径>");
  }
}
inputPath = path.resolve(inputPath);

let content;
try {
  content = fs.readFileSync(inputPath, "utf-8");
} catch (e) {
  console.error("无法读取源文件:", inputPath);
  console.error(e.message);
  process.exit(1);
}
const lines = content.split(/\r?\n/);

const sections = [];
let cs = null, cg = null, mode = "albums";
let ac = 0, sc = 0, qc = 0;
let inA = false, aL = [], aT = "", aA = "", aS = null, aX = null;

const TAGS = ["EP","Mixtape","Reissue","Soundtrack","Live","Compilation","Unofficial","DJ Mix","Video"];

function pt(text) { return TAGS.filter(t => text.includes(t)); }

function me(title, artist, score, sn, date, tags, review, isAoty, notes) {
  let eid;
  if (isAoty) { qc++; eid = "aoty-" + qc; }
  else if (mode === "singles") { sc++; eid = "s" + sc; }
  else { ac++; eid = "a" + ac; }
  return { id: eid, title: title, artist: artist, score: score, scoreNote: sn, date: date, tags: tags, review: review, isAoty: isAoty, notes: notes };
}

function ps(text) {
  const m = text.match(/<([^>]*)>/);
  if (m) {
    const v = m[1].trim();
    if (v === "" || v.toUpperCase() === "NR") return [null, v.toUpperCase() === "NR" ? "NR" : ""];
    const n = parseInt(v);
    return isNaN(n) ? [null, v] : [n, ""];
  }
  return [null, ""];
}

function pal(line) {
  const m = line.match(/^\d+[\.\s]\s*(.*)/);
  if (!m) return null;
  const rest = m[1];
  const p = rest.split(" - ", 2);
  if (p.length < 2) return null;
  const title = p[0].trim();
  const ar = p[1];
  const [score, sn] = ps(ar);
  const ns = ar.replace(/<[^>]*>/g, "").trim();
  // Extract tags first (they're usually at the end)
  const tags = pt(ns);
  let afterTags = ns;
  for (const tg of tags) afterTags = afterTags.replace(new RegExp("\\s*" + tg + "\\s*$"), "").replace(tg, "").trim();
  // Then extract date from what's left
  const dm = afterTags.match(/\s+(\d{1,2}\.\d{1,2})\s*$/);
  let date = "", artist;
  if (dm) { date = dm[1]; artist = afterTags.slice(0, dm.index).trim(); }
  else artist = afterTags.trim();
  // Extract notes
  let notes = "";
  for (const en of ["基于半成品", "基于未发行"]) {
    if (ar.includes(en)) {
      const nm = ar.match(new RegExp("[(（]([^)）]*" + en + "[^)）]*)[)）]"));
      if (nm) notes = nm[0];
      break;
    }
  }
  artist = artist.replace(/\s+/g, " ").trim().replace(/\s*[\/,，]\s*$/, "");
  return me(title, artist, score, sn, date, tags, "", false, notes);
}

function psl(line) {
  line = line.trim();
  if (!line || line.startsWith("P.S") || line.startsWith("Vol.") || line.startsWith("AOTY")) return null;
  const [score, sn] = ps(line);
  const ns = line.replace(/<[^>]*>/g, "").trim();
  const p = ns.split(" - ", 2);
  if (p.length < 2) return null;
  const title = p[0].trim();
  let rest = p[1].trim();
  // Extract tags
  const tags = pt(rest);
  for (const tg of tags) rest = rest.replace(new RegExp("\\s*" + tg), "").trim();
  // Remove AOTY marker
  rest = rest.replace(/\s*AOTY\b/gi, "").trim();
  // Remove parenthetical notes first (they may come after score)
  rest = rest.replace(/\s*[(（]Top\d+[)）]/g, "").trim();
  const noteMatch = rest.match(/[(（]([^)）]+)[)）]\s*$/);
  let notes = "";
  if (noteMatch) {
    notes = noteMatch[0];
    rest = rest.slice(0, noteMatch.index).trim();
  }
  // Extract score from trailing number if no <> score found (AFTER note removal)
  let finalScore = score;
  if (score === null && !sn) {
    const m = rest.match(/\s+(\d{1,3})\s*$/);
    if (m) { finalScore = parseInt(m[1]); rest = rest.slice(0, m.index).trim(); }
  }
  // Extract date
  const dm = rest.match(/\s+(\d{1,2}\.\d{1,2})\s*$/);
  let date = "";
  if (dm) { date = dm[1]; rest = rest.slice(0, dm.index).trim(); }
  if (line.includes("基于半成品")) notes = "基于半成品打分";
  const artist = rest.replace(/\s+/g, " ").trim();
  return me(title, artist, finalScore, sn, date, tags, "", false, notes);
}

function fa() {
  if (!inA) return;
  const review = aL.join("\n").trim();
  const e = me(aT, aA, aS, "", "", [], review, true, "");
  if (aX) {
    let ag = aX.groups.find(g => g.name === "AOTY");
    if (!ag) { ag = { name: "AOTY", entries: [] }; aX.groups.push(ag); }
    ag.entries.push(e);
  }
  inA = false; aL = [];
}

const hd = {
  "Vol. 1 - 2026": "vol1-2026", "Vol. 2 - 2026": "vol2-2026",
  "Vol. 1 - 2025": "vol1-2025", "Vol. 2 - 2025": "vol2-2025"
};
const dm2 = { "1980s": "1980s", "1979 to 1975": "1979-1975", "1974 to 1970": "1974-1970", "1960s": "1960s" };

const unmatchedLines = [];

for (let i = 0; i < lines.length; i++) {
  const s = lines[i].trim();
  if (!s) continue;

  if (inA) {
    if (s.startsWith("乐评：") || s.startsWith("乐评:")) continue;
    const isBreak = ["AOTY","Vol.","Before","P.S.","绿字"].some(p => s.startsWith(p)) || /^(19|20)\d{2}/.test(s);
    if (isBreak) { fa(); } else { aL.push(s); continue; }
  }

  let mt = false;
  for (const [k, v] of Object.entries(hd)) {
    if (s.startsWith(k)) {
      cs = { id: v, title: s, groups: [{ name: "Albums", entries: [] }] };
      sections.push(cs); cg = cs.groups[0]; mode = "albums"; mt = true; break;
    }
  }
  if (mt) continue;

  if (/^2024:\s*Part/.test(s)) {
    cs = { id: "2024", title: s, groups: [{ name: "Albums", entries: [] }] };
    sections.push(cs); cg = cs.groups[0]; mode = "albums"; continue;
  }
  if (s === "Before 2024: Part Albums/Mixtapes, etc. Ratings") continue;
  if (/^(19|20)\d{2}$/.test(s)) {
    cs = { id: s, title: s, groups: [{ name: "Albums", entries: [] }] };
    sections.push(cs); cg = cs.groups[0]; mode = "albums"; continue;
  }
  if (dm2[s]) {
    cs = { id: dm2[s], title: s, groups: [{ name: "Albums", entries: [] }] };
    sections.push(cs); cg = cs.groups[0]; mode = "albums"; continue;
  }
  if (s.startsWith("P.S.")) {
    mode = "singles";
    if (cs) { const sg = { name: "Singles", entries: [] }; cs.groups.push(sg); cg = sg; }
    continue;
  }
  if (s.startsWith("AOTY")) {
    inA = true; aL = []; aX = cs;
    i++;
    if (i < lines.length) {
      const nl = lines[i].trim();
      const sm = nl.match(/(\d+)\/100/);
      if (sm) { aS = parseInt(sm[1]); aT = nl.slice(0, sm.index).trim(); }
      else { aT = nl; aS = null; }
      i++;
    }
    if (i < lines.length) {
      const al2 = lines[i].trim();
      if (!al2.startsWith("乐评") && !al2.startsWith("AOTY")) { aA = al2; i++; }
    }
    continue;
  }
  if (["绿字","橙字","蓝字","未给出","700+","专辑后面"].some(p => s.startsWith(p))) continue;

  if (/^19\d{2}\s*-\s/.test(s) && cs) {
    const ym = s.match(/^(19\d{2})\s*-\s*(.*)/);
    if (ym) {
      const rest = ym[2];
      const p2 = rest.split(" - ", 2);
      let title = p2[0].trim();
      let artistRaw = p2.length > 1 ? p2[1].trim() : "";
      let [sc2, sn2] = ps(s + " " + artistRaw);
      // 如果没有 artist，尝试从 title 尾部提取裸数字分数（如 "Prince   77"）
      if (!artistRaw && sc2 == null) {
        const tm = title.match(/\s+(\d{1,3})\s*$/);
        if (tm) { sc2 = parseInt(tm[1]); title = title.slice(0, tm.index).trim(); }
      }
      // 提取标签并从 artist 中移除
      let ac2 = artistRaw.replace(/<[^>]*>/g, "").trim();
      const ta2 = pt(s + " " + artistRaw);
      for (const tg of ta2) ac2 = ac2.replace(new RegExp("\\s*" + tg + "\\s*$"), "").replace(tg, "").trim();
      // 移除 AOTY 标记
      ac2 = ac2.replace(/\s*AOTY\b/gi, "").trim();
      // 提取括号注释（如 (Top3)）
      const noteMatch2 = ac2.match(/[(（]([^)）]+)[)）]\s*$/);
      if (noteMatch2) { if (!sn2) sn2 = noteMatch2[1]; ac2 = ac2.slice(0, noteMatch2.index).trim(); }
      // 从 artist 尾部提取裸数字分数（如 "Pink Floyd  100"）
      if (sc2 === null) {
        const bm = ac2.match(/\s+(\d{1,3})\s*$/);
        if (bm) { sc2 = parseInt(bm[1]); ac2 = ac2.slice(0, bm.index).trim(); }
      }
      const d2 = ym[1];
      let no2 = "";
      if (s.includes("基于半成品")) no2 = "基于半成品打分";
      const paren = (s + artistRaw).match(/[(（]([^)）]*精选[^)）]*)[)）]/);
      if (paren) no2 = paren[0];
      const e = me(title, ac2, sc2, sn2, d2, ta2, "", false, no2);
      if (cg) cg.entries.push(e);
    }
    continue;
  }
  if (/^\d+[\.\s]/.test(s) && cs) {
    const e = pal(s);
    if (e && cg) cg.entries.push(e);
    continue;
  }
  if (cs && cg && mode === "albums" && s.includes(" - ")) {
    const e = psl(s);
    if (e) { cg.entries.push(e); continue; }
  }
  if (mode === "singles" && cs && cg && s) {
    const e = psl(s);
    if (e) { cg.entries.push(e); continue; }
  }
  unmatchedLines.push({ line: i + 1, text: s });
}

fa();

const data = { meta: { title: "Xan's Music Ratings", lastUpdated: new Date().toISOString().slice(0, 10) }, sections: sections };
let total = 0;
for (const sec of sections) {
  for (const g of sec.groups) {
    total += g.entries.length;
    console.log("  " + sec.id + " / " + g.name + ": " + g.entries.length);
  }
}
console.log("Total:", total);

if (unmatchedLines.length > 0) {
  console.warn("\n未匹配行 (" + unmatchedLines.length + "):");
  for (const ul of unmatchedLines) {
    console.warn("  第" + ul.line + "行: " + ul.text);
  }
}

const htmlPath = path.join(dir, "index.html");
let html;
try {
  html = fs.readFileSync(htmlPath, "utf-8");
} catch (e) {
  console.error("无法读取 index.html:", htmlPath);
  console.error(e.message);
  process.exit(1);
}

// Embed data using marker (works on re-runs)
const dataJson = JSON.stringify(data);
const marker = /const __MUSIC_DATA__ = [\s\S]*?;/;
if (!marker.test(html)) {
  console.error("错误: index.html 中未找到数据标记符 const __MUSIC_DATA__ = ...;");
  process.exit(1);
}
html = html.replace(marker, "const __MUSIC_DATA__ = " + dataJson + ";");

// Also write separate data.json
try {
  fs.writeFileSync(path.join(dir, "data.json"), JSON.stringify(data, null, 2), "utf-8");
  fs.writeFileSync(htmlPath, html, "utf-8");
  console.log("index.html updated with embedded data");
  console.log("data.json written");
} catch (e) {
  console.error("写入文件失败:", e.message);
  process.exit(1);
}
