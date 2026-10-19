// - repository: GitHub `owner/repository`.
// - ref: the commit, in full; refName: the tag it is known by, or null.
//   The `tt` source has neither: it follows the TauriTavern vendor image
//   (`vendorImage`), so its ref is the image's commit.
// - license: SPDX id, checked against the LICENSE shipped with the files;
//   null when the repository has none.
// - licenseFrom: a source whose LICENSE applies, for a repository without
//   one; licenseEvidence: the file at `ref` that says so, and the words it
//   must contain.
// - attribution: whom the files are credited to: the license's copyright
//   line when it has one, otherwise the repository's owner.
// - policy: `verbatim` ships the upstream files as they are; `link` ships
//   only `summary`, written by Studio, beside the repository's address.
// - include / exclude: globs over repository paths (see build.mjs).

export const SOURCES = [
  {
    id: 'st-docs',
    repository: 'SillyTavern/SillyTavern-Docs',
    ref: 'ed5423d809c6b10b8c1e9ef4a0c8ddc7f2ef7f3d',
    refName: null,
    license: 'AGPL-3.0',
    attribution: 'SillyTavern',
    policy: 'verbatim',
    include: ['**/*.md', 'LICENSE'],
    exclude: ['static/**', '_includes/**'],
  },
  {
    // The version Studio installs (apps/studio/src/preview/extensions.ts).
    id: 'jsr',
    repository: 'N0VI028/JS-Slash-Runner',
    ref: '1292dbfa0f16943f70d55cfdf3bb5a0ce690ef8b',
    refName: '4.11.3',
    license: 'PolyForm-Noncommercial-1.0.0',
    attribution: 'N0VI028',
    policy: 'verbatim',
    include: [
      'CHANGELOG.md',
      'README.md',
      'LICENSE',
      '@types/**/*.d.ts',
      'global.d.ts',
      'auto-imports.zod.d.ts',
    ],
  },
  {
    id: 'jsr-docs',
    repository: 'N0VI028/JS-Slash-Runner-Doc',
    ref: '08c81a21147498ce0de6f18cbfffc28a364ca27c',
    refName: null,
    license: 'PolyForm-Noncommercial-1.0.0',
    licenseFrom: 'jsr',
    // The site's footer, linking to jsr's LICENSE.
    licenseEvidence: {
      path: '.vitepress/config.mts',
      text: 'Licensed under <a href="https://github.com/N0VI028/JS-Slash-Runner/blob/main/LICENSE">PolyForm Noncommercial 1.0.0</a>',
    },
    attribution: 'N0VI028',
    policy: 'verbatim',
    include: ['src/**/*.md'],
    // The changelog page copies jsr's CHANGELOG.md.
    exclude: ['src/guide/关于酒馆助手/更新日志.md', 'src/public/**'],
  },
  {
    id: 'mvu',
    repository: 'MagicalAstrogy/MagVarUpdate',
    ref: 'd03b7dc8a6ebf9bd611c7e2dc91f3b35462deebc',
    refName: 'v0.196.0',
    license: 'MIT',
    attribution: 'Copyright (c) 2025 MagicalAstrogy & StageDog',
    policy: 'verbatim',
    include: [
      'README.md',
      'CHANGELOG.md',
      'LICENSE',
      'doc/tutorial.md',
      'doc/supplementary-tutorial.md',
      'doc/template.md',
      'doc/stat_var.md',
      'doc/generate.md',
    ],
  },
  {
    id: 'ccv3',
    repository: 'kwaroran/character-card-spec-v3',
    ref: 'f3a86af019fbd99f788f7a1155f399655b34ab35',
    refName: null,
    license: 'MIT',
    attribution: 'Copyright (c) 2024 Kwaroran',
    policy: 'verbatim',
    include: ['SPEC_V3.md', 'concepts.md', 'README.md', 'LICENSE'],
  },
  {
    // No license, so no upstream text; SPEC_V3.md carries every V2 field.
    id: 'ccv2',
    repository: 'malfoyslastname/character-card-spec-v2',
    ref: '8083fb388615ccbce768e97cbbd49d2b3214632c',
    refName: null,
    license: null,
    attribution: 'malfoyslastname',
    policy: 'link',
    summary: 'summaries/ccv2.md',
  },
  {
    // src/types.d.ts is in the image itself, under vendor/src/.
    id: 'tt',
    repository: 'Darkatse/TauriTavern',
    vendorImage: 'tt',
    license: 'AGPL-3.0',
    attribution: 'Darkatse',
    policy: 'verbatim',
    include: [
      'docs/API/*.md',
      'docs/FrontendHostContract.md',
      'docs/CurrentState/ThirdPartyExtensions.md',
      'LICENSE',
    ],
  },
  {
    id: 'stagedog-template',
    repository: 'StageDog/tavern_helper_template',
    ref: 'a5317b873d6a11e0ca2f71d53e45bc23e81faf2a',
    refName: null,
    license: 'PolyForm-Noncommercial-1.0.0',
    attribution: 'StageDog',
    policy: 'verbatim',
    // Not @types/, which is jsr's.
    include: [
      '.agents/skills/*/SKILL.md',
      'AGENTS.md',
      'README.md',
      'LICENSE',
      'util/**',
      '初始模板/**',
      '示例/**',
    ],
    // slash_command.txt carries no attribution; images are not text.
    exclude: ['**/slash_command.txt', '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.webp'],
  },
];
