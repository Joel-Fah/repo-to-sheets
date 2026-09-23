/**
 * loadLib.js
 * src/lib/ files are plain GAS scripts (no import/export), so tests load
 * them the way GAS does: evaluated into one shared global scope.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const LIB_DIR = path.join(__dirname, '..', '..', 'src', 'lib');

/**
 * @param {...string} fileNames - files under src/lib/, e.g. 'GitHubClient.js'
 * @returns {object} globalThis, where the loaded functions now live
 */
function loadLib(...fileNames) {
  for (const fileName of fileNames) {
    const filePath = path.join(LIB_DIR, fileName);
    vm.runInThisContext(fs.readFileSync(filePath, 'utf8'), { filename: filePath });
  }
  return globalThis;
}

/**
 * @param {string} fileName - a file under test/fixtures/
 * @returns {any} parsed JSON
 */
function loadFixture(fileName) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', fileName), 'utf8'));
}

module.exports = { loadLib, loadFixture };
