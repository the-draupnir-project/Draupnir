// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { MatrixGlob } from "@the-draupnir-project/matrix-basic-types";
import { ServerACLContent } from "./ServerACL";

export class ServerACLBuilder {
  private allowedServers: Set<string> = new Set<string>();
  private deniedServers: Set<string> = new Set<string>();
  private allowIps = false;

  public constructor(public readonly homeserver: string) {}

  /**
   * Checks the ACL for any entries that might ban ourself.
   * @returns A list of deny entries that will not ban our own homeserver.
   */
  public safeDeniedServers(): string[] {
    // The reason we do this check here rather than in the `denyServer` method
    // is because `literalAclContent` exists and also we want to be defensive about someone
    // mutating `this.deniedServers` via another method in the future.
    const entries: string[] = [];
    for (const server of this.deniedServers) {
      const glob = new MatrixGlob(server);
      if (!glob.test(this.homeserver)) {
        entries.push(server);
      }
    }
    return entries;
  }

  public safeAllowedServers(): string[] {
    const allowed = [...this.allowedServers];
    if (allowed.length === 0) {
      allowed.push("*"); // allow everything
    }
    if (
      !allowed.some((server) => new MatrixGlob(server).test(this.homeserver))
    ) {
      allowed.push(this.homeserver);
    }
    return allowed;
  }

  public allowIpAddresses(): this {
    this.allowIps = true;
    return this;
  }

  public denyIpAddresses(): this {
    this.allowIps = false;
    return this;
  }

  public allowServer(glob: string): this {
    this.allowedServers.add(glob);
    return this;
  }

  public setAllowedServers(globs: string[]): this {
    this.allowedServers = new Set<string>(globs);
    return this;
  }

  public denyServer(glob: string): this {
    this.deniedServers.add(glob);
    return this;
  }

  public setDeniedServers(globs: string[]): this {
    this.deniedServers = new Set<string>(globs);
    return this;
  }

  public safeAclContent(): ServerACLContent {
    return {
      allow: this.safeAllowedServers(),
      deny: this.safeDeniedServers(),
      allow_ip_literals: this.allowIps,
    };
  }

  public matches(acl: ServerACLContent): boolean {
    const allow = acl["allow"];
    const deny = acl["deny"];
    const ips = acl["allow_ip_literals"];

    let allowMatches = true; // until proven false
    let denyMatches = true; // until proven false
    const ipsMatch = ips === this.allowIps;

    const currentAllowed = this.safeAllowedServers();
    if (allow?.length === currentAllowed.length) {
      for (const s of allow) {
        if (!currentAllowed.includes(s)) {
          allowMatches = false;
          break;
        }
      }
    } else allowMatches = false;

    const currentDenied = this.safeDeniedServers();
    if (deny?.length === currentDenied.length) {
      for (const s of deny) {
        if (!currentDenied.includes(s)) {
          denyMatches = false;
          break;
        }
      }
    } else denyMatches = false;

    return denyMatches && allowMatches && ipsMatch;
  }
}
