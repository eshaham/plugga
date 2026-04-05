interface SecretReference {
  service: string;
  account: string;
  key: string;
}

interface AccountReference {
  service: string;
  account: string;
}

interface SecretsStore {
  get(ref: SecretReference): Promise<string>;
  set(ref: SecretReference, value: string): Promise<void>;
  has(ref: SecretReference): Promise<boolean>;
  delete(ref: SecretReference): Promise<void>;
  deleteAccount(ref: AccountReference): Promise<void>;
}

export type { AccountReference, SecretReference, SecretsStore };
