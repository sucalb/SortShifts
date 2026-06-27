/**
 * [URANUS] LỊCH LÀM VIỆC — Apps Script
 *
 * - Template có MÃ LỚP ở cột phải (có màu) — KHÔNG ghi đè
 * - Script CHỈ điền TÊN TG vào cột trái cùng hàng
 * - CS1 / CS2: tự phát hiện cột theo vị trí anchor "CƠ SỞ 1/2"
 *
 * Deploy: Execute as Me · Who has access: Anyone
 */

const SKIP_TABS = ['BẢN GỐC', 'BAN GOC'];

const SCRIPT_VERSION = '2026-06-27-v17';

/**
 * Layout cố định từ template URANUS (CSV TUẦN 29/6):
 * - Mỗi ngày 2 cột: TÊN TG (trái) + MÃ LỚP (phải, có màu)
 * - Cột C / W: spacer trống giữa cột giờ và cột tên T2
 */
const FACILITIES = {
  coso1: {
    anchor: 'CƠ SỞ 1',
    minCol: 1,
    timeCol: 2,
    nameColStart: 4,
    colScanEnd: 18,
    slotCounts: { cap3: 7, cap2: 6, cap1: 2 },
  },
  coso2: {
    anchor: 'CƠ SỞ 2',
    minCol: 12,
    timeCol: 22,
    nameColStart: 24,
    colScanEnd: 37,
    slotCounts: { cap3: 3, cap2: 3, cap1: 1 },
  },
};

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    if (payload.mode === 'scan') {
      var scanResult = scanTemplate(payload);
      return jsonResponse({
        ok: true,
        version: SCRIPT_VERSION,
        grid: scanResult.grid,
        colorGrid: scanResult.colorGrid,
        tab: scanResult.tab,
        count: scanResult.count,
      });
    }
    if (payload.mode === 'cells' || (payload.updates && payload.updates.length > 0)) {
      var cellResult = fillCells(payload);
      return jsonResponse({ ok: true, message: cellResult.message });
    }
    var result = fillSchedule(payload);
    return jsonResponse({ ok: true, message: result.message });
  } catch (err) {
    return jsonResponse({ ok: false, error: formatError(err) });
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.ping === '1') {
    return jsonResponse({ ok: true, version: SCRIPT_VERSION });
  }
  if (e && e.parameter && e.parameter.scan === '1') {
    var scanResult = scanTemplate({ weekTabHint: e.parameter.weekTabHint || e.parameter.week || '' });
    return jsonResponse({
      ok: true,
      version: SCRIPT_VERSION,
      grid: scanResult.grid,
      colorGrid: scanResult.colorGrid,
      tab: scanResult.tab,
      count: scanResult.count,
    });
  }
  return jsonResponse({ ok: true, message: 'Webhook SortShifts ' + SCRIPT_VERSION });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function formatError(err) {
  var msg = String(err.message || err);
  var lower = msg.toLowerCase();
  if (
    lower.indexOf('you are trying to edit a protected cell') >= 0 ||
    lower.indexOf('protected range') >= 0 ||
    lower.indexOf('permission to access') >= 0
  ) {
    return (
      'Không ghi được — ô đang bị khóa hoặc tài khoản deploy không có quyền sửa. ' +
      'Kiểm tra: (1) Data → Protect sheets and ranges, (2) quyền file phải là Editor, ' +
      '(3) Deploy Web app bằng đúng tài khoản chủ/sửa được tab TUẦN.'
    );
  }
  return msg;
}

function fillCells(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = findWeekSheet(ss, payload.weekLabel, payload.weekTabHint);
  prepareSheetForWrite(sheet);

  var updates = payload.updates || [];
  var written = 0;
  var failed = 0;
  var stats = { coso1: 0, coso2: 0 };
  var failSamples = [];

  for (var i = 0; i < updates.length; i++) {
    var u = updates[i];
    if (!u || !u.value) continue;
    var writeResult = trySetCell(sheet, u.row, u.col, String(u.value).trim());
    if (writeResult.ok) {
      written++;
      if (u.col >= 24) stats.coso2++;
      else stats.coso1++;
    } else {
      failed++;
      if (failSamples.length < 2) {
        failSamples.push(sheet.getRange(u.row, u.col).getA1Notation());
      }
    }
  }

  if (written === 0) {
    throw new Error(
      '[' +
        SCRIPT_VERSION +
        '] Không ghi được ô nào (' +
        failed +
        ' lỗi). Tab "' +
        sheet.getName() +
        '". ' +
        (failSamples.length ? 'Ô: ' + failSamples.join(', ') + '. ' : '') +
        'Kiểm tra quyền sửa file.',
    );
  }

  return {
    message:
      'Ghi ' +
      written +
      ' ô (CS1: ' +
      stats.coso1 +
      ', CS2: ' +
      stats.coso2 +
      ') · ' +
      sheet.getName() +
      ' · ' +
      SCRIPT_VERSION +
      (failed > 0 ? ' · ' + failed + ' ô lỗi' : ''),
  };
}

/** Đọc toàn bộ vùng lịch trên tab tuần — app khớp ca (giống export CSV, không cần tải file) */
function scanTemplate(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = findWeekSheet(ss, payload.weekLabel, payload.weekTabHint);
  var lastRow = Math.min(Math.max(sheet.getLastRow(), 90), 120);
  var lastCol = 37;
  var range = sheet.getRange(1, 1, lastRow, lastCol);
  var grid = range.getDisplayValues();
  var colorGrid = range.getBackgrounds();
  var count = countClassCellsInGrid(grid);

  if (count < 20) {
    throw new Error(
      '[' +
        SCRIPT_VERSION +
        '] Chỉ nhận ' +
        count +
        ' ô mã lớp trên tab "' +
        sheet.getName() +
        '". Kiểm tra tab TUẦN có đủ layout CS1 + CS2.',
    );
  }

  return { grid: grid, colorGrid: colorGrid, tab: sheet.getName(), count: count };
}

function countClassCellsInGrid(grid) {
  var n = 0;
  for (var r = 0; r < grid.length; r++) {
    for (var c = 0; c < grid[r].length; c++) {
      if (looksLikeClassCode(String(grid[r][c] || ''))) n++;
    }
  }
  return n;
}

function fillSchedule(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = findWeekSheet(ss, payload.weekLabel, payload.weekTabHint);
  var refSheet = findReferenceSheet(ss);
  prepareSheetForWrite(sheet);

  var entries = payload.entries || [];
  var written = 0;
  var notFound = 0;
  var writeFailed = 0;
  var cache = {};
  var usedRows = {};
  var stats = { coso1: 0, coso2: 0 };
  var missSamples = [];

  var writeFailSamples = [];

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry.names || !entry.names.trim()) continue;

    var base = FACILITIES[entry.facility];
    if (!base) continue;

    if (!cache[entry.facility]) {
      var ctx = resolveFacilityContext(sheet, base, entry.facility);
      if (ctx) {
        ctx.index = buildClassIndex(sheet, ctx, refSheet);
        ctx.indexSize = Object.keys(ctx.index).length;
      }
      cache[entry.facility] = ctx;
    }

    var ctx = cache[entry.facility];
    if (!ctx) {
      notFound++;
      pushMissSample(missSamples, entry, 'no context');
      continue;
    }

    var hit = findRowInSections(ctx, sheet, refSheet, entry, usedRows);
    if (!hit) {
      notFound++;
      pushMissSample(
        missSamples,
        entry,
        describeMiss(ctx, sheet, refSheet, entry),
      );
      continue;
    }

    var cellKey = hit.row + ':' + hit.nameCol;
    var writeResult = trySetCell(sheet, hit.row, hit.nameCol, entry.names.trim());
    if (writeResult.ok) {
      written++;
      usedRows[cellKey] = true;
      stats[entry.facility] = (stats[entry.facility] || 0) + 1;
    } else {
      writeFailed++;
      if (writeFailSamples.length < 2) {
        writeFailSamples.push(
          sheet.getRange(hit.row, hit.nameCol).getA1Notation() + ': ' + writeResult.reason,
        );
      }
    }
  }

  if (written === 0) {
    throw new Error(buildZeroWriteError(notFound, writeFailed, sheet, payload, refSheet, missSamples, writeFailSamples));
  }

  return {
    message:
      'Điền ' +
      written +
      ' ô (CS1: ' +
      (stats.coso1 || 0) +
      ', CS2: ' +
      (stats.coso2 || 0) +
      ') · ' +
      sheet.getName() +
      ' · ' +
      SCRIPT_VERSION +
      (notFound > 0 ? ' · ' + notFound + ' ca không khớp' : '') +
      (writeFailed > 0 ? ' · ' + writeFailed + ' ô không ghi được' : ''),
  };
}

function buildZeroWriteError(notFound, writeFailed, sheet, payload, refSheet, missSamples, writeFailSamples) {
  var parts = ['[' + SCRIPT_VERSION + '] Không ghi được ô nào.'];
  if (notFound > 0) {
    parts.push(notFound + ' ca không khớp (sai lớp / ca / ngày / cơ sở trên tab).');
  }
  if (writeFailed > 0) {
    parts.push(writeFailed + ' ca đã khớp nhưng không ghi được ô tên TG.');
    if (writeFailSamples.length > 0) parts.push('Ghi lỗi: ' + writeFailSamples.join('; ') + '.');
  }
  parts.push('Tab "' + sheet.getName() + '", tuần ' + (payload.weekTabHint || payload.weekLabel) + '.');
  if (refSheet) parts.push('Mẫu lớp: "' + refSheet.getName() + '".');
  if (missSamples.length > 0) parts.push(formatMissSamples(missSamples));
  if (notFound > 0) {
    parts.push('Chạy testDryRun() hoặc copy tab từ BẢN GỐC nếu cột mã lớp bị lệch.');
  }
  return parts.join(' ');
}

function pushMissSample(arr, entry, reason) {
  if (arr.length >= 3) return;
  arr.push(
    entry.facility +
      ' ' +
      entry.level +
      ' T' +
      (entry.day + 2) +
      ' ' +
      entry.slot +
      ' ' +
      entry.classLabel +
      ' (' +
      reason +
      ')',
  );
}

function formatMissSamples(arr) {
  if (arr.length === 0) return '';
  return 'VD: ' + arr.join('; ');
}

function findReferenceSheet(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName().toUpperCase();
    if (n.indexOf('BẢN GỐC') >= 0 || n.indexOf('BAN GOC') >= 0) return sheets[i];
  }
  return null;
}

function looksLikeClassCode(text) {
  var t = classCore(text);
  if (!t) return false;
  if (/\bB[123]\b/.test(t)) return true;
  if (/\d+A?\s*B[123]\b/i.test(t)) return true;
  if (/\d/.test(t) && /B[123]/i.test(t)) return true;
  return false;
}

/** Index mã lớp từ template — ưu tiên BẢN GỐC nếu tab tuần bị ghi đè */
function buildClassIndex(targetSheet, ctx, refSheet) {
  var index = {};
  var levels = ['cap3', 'cap2', 'cap1'];

  for (var li = 0; li < levels.length; li++) {
    var level = levels[li];
    var section = ctx.sections[level];
    if (!section) continue;

    for (var bi = 0; bi < section.timeBlocks.length; bi++) {
      var block = section.timeBlocks[bi];
      for (var ri = 0; ri < block.rows.length; ri++) {
        var row = block.rows[ri];
        for (var day = 0; day < 7; day++) {
          var nameCol = ctx.layout.nameColStart + day * 2;
          var classCol = nameCol + 1;
          var classVal = getClassAtCell(targetSheet, refSheet, row, classCol);
          if (!looksLikeClassCode(classVal)) continue;

          var key = makeIndexKey(level, day, block.slot, classVal);
          if (!index[key]) index[key] = [];
          index[key].push({
            row: row,
            nameCol: nameCol,
            classCol: classCol,
            classText: classVal,
            slot: block.slot,
          });
        }
      }
    }
  }
  return index;
}

function makeIndexKey(level, day, slot, classText) {
  return level + '|' + day + '|' + normalizeTime(slot) + '|' + compactClass(classText);
}

function findRowFromIndex(index, entry, usedRows) {
  for (var key in index) {
    var parts = key.split('|');
    if (parts.length < 4) continue;
    if (parts[0] !== entry.level || parseInt(parts[1], 10) !== parseInt(entry.day, 10)) continue;
    if (!timeMatchesSlotNorm(parts[2], entry.slot)) continue;

    var list = index[key];
    for (var i = 0; i < list.length; i++) {
      var hit = list[i];
      if (!classMatches(hit.classText, entry.className, entry.classLabel)) continue;
      var cellKey = hit.row + ':' + hit.nameCol;
      if (usedRows[cellKey]) continue;
      return hit;
    }
  }
  return null;
}

function getClassAtCell(targetSheet, refSheet, row, col) {
  var targetVal = getScheduleCellText(targetSheet, row, col);
  if (looksLikeClassCode(targetVal)) return targetVal;
  if (refSheet) {
    var refVal = getScheduleCellText(refSheet, row, col);
    if (looksLikeClassCode(refVal)) return refVal;
  }
  return targetVal;
}

/** Quét theo cấp + ngày + ca + mã lớp — thử cả cấp khác nếu fallback chia sai khối */
function findRowInSections(ctx, targetSheet, refSheet, entry, usedRows) {
  var hit = findRowInSectionsForLevel(ctx, targetSheet, refSheet, entry, usedRows, entry.level);
  if (hit) return hit;

  var levels = ['cap3', 'cap2', 'cap1'];
  for (var i = 0; i < levels.length; i++) {
    if (levels[i] === entry.level) continue;
    hit = findRowInSectionsForLevel(ctx, targetSheet, refSheet, entry, usedRows, levels[i]);
    if (hit) return hit;
  }
  return null;
}

function findRowInSectionsForLevel(ctx, targetSheet, refSheet, entry, usedRows, level) {
  var day = parseInt(entry.day, 10);
  if (isNaN(day)) return null;

  var section = ctx.sections[level];
  if (!section) return null;

  var nameCol = ctx.layout.nameColStart + day * 2;
  var classCol = nameCol + 1;

  for (var bi = 0; bi < section.timeBlocks.length; bi++) {
    var block = section.timeBlocks[bi];
    if (!timeMatches(block.slot, entry.slot)) continue;

    for (var ri = 0; ri < block.rows.length; ri++) {
      var row = block.rows[ri];
      var cellKey = row + ':' + nameCol;
      if (usedRows[cellKey]) continue;

      var classVal = getClassAtCell(targetSheet, refSheet, row, classCol);
      if (!classMatches(classVal, entry.className, entry.classLabel)) continue;

      return {
        row: row,
        nameCol: nameCol,
        classCol: classCol,
        classText: classVal,
        slot: block.slot,
      };
    }
  }
  return null;
}

function describeMiss(ctx, targetSheet, refSheet, entry) {
  var day = parseInt(entry.day, 10);
  var section = ctx.sections[entry.level];
  if (!section) return 'no section ' + entry.level;

  var nameCol = ctx.layout.nameColStart + day * 2;
  var classCol = nameCol + 1;
  var slotFound = false;
  var samples = [];

  for (var bi = 0; bi < section.timeBlocks.length; bi++) {
    var block = section.timeBlocks[bi];
    if (!timeMatches(block.slot, entry.slot)) continue;
    slotFound = true;

    for (var ri = 0; ri < block.rows.length && samples.length < 2; ri++) {
      var row = block.rows[ri];
      var classVal = getClassAtCell(targetSheet, refSheet, row, classCol);
      if (classVal) samples.push('r' + row + '=' + classVal);
    }
    break;
  }

  if (!slotFound) return 'no slot ' + entry.slot;
  if (samples.length === 0) return 'slot ok, ô lớp trống';
  return 'sheet: ' + samples.join(', ');
}

function timeMatchesSlotNorm(slotNorm, slotLabel) {
  if (slotNorm === normalizeTime(slotLabel)) return true;
  return timeMatches(slotNorm, slotLabel);
}

/** Phát hiện vùng CS1 / CS2 — dùng layout cố định từ template URANUS */
function resolveFacilityContext(sheet, base, facilityId) {
  var anchor = findAnchor(sheet, base.anchor, base.minCol);
  if (!anchor) return null;

  var timeCol = base.timeCol;
  var nameColStart = base.nameColStart;
  var colMin = timeCol;
  var colMax = base.colScanEnd;

  if (countTimeLabels(sheet, anchor.row + 1, anchor.row + 70, timeCol) < 2) {
    Logger.log(facilityId + ': cột giờ ' + timeCol + ' không có nhãn ca — kiểm tra template');
    return null;
  }

  var startRow = findFirstScheduleRow(sheet, timeCol, anchor.row + 1, anchor.row + 8);
  var toRow = findLayoutEndRow(
    sheet,
    startRow,
    Math.min(sheet.getLastRow(), anchor.row + 85),
    colMin,
    colMax,
  );

  var sections = findSectionBoundsInRegion(sheet, timeCol, nameColStart, colMax, startRow, toRow);
  if (countSectionBlocks(sections) < 2) {
    sections = fallbackSectionsBySlotCounts(
      sheet,
      timeCol,
      startRow,
      toRow,
      base.slotCounts,
      nameColStart,
      colMax,
    );
  }

  return {
    anchor: anchor,
    layout: {
      nameColStart: nameColStart,
      classColStart: nameColStart + 1,
      daySpan: 12,
    },
    timeCol: timeCol,
    colMin: colMin,
    colMax: colMax,
    sections: sections,
    usedFallback: countSectionBlocks(sections) > 0,
  };
}

function findFirstScheduleRow(sheet, timeCol, fromRow, toRow) {
  for (var r = fromRow; r <= toRow; r++) {
    if (isTimeRangeLabel(getCellTimeText(sheet, r, timeCol))) return r;
  }
  for (var r = fromRow; r <= toRow; r++) {
    for (var col = Math.max(1, timeCol - 1); col <= timeCol; col++) {
      if (parseLevelMarker(sheet.getRange(r, col).getDisplayValue())) return r + 2;
    }
  }
  return fromRow + 3;
}

function findSectionBoundsInRegion(sheet, timeCol, nameColStart, colMax, fromRow, toRow) {
  var markers = [];
  for (var r = fromRow; r <= toRow; r++) {
    for (var col = Math.max(1, timeCol - 1); col <= timeCol; col++) {
      var level = parseLevelMarker(sheet.getRange(r, col).getDisplayValue());
      if (level) {
        markers.push({ level: level, row: r });
        break;
      }
    }
  }

  if (markers.length === 0) return {};

  markers.sort(function (a, b) {
    return a.row - b.row;
  });

  var seen = {};
  var deduped = [];
  for (var j = 0; j < markers.length; j++) {
    if (seen[markers[j].level]) continue;
    seen[markers[j].level] = true;
    deduped.push(markers[j]);
  }

  var bounds = {};
  for (var k = 0; k < deduped.length; k++) {
    var end = k + 1 < deduped.length ? deduped[k + 1].row - 1 : toRow;
    bounds[deduped[k].level] = {
      timeBlocks: collectTimeBlocks(sheet, timeCol, deduped[k].row + 1, end, nameColStart, colMax),
    };
  }
  return bounds;
}

function countSectionBlocks(sections) {
  var n = 0;
  Object.keys(sections).forEach(function (level) {
    n += (sections[level].timeBlocks || []).length;
  });
  return n;
}

function getCellTimeText(sheet, row, col) {
  var range = sheet.getRange(row, col);
  var disp = String(range.getDisplayValue() || '').trim();
  if (disp && /\d/.test(disp)) return disp;
  var raw = range.getValue();
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Object.prototype.toString.call(raw) === '[object Date]' && !isNaN(raw.getTime())) {
    var h = raw.getHours();
    var m = raw.getMinutes();
    return h + ':' + (m < 10 ? '0' : '') + m;
  }
  return disp;
}

function isTimeRangeLabel(text) {
  var s = String(text || '').trim();
  if (!s) return false;
  return /\d{1,2}\s*:\s*\d{2}\s*[-–—~]\s*\d{1,2}\s*:\s*\d{2}/.test(s);
}

function countTimeLabels(sheet, fromRow, toRow, col) {
  var score = 0;
  for (var r = fromRow; r <= toRow; r++) {
    if (isTimeRangeLabel(getCellTimeText(sheet, r, col))) score++;
  }
  return score;
}

function findAnchor(sheet, anchorText, minCol) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var data = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  var needle = anchorText.toUpperCase();
  var best = null;

  for (var r = 0; r < data.length; r++) {
    for (var c = 0; c < data[r].length; c++) {
      if (String(data[r][c]).toUpperCase().indexOf(needle) < 0) continue;
      var col = c + 1;
      if (col < minCol) continue;
      if (!best || col > best.col) best = { row: r + 1, col: col };
    }
  }
  return best;
}

/** Cột có nhiều nhãn giờ nhất — ưu tiên cột trái nhất khi bằng điểm */
function detectTimeColumn(sheet, fromRow, toRow, colMin, colMax) {
  if (colMax < colMin) return colMin;

  var bestCol = -1;
  var bestScore = 0;

  for (var col = colMin; col <= colMax; col++) {
    var score = countTimeLabels(sheet, fromRow, toRow, col);
    if (score > bestScore || (score === bestScore && score > 0 && (bestCol < 0 || col < bestCol))) {
      bestScore = score;
      bestCol = col;
    }
  }
  return bestScore >= 2 ? bestCol : -1;
}

function getScheduleCellText(sheet, row, col) {
  var val = String(sheet.getRange(row, col).getDisplayValue() || '').trim();
  if (val) return val;
  for (var d = -1; d <= 1; d++) {
    if (d === 0) continue;
    var rr = row + d;
    if (rr < 1) continue;
    val = String(sheet.getRange(rr, col).getDisplayValue() || '').trim();
    if (val) return val;
  }
  return '';
}

function findRowForEntry(sheet, timeBlocks, entry, classCol, usedRows) {
  for (var i = 0; i < timeBlocks.length; i++) {
    var block = timeBlocks[i];
    if (!timeMatches(block.slot, entry.slot)) continue;

    for (var j = 0; j < block.rows.length; j++) {
      var row = block.rows[j];
      var classVal = getScheduleCellText(sheet, row, classCol);
      if (!classMatches(classVal, entry.className, entry.classLabel)) continue;

      var nameCol = classCol - 1;
      var cellKey = row + ':' + nameCol;
      if (usedRows[cellKey]) continue;

      return row;
    }
  }
  return -1;
}

function compactClass(value) {
  return classCore(value).replace(/[\s.]/g, '');
}

function classMatches(sheetText, className, classLabel) {
  var raw = String(sheetText || '').trim();
  if (!raw) return false;

  var sheetCore = classCore(raw);
  var nameCore = classCore(className);
  var labelCore = classCore(classLabel);
  var sheetCompact = compactClass(raw);
  var nameCompact = compactClass(className);
  var labelCompact = compactClass(classLabel);

  var matched =
    sheetCore === nameCore ||
    sheetCore === labelCore ||
    sheetCompact === nameCompact ||
    sheetCompact === labelCompact ||
    (nameCompact && sheetCompact.indexOf(nameCompact) === 0) ||
    (labelCompact && sheetCompact.indexOf(labelCompact) === 0) ||
    (nameCompact && nameCompact.indexOf(sheetCompact) === 0);

  if (!matched) return false;

  var sheetTeacher = extractTeacher(raw);
  var entryTeacher = extractTeacher(classLabel);
  if (sheetTeacher && entryTeacher && sheetTeacher !== entryTeacher) return false;

  return true;
}

function extractTeacher(text) {
  var m = String(text || '').match(/\(([^)]+)\)/);
  return m ? m[1].toUpperCase().replace(/\s+/g, ' ').trim() : '';
}

function classCore(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function timeMatches(sheetTime, slotLabel) {
  if (normalizeTime(sheetTime) === normalizeTime(slotLabel)) return true;
  var a = slotStartMinutes(sheetTime);
  var b = slotStartMinutes(slotLabel);
  if (a >= 0 && b >= 0 && Math.abs(a - b) <= 60) return true;
  var aEnd = slotEndMinutes(sheetTime);
  var bEnd = slotEndMinutes(slotLabel);
  if (a >= 0 && b >= 0 && aEnd >= 0 && bEnd >= 0) {
    return a === b && aEnd === bEnd;
  }
  return false;
}

function slotEndMinutes(label) {
  var parts = String(label).match(/(\d{1,2}):(\d{2})/g);
  if (!parts || parts.length < 2) return -1;
  var m = parts[1].match(/(\d{1,2}):(\d{2})/);
  if (!m) return -1;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function normalizeTime(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/–/g, '-')
    .toLowerCase();
}

function slotStartMinutes(label) {
  var m = String(label).match(/(\d{1,2}):(\d{2})/);
  if (!m) return -1;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function parseLevelMarker(value) {
  var t = String(value || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  if (t.indexOf('CẤP 3') >= 0 || t.indexOf('CAP 3') >= 0) return 'cap3';
  if (t.indexOf('CẤP 2') >= 0 || t.indexOf('CAP 2') >= 0) return 'cap2';
  if (t.indexOf('CẤP 1') >= 0 || t.indexOf('CAP 1') >= 0) return 'cap1';
  return null;
}

function findSectionBounds(sheet, timeCol, regionColMin, fromRow, maxRow) {
  var lastRow = Math.min(maxRow, sheet.getLastRow());
  var markers = [];

  for (var r = fromRow; r <= lastRow; r++) {
    for (var col = regionColMin; col <= timeCol; col++) {
      var level = parseLevelMarker(sheet.getRange(r, col).getDisplayValue());
      if (level) {
        markers.push({ level: level, row: r });
        break;
      }
    }
  }

  if (markers.length === 0) {
    markers = findLevelMarkersInMerged(sheet, fromRow, lastRow, regionColMin, timeCol);
  }

  if (markers.length === 0) return {};

  markers.sort(function (a, b) {
    return a.row - b.row;
  });

  var seen = {};
  var deduped = [];
  for (var j = 0; j < markers.length; j++) {
    if (seen[markers[j].level]) continue;
    seen[markers[j].level] = true;
    deduped.push(markers[j]);
  }
  deduped.sort(function (a, b) {
    return a.row - b.row;
  });

  var bounds = {};
  for (var k = 0; k < deduped.length; k++) {
    var end = k + 1 < deduped.length ? deduped[k + 1].row - 1 : lastRow;
    bounds[deduped[k].level] = {
      timeBlocks: collectTimeBlocks(sheet, timeCol, deduped[k].row + 1, end, timeCol + 2, null),
    };
  }
  return bounds;
}

function findLevelMarkersInMerged(sheet, fromRow, toRow, colMin, colMax) {
  var markers = [];
  if (toRow < fromRow || colMax < colMin) return markers;

  try {
    var numRows = toRow - fromRow + 1;
    var numCols = colMax - colMin + 1;
    var region = sheet.getRange(fromRow, colMin, numRows, numCols);
    var merged = region.getMergedRanges();
    for (var i = 0; i < merged.length; i++) {
      var m = merged[i];
      var r = m.getRow();
      if (r < fromRow || r > toRow) continue;
      var level = parseLevelMarker(m.getDisplayValue());
      if (level) markers.push({ level: level, row: r });
    }
  } catch (e) {}

  return markers;
}

/** Chia khối ca theo số ca mỗi cấp khi không đọc được nhãn CẤP */
function fallbackSectionsBySlotCounts(sheet, timeCol, fromRow, maxRow, slotCounts, nameColStart, colMax) {
  var lastRow = Math.min(maxRow, sheet.getLastRow());
  var allBlocks = collectTimeBlocks(sheet, timeCol, fromRow, lastRow, nameColStart, colMax);
  var bounds = {};
  var idx = 0;
  var order = ['cap3', 'cap2', 'cap1'];

  for (var i = 0; i < order.length; i++) {
    var level = order[i];
    var n = slotCounts[level] || 0;
    if (n <= 0) continue;
    if (idx >= allBlocks.length) break;
    bounds[level] = { timeBlocks: allBlocks.slice(idx, idx + n) };
    idx += n;
  }
  return bounds;
}

function findLayoutEndRow(sheet, fromRow, maxRow, colMin, colMax) {
  for (var r = fromRow; r <= maxRow; r++) {
    for (var c = colMin; c <= colMax; c++) {
      var t = String(sheet.getRange(r, c).getDisplayValue() || '').toUpperCase();
      if (t.indexOf('BẢNG ĐẾM') >= 0 || t.indexOf('SỐ CA') >= 0 || t.indexOf('CỤ THỂ') >= 0) {
        return Math.max(fromRow, r - 1);
      }
    }
  }
  return maxRow;
}

function rowHasFacilityContent(sheet, row, nameColStart, colMax) {
  var lastCol = colMax || nameColStart + 13;
  for (var nc = nameColStart; nc + 1 <= lastCol; nc += 2) {
    if (getScheduleCellText(sheet, row, nc)) return true;
    if (looksLikeClassCode(getScheduleCellText(sheet, row, nc + 1))) return true;
  }
  return false;
}

function collectTimeBlocks(sheet, timeCol, fromRow, toRow, nameColStart, colMax) {
  var blocks = [];
  var current = null;
  var scheduleCol = nameColStart || 0;

  if (toRow < fromRow) return blocks;

  for (var r = fromRow; r <= toRow; r++) {
    var val = getCellTimeText(sheet, r, timeCol);
    if (isTimeRangeLabel(val)) {
      if (current) blocks.push(current);
      current = { slot: val, rows: [r] };
    } else if (current) {
      var ok = true;
      if (scheduleCol > 0 && !rowHasFacilityContent(sheet, r, scheduleCol, colMax)) ok = false;
      if (current.rows.length >= 10) ok = false;
      if (ok) {
        current.rows.push(r);
      } else {
        blocks.push(current);
        current = null;
      }
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function findWeekSheet(ss, weekLabel, weekTabHint) {
  var hint = weekTabHint || parseWeekHint(weekLabel);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var upper = sheets[i].getName().toUpperCase();
    if (isSkippedTab(upper)) continue;
    if ((upper.indexOf('TUẦN') >= 0 || upper.indexOf('TUAN') >= 0) && tabMatchesWeekHint(upper, hint)) {
      return sheets[i];
    }
  }
  throw new Error(
    'Không tìm thấy tab TUẦN "' +
      hint +
      '". Trong app chọn tuần Thứ Hai đúng (vd: 2026-06-29 cho TUẦN 29/6).',
  );
}

function tabMatchesWeekHint(tabUpper, hint) {
  if (!hint) return false;
  var h = String(hint).toUpperCase();
  if (tabUpper.indexOf(h) >= 0) return true;
  var parts = h.split('/');
  if (parts.length !== 2) return false;
  var day = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10);
  if (Number.isNaN(day) || Number.isNaN(month)) return false;
  var variants = [day + '/' + month, day + '/0' + month];
  if (month < 10) variants.push(day + '/' + month);
  for (var i = 0; i < variants.length; i++) {
    if (tabUpper.indexOf(variants[i]) >= 0) return true;
  }
  return false;
}

function isSkippedTab(name) {
  for (var i = 0; i < SKIP_TABS.length; i++) {
    if (name.indexOf(SKIP_TABS[i]) >= 0) return true;
  }
  return false;
}

function parseWeekHint(weekLabel) {
  var parts = String(weekLabel || '').split(/[\/\-]/);
  if (parts.length < 2) return '';
  return parseInt(parts[0], 10) + '/' + parseInt(parts[1], 10);
}

function prepareSheetForWrite(sheet) {
  var emails = collectRunnerEmails();
  if (emails.length === 0) return;

  var ss = sheet.getParent();
  [SpreadsheetApp.ProtectionType.RANGE, SpreadsheetApp.ProtectionType.SHEET].forEach(function (type) {
    unblockProtections(sheet.getProtections(type), emails);
    try {
      ss.getProtections(type).forEach(function (p) {
        var range = p.getRange();
        if (range && range.getSheet().getName() === sheet.getName()) {
          unblockProtections([p], emails);
        }
      });
    } catch (e) {}
  });
}

function collectRunnerEmails() {
  var emails = [];
  var eff = Session.getEffectiveUser().getEmail();
  var act = Session.getActiveUser().getEmail();
  if (eff) emails.push(eff);
  if (act && emails.indexOf(act) < 0) emails.push(act);
  return emails;
}

function unblockProtections(protections, emails) {
  protections.forEach(function (p) {
    emails.forEach(function (email) {
      try {
        p.addEditor(email);
      } catch (e) {}
    });
    try {
      if (p.canEdit()) p.setWarningOnly(true);
    } catch (e2) {}
  });
}

function removeWriteProtections() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  removeProtectionsOnSheet(sheet);
}

function removeProtectionsOnSheet(sheet) {
  var n = 0;
  [SpreadsheetApp.ProtectionType.RANGE, SpreadsheetApp.ProtectionType.SHEET].forEach(function (type) {
    var list = sheet.getProtections(type);
    for (var i = list.length - 1; i >= 0; i--) {
      try {
        list[i].remove();
        n++;
      } catch (e) {}
    }
  });
  Logger.log('Đã bỏ ' + n + ' vùng bảo vệ trên ' + sheet.getName());
  return n;
}

function trySetCell(sheet, row, col, value) {
  try {
    var range = sheet.getRange(row, col);
    range.setValue(value);
    return { ok: true, reason: '' };
  } catch (e) {
    var reason = String(e.message || e);
    if (reason.toLowerCase().indexOf('protected') >= 0) {
      return { ok: false, reason: 'ô bảo vệ' };
    }
    throw e;
  }
}

function testMapping() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  Logger.log('SortShifts ' + SCRIPT_VERSION);
  Logger.log('Tab: ' + sheet.getName());
  ['coso1', 'coso2'].forEach(function (id) {
    var base = FACILITIES[id];
    var anchor = findAnchor(sheet, base.anchor, base.minCol);
    if (!anchor) {
      Logger.log(id + ': KHÔNG TÌM THẤY anchor');
      return;
    }

    Logger.log(
      id +
        ' layout cố định: timeCol=' +
        base.timeCol +
        ', nameCol T2=' +
        base.nameColStart +
        ', classCol T2=' +
        (base.nameColStart + 1),
    );

    var ctx = resolveFacilityContext(sheet, base, id);
    if (!ctx) {
      Logger.log(id + ': KHÔNG resolve được cột ca');
      return;
    }
    var ref = findReferenceSheet(SpreadsheetApp.getActiveSpreadsheet());
    ctx.index = buildClassIndex(sheet, ctx, ref);
    Logger.log(id + ' index: ' + Object.keys(ctx.index).length + ' keys' + (ref ? ' (mẫu: ' + ref.getName() + ')' : ''));
    Logger.log(id + ' anchor: ' + JSON.stringify(ctx.anchor));
    Logger.log(
      id +
        ' timeCol: ' +
        ctx.timeCol +
        ', nameCol T2: ' +
        ctx.layout.nameColStart +
        ', classCol T2: ' +
        ctx.layout.classColStart +
        (ctx.usedFallback ? ' (fallback số ca)' : ''),
    );
    var levels = Object.keys(ctx.sections);
    if (levels.length === 0) {
      Logger.log(id + ': KHÔNG TÌM THẤY CẤP 3/2/1');
      return;
    }
    levels.forEach(function (level) {
      var blocks = ctx.sections[level].timeBlocks;
      Logger.log(
        id +
          ' ' +
          level +
          ': ' +
          blocks.length +
          ' ca — ' +
          blocks
            .map(function (b) {
              return b.slot + '(' + b.rows.length + ' hàng)';
            })
            .join(', '),
      );
    });
  });
}

function testDryRun(payloadJson) {
  var payload = payloadJson ? JSON.parse(payloadJson) : { entries: [] };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = payload.weekTabHint
    ? findWeekSheet(ss, payload.weekLabel, payload.weekTabHint)
    : ss.getActiveSheet();
  var refSheet = findReferenceSheet(ss);
  var cache = {};
  Logger.log('DryRun tab: ' + sheet.getName() + (refSheet ? ', mẫu: ' + refSheet.getName() : ''));
  payload.entries.forEach(function (entry) {
    if (!cache[entry.facility]) {
      var ctx = resolveFacilityContext(sheet, FACILITIES[entry.facility], entry.facility);
      if (ctx) ctx.index = buildClassIndex(sheet, ctx, refSheet);
      cache[entry.facility] = ctx;
    }
    var ctx = cache[entry.facility];
    if (!ctx) {
      Logger.log('NO_CTX ' + entry.facility);
      return;
    }
    var hit = findRowInSections(ctx, sheet, refSheet, entry, {});
    Logger.log(
      (hit ? 'OK' : 'MISS') +
        ' ' +
        entry.facility +
        ' ' +
        entry.level +
        ' d' +
        entry.day +
        ' ' +
        entry.slot +
        ' ' +
        entry.classLabel +
        ' → ' +
        (hit ? sheet.getRange(hit.row, hit.nameCol).getA1Notation() : describeMiss(ctx, sheet, refSheet, entry)),
    );
  });
}

function testWriteAccess() {
  prepareSheetForWrite(SpreadsheetApp.getActiveSpreadsheet().getActiveSheet());
  ['C12', 'E15', 'G20'].forEach(function (a1) {
    try {
      var c = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(a1);
      var old = c.getValue();
      c.setValue('TEST');
      c.setValue(old);
      Logger.log(a1 + ': OK');
    } catch (e) {
      Logger.log(a1 + ': ' + e);
    }
  });
}
