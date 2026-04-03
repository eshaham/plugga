import { Box, Text, useApp } from 'ink';
import React, { useEffect, useState } from 'react';

import { addProfile, loadConfig, saveConfig } from '~/config/profiles';
import { exec } from '~/exec/runner';
import { logError, logInfo } from '~/logging/logger';
import { installPluggaSkill } from '~/skill/plugga-skill';

import { Confirm } from './components/Confirm';
import { ListSelector } from './components/ListSelector';
import type { ListItem } from './components/ListSelector';
import { StatusMessage } from './components/StatusMessage';
import { TextPrompt } from './components/TextPrompt';

type Phase =
  | 'check-op'
  | 'select-account'
  | 'select-vault'
  | 'create-vault'
  | 'profile-name'
  | 'configure-tag'
  | 'install-skill'
  | 'done'
  | 'error';

interface OpAccount {
  url: string;
  email: string;
  user_uuid: string;
  account_uuid: string;
}

interface OpVault {
  id: string;
  name: string;
}

const InitFlow: React.FC = () => {
  const app = useApp();
  const [phase, setPhase] = useState<Phase>('check-op');
  const [errorMessage, setErrorMessage] = useState('');
  const [accounts, setAccounts] = useState<OpAccount[]>([]);
  const [vaults, setVaults] = useState<OpVault[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedVault, setSelectedVault] = useState('');
  const [profileName, setProfileName] = useState('');
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  useEffect(() => {
    if (phase !== 'check-op') {
      return;
    }

    const checkOp = async () => {
      const result = await exec('op', ['--version']);
      if (result.exitCode !== 0) {
        setErrorMessage(
          '1Password CLI (op) is not installed. Install it from https://1password.com/downloads/command-line/'
        );
        setPhase('error');
        return;
      }

      setCompletedSteps((prev) => [
        ...prev,
        `1Password CLI found (${result.stdout})`,
      ]);

      const accountsResult = await exec('op', [
        'account',
        'list',
        '--format',
        'json',
      ]);
      if (accountsResult.exitCode !== 0) {
        setErrorMessage(
          'Failed to list 1Password accounts. Make sure you are signed in.'
        );
        setPhase('error');
        return;
      }

      try {
        const parsed = JSON.parse(accountsResult.stdout) as OpAccount[];
        if (parsed.length === 0) {
          setErrorMessage(
            'No 1Password accounts found. Sign in with "op signin".'
          );
          setPhase('error');
          return;
        }
        setAccounts(parsed);
        setPhase('select-account');
      } catch {
        setErrorMessage('Failed to parse 1Password accounts.');
        setPhase('error');
      }
    };

    checkOp().catch((e) => {
      setErrorMessage(String(e));
      setPhase('error');
    });
  }, [phase]);

  const handleAccountSelect = async (item: ListItem) => {
    setSelectedAccount(item.value);
    setCompletedSteps((prev) => [...prev, `Selected account: ${item.label}`]);

    const vaultsResult = await exec('op', [
      'vault',
      'list',
      '--account',
      item.value,
      '--format',
      'json',
    ]);

    if (vaultsResult.exitCode !== 0) {
      setErrorMessage('Failed to list vaults.');
      setPhase('error');
      return;
    }

    try {
      const parsed = JSON.parse(vaultsResult.stdout) as OpVault[];
      setVaults(parsed);
      setPhase('select-vault');
    } catch {
      setErrorMessage('Failed to parse vaults.');
      setPhase('error');
    }
  };

  const handleVaultSelect = (item: ListItem) => {
    if (item.value === '__create__') {
      setPhase('create-vault');
      return;
    }
    setSelectedVault(item.value);
    setCompletedSteps((prev) => [...prev, `Selected vault: ${item.label}`]);
    setPhase('profile-name');
  };

  const handleCreateVault = async (name: string) => {
    const result = await exec('op', [
      'vault',
      'create',
      name,
      '--account',
      selectedAccount,
    ]);

    if (result.exitCode !== 0) {
      setErrorMessage(`Failed to create vault: ${result.stderr}`);
      setPhase('error');
      return;
    }

    setSelectedVault(name);
    setCompletedSteps((prev) => [...prev, `Created vault: ${name}`]);
    setPhase('profile-name');
  };

  const handleProfileName = (name: string) => {
    setProfileName(name);
    setCompletedSteps((prev) => [...prev, `Profile name: ${name}`]);
    setPhase('configure-tag');
  };

  const handleTagConfirm = async (useDefault: boolean) => {
    if (!useDefault) {
      const config = await loadConfig();
      config.tag = 'plugga';
      await saveConfig(config);
    }

    await addProfile(profileName, {
      opAccount: selectedAccount,
      vault: selectedVault,
    });

    setCompletedSteps((prev) => [...prev, 'Profile saved']);
    await logInfo('init.profile-created', {
      profile: profileName,
      account: selectedAccount,
      vault: selectedVault,
    });
    setPhase('install-skill');
  };

  const handleSkillInstall = async (confirmed: boolean) => {
    if (confirmed) {
      try {
        await installPluggaSkill();
        setCompletedSteps((prev) => [
          ...prev,
          'Plugga skill installed to ~/.claude/skills/plugga/',
        ]);
        await logInfo('init.skill-installed');
      } catch (error) {
        await logError('init.skill-install', error);
        setCompletedSteps((prev) => [
          ...prev,
          'Failed to install plugga skill (non-fatal)',
        ]);
      }
    } else {
      setCompletedSteps((prev) => [...prev, 'Skipped skill installation']);
    }
    setPhase('done');
    setTimeout(() => app.exit(), 100);
  };

  const accountItems: ListItem[] = accounts.map((a) => ({
    label: `${a.email} (${a.url})`,
    value: a.url,
  }));

  const vaultItems: ListItem[] = [
    ...vaults.map((v) => ({ label: v.name, value: v.name })),
    { label: '+ Create new vault', value: '__create__' },
  ];

  const defaultProfileName =
    selectedAccount.replace('.1password.com', '').replace(/[^a-z0-9-]/g, '') ||
    'default';

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Plugga Init</Text>

      {completedSteps.map((step, i) => (
        <StatusMessage key={i} status="success" message={step} />
      ))}

      {phase === 'check-op' && (
        <StatusMessage status="loading" message="Checking 1Password CLI..." />
      )}

      {phase === 'select-account' && (
        <ListSelector
          label="Select 1Password account:"
          items={accountItems}
          onSelect={handleAccountSelect}
        />
      )}

      {phase === 'select-vault' && (
        <ListSelector
          label="Select vault:"
          items={vaultItems}
          onSelect={handleVaultSelect}
        />
      )}

      {phase === 'create-vault' && (
        <TextPrompt
          label="New vault name"
          defaultValue="plugga"
          onSubmit={handleCreateVault}
        />
      )}

      {phase === 'profile-name' && (
        <TextPrompt
          label="Profile name"
          defaultValue={defaultProfileName}
          onSubmit={handleProfileName}
        />
      )}

      {phase === 'configure-tag' && (
        <Confirm
          label='Use default tag "plugga" for 1Password items?'
          onConfirm={handleTagConfirm}
        />
      )}

      {phase === 'install-skill' && (
        <Confirm
          label="Install the plugga skill globally (~/.claude/skills/plugga/)?"
          onConfirm={handleSkillInstall}
        />
      )}

      {phase === 'done' && (
        <Box flexDirection="column">
          <StatusMessage status="success" message="Plugga initialized!" />
          <Text>
            Run &quot;plugga init --add-profile&quot; to add more 1Password
            profiles.
          </Text>
        </Box>
      )}

      {phase === 'error' && (
        <StatusMessage status="error" message={errorMessage} />
      )}
    </Box>
  );
};

export { InitFlow };
