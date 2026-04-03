/**
 * Temp directory helper for tests
 */

import fs from "fs";
import os from "os";
import path from "path";

/**
 * Create a temporary directory for testing
 * @param {string} prefix - Prefix for the temp directory name
 * @returns {string} Path to the created temp directory
 */
export function createTempDir(prefix = "claudeman-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Remove a directory recursively
 * @param {string} dir - Directory to remove
 */
export function removeTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Create a test fixture with optional files
 * @param {Object} files - Object mapping relative paths to content
 * @returns {{ dir: string, cleanup: () => void }}
 */
export function createFixture(files = {}) {
  const dir = createTempDir();

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relativePath);
    const dirPath = path.dirname(fullPath);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    if (typeof content === "object") {
      fs.writeFileSync(fullPath, JSON.stringify(content, null, 2));
    } else {
      fs.writeFileSync(fullPath, content);
    }
  }

  return {
    dir,
    cleanup: () => removeTempDir(dir),
  };
}
