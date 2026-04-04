import { logError, logInfo } from '~/logging/logger';
import { getSkillDir, installPluggaSkill } from '~/skill/plugga-skill';

async function handleInstallSkill(): Promise<void> {
  try {
    await installPluggaSkill();
    console.log(`Plugga skill installed to ${getSkillDir()}/SKILL.md`);
    await logInfo('install-skill');
  } catch (error) {
    await logError('install-skill', error);
    console.error(
      `Failed to install skill: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export { handleInstallSkill };
