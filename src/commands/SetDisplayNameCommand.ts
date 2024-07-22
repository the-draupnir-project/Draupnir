import {
  defineInterfaceCommand,
  findTableCommand,
} from "./interface-manager/InterfaceCommand";
import {
  ParsedKeywords,
  RestDescription,
  findPresentationType,
  parameters,
} from "./interface-manager/ParameterParsing";
import { DraupnirContext } from "./CommandHandler";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { ActionError, ActionResult, Ok } from "matrix-protection-suite";

defineInterfaceCommand({
  table: "draupnir",
  designator: ["displayname"],
  summary:
    "Sets the displayname of the draupnir instance to the specified value in all rooms.",
  parameters: parameters(
    [],
    new RestDescription<DraupnirContext>(
      "displayname",
      findPresentationType("string")
    )
  ),
  command: execSetDisplayNameCommand,
});

// !draupnir displayname <displayname>
export async function execSetDisplayNameCommand(
  this: DraupnirContext,
  _keywords: ParsedKeywords,
  ...displaynameParts: string[]
): Promise<ActionResult<void>> {
  const displayname = displaynameParts.join(" ");
  try {
    await this.client.setDisplayName(displayname);
  } catch (e) {
    const message = e.message || (e.body ? e.body.error : "<no message>");
    return ActionError.Result(
      `Failed to set displayname to ${displayname}: ${message}`
    );
  }

  return Ok(undefined);
}

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("draupnir", "displayname"),
  renderer: tickCrossRenderer,
});
