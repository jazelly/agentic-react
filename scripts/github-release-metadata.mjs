import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publishableReleases = (plan) =>
  plan.releases
    .filter((release) => release.type !== 'none' && release.newVersion)
    .toSorted((left, right) => left.name.localeCompare(right.name));

const packageDirectory = (packageName) => packageName.split('/').at(-1);

const changelogSection = (rootDir, release) => {
  const changelogPath = path.join(
    rootDir,
    'packages',
    packageDirectory(release.name),
    'CHANGELOG.md',
  );

  if (!fs.existsSync(changelogPath)) {
    return undefined;
  }

  const changelog = fs.readFileSync(changelogPath, 'utf8');
  const heading = `## ${release.newVersion}`;
  const headingIndex = changelog.indexOf(heading);

  if (headingIndex === -1) {
    return undefined;
  }

  const sectionStart = headingIndex + heading.length;
  const remaining = changelog.slice(sectionStart);
  const nextHeading = remaining.search(/\n## \S/);
  const section =
    nextHeading === -1 ? remaining : remaining.slice(0, nextHeading);

  return section.trim() || undefined;
};

const releaseTitle = (releases) => {
  if (releases.length === 1) {
    return `${releases[0].name} v${releases[0].newVersion}`;
  }

  const versions = [...new Set(releases.map((release) => release.newVersion))];

  if (versions.length === 1) {
    return `Agentic React packages v${versions[0]}`;
  }

  return `Agentic React packages · ${versions.map((version) => `v${version}`).join(' / ')}`;
};

export const createGitHubReleaseMetadata = ({
  plan,
  repository,
  rootDir,
  sha,
}) => {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error(`Invalid GitHub repository: ${repository}`);
  }

  if (!/^[0-9a-f]{12,40}$/.test(sha)) {
    throw new Error(`Invalid release commit SHA: ${sha}`);
  }

  const releases = publishableReleases(plan);

  if (releases.length === 0) {
    return undefined;
  }

  const shortSha = sha.slice(0, 12);
  const tag = `packages@${shortSha}`;
  const encodedTag = encodeURIComponent(tag);
  const lines = [
    '## Published packages',
    '',
    'These packages were built, tested, and published together from ' +
      `release commit [\`${shortSha}\`](https://github.com/${repository}/commit/${sha}).`,
    '',
    '| Package | Version | npm | Changelog |',
    '| --- | --- | --- | --- |',
  ];

  for (const release of releases) {
    const directory = packageDirectory(release.name);
    const npmUrl =
      `https://www.npmjs.com/package/${release.name}/v/` +
      release.newVersion;
    const changelogUrl =
      `https://github.com/${repository}/blob/${encodedTag}/packages/` +
      `${directory}/CHANGELOG.md`;

    lines.push(
      `| \`${release.name}\` | \`${release.newVersion}\` | ` +
        `[npm](${npmUrl}) | [changelog](${changelogUrl}) |`,
    );
  }

  const sections = releases
    .map((release) => ({
      name: release.name,
      section: changelogSection(rootDir, release),
    }))
    .filter(({ section }) => section);

  if (sections.length > 0) {
    lines.push('', '## Package changes');

    for (const { name, section } of sections) {
      lines.push('', `### \`${name}\``, '', section);
    }
  }

  return {
    notes: `${lines.join('\n')}\n`,
    tag,
    title: releaseTitle(releases),
  };
};

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const [planPath, sha, repository, notesPath, outputPath] =
    process.argv.slice(2);

  if (!planPath || !sha || !repository || !notesPath || !outputPath) {
    throw new Error(
      'Usage: github-release-metadata.mjs ' +
        '<plan> <sha> <repository> <notes> <output>',
    );
  }

  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const metadata = createGitHubReleaseMetadata({
    plan,
    repository,
    rootDir: process.cwd(),
    sha,
  });

  if (!metadata) {
    fs.appendFileSync(outputPath, 'has-release=false\n');
  } else {
    fs.writeFileSync(notesPath, metadata.notes);
    fs.appendFileSync(
      outputPath,
      [
        'has-release=true',
        `tag=${metadata.tag}`,
        `title=${metadata.title}`,
        `notes=${notesPath}`,
        '',
      ].join('\n'),
    );
  }
}
