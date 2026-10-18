// The changelog roll of the Release workflow (.github/scripts/changelog-release.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-twitch';

test('moves the Unreleased section under the new version', () => {
  const before = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Something.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const after = rollChangelog(before, '1.0.0', '2026-10-18');
  assert.equal(
    after,
    `# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-10-18\n\n### Added\n\n- Something.\n` +
      `\n[Unreleased]: ${REPO}/compare/v1.0.0...HEAD\n[1.0.0]: ${REPO}/releases/tag/v1.0.0\n`,
  );
});

test('compares with the previous tag on the next release', () => {
  const before =
    `## [Unreleased]\n\n- Fix.\n\n## [1.0.0] - 2026-10-18\n\n- First.\n\n` +
    `[Unreleased]: ${REPO}/compare/v1.0.0...HEAD\n[1.0.0]: ${REPO}/releases/tag/v1.0.0\n`;
  const after = rollChangelog(before, '1.0.1', '2026-10-19');
  assert.match(after, /## \[1\.0\.1\] - 2026-10-19\n\n- Fix\./);
  assert.match(after, /\[Unreleased\]: \S+\/compare\/v1\.0\.1\.\.\.HEAD/);
  assert.match(after, /\[1\.0\.1\]: \S+\/compare\/v1\.0\.0\.\.\.v1\.0\.1/);
});

test('an empty Unreleased section still names the version', () => {
  const after = rollChangelog('## [Unreleased]\n', '1.0.2', '2026-10-20');
  assert.match(after, /## \[1\.0\.2\] - 2026-10-20\n\n- Maintenance release/);
});

test('a version already in the file is left alone', () => {
  const text = '## [Unreleased]\n\n## [1.0.0] - 2026-10-18\n';
  assert.equal(rollChangelog(text, '1.0.0', '2026-10-21'), text);
});
