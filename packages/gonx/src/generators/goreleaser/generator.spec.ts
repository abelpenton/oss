import { type Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import goreleaserGenerator from './generator';
import { GoreleaserGeneratorSchema } from './schema';

describe('goreleaserGenerator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('should generate a .goreleaser.yml file for applications', async () => {
    const options: GoreleaserGeneratorSchema = {
      name: 'myGoApp',
      directory: 'myDir',
      template: 'cli',
      tags: '',
    };
    await goreleaserGenerator(tree, 'application', options);
    const content = tree
      .read(`${options.directory}/.goreleaser.yml`)
      ?.toString();
    expect(content).toContain(`project_name: ${options.name}`);
    expect(content).toContain(`id: ${options.name}`);
  });

  it('should generate a .goreleaser.yml file for libraries', async () => {
    const options: GoreleaserGeneratorSchema = {
      name: 'myGoLib',
      directory: 'myDir',
      template: 'cli',
      tags: '',
    };
    await goreleaserGenerator(tree, 'library', options);
    const content = tree
      .read(`${options.directory}/.goreleaser.yml`)
      ?.toString();
    expect(content).toContain(`project_name: ${options.name}`);
    expect(content).toContain(`id: ${options.name}`);
  });
});
