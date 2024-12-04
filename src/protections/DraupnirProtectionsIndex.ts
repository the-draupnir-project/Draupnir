// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

/**
 * This file exists as a way to register all protections.
 * In future, we should maybe try to dogfood the dynamic plugin load sytem
 * instead. For now that system doesn't even exist.
 */

// keep alphabetical please.
import "./BanPropagation";
import "./BasicFlooding";
import "./FirstMessageIsImage";
import "./JoinWaveShortCircuit";
import "./RedactionSynchronisation";
import "./MentionLimitProtection";
import "./MessageIsMedia";
import "./MessageIsVoice";
import "./NewJoinerProtection";
import "./PolicyChangeNotification";
import "./TrustedReporters";
import "./WordList";

// import capability renderers and glue too.
import "../capabilities/capabilityIndex";
import { DraupnirTopLevelCommands } from "../commands/DraupnirCommandTable";
import { getAllProtections } from "matrix-protection-suite";
import { CommandTable } from "@the-draupnir-project/interface-manager";

// now add commands mare
for (const protection of getAllProtections()) {
  if ("commandTable" in protection && protection.commandTable !== undefined) {
    DraupnirTopLevelCommands.importTable(
      protection.commandTable as CommandTable,
      []
    );
  }
}
