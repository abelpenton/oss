import { ProjectType, Tree, generateFiles } from '@nx/devkit';
import { join } from 'path';
import { GoreleaserGeneratorSchema } from './schema';
import { normalizeOptions } from '../../utils';

export default async function goreleaserGenerator(
  tree: Tree,
  projectType: ProjectType,
  schema: GoreleaserGeneratorSchema
) {
  const options = await normalizeOptions(tree, schema, projectType);

  generateFiles(tree, join(__dirname, 'files'), options.projectRoot, options);
}
