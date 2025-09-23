import {
  ExecutorContext,
  joinPathFragments,
  NxJsonConfiguration,
  output,
  readJsonFile,
} from '@nx/devkit';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env as appendLocalEnv } from 'npm-run-path';
import { NxReleasePublishExecutorSchema } from './schema';
import chalk = require('chalk');

const LARGE_BUFFER = 1024 * 1000000;
const DEFAULT_TAG_PATTERN = 'v{version}';

function processEnv(color: boolean) {
  const env = {
    ...process.env,
    ...appendLocalEnv(),
  };

  if (color) {
    env.FORCE_COLOR = `${color}`;
  }
  return env;
}

/**
 * Gets the release tag pattern from nx.json configuration
 * @param workspaceRoot The root of the workspace
 * @param projectName The name of the project
 * @returns The tag pattern to use for releases
 */
function getReleaseTagPattern(
  workspaceRoot: string,
  projectName: string
): string {
  try {
    const nxJsonPath = join(workspaceRoot, 'nx.json');
    const nxJson = readJsonFile<NxJsonConfiguration>(nxJsonPath);

    // Check for release configuration in nx.json
    if (nxJson.release && nxJson.release.releaseTagPattern) {
      // Replace {projectName} with the actual project name in the pattern
      const tagPattern = nxJson.release.releaseTagPattern.replace(
        '{projectName}',
        projectName
      );

      return tagPattern;
    }

    // Return default pattern if nothing specific is found
    return DEFAULT_TAG_PATTERN;
  } catch (err) {
    console.warn(
      `Warning: Could not read nx.json to determine tag pattern: ${err}`
    );
    return DEFAULT_TAG_PATTERN;
  }
}

/**
 * Gets the latest version from git tags based on the pattern
 * @param moduleRoot Root directory of the module
 * @param tagPattern Pattern to match tags
 * @param projectName Name of the project
 * @returns The latest version tag
 */

/**
 * Gets the latest and previous version tags from git based on the pattern
 * @param moduleRoot Root directory of the module
 * @param tagPattern Pattern to match tags
 * @returns [latestTag, previousTag]
 */
function getLatestAndPreviousTagsFromGit(
  moduleRoot: string,
  tagPattern: string
): [string, string] {
  try {
    const gitPattern = tagPattern.replace('{version}', '*');
    const gitTagCmd = `git tag --sort=-v:refname`;
    const allTags = execSync(gitTagCmd, {
      env: processEnv(true),
      cwd: moduleRoot,
      stdio: 'pipe',
    })
      .toString()
      .trim()
      .split('\n');

    const tagRegex = new RegExp('^' + gitPattern.replace('*', '.*') + '$');
    const matchingTags = allTags.filter((tag) => tagRegex.test(tag));
    const latestTag = matchingTags[0] || tagPattern.replace('{version}', '0.0.0');
    const previousTag = matchingTags[1] || tagPattern.replace('{version}', '0.0.0');
    return [latestTag, previousTag];
  } catch (err) {
    console.warn(`Warning: Failed to get latest/previous version from git: ${err}`);
    const fallback = tagPattern.replace('{version}', '0.0.0');
    return [fallback, fallback];
  }
}

/**
 * Checks if there are changes in the moduleRoot since the latest tag
 */
function hasChangesSinceTag(moduleRoot: string, latestTag: string): boolean {
  try {
    // Get list of changed files since the latest tag
    const gitDiffCmd = `git diff --name-only ${latestTag} HEAD -- .`;
    const changedFiles = execSync(gitDiffCmd, {
      env: processEnv(true),
      cwd: moduleRoot,
      stdio: 'pipe',
    })
      .toString()
      .trim();
    return changedFiles.length > 0;
  } catch (err) {
    console.warn(`Warning: Failed to check changes since tag: ${err}`);
    return true;
  }
}

export default async function runExecutor(
  options: NxReleasePublishExecutorSchema,
  context: ExecutorContext
) {
  /**
   * We need to check both the env var and the option because the executor may have been triggered
   * indirectly via dependsOn, in which case the env var will be set, but the option will not.
   */
  const isDryRun = process.env.NX_DRY_RUN === 'true' || options.dryRun || false;
  const projectName = context.projectName;

  if (!projectName) {
    output.error({ title: 'Project name is undefined' });
    return { success: false };
  }

  const projectConfig = context.projectsConfigurations?.projects[projectName];

  if (!projectConfig) {
    output.error({
      title: `Project configuration for ${projectName} not found`,
    });
    return { success: false };
  }

  const moduleRoot = joinPathFragments(
    context.root,
    options.moduleRoot ?? projectConfig.root
  );

  const goModPath = joinPathFragments(moduleRoot, 'go.mod');
  const goModContents = readFileSync(goModPath, 'utf-8');
  const moduleMatch = goModContents.match(/module\s+([^\s]+)/);

  if (!moduleMatch) {
    output.error({ title: `Could not find module name in ${goModPath}` });
    return { success: false };
  }

  const moduleName = moduleMatch[1];

  try {
    // Get the release tag pattern from nx.json
    const tagPattern = getReleaseTagPattern(context.root, projectName);
    output.logSingleLine(`Using release tag pattern: ${tagPattern}`);

    // Get the latest and previous tags based on the pattern
    const [latestTag, previousTag] = getLatestAndPreviousTagsFromGit(moduleRoot, tagPattern);


    // If no tag is found (i.e., fallback value), skip the release
    const fallbackTag = tagPattern.replace('{version}', '0.0.0');
    if (!latestTag || latestTag === fallbackTag) {
      output.logSingleLine(
        `No tag found matching pattern ${tagPattern} for ${projectName}. Skipping release.`
      );
      return { success: true };
    }

    output.logSingleLine(`Found latest version tag: ${latestTag}`);
    output.logSingleLine(`Found previous version tag: ${previousTag}`);

    // Check for changes since the previous tag (not the latest)
    if (!hasChangesSinceTag(moduleRoot, previousTag)) {
      output.logSingleLine(
        `No changes detected in ${projectName} since previous tag (${previousTag}). Skipping release.`
      );
      return { success: true };
    }

    // Extract the version from the latest tag using regex based on the tag pattern
    let version = latestTag;

    if (tagPattern.includes('{version}')) {
      // Escape special regex characters in the tag pattern
      const escapeRegex = (str: string) =>
        str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Create pattern by replacing {projectName} with its value and {version} with a capturing group
      const regexPattern = escapeRegex(tagPattern)
        .replace(escapeRegex('{projectName}'), escapeRegex(projectName))
        .replace(escapeRegex('{version}'), '(.+)');

      // Create regex and try to match
      const regex = new RegExp(`^${regexPattern}$`);
      const match = latestTag.match(regex);

      if (match && match[1]) {
        version = match[1];
      }
    }

    // Prepare GoReleaser command using .goreleaser.yml
    const goReleaserConfigPath = joinPathFragments(
      moduleRoot,
      '.goreleaser.yml'
    );
    const goReleaserCommand = `goreleaser release --clean -f "${goReleaserConfigPath}"`;

    output.logSingleLine(
      `Releasing ${chalk.bold(moduleName)} at version ${chalk.bold(
        version
      )} (from tag ${chalk.bold(latestTag)}) using GoReleaser...`
    );

    if (isDryRun) {
      console.log(`Would run: ${goReleaserCommand}`);
      console.log(
        `Would run GoReleaser for module ${chalk.cyan(
          moduleName
        )} at version ${chalk.cyan(version)}, but ${chalk.keyword('orange')(
          '[dry-run]'
        )} was set`
      );
    } else {
      output.logSingleLine(`Running "${goReleaserCommand}"...`);
      execSync(goReleaserCommand, {
        maxBuffer: LARGE_BUFFER,
        env: processEnv(true),
        cwd: moduleRoot,
        stdio: 'inherit',
      });

      console.log('');
      console.log(
        `GoReleaser ran for ${chalk.cyan(moduleName)}@${chalk.cyan(version)}`
      );
    }

    return {
      success: true,
    };
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error('Publication failed:', err.message);
    }
    return {
      success: false,
    };
  }
}
