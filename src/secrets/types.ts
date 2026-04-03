interface SecretReference {
  service: string;
  account: string;
  key: string;
}

interface SecretsStore {
  get(ref: SecretReference): Promise<string>;
  set(ref: SecretReference, value: string): Promise<void>;
  has(ref: SecretReference): Promise<boolean>;
  delete(ref: SecretReference): Promise<void>;
}

export type { SecretReference, SecretsStore };
