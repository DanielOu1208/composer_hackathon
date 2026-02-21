import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".config", "agentvault");
const PROFILES_PATH = join(CONFIG_DIR, "profiles.json");

export interface ProfileAuth {
  type: "header";
  name: string;
  secretPath: string;
}

export interface ProfilePolicy {
  allowedHosts: string[];
  allowedMethods: string[];
  allowedPaths: string[];
  maxResponseBytes: number;
  allowRedirects: boolean;
}

export interface Profile {
  remoteUrl: string;
  auth: ProfileAuth;
  policy: ProfilePolicy;
}

export interface ProfilesConfig {
  profiles: Record<string, Profile>;
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadProfiles(): ProfilesConfig {
  ensureConfigDir();
  if (!existsSync(PROFILES_PATH)) {
    return { profiles: {} };
  }
  const raw = readFileSync(PROFILES_PATH, "utf8");
  return JSON.parse(raw) as ProfilesConfig;
}

export function saveProfiles(config: ProfilesConfig): void {
  ensureConfigDir();
  writeFileSync(PROFILES_PATH, JSON.stringify(config, null, 2));
}

export function getProfile(name: string): Profile | null {
  const config = loadProfiles();
  return config.profiles[name] ?? null;
}

export function addProfile(name: string, profile: Profile): void {
  const config = loadProfiles();
  config.profiles[name] = profile;
  saveProfiles(config);
}

export function deleteProfile(name: string): boolean {
  const config = loadProfiles();
  if (!(name in config.profiles)) return false;
  delete config.profiles[name];
  saveProfiles(config);
  return true;
}

export function listProfiles(): string[] {
  const config = loadProfiles();
  return Object.keys(config.profiles);
}
