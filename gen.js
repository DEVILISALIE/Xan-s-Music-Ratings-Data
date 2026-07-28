const fs = require("fs");
const path = require("path");
const dir = __dirname;
const uiDir = path.join(dir, "desktop-ui");

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
let currentSection = null, currentGroup = null, mode = "albums";
let albumCounter = 0, singleCounter = 0, aotyCounter = 0;

// AOTY 渲染状态
let isProcessingAoty = false, aotyReviewLines = [];
let aotyTitle = "", aotyArtist = "", aotyScore = null, aotyTargetSection = null;

const TAGS = ["EP","Mixtape","Reissue","Soundtrack","Live","Compilation","Unofficial","DJ Mix","Video"];

// 从文本中提取标签
function extractTags(text) {
  return TAGS.filter(t => text.includes(t));
}

// 创建条目对象
function createEntry(title, artist, score, scoreNote, date, tags, review, isAoty, notes) {
  let entryId;
  if (isAoty) { aotyCounter++; entryId = "aoty-" + aotyCounter; }
  else if (mode === "singles") { singleCounter++; entryId = "s" + singleCounter; }
  else { albumCounter++; entryId = "a" + albumCounter; }
  return { id: entryId, title: title, artist: artist, score: score, scoreNote: scoreNote, date: date, tags: tags, review: review, isAoty: isAoty, isSoty: false, notes: notes };
}

// 从尖括号标签 <...> 中解析分数
function parseScore(text) {
  const match = text.match(/<([^>]*)>/);
  if (match) {
    const value = match[1].trim();
    if (value === "" || value.toUpperCase() === "NR") return [null, value.toUpperCase() === "NR" ? "NR" : ""];
    const num = parseInt(value);
    return isNaN(num) ? [null, value] : [num, ""];
  }
  return [null, ""];
}

// 解析专辑行格式: "1. Title - Artist <score> date"
function parseAlbumLine(line) {
  const match = line.match(/^\d+[\.\s]\s*(.*)/);
  if (!match) return null;
  const rest = match[1];
  const parts = rest.split(" - ", 2);
  if (parts.length < 2) return null;
  const title = parts[0].trim();
  const artistRaw = parts[1];
  const [score, scoreNote] = parseScore(artistRaw);
  const cleaned = artistRaw.replace(/<[^>]*>/g, "").trim();
  // 提取标签
  const tags = extractTags(cleaned);
  let afterTags = cleaned;
  for (const tag of tags) afterTags = afterTags.replace(new RegExp("\\s*" + tag + "\\s*$"), "").replace(tag, "").trim();
  // 提取日期
  const dateMatch = afterTags.match(/\s+(\d{1,2}\.\d{1,2})\s*$/);
  let date = "", artist;
  if (dateMatch) { date = dateMatch[1]; artist = afterTags.slice(0, dateMatch.index).trim(); }
  else artist = afterTags.trim();
  // 提取备注
  let notes = "";
  for (const keyword of ["基于半成品", "基于未发行"]) {
    if (artistRaw.includes(keyword)) {
      const noteMatch = artistRaw.match(new RegExp("[(（]([^)）]*" + keyword + "[^)）]*)[)）]"));
      if (noteMatch) notes = noteMatch[0];
      break;
    }
  }
  artist = artist.replace(/\s+/g, " ").trim().replace(/\s*[\/,，]\s*$/, "");
  return createEntry(title, artist, score, scoreNote, date, tags, "", false, notes);
}

// 解析单曲行格式: "Title - Artist <score> date"
function parseSinglesLine(line) {
  line = line.trim();
  if (!line || line.startsWith("P.S") || line.startsWith("Vol.") || line.startsWith("AOTY")) return null;
  const [score, scoreNote] = parseScore(line);
  const cleaned = line.replace(/<[^>]*>/g, "").trim();
  const parts = cleaned.split(" - ", 2);
  if (parts.length < 2) return null;
  const title = parts[0].trim();
  let rest = parts[1].trim();
  // 提取标签
  const tags = extractTags(rest);
  for (const tag of tags) rest = rest.replace(new RegExp("\\s*" + tag), "").trim();
  // 移除 AOTY 标记
  rest = rest.replace(/\s*AOTY\b/gi, "").trim();
  // 先移除括号注释（如 (Top3)）
  rest = rest.replace(/\s*[(（]Top\d+[)）]/g, "").trim();
  const noteMatch = rest.match(/[(（]([^)）]+)[)）]\s*$/);
  let notes = "";
  if (noteMatch) {
    notes = noteMatch[0];
    rest = rest.slice(0, noteMatch.index).trim();
  }
  // 从尾部提取裸数字分数（AFTER 移除括号注释）
  let finalScore = score;
  if (score === null && !scoreNote) {
    const numMatch = rest.match(/\s+(\d{1,3})\s*$/);
    if (numMatch) { finalScore = parseInt(numMatch[1]); rest = rest.slice(0, numMatch.index).trim(); }
  }
  // 提取日期
  const dateMatch = rest.match(/\s+(\d{1,2}\.\d{1,2})\s*$/);
  let date = "";
  if (dateMatch) { date = dateMatch[1]; rest = rest.slice(0, dateMatch.index).trim(); }
  if (line.includes("基于半成品")) notes = "基于半成品打分";
  const artist = rest.replace(/\s+/g, " ").trim();
  return createEntry(title, artist, finalScore, scoreNote, date, tags, "", false, notes);
}

// 将当前 AOTY 渲染块写入对应 section 的 AOTY 分组
function finalizeAoty() {
  if (!isProcessingAoty) return;
  const review = aotyReviewLines.join("\n").trim();
  const entry = createEntry(aotyTitle, aotyArtist, aotyScore, "", "", [], review, true, "");
  if (aotyTargetSection) {
    let aotyGroup = aotyTargetSection.groups.find(g => g.name === "AOTY");
    if (!aotyGroup) { aotyGroup = { name: "AOTY", entries: [] }; aotyTargetSection.groups.push(aotyGroup); }
    aotyGroup.entries.push(entry);
  }
  isProcessingAoty = false; aotyReviewLines = [];
}

// 标题映射表
const headerMap = {
  "2024: Part": "2024"
};
const decadeMap = { "1980s": "1980s", "1979 to 1975": "1979-1975", "1974 to 1970": "1974-1970", "1960s": "1960s", "1950s": "1950s" };

const unmatchedLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  // 如果当前处于 AOTY 乐评渲染状态
  if (isProcessingAoty) {
    if (line.startsWith("乐评：") || line.startsWith("乐评:")) continue;
    const isBreak = ["AOTY","Vol.","Before","P.S.","绿字"].some(p => line.startsWith(p)) || /^(19|20)\d{2}/.test(line);
    if (isBreak) { finalizeAoty(); } else { aotyReviewLines.push(line); continue; }
  }

  let matched = false;

  // Vol headers（Vol. 1 - 2026 等）直接合并到对应年份的 section
  const volMatch = line.match(/^Vol\.\s*\d+\s*-\s*(\d{4})/);
  if (volMatch) {
    const year = volMatch[1];
    const existing = sections.find(sec => sec.id === year);
    if (existing) {
      currentSection = existing;
      currentGroup = currentSection.groups.find(g => g.name === "Albums") || currentSection.groups[0];
    } else {
      currentSection = { id: year, title: line, groups: [{ name: "Albums", entries: [] }] };
      sections.push(currentSection); currentGroup = currentSection.groups[0];
    }
    mode = "albums"; matched = true;
  }

  // 标题映射表匹配
  if (!matched) {
    for (const [prefix, id] of Object.entries(headerMap)) {
      if (line.startsWith(prefix)) {
        currentSection = { id: id, title: line, groups: [{ name: "Albums", entries: [] }] };
        sections.push(currentSection); currentGroup = currentSection.groups[0]; mode = "albums"; matched = true; break;
      }
    }
  }
  if (matched) continue;

  // 跳过无用标题行
  if (line === "Before 2024: Part Albums/Mixtapes, etc. Ratings") continue;

  // 年份标题（如 "2024"）
  if (/^(19|20)\d{2}$/.test(line)) {
    currentSection = { id: line, title: line, groups: [{ name: "Albums", entries: [] }] };
    sections.push(currentSection); currentGroup = currentSection.groups[0]; mode = "albums"; continue;
  }

  // 年代标题（如 "1980s"）
  if (decadeMap[line]) {
    currentSection = { id: decadeMap[line], title: line, groups: [{ name: "Albums", entries: [] }] };
    sections.push(currentSection); currentGroup = currentSection.groups[0]; mode = "albums"; continue;
  }

  // P.S. 标记切换到单曲模式
  if (line.startsWith("P.S.")) {
    mode = "singles";
    if (currentSection) {
      const singlesGroup = { name: "Singles", entries: [] };
      currentSection.groups.push(singlesGroup); currentGroup = singlesGroup;
    }
    continue;
  }

  // AOTY 渲染块开始
  if (line.startsWith("AOTY")) {
    isProcessingAoty = true; aotyReviewLines = []; aotyTargetSection = currentSection;
    i++;
    if (i < lines.length) {
      const nextLine = lines[i].trim();
      const scoreMatch = nextLine.match(/(\d+)\/100/);
      if (scoreMatch) { aotyScore = parseInt(scoreMatch[1]); aotyTitle = nextLine.slice(0, scoreMatch.index).trim(); }
      else { aotyTitle = nextLine; aotyScore = null; }
      i++;
    }
    if (i < lines.length) {
      const artistLine = lines[i].trim();
      if (!artistLine.startsWith("乐评") && !artistLine.startsWith("AOTY")) { aotyArtist = artistLine; i++; }
    }
    continue;
  }

  // 跳过标注说明行
  if (["绿字","橙字","蓝字","未给出","700+","专辑后面"].some(p => line.startsWith(p))) continue;

  // "1970s - Title - Artist" 格式
  if (/^19\d{2}\s*-\s/.test(line) && currentSection) {
    const decadeMatch = line.match(/^(19\d{2})\s*-\s*(.*)/);
    if (decadeMatch) {
      const rest = decadeMatch[2];
      const splitParts = rest.split(" - ", 2);
      let title = splitParts[0].trim();
      let artistRaw = splitParts.length > 1 ? splitParts[1].trim() : "";
      let [sc, sn] = parseScore(line + " " + artistRaw);
      // 如果没有 artist，尝试从 title 尾部提取裸数字分数
      if (!artistRaw && sc == null) {
        const titleNumMatch = title.match(/\s+(\d{1,3})\s*$/);
        if (titleNumMatch) { sc = parseInt(titleNumMatch[1]); title = title.slice(0, titleNumMatch.index).trim(); }
      }
      // 提取标签并从 artist 中移除
      let cleanedArtist = artistRaw.replace(/<[^>]*>/g, "").trim();
      const tags = extractTags(line + " " + artistRaw);
      for (const tag of tags) cleanedArtist = cleanedArtist.replace(new RegExp("\\s*" + tag + "\\s*$"), "").replace(tag, "").trim();
      // 移除 AOTY 标记
      cleanedArtist = cleanedArtist.replace(/\s*AOTY\b/gi, "").trim();
      // 提取括号注释
      const noteMatch = cleanedArtist.match(/[(（]([^)）]+)[)）]\s*$/);
      if (noteMatch) { if (!sn) sn = noteMatch[1]; cleanedArtist = cleanedArtist.slice(0, noteMatch.index).trim(); }
      // 从 artist 尾部提取裸数字分数
      if (sc === null) {
        const artistNumMatch = cleanedArtist.match(/\s+(\d{1,3})\s*$/);
        if (artistNumMatch) { sc = parseInt(artistNumMatch[1]); cleanedArtist = cleanedArtist.slice(0, artistNumMatch.index).trim(); }
      }
      const entryDate = decadeMatch[1];
      let notes = "";
      if (line.includes("基于半成品")) notes = "基于半成品打分";
      const paren = (line + artistRaw).match(/[(（]([^)）]*精选[^)）]*)[)）]/);
      if (paren) notes = paren[0];
      const entry = createEntry(title, cleanedArtist, sc, sn, entryDate, tags, "", false, notes);
      if (currentGroup) currentGroup.entries.push(entry);
    }
    continue;
  }

  // 编号行格式: "1. Title - Artist"
  if (/^\d+[\.\s]/.test(line) && currentSection) {
    const entry = parseAlbumLine(line);
    if (entry && currentGroup) currentGroup.entries.push(entry);
    continue;
  }

  // 通用 "Title - Artist" 格式（专辑模式）
  if (currentSection && currentGroup && mode === "albums" && line.includes(" - ")) {
    const entry = parseSinglesLine(line);
    if (entry) { currentGroup.entries.push(entry); continue; }
  }

  // 通用 "Title - Artist" 格式（单曲模式）
  if (mode === "singles" && currentSection && currentGroup && line) {
    const entry = parseSinglesLine(line);
    if (entry) { currentGroup.entries.push(entry); continue; }
  }

  unmatchedLines.push({ line: i + 1, text: line });
}

finalizeAoty();

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

const htmlPath = path.join(uiDir, "index.html");
let html;
try {
  html = fs.readFileSync(htmlPath, "utf-8");
} catch (e) {
  console.error("无法读取 index.html:", htmlPath);
  console.error(e.message);
  process.exit(1);
}

// 嵌入数据到 index.html（支持重复运行）
const dataJson = JSON.stringify(data);
const marker = /const __MUSIC_DATA__ = [\s\S]*?;/;
if (!marker.test(html)) {
  console.error("错误: index.html 中未找到数据标记符 const __MUSIC_DATA__ = ...;");
  process.exit(1);
}
html = html.replace(marker, "const __MUSIC_DATA__ = " + dataJson + ";");

// 同时写入独立的 data.json
try {
  fs.writeFileSync(path.join(uiDir, "data.json"), JSON.stringify(data, null, 2), "utf-8");
  fs.writeFileSync(htmlPath, html, "utf-8");
  console.log("index.html updated with embedded data");
  console.log("data.json written");
} catch (e) {
  console.error("写入文件失败:", e.message);
  process.exit(1);
}
