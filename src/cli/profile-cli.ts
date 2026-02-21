import {
  addProfile,
  deleteProfile,
  listProfiles,
  type Profile,
} from "../profile/profile.js";
import { appendAudit } from "../audit/log.js";

export function profileAdd(
  name: string,
  opts: { url: string; header: string; secret: string }
): void {
  const url = new URL(opts.url);
  const profile: Profile = {
    remoteUrl: opts.url,
    auth: {
      type: "header",
      name: opts.header,
      secretPath: opts.secret,
    },
    policy: {
      allowedHosts: [url.hostname],
      allowedMethods: ["POST"],
      allowedPaths: [url.pathname || "/"],
      maxResponseBytes: 262144,
      allowRedirects: false,
    },
  };
  addProfile(name, profile);
  appendAudit("cli", "PROFILE_CREATED", name, opts.url);
  console.error(`Profile '${name}' added`);
}

export function profileList(): void {
  const names = listProfiles();
  for (const n of names) {
    console.log(n);
  }
}

export function profileDelete(name: string): void {
  const deleted = deleteProfile(name);
  if (deleted) {
    appendAudit("cli", "PROFILE_DELETED", name, "deleted");
    console.error(`Deleted profile '${name}'`);
  } else {
    console.error(`Profile '${name}' not found`);
    process.exit(1);
  }
}
