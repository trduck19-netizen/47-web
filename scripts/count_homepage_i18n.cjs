const fs = require('fs');
const path = require('path');
const ts = require('typescript');

/**
 * Trích xuất các lệnh gọi t('...') bằng TypeScript Compiler API (AST traversal)
 * AST tự động bỏ qua toàn bộ comment (trivia) vì comment không phải là AST node.
 */
function extractTCallsWithAST(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    path.basename(filePath),
    code,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const callSites = [];

  function visit(node) {
    if (ts.isCallExpression(node)) {
      // Bắt lệnh gọi hàm t(...)
      if (ts.isIdentifier(node.expression) && node.expression.text === 't') {
        if (node.arguments.length > 0) {
          const firstArg = node.arguments[0];
          let keyText = null;
          if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
            keyText = firstArg.text;
          }
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          callSites.push({
            key: keyText,
            line: line + 1,
            column: character + 1,
            raw: node.getText(sourceFile),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { sourceFile, callSites, code };
}

// =========================================================================
// PHẦN 1: KIỂM CHỨNG TRÊN FIXTURE (CHỨNG MINH LOẠI BỎ 100% COMMENT)
// =========================================================================
const fixturePath = path.resolve(__dirname, '../tests/fixtures/i18n_comment_fixture.tsx');
console.log('================================================================================');
console.log('[PHẦN 1: KIỂM CHỨNG FIXTURE AST vs COMMENTS]');
console.log('Fixture file:', fixturePath);

if (fs.existsSync(fixturePath)) {
  const fixtureRes = extractTCallsWithAST(fixturePath);
  console.log(`Số lệnh gọi t() bắt được trong AST: ${fixtureRes.callSites.length} (Kỳ vọng: 1)`);
  fixtureRes.callSites.forEach((c, idx) => {
    console.log(`  [Call ${idx + 1}] Dòng ${c.line}: key = "${c.key}"`);
  });

  if (fixtureRes.callSites.length === 1 && fixtureRes.callSites[0].key === 'fixture.real_key') {
    console.log('-> KẾT QUẢ FIXTURE: CHÍNH XÁC 100%! Toàn bộ 4 lệnh gọi trong comment bị loại bỏ hoàn toàn.');
  } else {
    console.error('-> KẾT QUẢ FIXTURE: THẤT BẠI!');
    process.exit(1);
  }
} else {
  console.warn('Cảnh báo: Không tìm thấy file fixture:', fixturePath);
}

// =========================================================================
// PHẦN 2: PHÂN TÍCH AST TRÊN HOMEPAGE SECTIONS MODULE THỰC TẾ
// =========================================================================
const targetFile = path.resolve(__dirname, '../src/admin/modules/HomepageSectionsModule.tsx');
console.log('\n================================================================================');
console.log('[PHẦN 2: PHÂN TÍCH AST TRÊN HOMEPAGE SECTIONS MODULE]');
console.log('Target file:', targetFile);

const { callSites, code, sourceFile } = extractTCallsWithAST(targetFile);
const keys = callSites.map((c) => c.key).filter(Boolean);
const uniqueKeys = Array.from(new Set(keys)).sort();

console.log('Total t(...) Call Sites (AST traversal, 0% comment):', callSites.length);
console.log('Total Unique Translation Keys:', uniqueKeys.length);

// Đếm toán tử ba ngôi (ConditionalExpression) trong AST
let ternaryCount = 0;
const ternaryLocations = [];
function findTernaries(node) {
  if (ts.isConditionalExpression(node)) {
    ternaryCount++;
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    ternaryLocations.push(line + 1);
  }
  ts.forEachChild(node, findTernaries);
}
findTernaries(sourceFile);

console.log(`Total Ternary Operators (? :) in Module AST: ${ternaryCount} tại các dòng:`, ternaryLocations.slice(0, 15).join(', '));
console.log('================================================================================');

console.log('\nSample Unique Keys (First 10):');
uniqueKeys.slice(0, 10).forEach((k, idx) => console.log(`  ${idx + 1}. ${k}`));

console.log('\nSample Unique Keys (Last 10):');
uniqueKeys.slice(-10).forEach((k, idx) => console.log(`  ${uniqueKeys.length - 10 + idx + 1}. ${k}`));

console.log('================================================================================');
