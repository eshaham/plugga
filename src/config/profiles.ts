import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ensureConfigDirs, getConfigDir } from './paths';

interface Profile {
  opAccount: string;
  vault: string;
}

interface PluggaConfig {
  profiles: Record<string, Profile>;
  tag: string;
}

function getConfigFilePath(): string {
  return join(getConfigDir(), 'config.json');
}

function createDefaultConfig(): PluggaConfig {
  return { profiles: {}, tag: 'plugga' };
}

async function loadConfig(): Promise<PluggaConfig> {
  try {
    const content = await readFile(getConfigFilePath(), 'utf-8');
    return JSON.parse(content) as PluggaConfig;
  } catch {
    return createDefaultConfig();
  }
}

async function saveConfig(config: PluggaConfig): Promise<void> {
  await ensureConfigDirs();
  await writeFile(
    getConfigFilePath(),
    JSON.stringify(config, null, 2) + '\n',
    'utf-8'
  );
}

async function getProfile(name: string): Promise<Profile | undefined> {
  const config = await loadConfig();
  return config.profiles[name];
}

async function addProfile(name: string, profile: Profile): Promise<void> {
  const config = await loadConfig();
  config.profiles[name] = profile;
  await saveConfig(config);
}

async function listProfiles(): Promise<Record<string, Profile>> {
  const config = await loadConfig();
  return config.profiles;
}

async function getTag(): Promise<string> {
  const config = await loadConfig();
  return config.tag;
}

async function resolveProfile(accountName: string): Promise<Profile> {
  const profiles = await listProfiles();
  const profileNames = Object.keys(profiles);

  if (profileNames.length === 0) {
    throw new Error(
      'No profiles configured. Run "plugga init" to set up a 1Password profile.'
    );
  }

  const profile = profiles[accountName];
  if (profile) {
    return profile;
  }

  if (profileNames.length === 1) {
    const onlyProfile = profiles[profileNames[0] as string];
    if (onlyProfile) {
      return onlyProfile;
    }
  }

  throw new Error(
    `No profile found for account "${accountName}". Available profiles: ${profileNames.join(', ')}`
  );
}

export {
  addProfile,
  getProfile,
  getTag,
  listProfiles,
  loadConfig,
  resolveProfile,
  saveConfig,
};
export type { PluggaConfig, Profile };
